use bytes::Bytes;

#[derive(Debug, Clone)]
pub struct KairoMessage {
    pub kind: MessageKind,
    pub request_id: u64,
    pub payload: Bytes,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MessageKind {
    HandshakeInit,
    HandshakeAck,
    Request,
    Response,
    Event,
    Error,
}

impl MessageKind {
    #[must_use]
    pub fn from_u32(v: u32) -> Option<Self> {
        match v {
            0 => Some(Self::HandshakeInit),
            1 => Some(Self::HandshakeAck),
            2 => Some(Self::Request),
            3 => Some(Self::Response),
            4 => Some(Self::Event),
            5 => Some(Self::Error),
            _ => None,
        }
    }

    #[must_use]
    pub fn as_u32(self) -> u32 {
        match self {
            Self::HandshakeInit => 0,
            Self::HandshakeAck => 1,
            Self::Request => 2,
            Self::Response => 3,
            Self::Event => 4,
            Self::Error => 5,
        }
    }
}
