//! Noticing that the machine slept.
//!
//! Sleep freezes the daemon in place: its timers stop with it, so nothing in the process sees the
//! time pass, and the sockets it held are dead on the other side long before it runs again. Left
//! alone it would go on trusting those sockets until its own silence limit ran out, which is most
//! of a minute of awake time. A laptop that wakes for a few seconds at a time to do housekeeping
//! and sleeps again (as they do, on battery, every few minutes) would never get that far.
//!
//! So the one thing that does keep moving is watched: the wall clock. When it has jumped further
//! than the daemon's own clock between two ticks, the machine was asleep in between.

use std::sync::OnceLock;
use std::time::{Duration, SystemTime};

use tokio::sync::watch;

/// How often the clocks are compared.
const TICK: Duration = Duration::from_secs(2);

/// How much further the wall clock must have moved than the tick to call it sleep. Well clear of a
/// busy machine running late or a clock being nudged into step.
const JUMP: Duration = Duration::from_secs(8);

static WAKES: OnceLock<watch::Sender<u64>> = OnceLock::new();

/// A count of the times the machine has woken from sleep since something first asked. It changes
/// within a couple of seconds of each wake; whoever holds a link to the outside takes that as the
/// moment to start it afresh. Must be called within a runtime.
pub fn wakes() -> watch::Receiver<u64> {
    WAKES
        .get_or_init(|| {
            let (tx, _) = watch::channel(0);
            tokio::spawn(watch_clock(tx.clone()));
            tx
        })
        .subscribe()
}

async fn watch_clock(wakes: watch::Sender<u64>) {
    let mut last = SystemTime::now();
    loop {
        tokio::time::sleep(TICK).await;
        let now = SystemTime::now();
        // The wall clock can also step backwards, which is no sleep at all.
        let passed = now.duration_since(last).unwrap_or_default();
        last = now;
        if slept(passed) {
            wakes.send_modify(|count| *count += 1);
        }
    }
}

/// Whether that much wall time between two ticks means the machine slept.
fn slept(passed: Duration) -> bool {
    passed > TICK + JUMP
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_real_gap_counts_as_sleep() {
        assert!(!slept(TICK));
        // Running late under load is not sleep.
        assert!(!slept(TICK + Duration::from_secs(3)));
        assert!(slept(TICK + Duration::from_secs(30)));
        // The shortest naps a laptop takes are still minutes long.
        assert!(slept(Duration::from_secs(300)));
    }
}
