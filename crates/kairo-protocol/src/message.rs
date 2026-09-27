use bytes::{Buf, BufMut, Bytes, BytesMut};

use crate::ProtocolError;

pub const MAGIC: [u8; 2] = [0x4B, 0x52];
pub const PROTOCOL_VERSION: u16 = 1;
pub const HEADER_SIZE: usize = 20;
pub const MAX_PAYLOAD_SIZE: usize = 16 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u16)]
pub enum MessageKind {
    HandshakeInit = 1,
    HandshakeAck = 2,
    Request = 3,
    Response = 4,
    Event = 5,
    Error = 6,
}

impl MessageKind {
    #[must_use]
    pub fn from_u16(v: u16) -> Option<Self> {
        match v {
            1 => Some(Self::HandshakeInit),
            2 => Some(Self::HandshakeAck),
            3 => Some(Self::Request),
            4 => Some(Self::Response),
            5 => Some(Self::Event),
            6 => Some(Self::Error),
            _ => None,
        }
    }

    #[must_use]
    pub fn as_u16(self) -> u16 {
        self as u16
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u16)]
pub enum Opcode {
    None = 0,
    FsListDirectory = 10,
    FsReadFile = 11,
    FsWriteFile = 12,
    FsWatch = 13,
    TerminalCreatePty = 20,
    TerminalInput = 21,
    TerminalOutput = 22,
    TerminalResize = 23,
    TerminalClose = 24,
    TerminalAttach = 25,
    TerminalList = 26,
    ProcessList = 30,
    ProcessSpawn = 31,
    ProcessKill = 32,
    MetricsGet = 40,
    DockerListContainers = 50,
    DockerManageContainer = 51,
    DockerContainerLogs = 52,
    SystemListServices = 60,
    SystemManageService = 61,
    AppList = 70,
    AppLaunch = 71,
    SurfaceInput = 72,
    SurfaceClose = 73,
    GpuGetInfo = 80,
    GpuStartStream = 81,
    GpuStopStream = 82,
    GpuStreamStats = 83,
}

impl Opcode {
    #[must_use]
    pub fn from_u16(v: u16) -> Option<Self> {
        match v {
            0 => Some(Self::None),
            10 => Some(Self::FsListDirectory),
            11 => Some(Self::FsReadFile),
            12 => Some(Self::FsWriteFile),
            13 => Some(Self::FsWatch),
            20 => Some(Self::TerminalCreatePty),
            21 => Some(Self::TerminalInput),
            22 => Some(Self::TerminalOutput),
            23 => Some(Self::TerminalResize),
            24 => Some(Self::TerminalClose),
            25 => Some(Self::TerminalAttach),
            26 => Some(Self::TerminalList),
            30 => Some(Self::ProcessList),
            31 => Some(Self::ProcessSpawn),
            32 => Some(Self::ProcessKill),
            40 => Some(Self::MetricsGet),
            50 => Some(Self::DockerListContainers),
            51 => Some(Self::DockerManageContainer),
            52 => Some(Self::DockerContainerLogs),
            60 => Some(Self::SystemListServices),
            61 => Some(Self::SystemManageService),
            70 => Some(Self::AppList),
            71 => Some(Self::AppLaunch),
            72 => Some(Self::SurfaceInput),
            73 => Some(Self::SurfaceClose),
            80 => Some(Self::GpuGetInfo),
            81 => Some(Self::GpuStartStream),
            82 => Some(Self::GpuStopStream),
            83 => Some(Self::GpuStreamStats),
            _ => None,
        }
    }

    #[must_use]
    pub fn as_u16(self) -> u16 {
        self as u16
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KairoMessage {
    pub version: u16,
    pub kind: MessageKind,
    pub flags: u16,
    pub request_id: u64,
    pub payload: Bytes,
}

impl KairoMessage {
    #[must_use]
    pub fn new(kind: MessageKind, request_id: u64, payload: Bytes) -> Self {
        Self {
            version: PROTOCOL_VERSION,
            kind,
            flags: 0,
            request_id,
            payload,
        }
    }

    #[must_use]
    pub fn with_opcode(kind: MessageKind, opcode: Opcode, request_id: u64, payload: Bytes) -> Self {
        Self {
            version: PROTOCOL_VERSION,
            kind,
            flags: opcode.as_u16(),
            request_id,
            payload,
        }
    }

    #[must_use]
    pub fn opcode(&self) -> Opcode {
        Opcode::from_u16(self.flags).unwrap_or(Opcode::None)
    }

    pub fn encode(&self) -> Result<Bytes, ProtocolError> {
        let payload_len = self.payload.len();
        if payload_len > MAX_PAYLOAD_SIZE {
            return Err(ProtocolError::PayloadTooLarge {
                size: payload_len,
                limit: MAX_PAYLOAD_SIZE,
            });
        }

        let mut buf = BytesMut::with_capacity(HEADER_SIZE + payload_len);
        buf.put_slice(&MAGIC);
        buf.put_u16(self.version);
        buf.put_u16(self.kind.as_u16());
        buf.put_u16(self.flags);
        buf.put_u64(self.request_id);
        buf.put_u32(payload_len as u32);
        buf.put_slice(&self.payload);

        Ok(buf.freeze())
    }

    pub fn decode(mut data: Bytes) -> Result<Self, ProtocolError> {
        if data.len() < HEADER_SIZE {
            return Err(ProtocolError::FrameTooShort {
                expected: HEADER_SIZE,
                actual: data.len(),
            });
        }

        let magic = [data.get_u8(), data.get_u8()];
        if magic != MAGIC {
            return Err(ProtocolError::InvalidMagic(magic));
        }

        let version = data.get_u16();
        if version != PROTOCOL_VERSION {
            return Err(ProtocolError::VersionMismatch {
                local: PROTOCOL_VERSION,
                remote: version,
            });
        }

        let kind_raw = data.get_u16();
        let kind =
            MessageKind::from_u16(kind_raw).ok_or(ProtocolError::UnknownMessageKind(kind_raw))?;

        let flags = data.get_u16();
        let request_id = data.get_u64();
        let payload_len = data.get_u32() as usize;

        if payload_len > MAX_PAYLOAD_SIZE {
            return Err(ProtocolError::PayloadTooLarge {
                size: payload_len,
                limit: MAX_PAYLOAD_SIZE,
            });
        }

        if data.len() != payload_len {
            return Err(ProtocolError::PayloadLengthMismatch {
                expected: payload_len,
                actual: data.len(),
            });
        }

        Ok(Self {
            version,
            kind,
            flags,
            request_id,
            payload: data,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_decode_roundtrip() {
        let payload = Bytes::from_static(b"hello kairo");
        let msg = KairoMessage::new(MessageKind::HandshakeInit, 42, payload.clone());

        let encoded = msg.encode().expect("encode should succeed");
        assert_eq!(encoded.len(), HEADER_SIZE + payload.len());

        let decoded = KairoMessage::decode(encoded).expect("decode should succeed");
        assert_eq!(decoded.version, PROTOCOL_VERSION);
        assert_eq!(decoded.kind, MessageKind::HandshakeInit);
        assert_eq!(decoded.flags, 0);
        assert_eq!(decoded.request_id, 42);
        assert_eq!(decoded.payload, payload);
    }

    #[test]
    fn test_invalid_magic() {
        let mut buf = BytesMut::with_capacity(HEADER_SIZE);
        buf.put_slice(b"XX");
        buf.put_u16(1);
        buf.put_u16(1);
        buf.put_u16(0);
        buf.put_u64(1);
        buf.put_u32(0);

        let err = KairoMessage::decode(buf.freeze()).unwrap_err();
        assert_eq!(err, ProtocolError::InvalidMagic([b'X', b'X']));
    }

    #[test]
    fn test_frame_too_short() {
        let err = KairoMessage::decode(Bytes::from_static(b"short")).unwrap_err();
        assert_eq!(
            err,
            ProtocolError::FrameTooShort {
                expected: HEADER_SIZE,
                actual: 5
            }
        );
    }

    #[test]
    fn test_version_mismatch() {
        let mut buf = BytesMut::with_capacity(HEADER_SIZE);
        buf.put_slice(&MAGIC);
        buf.put_u16(99);
        buf.put_u16(1);
        buf.put_u16(0);
        buf.put_u64(1);
        buf.put_u32(0);

        let err = KairoMessage::decode(buf.freeze()).unwrap_err();
        assert_eq!(
            err,
            ProtocolError::VersionMismatch {
                local: PROTOCOL_VERSION,
                remote: 99
            }
        );
    }

    #[test]
    fn test_unknown_kind() {
        let mut buf = BytesMut::with_capacity(HEADER_SIZE);
        buf.put_slice(&MAGIC);
        buf.put_u16(PROTOCOL_VERSION);
        buf.put_u16(999);
        buf.put_u16(0);
        buf.put_u64(1);
        buf.put_u32(0);

        let err = KairoMessage::decode(buf.freeze()).unwrap_err();
        assert_eq!(err, ProtocolError::UnknownMessageKind(999));
    }
}
