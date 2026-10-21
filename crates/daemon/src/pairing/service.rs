use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use base64::Engine;
use soromi_protocol::{DeviceRoute, DeviceSummary};
use tokio::sync::{broadcast, watch};
use tokio::task::AbortHandle;

use crate::accounts::store::FileAccountManager;
use crate::pairing::device::{Device, load_devices, save_devices};
use crate::transport::direct::{Admission, Admit, DirectAccess};
use crate::transport::server::{DeviceLink, PresenceSink};
use crate::workspaces::service::WorkspaceService;

/// The layout of the pairing code's payload. A scanner that does not know the version it reads asks
/// for an app update instead of guessing.
const PAIRING_CODE_VERSION: u32 = 1;

/// Whether paired devices may connect straight to this computer, and on which port.
#[derive(Debug, Clone, Copy)]
pub struct DirectSettings {
    pub enabled: bool,
    /// The port to listen on; 0 lets the system pick one.
    pub port: u16,
}

/// How long the machine is still held awake after the last device leaves. A phone that changes
/// network, or is put down and picked up again, is back within this; without it the computer
/// could be asleep by the time it returns.
const AWAKE_LINGER: Duration = Duration::from_secs(90);

/// Holds the machine awake while any paired device is connected, and for a while after.
#[derive(Clone)]
struct Awake {
    /// Engages or releases the hold.
    hold: Arc<dyn Fn(bool) + Send + Sync>,
    /// Counts the changes, so a release that was scheduled before a device came back is dropped.
    changes: Arc<AtomicU64>,
}

impl Awake {
    fn new(hold: impl Fn(bool) + Send + Sync + 'static) -> Self {
        Self {
            hold: Arc::new(hold),
            changes: Arc::new(AtomicU64::new(0)),
        }
    }

    /// Whether any device is connected now. The hold is taken at once and let go late.
    fn set(&self, connected: bool) {
        let change = self.changes.fetch_add(1, Ordering::SeqCst) + 1;
        if connected {
            (self.hold)(true);
            return;
        }
        let Ok(runtime) = tokio::runtime::Handle::try_current() else {
            (self.hold)(false);
            return;
        };
        let (hold, changes) = (self.hold.clone(), self.changes.clone());
        runtime.spawn(async move {
            tokio::time::sleep(AWAKE_LINGER).await;
            if changes.load(Ordering::SeqCst) == change {
                hold(false);
            }
        });
    }
}

/// Which of a device's routes its phone is on right now. A phone uses one, and both for a moment
/// while it moves from one to the other.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
struct Presence {
    /// The phone is in the device's relay room.
    relay: bool,
    /// How many direct sockets the phone has proved itself on.
    direct: u32,
}

impl Presence {
    /// The route the phone is using: the direct one whenever it has one.
    fn route(self) -> Option<DeviceRoute> {
        if self.direct > 0 {
            Some(DeviceRoute::Direct)
        } else if self.relay {
            Some(DeviceRoute::Relay)
        } else {
            None
        }
    }
}

/// Owns the paired devices and their two ways in: one relay connection per device, and the direct
/// listener they share. Device management happens only over the trusted local link (the desktop
/// app); the devices' own links are plain viewports that never reach back into this service, so a
/// phone can neither list devices nor see other keys.
pub struct PairingService {
    hub: Arc<WorkspaceService>,
    accounts: Arc<FileAccountManager>,
    /// The relay URL and relay access key; behind locks so a self-host settings change applies
    /// live. The access key is presented (as a header) when dialing the relay.
    relay_url: Mutex<String>,
    access_key: Mutex<String>,
    /// Shared with the direct listener, which looks a device up when a socket names it.
    devices: Arc<Mutex<Vec<Device>>>,
    /// device id -> its relay dial task, so revoking can stop it.
    connections: Mutex<HashMap<String, AbortHandle>>,
    /// device id -> how its phone is connected right now (live). Shared with the devices' links,
    /// which update it as the phone comes and goes.
    connected: Arc<Mutex<HashMap<String, Presence>>>,
    /// Fires when any device's connection state changes, so viewports re-fetch the device list.
    changed_tx: broadcast::Sender<()>,
    /// The listener devices connect to directly. It is on only while direct access is allowed and
    /// there is a device to connect: with nothing paired, no port is open.
    direct: DirectAccess,
    direct_allowed: Mutex<bool>,
    awake: Awake,
}

impl PairingService {
    /// Loads persisted devices, starts dialing the relay for each, and opens the direct listener
    /// if there is a device to use it. Must run within a runtime.
    pub fn new(
        hub: Arc<WorkspaceService>,
        accounts: Arc<FileAccountManager>,
        relay_url: String,
        access_key: String,
        direct: DirectSettings,
    ) -> Arc<Self> {
        let (changed_tx, _) = broadcast::channel(16);
        let devices = Arc::new(Mutex::new(load_devices()));
        let connected = Arc::new(Mutex::new(HashMap::new()));
        let awake = {
            let hub = hub.clone();
            Awake::new(move |connected| hub.set_device_connected(connected))
        };
        let admit = admit(
            devices.clone(),
            connected.clone(),
            changed_tx.clone(),
            awake.clone(),
        );
        let service = Arc::new(Self {
            awake,
            direct: DirectAccess::new(hub.clone(), accounts.clone(), admit, direct.port),
            direct_allowed: Mutex::new(direct.enabled),
            hub,
            accounts,
            relay_url: Mutex::new(relay_url),
            access_key: Mutex::new(access_key),
            devices,
            connections: Mutex::new(HashMap::new()),
            connected,
            changed_tx,
        });

        for device in service.devices.lock().unwrap().iter() {
            service.dial(device);
        }
        service.refresh_direct();

        service
    }

    /// Pairs a new device, starts dialing its room, and returns its summary (with the QR code).
    pub fn create_device(&self, name: String) -> DeviceSummary {
        let device = Device::generate(name);
        self.dial(&device);

        let summary = self.summary(&device);
        {
            let mut devices = self.devices.lock().unwrap();
            devices.push(device);
            save_devices(&devices);
        }
        self.refresh_direct();

        summary
    }

    /// Every paired device.
    pub fn list_devices(&self) -> Vec<DeviceSummary> {
        self.devices
            .lock()
            .unwrap()
            .iter()
            .map(|device| self.summary(device))
            .collect()
    }

    /// Forgets a device and cuts both of its ways in. Returns the remaining devices.
    pub fn revoke_device(&self, id: &str) -> Vec<DeviceSummary> {
        if let Some(handle) = self.connections.lock().unwrap().remove(id) {
            handle.abort();
        }
        {
            let mut devices = self.devices.lock().unwrap();
            devices.retain(|device| device.id != id);
            save_devices(&devices);
        }
        // After the device is forgotten, so a socket it opens meanwhile is turned away.
        self.direct.drop_device(id);
        // Nothing is pushed to a phone that was cut off.
        self.hub.push().forget(id);
        let any = {
            let mut connected = self.connected.lock().unwrap();
            connected.remove(id);
            connected
                .values()
                .any(|presence| presence.route().is_some())
        };
        self.awake.set(any);
        self.refresh_direct();

        self.list_devices()
    }

    /// Updates the relay URL and relay access key (self-host settings change). Re-dials every
    /// device when either changed, so the change is live, not restart-gated.
    pub fn set_remote(&self, relay_url: String, access_key: String) {
        let relay_changed = {
            let mut current = self.relay_url.lock().unwrap();
            let changed = *current != relay_url;
            *current = relay_url;
            changed
        };
        let key_changed = {
            let mut current = self.access_key.lock().unwrap();
            let changed = *current != access_key;
            *current = access_key;
            changed
        };
        if !relay_changed && !key_changed {
            return;
        }

        for handle in self.connections.lock().unwrap().drain() {
            handle.1.abort();
        }
        for device in self.devices.lock().unwrap().iter() {
            self.dial(device);
        }
    }

    /// Allows or forbids direct connections (a settings change), live: forbidding closes the port
    /// and drops the devices on it, which fall back to the relay.
    pub fn set_direct(&self, allowed: bool) {
        *self.direct_allowed.lock().unwrap() = allowed;
        self.refresh_direct();
    }

    /// The port devices connect to directly, `None` while the listener is off or not yet up.
    pub fn direct_port(&self) -> watch::Receiver<Option<u16>> {
        self.direct.bound()
    }

    /// Opens or closes the direct listener to match what is allowed and whether anything is paired.
    fn refresh_direct(&self) {
        let allowed = *self.direct_allowed.lock().unwrap();
        let paired = !self.devices.lock().unwrap().is_empty();
        self.direct.set_enabled(allowed && paired);
    }

    /// Dials the relay for a device's room and records the task so revoking can stop it. The relay
    /// client reports the phone's live presence back into `connected`, waking viewports on change.
    fn dial(&self, device: &Device) {
        let on_presence = presence_sink(
            self.connected.clone(),
            self.changed_tx.clone(),
            self.awake.clone(),
            device.id.clone(),
            |presence, present| presence.relay = present,
        );

        let handle = crate::transport::relay::spawn_device(
            self.hub.clone(),
            self.accounts.clone(),
            self.relay_url.lock().unwrap().clone(),
            device.room.clone(),
            device.key.clone(),
            self.access_key.lock().unwrap().clone(),
            DeviceLink {
                id: device.id.clone(),
                on_presence,
                routes: self.direct.routes(),
            },
            device.name.clone(),
        );
        self.connections
            .lock()
            .unwrap()
            .insert(device.id.clone(), handle);
    }

    /// Subscribes to device connection-state changes, so a viewport can push a fresh device list.
    pub fn subscribe_changes(&self) -> broadcast::Receiver<()> {
        self.changed_tx.subscribe()
    }

    fn summary(&self, device: &Device) -> DeviceSummary {
        let route = self
            .connected
            .lock()
            .unwrap()
            .get(&device.id)
            .and_then(|presence| presence.route());

        DeviceSummary {
            id: device.id.clone(),
            name: device.name.clone(),
            pairing_code: pairing_code(device, &self.relay_url.lock().unwrap()),
            connected: route.is_some(),
            route,
        }
    }
}

/// How the direct listener decides on a socket: a device it names that is paired is let in with
/// its key, and reports its presence like the relay link does.
fn admit(
    devices: Arc<Mutex<Vec<Device>>>,
    connected: Arc<Mutex<HashMap<String, Presence>>>,
    changed_tx: broadcast::Sender<()>,
    awake: Awake,
) -> Admit {
    Arc::new(move |id| {
        let devices = devices.lock().unwrap();
        let device = devices.iter().find(|device| device.id == id)?;

        Some(Admission {
            key: device.key.clone(),
            name: device.name.clone(),
            on_presence: presence_sink(
                connected.clone(),
                changed_tx.clone(),
                awake.clone(),
                device.id.clone(),
                |presence, present| {
                    presence.direct = if present {
                        presence.direct + 1
                    } else {
                        presence.direct.saturating_sub(1)
                    }
                },
            ),
        })
    })
}

/// A sink that records one link's presence for a device, wakes viewports when the device's route
/// changes as a result, and keeps the machine awake while any device is there.
fn presence_sink(
    connected: Arc<Mutex<HashMap<String, Presence>>>,
    changed_tx: broadcast::Sender<()>,
    awake: Awake,
    id: String,
    apply: fn(&mut Presence, bool),
) -> PresenceSink {
    Arc::new(move |present| {
        let (changed, any) = {
            let mut connected = connected.lock().unwrap();
            let presence = connected.entry(id.clone()).or_default();
            let before = presence.route();
            apply(presence, present);
            let changed = presence.route() != before;
            let any = connected.values().any(|one| one.route().is_some());
            (changed, any)
        };
        if changed {
            awake.set(any);
            let _ = changed_tx.send(());
        }
    })
}

/// Everything the mobile app needs to reach this device's room, as the text of the QR it scans:
/// `soromi://pair#<base64url(JSON)>`. The payload sits in the fragment so that an app or service
/// handed the link as a URL does not log it along with the path.
fn pairing_code(device: &Device, relay_url: &str) -> String {
    let payload = serde_json::json!({
        "v": PAIRING_CODE_VERSION,
        "device": device.id,
        "relay": relay_url,
        "room": device.room,
        "key": device.key,
    });
    format!(
        "soromi://pair#{}",
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(payload.to_string())
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_device_is_on_its_direct_route_whenever_it_has_one() {
        let mut presence = Presence::default();
        assert_eq!(presence.route(), None);

        presence.relay = true;
        assert_eq!(presence.route(), Some(DeviceRoute::Relay));

        presence.direct = 1;
        assert_eq!(presence.route(), Some(DeviceRoute::Direct));

        presence.relay = false;
        assert_eq!(presence.route(), Some(DeviceRoute::Direct));
    }

    #[test]
    fn a_route_change_wakes_viewports_and_a_repeat_does_not() {
        let connected = Arc::new(Mutex::new(HashMap::new()));
        let (changed_tx, mut changed) = broadcast::channel(8);
        let relay = presence_sink(
            connected.clone(),
            changed_tx,
            Awake::new(|_| {}),
            "d1".to_string(),
            |p, on| p.relay = on,
        );

        relay(true);
        relay(true);
        assert!(changed.try_recv().is_ok());
        assert!(changed.try_recv().is_err());

        relay(false);
        assert!(changed.try_recv().is_ok());
    }

    #[tokio::test(start_paused = true)]
    async fn the_machine_is_held_awake_while_a_device_is_there_and_a_while_after() {
        let held = Arc::new(Mutex::new(Vec::new()));
        let record = held.clone();
        let connected = Arc::new(Mutex::new(HashMap::new()));
        let (changed_tx, _changed) = broadcast::channel(8);
        let awake = Awake::new(move |on| record.lock().unwrap().push(on));
        let sink = |id: &str, apply: fn(&mut Presence, bool)| {
            presence_sink(
                connected.clone(),
                changed_tx.clone(),
                awake.clone(),
                id.to_string(),
                apply,
            )
        };
        let relay = sink("d1", |p, on| p.relay = on);
        let direct = sink("d1", |p, on| p.direct = u32::from(on));

        // Held from the moment a device is there.
        relay(true);
        assert_eq!(*held.lock().unwrap(), vec![true]);

        // It drops off and is back within the linger, by another route: never let go.
        relay(false);
        tokio::time::sleep(AWAKE_LINGER / 2).await;
        direct(true);
        tokio::time::sleep(AWAKE_LINGER * 2).await;
        assert_eq!(*held.lock().unwrap(), vec![true, true]);

        // Gone for good: let go once the linger has passed, and not before.
        direct(false);
        tokio::time::sleep(AWAKE_LINGER - Duration::from_secs(1)).await;
        assert_eq!(held.lock().unwrap().last(), Some(&true));
        tokio::time::sleep(Duration::from_secs(2)).await;
        assert_eq!(held.lock().unwrap().last(), Some(&false));
    }

    #[test]
    fn a_pairing_code_carries_the_room_and_key_in_its_fragment() {
        let device = Device {
            id: "d1".into(),
            name: "Phone".into(),
            room: "room/1".into(),
            key: "a+b/c=".into(),
        };
        let code = pairing_code(&device, "wss://relay.example/?x=1");
        // The client's parser is tested against this exact text, so the two cannot drift apart.
        assert_eq!(
            code,
            "soromi://pair#eyJkZXZpY2UiOiJkMSIsImtleSI6ImErYi9jPSIsInJlbGF5Ijoid3NzOi8vcmVsYXkuZXhhbXBsZS8_eD0xIiwicm9vbSI6InJvb20vMSIsInYiOjF9"
        );

        let encoded = code
            .strip_prefix("soromi://pair#")
            .expect("scheme and fragment");
        // Nothing in the payload needs escaping to survive a QR or a link.
        assert!(
            encoded
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        );
        let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(encoded)
            .unwrap();
        let payload: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(
            payload,
            serde_json::json!({
                "v": 1,
                "device": "d1",
                "relay": "wss://relay.example/?x=1",
                "room": "room/1",
                "key": "a+b/c=",
            })
        );
    }
}
