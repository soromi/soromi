use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use soromi_protocol::DeviceSummary;
use tokio::sync::broadcast;
use tokio::task::AbortHandle;

use crate::accounts::store::FileAccountManager;
use crate::pairing::device::{Device, load_devices, save_devices};
use crate::workspaces::service::WorkspaceService;

/// Owns the paired devices and one relay connection per device. Device management happens only over
/// the trusted local link (the desktop app); the per-device relay links are plain viewports that
/// never reach back into this service, so a phone can neither list devices nor see other keys.
pub struct PairingService {
    hub: Arc<WorkspaceService>,
    accounts: Arc<FileAccountManager>,
    /// The relay + web URLs and relay access key; behind locks so a self-host settings change
    /// applies live. The access key is presented (as a header) when dialing the relay.
    relay_url: Mutex<String>,
    web_url: Mutex<String>,
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
        web_url: String,
        access_key: String,
    ) -> Arc<Self> {
        let (changed_tx, _) = broadcast::channel(16);
        let service = Arc::new(Self {
            hub,
            accounts,
            relay_url: Mutex::new(relay_url),
            web_url: Mutex::new(web_url),
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

    /// Pairs a new device, starts dialing its room, and returns its summary (with the QR url).
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

    /// Updates the relay + web URLs and relay access key (self-host settings change). Re-dials every
    /// device when the relay URL or access key changed, so the change is live, not restart-gated.
    pub fn set_remote(&self, relay_url: String, web_url: String, access_key: String) {
        *self.web_url.lock().unwrap() = web_url;

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
            pairing_url: self.pairing_url(device),
            connected: *self
                .connected
                .lock()
                .unwrap()
                .get(&device.id)
                .unwrap_or(&false),
        }
    }

    /// `<webUrl>/?relay=<relay>&room=<room>&key=<key>`, with values URL-encoded.
    fn pairing_url(&self, device: &Device) -> String {
        format!(
            "{}/?relay={}&room={}&key={}",
            self.web_url.lock().unwrap().trim_end_matches('/'),
            urlencoding::encode(&self.relay_url.lock().unwrap()),
            urlencoding::encode(&device.room),
            urlencoding::encode(&device.key),
        )
    }
}
