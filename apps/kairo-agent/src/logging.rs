use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use tracing::Subscriber;
use tracing::info;
use tracing::warn;
use tracing_appender::non_blocking::NonBlocking;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::registry::LookupSpan;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{EnvFilter, Layer};

const LOG_FILE_STEM: &str = "kairo-agent.log";
const LOG_RETENTION: Duration = Duration::from_secs(14 * 24 * 3600);
const PRUNE_INTERVAL: Duration = Duration::from_secs(6 * 3600);

/// Keeps file-logging resources alive for the whole process lifetime.
///
/// The non-blocking file writer drops queued events unless its
/// [`WorkerGuard`] lives to the end of the process, and the prune task is
/// aborted on drop so tests do not leak background work.
pub struct LoggingGuard {
    _file_worker: Option<WorkerGuard>,
    _prune_task: Option<tokio::task::JoinHandle<()>>,
}

pub fn init(log_dir: Option<&str>, log_json: bool, fallback_filter: &str) -> LoggingGuard {
    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(fallback_filter));

    let registry = tracing_subscriber::registry().with(stdout_layer(log_json));
    match log_dir {
        Some(dir) => {
            let (writer, worker) = tracing_appender::non_blocking(
                tracing_appender::rolling::daily(dir, LOG_FILE_STEM),
            );
            registry
                .with(file_layer(log_json, writer))
                .with(filter)
                .init();
            let prune_task = tokio::spawn(prune_loop(PathBuf::from(dir)));
            LoggingGuard {
                _file_worker: Some(worker),
                _prune_task: Some(prune_task),
            }
        }
        None => {
            registry.with(filter).init();
            LoggingGuard {
                _file_worker: None,
                _prune_task: None,
            }
        }
    }
}

// Layers are erased as `Box<dyn Layer<S>>` with `S` left to inference: each
// box must implement `Layer` for the subscriber position it is composed into,
// which is only known after the whole chain is built. The env filter is
// attached once to the registry as a global filter; a per-layer filter would
// pin `Filtered<_, _, S>` the same way a pre-pinned box does.
fn stdout_layer<S>(log_json: bool) -> Box<dyn Layer<S> + Send + Sync>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    if log_json {
        Box::new(tracing_subscriber::fmt::layer().json())
    } else {
        Box::new(tracing_subscriber::fmt::layer())
    }
}

fn file_layer<S>(log_json: bool, writer: NonBlocking) -> Box<dyn Layer<S> + Send + Sync>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    if log_json {
        Box::new(
            tracing_subscriber::fmt::layer()
                .json()
                .with_ansi(false)
                .with_writer(writer),
        )
    } else {
        Box::new(
            tracing_subscriber::fmt::layer()
                .with_ansi(false)
                .with_writer(writer),
        )
    }
}

async fn prune_loop(dir: PathBuf) {
    let mut ticker = tokio::time::interval(PRUNE_INTERVAL);
    loop {
        ticker.tick().await;
        match prune_expired_logs(&dir, LOG_RETENTION, SystemTime::now()) {
            Ok(0) => {}
            Ok(removed) => info!(removed, "pruned expired log files"),
            Err(e) => warn!(error = %e, "log retention prune failed"),
        }
    }
}

/// Deletes rotated log files in `dir` whose modification time is at least
/// `retention` older than `now`, leaving foreign files untouched.
pub fn prune_expired_logs(dir: &Path, retention: Duration, now: SystemTime) -> io::Result<usize> {
    let mut removed = 0;
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let metadata = entry.metadata()?;
        if !metadata.is_file() {
            continue;
        }
        if !entry
            .file_name()
            .to_string_lossy()
            .starts_with(LOG_FILE_STEM)
        {
            continue;
        }
        let modified = metadata.modified()?;
        if now
            .duration_since(modified)
            .is_ok_and(|age| age >= retention)
        {
            std::fs::remove_file(entry.path())?;
            removed += 1;
        }
    }
    Ok(removed)
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn prune_removes_only_expired_rotated_files() {
        let dir = TempDir::new().expect("temp dir");
        let old = dir.path().join("kairo-agent.log.2026-01-01");
        let fresh = dir.path().join("kairo-agent.log.2026-11-12");
        let foreign = dir.path().join("unrelated.txt");
        fs::write(&old, "old").expect("write old");
        fs::write(&fresh, "fresh").expect("write fresh");
        fs::write(&foreign, "foreign").expect("write foreign");

        let now = SystemTime::now();
        assert_eq!(
            prune_expired_logs(dir.path(), LOG_RETENTION, now).expect("prune"),
            0
        );
        assert!(old.exists() && fresh.exists() && foreign.exists());

        let later = now + Duration::from_secs(15 * 24 * 3600);
        assert_eq!(
            prune_expired_logs(dir.path(), LOG_RETENTION, later).expect("prune"),
            2
        );
        assert!(!old.exists());
        assert!(!fresh.exists());
        assert!(foreign.exists());
    }
}
