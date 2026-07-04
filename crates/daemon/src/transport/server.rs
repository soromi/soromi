use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, mpsc};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{accept_async, WebSocketStream};

use soromi_protocol::{ClientMessage, ServerMessage};

use super::connection::{send_state, Connection};
use crate::accounts::store::FileAccountManager;
use crate::workspaces::service::WorkspaceService;

/// Accepts viewport connections forever. Each connection runs independently.
pub async fn serve(
    listener: TcpListener,
    hub: Arc<WorkspaceService>,
    accounts: Arc<FileAccountManager>,
) {
    loop {
        let Ok((stream, _)) = listener.accept().await else {
            continue;
        };
        let hub = hub.clone();
        let accounts = accounts.clone();
        tokio::spawn(async move {
            if let Ok(ws) = accept_async(stream).await {
                handle_connection(ws, hub, accounts).await;
            }
        });
    }
}

async fn handle_connection(
    ws: WebSocketStream<TcpStream>,
    hub: Arc<WorkspaceService>,
    accounts: Arc<FileAccountManager>,
) {
    let (mut sink, mut source) = ws.split();
    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<ServerMessage>();

    // Writer task: serialize outbound messages to the socket, in order.
    let writer = tokio::spawn(async move {
        while let Some(message) = out_rx.recv().await {
            let Ok(text) = serde_json::to_string(&message) else {
                continue;
            };
            if sink.send(Message::Text(text)).await.is_err() {
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

    let mut connection = Connection::new(hub, accounts, out_tx);
    while let Some(Ok(message)) = source.next().await {
        match message {
            Message::Text(text) => {
                if let Ok(client) = serde_json::from_str::<ClientMessage>(&text) {
                    connection.handle(client);
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    connection.dispose();
    change_task.abort();
    writer.abort();
}
