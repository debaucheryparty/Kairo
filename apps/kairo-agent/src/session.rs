use std::sync::Arc;
use std::time::Duration;

use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use kairo_common::KairoId;
use kairo_protocol::v1::{
    ErrorCode, HandshakeAck, HandshakeInit, KairoError, ListDirectoryRequest, ReadFileRequest,
    WriteFileRequest,
};
use kairo_protocol::{KairoMessage, MessageKind, Opcode, ProtocolError};
use prost::Message as ProstMessage;
use thiserror::Error;
use tokio::net::TcpStream;
use tokio::time::timeout;
use tokio_tungstenite::WebSocketStream;
use tokio_tungstenite::tungstenite::Message as WsMessage;
use tracing::{debug, error, info, warn};

use crate::config::AgentConfig;
use crate::fs::{FilesystemHandler, FsError};

const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Error)]
pub enum SessionError {
    #[error("handshake timed out")]
    HandshakeTimeout,

    #[error("connection closed: {0}")]
    ConnectionClosed(String),

    #[error("protocol error: {0}")]
    Protocol(#[from] ProtocolError),

    #[error("protobuf decode failed: {0}")]
    ProtobufDecode(#[from] prost::DecodeError),

    #[error("protobuf encode failed: {0}")]
    ProtobufEncode(#[from] prost::EncodeError),

    #[error("unexpected message kind: expected {expected:?}, got {actual:?}")]
    UnexpectedKind {
        expected: MessageKind,
        actual: MessageKind,
    },

    #[error("version mismatch: expected {expected}, got {actual}")]
    VersionMismatch { expected: u32, actual: u32 },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionState {
    Authenticating,
    Ready,
    Terminated,
}

pub struct Session {
    session_id: KairoId,
    config: Arc<AgentConfig>,
    state: SessionState,
    fs: FilesystemHandler,
}

impl Session {
    #[must_use]
    pub fn new(config: Arc<AgentConfig>) -> Self {
        let fs = FilesystemHandler::new(&config.data_dir);
        Self {
            session_id: KairoId::new(),
            config,
            state: SessionState::Authenticating,
            fs,
        }
    }

    #[must_use]
    pub fn session_id(&self) -> &KairoId {
        &self.session_id
    }

    #[must_use]
    pub fn state(&self) -> SessionState {
        self.state
    }

    pub async fn run(
        &mut self,
        mut stream: WebSocketStream<TcpStream>,
    ) -> Result<(), SessionError> {
        let handshake_res = timeout(HANDSHAKE_TIMEOUT, self.handle_handshake(&mut stream)).await;
        match handshake_res {
            Ok(Ok(())) => {
                self.state = SessionState::Ready;
                info!(session_id = %self.session_id, "session authenticated and ready");
            }
            Ok(Err(e)) => {
                self.state = SessionState::Terminated;
                warn!(error = %e, "handshake failed");
                let _ = stream.close(None).await;
                return Err(e);
            }
            Err(_) => {
                self.state = SessionState::Terminated;
                warn!("handshake timed out");
                let _ = stream.close(None).await;
                return Err(SessionError::HandshakeTimeout);
            }
        }

        while let Some(msg_res) = stream.next().await {
            let ws_msg = msg_res.map_err(|e| SessionError::ConnectionClosed(e.to_string()))?;

            match ws_msg {
                WsMessage::Binary(data) => {
                    self.handle_message(&mut stream, data).await?;
                }
                WsMessage::Close(_) => {
                    info!(session_id = %self.session_id, "client closed connection");
                    break;
                }
                WsMessage::Ping(payload) => {
                    stream
                        .send(WsMessage::Pong(payload))
                        .await
                        .map_err(|e| SessionError::ConnectionClosed(e.to_string()))?;
                }
                _ => {}
            }
        }

        self.state = SessionState::Terminated;
        Ok(())
    }

    async fn handle_handshake(
        &mut self,
        stream: &mut WebSocketStream<TcpStream>,
    ) -> Result<(), SessionError> {
        let ws_msg = stream
            .next()
            .await
            .ok_or_else(|| SessionError::ConnectionClosed("stream ended before handshake".into()))?
            .map_err(|e| SessionError::ConnectionClosed(e.to_string()))?;

        let data = match ws_msg {
            WsMessage::Binary(bytes) => bytes,
            other => {
                return Err(SessionError::ConnectionClosed(format!(
                    "expected binary frame, got {other:?}"
                )));
            }
        };

        let message = KairoMessage::decode(data)?;
        if message.kind != MessageKind::HandshakeInit {
            return Err(SessionError::UnexpectedKind {
                expected: MessageKind::HandshakeInit,
                actual: message.kind,
            });
        }

        let init = HandshakeInit::decode(message.payload)?;
        if init.protocol_version != 1 {
            return Err(SessionError::VersionMismatch {
                expected: 1,
                actual: init.protocol_version,
            });
        }

        debug!(
            client_id = %init.client_id,
            version = init.protocol_version,
            "received valid HandshakeInit"
        );

        let ack = HandshakeAck {
            protocol_version: 1,
            agent_id: self.config.agent_id.to_string(),
            session_id: self.session_id.to_string(),
            capabilities: vec![
                "filesystem.v1".to_string(),
                "terminal.v1".to_string(),
                "process.v1".to_string(),
                "metrics.v1".to_string(),
            ],
        };

        let mut payload_buf = Vec::new();
        ack.encode(&mut payload_buf)?;

        let ack_message = KairoMessage::new(
            MessageKind::HandshakeAck,
            message.request_id,
            Bytes::from(payload_buf),
        );

        let encoded = ack_message.encode()?;
        stream
            .send(WsMessage::Binary(encoded))
            .await
            .map_err(|e| SessionError::ConnectionClosed(e.to_string()))?;

        Ok(())
    }

    async fn handle_message(
        &mut self,
        stream: &mut WebSocketStream<TcpStream>,
        data: Bytes,
    ) -> Result<(), SessionError> {
        let message = match KairoMessage::decode(data) {
            Ok(m) => m,
            Err(e) => {
                error!(error = %e, "failed to decode incoming message");
                return Ok(());
            }
        };

        match message.kind {
            MessageKind::Request => self.handle_request(stream, message).await,
            _ => {
                debug!(kind = ?message.kind, "ignoring unhandled message kind");
                Ok(())
            }
        }
    }

    async fn handle_request(
        &mut self,
        stream: &mut WebSocketStream<TcpStream>,
        message: KairoMessage,
    ) -> Result<(), SessionError> {
        let opcode = message.opcode();
        let request_id = message.request_id;

        match opcode {
            Opcode::FsListDirectory => {
                let req = ListDirectoryRequest::decode(message.payload)?;
                match self.fs.list_directory(&req.path) {
                    Ok(resp) => {
                        let mut buf = Vec::new();
                        resp.encode(&mut buf)?;
                        let msg = KairoMessage::with_opcode(
                            MessageKind::Response,
                            Opcode::FsListDirectory,
                            request_id,
                            Bytes::from(buf),
                        );
                        stream
                            .send(WsMessage::Binary(msg.encode()?))
                            .await
                            .map_err(|e| SessionError::ConnectionClosed(e.to_string()))?;
                    }
                    Err(e) => self.send_fs_error(stream, opcode, request_id, e).await?,
                }
            }
            Opcode::FsReadFile => {
                let req = ReadFileRequest::decode(message.payload)?;
                match self.fs.read_file(&req.path, req.offset, req.length) {
                    Ok(resp) => {
                        let mut buf = Vec::new();
                        resp.encode(&mut buf)?;
                        let msg = KairoMessage::with_opcode(
                            MessageKind::Response,
                            Opcode::FsReadFile,
                            request_id,
                            Bytes::from(buf),
                        );
                        stream
                            .send(WsMessage::Binary(msg.encode()?))
                            .await
                            .map_err(|e| SessionError::ConnectionClosed(e.to_string()))?;
                    }
                    Err(e) => self.send_fs_error(stream, opcode, request_id, e).await?,
                }
            }
            Opcode::FsWriteFile => {
                let req = WriteFileRequest::decode(message.payload)?;
                let expected = if req.expected_revision.is_empty() {
                    None
                } else {
                    Some(req.expected_revision.as_str())
                };

                match self.fs.write_file(&req.path, &req.content, expected) {
                    Ok(resp) => {
                        let mut buf = Vec::new();
                        resp.encode(&mut buf)?;
                        let msg = KairoMessage::with_opcode(
                            MessageKind::Response,
                            Opcode::FsWriteFile,
                            request_id,
                            Bytes::from(buf),
                        );
                        stream
                            .send(WsMessage::Binary(msg.encode()?))
                            .await
                            .map_err(|e| SessionError::ConnectionClosed(e.to_string()))?;
                    }
                    Err(e) => self.send_fs_error(stream, opcode, request_id, e).await?,
                }
            }
            _ => {
                warn!(?opcode, "unsupported request opcode");
                let err = KairoError {
                    code: ErrorCode::InvalidArgument as i32,
                    message: format!("unsupported opcode: {opcode:?}"),
                    request_id: request_id.to_string(),
                };
                let mut buf = Vec::new();
                err.encode(&mut buf)?;
                let msg = KairoMessage::with_opcode(
                    MessageKind::Error,
                    opcode,
                    request_id,
                    Bytes::from(buf),
                );
                stream
                    .send(WsMessage::Binary(msg.encode()?))
                    .await
                    .map_err(|e| SessionError::ConnectionClosed(e.to_string()))?;
            }
        }

        Ok(())
    }

    async fn send_fs_error(
        &self,
        stream: &mut WebSocketStream<TcpStream>,
        opcode: Opcode,
        request_id: u64,
        err: FsError,
    ) -> Result<(), SessionError> {
        let code = match err {
            FsError::NotFound(_) => ErrorCode::NotFound,
            FsError::PermissionDenied(_) | FsError::PathTraversal(_) => ErrorCode::PermissionDenied,
            FsError::Conflict { .. } => ErrorCode::AlreadyExists,
            FsError::Io(_) => ErrorCode::Internal,
        };

        let proto_err = KairoError {
            code: code as i32,
            message: err.to_string(),
            request_id: request_id.to_string(),
        };

        let mut buf = Vec::new();
        proto_err.encode(&mut buf)?;

        let msg =
            KairoMessage::with_opcode(MessageKind::Error, opcode, request_id, Bytes::from(buf));

        stream
            .send(WsMessage::Binary(msg.encode()?))
            .await
            .map_err(|e| SessionError::ConnectionClosed(e.to_string()))?;

        Ok(())
    }
}
