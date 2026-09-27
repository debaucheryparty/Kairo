use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ProtocolError {
    #[error("invalid magic bytes: expected [0x4B, 0x52], got {0:?}")]
    InvalidMagic([u8; 2]),

    #[error("unknown message kind: {0}")]
    UnknownMessageKind(u16),

    #[error("frame too short: expected at least {expected} bytes, got {actual}")]
    FrameTooShort { expected: usize, actual: usize },

    #[error("payload length mismatch: header specifies {expected} bytes, got {actual}")]
    PayloadLengthMismatch { expected: usize, actual: usize },

    #[error("payload too large: {size} bytes (limit {limit})")]
    PayloadTooLarge { size: usize, limit: usize },

    #[error("version mismatch: local={local}, remote={remote}")]
    VersionMismatch { local: u16, remote: u16 },

    #[error("decode failed: {0}")]
    Decode(String),

    #[error("encode failed: {0}")]
    Encode(String),
}

impl From<prost::DecodeError> for ProtocolError {
    fn from(err: prost::DecodeError) -> Self {
        Self::Decode(err.to_string())
    }
}

impl From<prost::EncodeError> for ProtocolError {
    fn from(err: prost::EncodeError) -> Self {
        Self::Encode(err.to_string())
    }
}
