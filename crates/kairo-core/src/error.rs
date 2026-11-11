use kairo_bridge::BridgeError;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum CoreError {
    #[error("bridge error: {0}")]
    Bridge(#[from] BridgeError),

    #[error("permission denied: {0}")]
    PermissionDenied(String),

    #[error("target unsupported: {0}")]
    TargetUnsupported(String),

    #[error("filesystem boundary violation: path '{path}' is outside {target} boundary")]
    BoundaryViolation { path: String, target: String },

    #[error("not found: {0}")]
    NotFound(String),

    #[error("invalid argument: {0}")]
    InvalidArgument(String),

    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}
