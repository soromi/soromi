//! Measures a daemon link from the client side: round-trip time, and how many frames and bytes of
//! each kind arrive while watching a session. Works against the local socket or through a relay.
//!
//! ```text
//! cargo run -p soromi-daemon --example remote_bench -- --url ws://127.0.0.1:8317
//! cargo run -p soromi-daemon --example remote_bench -- \
//!     --url 'wss://relay.example/?room=<room>' --key <base64 key> --session <id> --watch 60
//! ```
//!
//! `--watch <seconds>` tallies what arrives; add `--session <id>` to attach to one and include its
//! stream.
//!
//! It only observes: it never takes control, sends input, or changes anything on the daemon.

use std::collections::BTreeMap;
use std::time::{Duration, Instant};

use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

use soromi_daemon::transport::codec::Codec;
use soromi_protocol::{PROTOCOL_VERSION, TERMINAL_OUTPUT};

type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

struct Args {
    url: String,
    key: Option<String>,
    session: Option<String>,
    pings: u32,
    watch: u64,
}

fn parse_args() -> Result<Args, String> {
    let mut args = Args {
        url: String::new(),
        key: None,
        session: None,
        pings: 20,
        watch: 0,
    };
    let mut input = std::env::args().skip(1);
    while let Some(flag) = input.next() {
        let mut value = || input.next().ok_or(format!("{flag} needs a value"));
        match flag.as_str() {
            "--url" => args.url = value()?,
            "--key" => args.key = Some(value()?),
            "--session" => args.session = Some(value()?),
            "--pings" => args.pings = value()?.parse().map_err(|_| "--pings takes a number")?,
            "--watch" => args.watch = value()?.parse().map_err(|_| "--watch takes seconds")?,
            other => return Err(format!("unknown argument {other}")),
        }
    }
    if args.url.is_empty() {
        return Err("--url is required".to_string());
    }
    Ok(args)
}

/// A received frame, reduced to what the tally needs.
enum Incoming {
    /// A JSON message and its size on the wire.
    Json(Value, usize),
    /// A binary terminal frame and its size on the wire.
    Terminal(usize),
    /// The relay reporting whether the daemon is in the room.
    Presence(bool),
}

struct Link {
    socket: Socket,
    codec: Codec,
}

impl Link {
    async fn send(&mut self, value: Value) -> Result<(), String> {
        let frame = self
            .codec
            .seal(value.to_string().into_bytes(), true)
            .ok_or("could not encode a frame")?;
        self.socket.send(frame).await.map_err(|e| e.to_string())
    }

    /// The next frame, or `None` if `wait` passes first.
    async fn next(&mut self, wait: Duration) -> Result<Option<Incoming>, String> {
        loop {
            let frame = match tokio::time::timeout(wait, self.socket.next()).await {
                Err(_) => return Ok(None),
                Ok(None) => return Err("the connection closed".to_string()),
                Ok(Some(frame)) => frame.map_err(|e| e.to_string())?,
            };
            let size = frame.len();
            // Presence is plaintext from the relay itself, even on an encrypted link.
            if let Message::Text(text) = &frame
                && let Ok(value) = serde_json::from_str::<Value>(text)
                && value["__relay"] == "presence"
            {
                return Ok(Some(Incoming::Presence(
                    value["peers"].as_u64().unwrap_or(0) > 1,
                )));
            }
            let Some(payload) = self.codec.open(frame) else {
                continue;
            };
            if payload.first() == Some(&TERMINAL_OUTPUT) {
                return Ok(Some(Incoming::Terminal(size)));
            }
            if let Ok(value) = serde_json::from_slice(&payload) {
                return Ok(Some(Incoming::Json(value, size)));
            }
        }
    }

    /// Reads until a JSON message of type `ty` and returns it with its size on the wire, or `None`
    /// if `wait` passes first.
    async fn until(&mut self, ty: &str, wait: Duration) -> Result<Option<(Value, usize)>, String> {
        let deadline = Instant::now() + wait;
        loop {
            let left = deadline.saturating_duration_since(Instant::now());
            match self.next(left).await? {
                None => return Ok(None),
                Some(Incoming::Json(value, size)) if value["type"] == ty => {
                    return Ok(Some((value, size)));
                }
                Some(_) => continue,
            }
        }
    }
}

fn percentile(sorted: &[Duration], p: f64) -> Duration {
    let index = ((sorted.len() as f64 - 1.0) * p).round() as usize;
    sorted[index]
}

async fn run(args: Args) -> Result<(), String> {
    let codec = match &args.key {
        Some(key) => Codec::from_key_base64(key).ok_or("--key is not a base64 32-byte key")?,
        None => Codec::Plain,
    };
    let through_relay = args.key.is_some();

    let started = Instant::now();
    let (socket, _) = tokio_tungstenite::connect_async(&args.url)
        .await
        .map_err(|e| format!("could not connect: {e}"))?;
    println!("connected in {:.0?}", started.elapsed());
    let mut link = Link { socket, codec };

    if through_relay {
        // Nothing sent before the daemon is in the room would reach it.
        loop {
            match link.next(Duration::from_secs(10)).await? {
                Some(Incoming::Presence(true)) => break,
                Some(_) => continue,
                None => return Err("the daemon is not on the relay".to_string()),
            }
        }
        println!("daemon present after {:.0?}", started.elapsed());
    }

    link.send(json!({
        "type": "hello",
        "protocol": PROTOCOL_VERSION,
        "clientId": "remote-bench"
    }))
    .await?;
    loop {
        match link.next(Duration::from_secs(5)).await? {
            Some(Incoming::Json(reply, _)) if reply["type"] == "welcome" => {
                println!(
                    "daemon {} speaking protocol {}",
                    reply["version"].as_str().unwrap_or("?"),
                    reply["protocol"]
                );
                break;
            }
            Some(Incoming::Json(reply, _)) if reply["type"] == "incompatible" => {
                return Err(format!(
                    "the daemon speaks protocol {}, this build speaks {PROTOCOL_VERSION}",
                    reply["protocol"]
                ));
            }
            Some(_) => continue,
            None => return Err("the daemon did not answer the hello".to_string()),
        }
    }

    let asked = Instant::now();
    link.send(json!({ "type": "list-workspaces" })).await?;
    let (list, list_bytes) = link
        .until("workspace-list", Duration::from_secs(10))
        .await?
        .ok_or("no workspace list arrived")?;
    println!(
        "workspace list in {:.0?} ({list_bytes} bytes on the wire)",
        asked.elapsed()
    );
    for workspace in list["workspaces"].as_array().into_iter().flatten() {
        println!("  {}", workspace["name"].as_str().unwrap_or("?"));
        for session in workspace["sessions"].as_array().into_iter().flatten() {
            println!(
                "    {}  {}  {}  {}",
                session["id"].as_str().unwrap_or("?"),
                session["agent"].as_str().unwrap_or("?"),
                session["mode"].as_str().unwrap_or("?"),
                session["status"].as_str().unwrap_or("?"),
            );
        }
    }

    if args.pings > 0 {
        let mut times = Vec::new();
        for nonce in 0..args.pings {
            let sent = Instant::now();
            link.send(json!({ "type": "ping", "nonce": nonce })).await?;
            match link.until("pong", Duration::from_secs(5)).await? {
                Some(_) => times.push(sent.elapsed()),
                None => {
                    println!("no pong: this daemon cannot be pinged");
                    break;
                }
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        if !times.is_empty() {
            times.sort();
            println!(
                "round trip over {} pings: min {:.1?}  median {:.1?}  p95 {:.1?}  max {:.1?}",
                times.len(),
                times[0],
                percentile(&times, 0.5),
                percentile(&times, 0.95),
                times[times.len() - 1],
            );
        }
    }

    if args.watch == 0 {
        return Ok(());
    }
    // With a session, attach and count its stream too; without one, count only what every
    // connected viewport is sent. Attaching to a session that has not started yet launches its agent,
    // so that is left to an explicit `--session`.
    match &args.session {
        Some(session) => {
            println!("watching {session} for {}s", args.watch);
            link.send(json!({ "type": "attach", "session": session }))
                .await?;
        }
        None => println!("watching the connection for {}s", args.watch),
    }
    let mut tally: BTreeMap<String, (u64, u64)> = BTreeMap::new();
    let deadline = Instant::now() + Duration::from_secs(args.watch);
    loop {
        let left = deadline.saturating_duration_since(Instant::now());
        let (kind, size) = match link.next(left).await? {
            None => break,
            Some(Incoming::Presence(_)) => continue,
            Some(Incoming::Terminal(size)) => ("terminal".to_string(), size),
            Some(Incoming::Json(value, size)) => (
                value["type"].as_str().unwrap_or("unknown").to_string(),
                size,
            ),
        };
        let entry = tally.entry(kind).or_default();
        entry.0 += 1;
        entry.1 += size as u64;
    }
    let mut rows: Vec<_> = tally.into_iter().collect();
    rows.sort_by_key(|(_, (_, bytes))| std::cmp::Reverse(*bytes));
    let (frames, bytes) = rows
        .iter()
        .fold((0, 0), |sum, (_, row)| (sum.0 + row.0, sum.1 + row.1));
    println!("{frames} frames, {bytes} bytes on the wire");
    for (kind, (frames, bytes)) in rows {
        println!("  {kind}: {frames} frames, {bytes} bytes");
    }
    Ok(())
}

#[tokio::main]
async fn main() {
    let result = match parse_args() {
        Ok(args) => run(args).await,
        Err(error) => Err(error),
    };
    if let Err(error) = result {
        eprintln!("remote_bench: {error}");
        std::process::exit(1);
    }
}
