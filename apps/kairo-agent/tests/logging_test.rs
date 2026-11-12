#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::fs;
use std::time::{Duration, SystemTime};

use kairo_agent::logging::{init, prune_expired_logs};

const ROTATED_PREFIX: &str = "kairo-agent.log.";
const LOG_RETENTION: Duration = Duration::from_secs(14 * 24 * 3600);

/// Single test in this binary: the global subscriber can only be set once
/// per process, so rotation and retention are verified in one run.
#[tokio::test]
async fn file_logging_writes_and_rotated_files_age_out() {
    let dir = tempfile::tempdir().expect("temp dir");
    let guard = init(Some(dir.path().to_str().expect("utf8 path")), false, "info");
    tracing::info!("kairo file logging marker");
    drop(guard);

    let rotated: Vec<_> = fs::read_dir(dir.path())
        .expect("read log dir")
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with(ROTATED_PREFIX))
        })
        .collect();
    assert!(!rotated.is_empty(), "rotated log file should appear");
    let content = fs::read_to_string(&rotated[0]).expect("read rotated log");
    assert!(content.contains("kairo file logging marker"));

    let later = SystemTime::now() + Duration::from_secs(15 * 24 * 3600);
    let removed = prune_expired_logs(dir.path(), LOG_RETENTION, later).expect("prune");
    assert_eq!(removed, rotated.len());
    assert!(
        !rotated.iter().any(|p| p.exists()),
        "aged-out log files should be gone"
    );
}
