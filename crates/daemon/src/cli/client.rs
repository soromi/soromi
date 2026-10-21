//! A one-off client of the daemon running on this machine, over the same local link the desktop
//! app uses. That link is trusted (it can pair devices), which is why it only listens on loopback.

use std::time::Duration;

use anyhow::{Context, bail};
use futures_util::{SinkExt, StreamExt};
use soromi_protocol::{
    ClientMessage, HostInfo, IncompatibleAction, PROTOCOL_VERSION, ServerMessage,
};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async};

use crate::instance;

/// The port of the daemon to talk to: the one `SOROMI_PORT` names, else the one the daemon
/// running on this home said it listens on (the desktop app picks its port at random), else the
/// default.
/// Where the running daemon listens, and the token its local link takes (from `daemon.json`, or
/// `SOROMI_LOCAL_TOKEN` for one started with it). `SOROMI_PORT` names the port by hand.
fn daemon_link() -> (u16, Option<String>) {
    let running = instance::running();
    let token = std::env::var("SOROMI_LOCAL_TOKEN")
        .ok()
        .filter(|token| !token.trim().is_empty())
        .or_else(|| running.as_ref().and_then(|info| info.token.clone()));
    if std::env::var_os("SOROMI_PORT").is_some() {
        return (crate::config::port(), token);
    }
    let port = running
        .map(|info| info.port)
        .unwrap_or_else(crate::config::port);

    (port, token)
}

/// How long the daemon has to answer one request.
const ANSWER_TIMEOUT: Duration = Duration::from_secs(10);

pub struct LocalClient {
    socket: WebSocketStream<MaybeTlsStream<TcpStream>>,
    /// The running daemon's release, from its welcome.
    pub version: String,
    /// The computer it runs on and what started it; `None` from a daemon too old to say.
    pub host: Option<HostInfo>,
    /// The port it was reached on.
    pub port: u16,
}

impl LocalClient {
    /// Connects to the daemon and says hello. Fails with a hint when no daemon is running.
    pub async fn connect() -> anyhow::Result<Self> {
        let (port, token) = daemon_link();
        let (socket, _) = connect_async(crate::transport::local::url(port, token.as_deref()))
            .await
            .map_err(|_| {
                anyhow::anyhow!(
                    "no Soromi daemon is answering on port {port}. Start it with `soromi serve` \
                     (or its service) first"
                )
            })?;
        let mut client = Self {
            socket,
            version: String::new(),
            host: None,
            port,
        };

        client
            .send(ClientMessage::Hello {
                protocol: PROTOCOL_VERSION,
                client_id: format!("cli-{}", uuid::Uuid::new_v4()),
                device_name: None,
            })
            .await?;
        let (version, host) = client
            .answer(|message| match message {
                ServerMessage::Welcome { version, host, .. } => Some(Ok((version, host))),
                ServerMessage::Incompatible { action, .. } => Some(Err(match action {
                    IncompatibleAction::UpdateClient => {
                        "this soromi is older than the daemon running here; use the same version"
                    }
                    IncompatibleAction::UpdateDaemon => {
                        "the daemon running here is older than this soromi; restart it"
                    }
                })),
                _ => None,
            })
            .await?
            .map_err(anyhow::Error::msg)?;
        client.version = version;
        client.host = host;

        Ok(client)
    }

    pub async fn send(&mut self, message: ClientMessage) -> anyhow::Result<()> {
        let text = serde_json::to_string(&message)?;
        self.socket.send(Message::Text(text)).await?;
        Ok(())
    }

    /// Waits for the first message `pick` takes, passing over everything else the daemon streams
    /// to a viewport. An `Error` from the daemon ends the wait with its message.
    pub async fn answer<T>(
        &mut self,
        mut pick: impl FnMut(ServerMessage) -> Option<T>,
    ) -> anyhow::Result<T> {
        let waiting = async {
            while let Some(frame) = self.socket.next().await {
                let Message::Text(text) = frame? else {
                    continue;
                };
                // A message this build does not know is something it was not waiting for.
                let Ok(message) = serde_json::from_str::<ServerMessage>(&text) else {
                    continue;
                };
                if let ServerMessage::Error { message } = message {
                    bail!(message);
                }
                if let Some(picked) = pick(message) {
                    return Ok(picked);
                }
            }
            bail!("the daemon closed the connection")
        };

        tokio::time::timeout(ANSWER_TIMEOUT, waiting)
            .await
            .context("the daemon did not answer")?
    }

    /// Sends `message` and waits for its answer.
    pub async fn request<T>(
        &mut self,
        message: ClientMessage,
        pick: impl FnMut(ServerMessage) -> Option<T>,
    ) -> anyhow::Result<T> {
        self.send(message).await?;
        self.answer(pick).await
    }

    pub async fn close(mut self) {
        let _ = self.socket.close(None).await;
    }
}
