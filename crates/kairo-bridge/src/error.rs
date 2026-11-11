use std::time::Duration;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum BridgeError {
    #[error("capability not supported: {0}")]
    Unsupported(String),

    #[error("insufficient privileges: {0}")]
    PermissionDenied(String),

    #[error("package lock is held by another process: {0}")]
    PackageLockHeld(String),

    #[error("invalid package identifier '{name}': {reason}")]
    InvalidPackageName { name: String, reason: String },

    #[error("operation timed out after {0:?}")]
    Timeout(Duration),

    #[error("command execution failed: {0}")]
    ExecutionFailed(String),

    #[error("backend binary not found: {0}")]
    BackendNotFound(String),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}
