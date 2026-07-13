use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use soromi_protocol::DeviceSummary;
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
    relay_url: String,
    web_url: String,
    devices: Mutex<Vec<Device>>,
    /// device id -> its relay dial task, so revoking can stop it.
    connections: Mutex<HashMap<String, AbortHandle>>,
}

impl PairingService {
    /// Loads persisted devices and starts dialing the relay for each. Must run within a runtime.
    pub fn new(
        hub: Arc<WorkspaceService>,
        accounts: Arc<FileAccountManager>,
        relay_url: String,
        web_url: String,
    ) -> Arc<Self> {
        let service = Arc::new(Self {
            hub,
            accounts,
            relay_url,
            web_url,
            devices: Mutex::new(load_devices()),
            connections: Mutex::new(HashMap::new()),
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

        let mut devices = self.devices.lock().unwrap();
        devices.retain(|device| device.id != id);
        save_devices(&devices);

        devices.iter().map(|device| self.summary(device)).collect()
    }

    /// Dials the relay for a device's room and records the task so revoking can stop it.
    fn dial(&self, device: &Device) {
        let handle = crate::transport::relay::spawn_device(
            self.hub.clone(),
            self.accounts.clone(),
            self.relay_url.clone(),
            device.room.clone(),
            device.key.clone(),
        );
        self.connections
            .lock()
            .unwrap()
            .insert(device.id.clone(), handle);
    }

    fn summary(&self, device: &Device) -> DeviceSummary {
        DeviceSummary {
            id: device.id.clone(),
            name: device.name.clone(),
            pairing_url: self.pairing_url(device),
        }
    }

    /// `<webUrl>/?relay=<relay>&room=<room>&key=<key>`, with values URL-encoded.
    fn pairing_url(&self, device: &Device) -> String {
        format!(
            "{}/?relay={}&room={}&key={}",
            self.web_url.trim_end_matches('/'),
            urlencoding::encode(&self.relay_url),
            urlencoding::encode(&device.room),
            urlencoding::encode(&device.key),
        )
    }
}
