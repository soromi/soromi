use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use base64::Engine;
use soromi_protocol::DeviceSummary;
use tokio::sync::broadcast;
use tokio::task::AbortHandle;

use crate::accounts::store::FileAccountManager;
use crate::pairing::device::{Device, load_devices, save_devices};
use crate::workspaces::service::WorkspaceService;

/// The layout of the pairing code's payload. A scanner that does not know the version it reads asks
/// for an app update instead of guessing.
const PAIRING_CODE_VERSION: u32 = 1;

/// Owns the paired devices and one relay connection per device. Device management happens only over
/// the trusted local link (the desktop app); the per-device relay links are plain viewports that
/// never reach back into this service, so a phone can neither list devices nor see other keys.
pub struct PairingService {
    hub: Arc<WorkspaceService>,
    accounts: Arc<FileAccountManager>,
    /// The relay URL and relay access key; behind locks so a self-host settings change applies
    /// live. The access key is presented (as a header) when dialing the relay.
    relay_url: Mutex<String>,
    access_key: Mutex<String>,
    devices: Mutex<Vec<Device>>,
    /// device id -> its relay dial task, so revoking can stop it.
    connections: Mutex<HashMap<String, AbortHandle>>,
    /// device id -> whether its phone is currently attached through the relay (live). Shared with
    /// the per-device relay clients, which flip it as the phone joins / drops.
    connected: Arc<Mutex<HashMap<String, bool>>>,
    /// Fires when any device's connection state changes, so viewports re-fetch the device list.
    changed_tx: broadcast::Sender<()>,
}

impl PairingService {
    /// Loads persisted devices and starts dialing the relay for each. Must run within a runtime.
    pub fn new(
        hub: Arc<WorkspaceService>,
        accounts: Arc<FileAccountManager>,
        relay_url: String,
        access_key: String,
    ) -> Arc<Self> {
        let (changed_tx, _) = broadcast::channel(16);
        let service = Arc::new(Self {
            hub,
            accounts,
            relay_url: Mutex::new(relay_url),
            access_key: Mutex::new(access_key),
            devices: Mutex::new(load_devices()),
            connections: Mutex::new(HashMap::new()),
            connected: Arc::new(Mutex::new(HashMap::new())),
            changed_tx,
        });

        for device in service.devices.lock().unwrap().iter() {
            service.dial(device);
        }

        service
    }

    /// Pairs a new device, starts dialing its room, and returns its summary (with the QR code).
    pub fn create_device(&self, name: String) -> DeviceSummary {
        let device = Device::generate(name);
        self.dial(&device);

        let summary = self.summary(&device);
        let mut devices = self.devices.lock().unwrap();
        devices.push(device);
        save_devices(&devices);

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

    /// Forgets a device and stops dialing its room. Returns the remaining devices.
    pub fn revoke_device(&self, id: &str) -> Vec<DeviceSummary> {
        if let Some(handle) = self.connections.lock().unwrap().remove(id) {
            handle.abort();
        }
        self.connected.lock().unwrap().remove(id);

        let mut devices = self.devices.lock().unwrap();
        devices.retain(|device| device.id != id);
        save_devices(&devices);

        devices.iter().map(|device| self.summary(device)).collect()
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

    /// Dials the relay for a device's room and records the task so revoking can stop it. The relay
    /// client reports the phone's live presence back into `connected`, waking viewports on change.
    fn dial(&self, device: &Device) {
        let connected = self.connected.clone();
        let changed_tx = self.changed_tx.clone();
        let id = device.id.clone();
        let on_presence: crate::transport::server::PresenceSink = Arc::new(move |present| {
            let changed = connected.lock().unwrap().insert(id.clone(), present) != Some(present);
            if changed {
                let _ = changed_tx.send(());
            }
        });

        let handle = crate::transport::relay::spawn_device(
            self.hub.clone(),
            self.accounts.clone(),
            self.relay_url.lock().unwrap().clone(),
            device.room.clone(),
            device.key.clone(),
            self.access_key.lock().unwrap().clone(),
            on_presence,
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
        DeviceSummary {
            id: device.id.clone(),
            name: device.name.clone(),
            pairing_code: pairing_code(device, &self.relay_url.lock().unwrap()),
            connected: *self
                .connected
                .lock()
                .unwrap()
                .get(&device.id)
                .unwrap_or(&false),
        }
    }
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
    fn a_pairing_code_carries_the_room_and_key_in_its_fragment() {
        let device = Device {
            id: "d1".into(),
            name: "Phone".into(),
            room: "room/1".into(),
            key: "a+b/c=".into(),
        };
        let code = pairing_code(&device, "wss://relay.example/?x=1");

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
