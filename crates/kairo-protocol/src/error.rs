use thiserror::Error;

#[derive(Debug, Error)]
pub enum ProtocolError {
    #[error("unknown message kind: {0}")]
    UnknownMessageKind(u32),

    #[error("payload too large: {size} bytes (limit {limit})")]
    PayloadTooLarge { size: usize, limit: usize },

    #[error("decode failed: {0}")]
    Decode(#[from] prost::DecodeError),

    #[error("encode failed: {0}")]
    Encode(#[from] prost::EncodeError),

    #[error("version mismatch: local={local}, remote={remote}")]
    VersionMismatch { local: u32, remote: u32 },
}
