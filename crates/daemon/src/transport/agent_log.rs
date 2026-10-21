//! Following one background agent's own conversation for a viewport (`WatchAgent`): its log is
//! found, read from the top, and followed as it grows, each batch sent as an `AgentLog`.

use std::sync::Arc;
use std::time::Duration;

use soromi_protocol::{ChatEvent, ServerMessage};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

use super::outbound::Outbound;
use crate::transcript::tailer;
use crate::workspaces::service::WorkspaceService;

/// How long an agent that has not written its log yet is waited for, and how often it is looked
/// for meanwhile. One just started is a moment behind its row.
const FIND_FOR: Duration = Duration::from_secs(60);
const FIND_EVERY: Duration = Duration::from_millis(500);
/// How much of a long log the viewport is sent when it starts watching: the latest of it.
const LATEST: usize = 200;
/// The most of one tool call's input or output sent: a file read whole, or a long command's
/// output, would not fit through the relay with the rest.
const TOOL_TEXT: usize = 6_000;

enum Item {
    Events(Vec<ChatEvent>),
    /// The log was replaced: what was sent of it is void.
    Restart,
}

/// Starts following `agent` of `session` for this viewport. The task ends when aborted.
pub fn follow(
    hub: Arc<WorkspaceService>,
    out: Outbound,
    session: String,
    agent: String,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        let Some((path, provider)) = find(&hub, &session, &agent).await else {
            // Nothing to show: an empty log says so, rather than leaving the viewport waiting.
            let _ = out.send(ServerMessage::AgentLog {
                session,
                agent,
                events: Vec::new(),
                reset: true,
                earlier: false,
            });
            return;
        };

        let (items, mut received) = mpsc::unbounded_channel::<Item>();
        let restarts = items.clone();
        let reading = tokio::spawn(tailer::tail(
            path,
            move |line| provider.parse_agent_log_line(line),
            move |events| {
                let _ = items.send(Item::Events(events));
            },
            move || {
                let _ = restarts.send(Item::Restart);
            },
        ));

        // Whatever arrived together goes out together: reading the log from the top hands over
        // every line at once, and that is one message, not hundreds.
        let mut reset = true;
        while let Some(first) = received.recv().await {
            let mut batch = vec![first];
            while let Ok(next) = received.try_recv() {
                batch.push(next);
            }
            let mut events = Vec::new();
            for item in batch {
                match item {
                    Item::Events(more) => events.extend(more.into_iter().map(fit)),
                    Item::Restart => {
                        events.clear();
                        reset = true;
                    }
                }
            }
            let earlier = reset && events.len() > LATEST;
            if earlier {
                events.drain(..events.len() - LATEST);
            }
            if events.is_empty() && !reset {
                continue;
            }
            let sent = out.send(ServerMessage::AgentLog {
                session: session.clone(),
                agent: agent.clone(),
                events,
                reset,
                earlier,
            });
            if sent.is_err() {
                break;
            }
            reset = false;
        }
        reading.abort();
    })
}

/// The agent's log, looked for until it turns up or the wait is over.
async fn find(
    hub: &WorkspaceService,
    session: &str,
    agent: &str,
) -> Option<(std::path::PathBuf, &'static dyn crate::providers::Provider)> {
    let deadline = tokio::time::Instant::now() + FIND_FOR;
    loop {
        if let Some(found) = hub.agent_log(session, agent) {
            return Some(found);
        }
        if tokio::time::Instant::now() >= deadline {
            return None;
        }
        tokio::time::sleep(FIND_EVERY).await;
    }
}

/// An event as a viewport is sent it: pictures left out, and a tool call's long input or output
/// cut down, so that the log fits through the relay.
fn fit(event: ChatEvent) -> ChatEvent {
    match event {
        ChatEvent::ToolResult { id, ok, text, .. } => ChatEvent::ToolResult {
            id,
            ok,
            text: clip(text),
            files: Vec::new(),
        },
        ChatEvent::User { text, .. } => ChatEvent::User {
            text,
            files: Vec::new(),
        },
        ChatEvent::Tool {
            id,
            name,
            path,
            body,
            tool_kind,
        } => ChatEvent::Tool {
            id,
            name,
            path,
            body: body.map(clip),
            tool_kind,
        },
        other => other,
    }
}

fn clip(text: String) -> String {
    if text.chars().count() <= TOOL_TEXT {
        return text;
    }
    let mut clipped: String = text.chars().take(TOOL_TEXT).collect();
    clipped.push_str("\n…");
    clipped
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_log_is_sent_without_pictures_and_with_long_tool_text_cut() {
        let picture = soromi_protocol::ChatFile {
            media_type: "image/png".into(),
            data: "aGk=".into(),
            filename: None,
            deferred: false,
        };
        let fitted = fit(ChatEvent::ToolResult {
            id: "t1".into(),
            ok: true,
            text: "x".repeat(TOOL_TEXT + 10),
            files: vec![picture],
        });

        let ChatEvent::ToolResult { text, files, .. } = fitted else {
            panic!("still a tool result");
        };
        assert!(files.is_empty());
        assert_eq!(text.chars().count(), TOOL_TEXT + 2);
        assert_eq!(clip("short".into()), "short");
    }
}
