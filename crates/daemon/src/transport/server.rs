use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::net::TcpListener;
use tokio::sync::{broadcast, mpsc};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{WebSocketStream, accept_async};

use soromi_protocol::ServerMessage;

use super::codec::Codec;
use super::connection::{Connection, send_state};
use crate::accounts::store::FileAccountManager;
use crate::pairing::PairingService;
use crate::workspaces::service::WorkspaceService;

/// Accepts local viewport connections forever. Each connection runs independently and, being
/// local (trusted), carries the pairing service so the desktop can manage devices.
pub async fn serve(
    listener: TcpListener,
    hub: Arc<WorkspaceService>,
    accounts: Arc<FileAccountManager>,
    pairing: Arc<PairingService>,
) {
    loop {
        let Ok((stream, _)) = listener.accept().await else {
            continue;
        };
        let hub = hub.clone();
        let accounts = accounts.clone();
        let pairing = pairing.clone();
        tokio::spawn(async move {
            if let Ok(ws) = accept_async(stream).await {
                // Local links are trusted, so they run plaintext and can manage devices.
                handle_connection(ws, hub, accounts, Codec::Plain, Some(pairing)).await;
            }
        });
    }
}

/// Runs one viewport connection over a WebSocket, whichever way it arrived: accepted locally
/// (`serve`) or dialed out to a relay. Generic over the stream so both share this exact routing.
/// The `codec` decides plaintext (local) vs encrypted (relay) framing; `pairing` is `Some` only
/// for the trusted local link, so only the desktop can create/list/revoke devices.
pub(crate) async fn handle_connection<S>(
    ws: WebSocketStream<S>,
    hub: Arc<WorkspaceService>,
    accounts: Arc<FileAccountManager>,
    codec: Codec,
    pairing: Option<Arc<PairingService>>,
) where
    S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    let codec = Arc::new(codec);
    let (mut sink, mut source) = ws.split();
    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<ServerMessage>();

    // Writer task: encode outbound messages (plaintext or encrypted) and send them, in order.
    let writer_codec = codec.clone();
    let writer = tokio::spawn(async move {
        while let Some(message) = out_rx.recv().await {
            let Some(frame) = writer_codec.encode(&message) else {
                continue;
            };
            if sink.send(frame).await.is_err() {
                break;
            }
        }
    });

    // Change task: push workspace-list + keep-awake whenever the hub changes.
    let change_hub = hub.clone();
    let change_out = out_tx.clone();
    let mut changes = hub.subscribe_changes();
    let change_task = tokio::spawn(async move {
        loop {
            match changes.recv().await {
                Ok(()) => send_state(&change_hub, &change_out),
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    // Dir-change task: when a watched directory changes on disk, re-list it and push the update,
    // so the file tree stays live without the viewport polling.
    let dir_hub = hub.clone();
    let dir_out = out_tx.clone();
    let mut dir_changes = hub.subscribe_dir_changes();
    let dir_task = tokio::spawn(async move {
        loop {
            match dir_changes.recv().await {
                Ok((workspace, path)) => {
                    let entries = dir_hub.list_dir(&workspace, &path);
                    let _ = dir_out.send(ServerMessage::DirListing {
                        workspace,
                        path,
                        entries,
                    });
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    // Reset task: when a session's agent is relaunched (folders/account changed), tell this
    // viewport to re-attach so its terminal reflects the fresh process.
    let reset_out = out_tx.clone();
    let mut resets = hub.subscribe_resets();
    let reset_task = tokio::spawn(async move {
        loop {
            match resets.recv().await {
                Ok(session) => {
                    let _ = reset_out.send(ServerMessage::SessionReset { session });
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    let mut connection = Connection::new(hub, accounts, pairing, out_tx);
    while let Some(Ok(message)) = source.next().await {
        if matches!(message, Message::Close(_)) {
            break;
        }
        if let Some(client) = codec.decode(message) {
            connection.handle(client);
        }
    }

    connection.dispose();
    change_task.abort();
    dir_task.abort();
    reset_task.abort();
    writer.abort();
}
