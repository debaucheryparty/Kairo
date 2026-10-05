use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use kairo_common::KairoId;
use kairo_protocol::v1::{
    AttachPtyRequest, AttachPtyResponse, ClosePtyRequest, CloseSurfaceRequest,
    CloseSurfaceResponse, ConfigureSurfaceRequest, ConfigureSurfaceResponse, ContainerAction,
    ContainerLogsRequest, CreatePtyRequest, CreatePtyResponse, ErrorCode, FocusSurfaceRequest,
    FocusSurfaceResponse, GetGpuInfoRequest, GetMetricsRequest, GetMetricsResponse,
    HandshakeAck, HandshakeInit, KairoError, KillProcessRequest, LaunchAppRequest, ListAppsRequest,
    ListAppsResponse, ListContainersRequest, ListDirectoryRequest, ListProcessesRequest,
    ListProcessesResponse, ListPtysRequest, ListPtysResponse, ListServicesRequest,
    ListSurfacesRequest, ListSurfacesResponse, ManageContainerRequest, ManageServiceRequest,
    PtyInput, PtyOutput, ReadFileRequest, ResizePtyRequest, ServiceAction, StartGpuStreamRequest,
    StopGpuStreamRequest, StopGpuStreamResponse, SurfaceInputEvent, WatchRequest, WatchResponse,
    WriteFileRequest,
};
use kairo_protocol::{KairoMessage, MessageKind, Opcode, ProtocolError};
use prost::Message as ProstMessage;
use thiserror::Error;
use tokio::sync::{mpsc, Mutex, Notify};
use tokio::time::timeout;
use tokio_tungstenite::WebSocketStream;
use tokio_tungstenite::tungstenite::Message as WsMessage;
use tracing::{debug, error, info, warn};

use crate::app_manager::AppManager;
use crate::config::AgentConfig;
use crate::fs::{FilesystemHandler, FsError};
use crate::gpu::{GpuError, GpuManager};
use crate::metrics::MetricsCollector;
use crate::process::ProcessManager;
use crate::pty::{PtyError, PtyManager};
use crate::system::{SystemError, SystemManager};

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Error)]
pub enum SessionError {
    #[error("handshake timed out")]
    HandshakeTimeout,

    #[error("authentication failed")]
    AuthenticationFailed,

    #[error("connection closed: {0}")]
    ConnectionClosed(String),

    #[error("protocol error: {0}")]
    Protocol(#[from] ProtocolError),

    #[error("protobuf decode failed: {0}")]
    ProtobufDecode(#[from] prost::DecodeError),

    #[error("protobuf encode failed: {0}")]
    ProtobufEncode(#[from] prost::EncodeError),

    #[error("pty error: {0}")]
    Pty(#[from] PtyError),

    #[error("system error: {0}")]
    System(#[from] SystemError),

    #[error("gpu error: {0}")]
    Gpu(#[from] GpuError),

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

struct ActiveWatcher {
    _watcher: notify::RecommendedWatcher,
    abort_handle: tokio::task::AbortHandle,
}

impl Drop for ActiveWatcher {
    fn drop(&mut self) {
        self.abort_handle.abort();
    }
}

pub struct Session {
    session_id: KairoId,
    config: Arc<AgentConfig>,
    state: SessionState,
    fs: FilesystemHandler,
    pty: Arc<PtyManager>,
    metrics: Arc<MetricsCollector>,
    process: Arc<ProcessManager>,
    system: Arc<SystemManager>,
    app: Arc<AppManager>,
    gpu: Arc<GpuManager>,
    watcher: Option<ActiveWatcher>,
}

impl Session {
    #[must_use]
    pub fn with_pty(config: Arc<AgentConfig>, pty: Arc<PtyManager>) -> Self {
        Self::with_components(
            config,
            pty,
            Arc::new(AppManager::new()),
            Arc::new(GpuManager::new()),
        )
    }

    #[must_use]
    pub fn with_components(
        config: Arc<AgentConfig>,
        pty: Arc<PtyManager>,
        app: Arc<AppManager>,
        gpu: Arc<GpuManager>,
    ) -> Self {
        let fs_root = if cfg!(windows) {
            std::env::var("SystemDrive")
                .map(|d| format!("{d}\\"))
                .unwrap_or_else(|_| "C:\\".to_string())
        } else {
            "/".to_string()
        };
        let fs = FilesystemHandler::new(fs_root);
        if let Ok(home) = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")) {
            let standard_dirs = [
                "Desktop",
                "Documents",
                "Downloads",
                "Movies",
                "Music",
                "Pictures",
                "Public",
                "Code",
            ];
            for dir in standard_dirs {
                let _ = std::fs::create_dir_all(std::path::Path::new(&home).join(dir));
            }
        }
        let metrics = Arc::new(MetricsCollector::new());
        let process = Arc::new(ProcessManager::new());
        let system = Arc::new(SystemManager::new());
        Self {
            session_id: KairoId::new(),
            config,
            state: SessionState::Authenticating,
            fs,
            pty,
            metrics,
            process,
            system,
            app,
            gpu,
            watcher: None,
        }
    }

    #[must_use]
    pub fn new(config: Arc<AgentConfig>) -> Self {
        Self::with_pty(config, Arc::new(PtyManager::new()))
    }

    #[must_use]
    pub fn session_id(&self) -> &KairoId {
        &self.session_id
    }

    #[must_use]
    pub fn state(&self) -> SessionState {
        self.state
    }

    pub async fn run<S>(&mut self, mut stream: WebSocketStream<S>) -> Result<(), SessionError>
    where
        S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
    {
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

        let (mut ws_tx, mut ws_rx) = stream.split();
        let (high_tx, mut high_rx) = mpsc::channel::<WsMessage>(512);
        let latest_frames: Arc<Mutex<HashMap<String, WsMessage>>> = Arc::new(Mutex::new(HashMap::new()));
        let frame_notify = Arc::new(Notify::new());

        let pending_frames_writer = latest_frames.clone();
        let frame_notify_writer = frame_notify.clone();

        let writer_handle = tokio::spawn(async move {
            loop {
                tokio::select! {
                    biased;
                    Some(high_msg) = high_rx.recv() => {
                        let res = ws_tx.send(high_msg).await;
                        if res.is_err() {
                            break;
                        }
                    }
                    _ = frame_notify_writer.notified() => {
                        let next_frame = {
                            let mut lock = pending_frames_writer.lock().await;
                            if let Some(key) = lock.keys().next().cloned() {
                                lock.remove(&key)
                            } else {
                                None
                            }
                        };

                        if let Some(frame_msg) = next_frame {
                            {
                                let lock = pending_frames_writer.lock().await;
                                if !lock.is_empty() {
                                    frame_notify_writer.notify_one();
                                }
                            }

                            let write_start = std::time::Instant::now();
                            let len = frame_msg.len();
                            let res = ws_tx.send(frame_msg).await;
                            let elapsed = write_start.elapsed();
                            if elapsed > Duration::from_millis(30) {
                                warn!("[AGENT WS_TX SLOW] ws_tx.send took {:?} for {} bytes", elapsed, len);
                            }
                            if res.is_err() {
                                break;
                            }
                        }
                    }
                    else => break,
                }
            }
        });

        // Attach this session to the AppManager event stream
        self.app.attach_session(high_tx.clone(), latest_frames.clone(), frame_notify.clone());

        while let Some(msg_res) = ws_rx.next().await {
            let ws_msg = msg_res.map_err(|e| SessionError::ConnectionClosed(e.to_string()))?;

            match ws_msg {
                WsMessage::Binary(data) => {
                    self.handle_message(&high_tx, data).await?;
                }
                WsMessage::Close(_) => {
                    info!(session_id = %self.session_id, "client closed connection");
                    break;
                }
                WsMessage::Ping(payload) => {
                    let _ = high_tx.send(WsMessage::Pong(payload)).await;
                }
                _ => {}
            }
        }

        self.state = SessionState::Terminated;
        self.watcher = None;
        drop(high_tx);
        let _ = writer_handle.await;

        Ok(())
    }

    async fn handle_handshake<S>(
        &mut self,
        stream: &mut WebSocketStream<S>,
    ) -> Result<(), SessionError>
    where
        S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
    {
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

        if let Some(expected_token) = self
            .config
            .auth_token
            .as_deref()
            .filter(|t| !t.trim().is_empty())
        {
            let client_token = init.auth_token.trim();
            if client_token.is_empty()
                || !constant_time_eq(client_token.as_bytes(), expected_token.as_bytes())
            {
                warn!("client handshake authentication failed: invalid token");
                let ack = HandshakeAck {
                    protocol_version: 1,
                    agent_id: self.config.agent_id.to_string(),
                    session_id: self.session_id.to_string(),
                    capabilities: Vec::new(),
                    authenticated: false,
                    error_message: "authentication failed: invalid or missing auth token"
                        .to_string(),
                };
                let mut payload_buf = Vec::new();
                let _ = ack.encode(&mut payload_buf);
                let ack_message = KairoMessage::new(
                    MessageKind::HandshakeAck,
                    message.request_id,
                    Bytes::from(payload_buf),
                );
                let _ = stream.send(WsMessage::Binary(ack_message.encode()?)).await;
                return Err(SessionError::AuthenticationFailed);
            }
        }

        let home_capability = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .map(|h| format!("home:{h}"))
            .unwrap_or_else(|_| "home:/".to_string());

        let ack = HandshakeAck {
            protocol_version: 1,
            agent_id: self.config.agent_id.to_string(),
            session_id: self.session_id.to_string(),
            capabilities: vec![
                "filesystem.v1".to_string(),
                "terminal.v1".to_string(),
                "process.v1".to_string(),
                "metrics.v1".to_string(),
                "docker.v1".to_string(),
                "system.v1".to_string(),
                "app.v1".to_string(),
                "gpu.v1".to_string(),
                home_capability,
            ],
            authenticated: true,
            error_message: String::new(),
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
        out_tx: &mpsc::Sender<WsMessage>,
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
            MessageKind::Request => self.handle_request(out_tx, message).await,
            _ => {
                debug!(kind = ?message.kind, "ignoring unhandled message kind");
                Ok(())
            }
        }
    }

    async fn handle_request(
        &mut self,
        out_tx: &mpsc::Sender<WsMessage>,
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
                        self.send_frame(out_tx, msg).await?;
                    }
                    Err(e) => self.send_fs_error(out_tx, opcode, request_id, e).await?,
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
                        self.send_frame(out_tx, msg).await?;
                    }
                    Err(e) => self.send_fs_error(out_tx, opcode, request_id, e).await?,
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
                        self.send_frame(out_tx, msg).await?;
                    }
                    Err(e) => self.send_fs_error(out_tx, opcode, request_id, e).await?,
                }
            }
            Opcode::FsWatch => {
                let req = WatchRequest::decode(message.payload)?;
                match self.fs.watch_path(&req.path, req.recursive) {
                    Ok((watcher, mut rx)) => {
                        if let Some(prev) = self.watcher.take() {
                            prev.abort_handle.abort();
                        }

                        let out_tx_clone = out_tx.clone();
                        let task = tokio::spawn(async move {
                            while let Some(event) = rx.recv().await {
                                let mut buf = Vec::new();
                                if event.encode(&mut buf).is_ok() {
                                    let msg = KairoMessage::with_opcode(
                                        MessageKind::Event,
                                        Opcode::FsWatch,
                                        0,
                                        Bytes::from(buf),
                                    );
                                    if let Ok(encoded) = msg.encode()
                                        && out_tx_clone
                                            .send(WsMessage::Binary(encoded))
                                            .await
                                            .is_err()
                                    {
                                        break;
                                    }
                                }
                            }
                        });

                        self.watcher = Some(ActiveWatcher {
                            _watcher: watcher,
                            abort_handle: task.abort_handle(),
                        });

                        let resp = WatchResponse { success: true };
                        let mut buf = Vec::new();
                        resp.encode(&mut buf)?;
                        let msg = KairoMessage::with_opcode(
                            MessageKind::Response,
                            Opcode::FsWatch,
                            request_id,
                            Bytes::from(buf),
                        );
                        self.send_frame(out_tx, msg).await?;
                    }
                    Err(e) => self.send_fs_error(out_tx, opcode, request_id, e).await?,
                }
            }
            Opcode::TerminalCreatePty => {
                let req = CreatePtyRequest::decode(message.payload)?;
                let shell = if req.shell.is_empty() {
                    None
                } else {
                    Some(req.shell.as_str())
                };
                let cwd = if req.working_directory.is_empty() {
                    None
                } else {
                    Some(Path::new(&req.working_directory))
                };

                let (pty_id, mut pty_rx) =
                    self.pty
                        .create_pty(shell, req.cols as u16, req.rows as u16, cwd)?;

                let out_tx_clone = out_tx.clone();
                let pty_id_str = pty_id.to_string();
                tokio::spawn(async move {
                    while let Ok(chunk) = pty_rx.recv().await {
                        let pty_out = PtyOutput {
                            pty_id: pty_id_str.clone(),
                            data: chunk,
                        };
                        let mut buf = Vec::new();
                        if pty_out.encode(&mut buf).is_ok() {
                            let msg = KairoMessage::with_opcode(
                                MessageKind::Event,
                                Opcode::TerminalOutput,
                                0,
                                Bytes::from(buf),
                            );
                            if let Ok(encoded) = msg.encode()
                                && out_tx_clone.send(WsMessage::Binary(encoded)).await.is_err()
                            {
                                break;
                            }
                        }
                    }
                });

                let resp = CreatePtyResponse {
                    pty_id: pty_id.to_string(),
                };
                let mut buf = Vec::new();
                resp.encode(&mut buf)?;
                let msg = KairoMessage::with_opcode(
                    MessageKind::Response,
                    Opcode::TerminalCreatePty,
                    request_id,
                    Bytes::from(buf),
                );
                self.send_frame(out_tx, msg).await?;
            }
            Opcode::TerminalAttach => {
                let req = AttachPtyRequest::decode(message.payload)?;
                let (backlog, mut pty_rx) = self.pty.attach_pty(&req.pty_id)?;

                let out_tx_clone = out_tx.clone();
                let pty_id_str = req.pty_id.clone();
                tokio::spawn(async move {
                    while let Ok(chunk) = pty_rx.recv().await {
                        let pty_out = PtyOutput {
                            pty_id: pty_id_str.clone(),
                            data: chunk,
                        };
                        let mut buf = Vec::new();
                        if pty_out.encode(&mut buf).is_ok() {
                            let msg = KairoMessage::with_opcode(
                                MessageKind::Event,
                                Opcode::TerminalOutput,
                                0,
                                Bytes::from(buf),
                            );
                            if let Ok(encoded) = msg.encode()
                                && out_tx_clone.send(WsMessage::Binary(encoded)).await.is_err()
                            {
                                break;
                            }
                        }
                    }
                });

                let resp = AttachPtyResponse {
                    pty_id: req.pty_id,
                    backlog,
                };
                let mut buf = Vec::new();
                resp.encode(&mut buf)?;
                let msg = KairoMessage::with_opcode(
                    MessageKind::Response,
                    Opcode::TerminalAttach,
                    request_id,
                    Bytes::from(buf),
                );
                self.send_frame(out_tx, msg).await?;
            }
            Opcode::TerminalList => {
                let _req = ListPtysRequest::decode(message.payload)?;
                let sessions = self.pty.list_ptys()?;
                let resp = ListPtysResponse { sessions };
                let mut buf = Vec::new();
                resp.encode(&mut buf)?;
                let msg = KairoMessage::with_opcode(
                    MessageKind::Response,
                    Opcode::TerminalList,
                    request_id,
                    Bytes::from(buf),
                );
                self.send_frame(out_tx, msg).await?;
            }
            Opcode::TerminalInput => {
                let req = PtyInput::decode(message.payload)?;
                if let Err(e) = self.pty.write_input(&req.pty_id, &req.data) {
                    warn!(error = %e, "pty write input failed");
                }
            }
            Opcode::TerminalResize => {
                let req = ResizePtyRequest::decode(message.payload)?;
                if let Err(e) = self
                    .pty
                    .resize(&req.pty_id, req.cols as u16, req.rows as u16)
                {
                    warn!(error = %e, "pty resize failed");
                }
            }
            Opcode::TerminalClose => {
                let req = ClosePtyRequest::decode(message.payload)?;
                if let Err(e) = self.pty.close(&req.pty_id) {
                    warn!(error = %e, "pty close failed");
                }
            }
            Opcode::MetricsGet => {
                let _req = GetMetricsRequest::decode(message.payload)?;
                let metrics = self.metrics.collect();
                let resp = GetMetricsResponse {
                    metrics: Some(metrics),
                };
                let mut buf = Vec::new();
                resp.encode(&mut buf)?;
                let msg = KairoMessage::with_opcode(
                    MessageKind::Response,
                    Opcode::MetricsGet,
                    request_id,
                    Bytes::from(buf),
                );
                self.send_frame(out_tx, msg).await?;
            }
            Opcode::ProcessList => {
                let _req = ListProcessesRequest::decode(message.payload)?;
                let processes = self.process.list_processes();
                let resp = ListProcessesResponse { processes };
                let mut buf = Vec::new();
                resp.encode(&mut buf)?;
                let msg = KairoMessage::with_opcode(
                    MessageKind::Response,
                    Opcode::ProcessList,
                    request_id,
                    Bytes::from(buf),
                );
                self.send_frame(out_tx, msg).await?;
            }
            Opcode::ProcessKill => {
                let req = KillProcessRequest::decode(message.payload)?;
                if let Err(e) = self.process.kill_process(&req.process_id, req.signal) {
                    warn!(error = %e, pid = %req.process_id, "failed to kill process");
                }
            }
            Opcode::DockerListContainers => {
                let req = ListContainersRequest::decode(message.payload)?;
                let resp = self.system.list_containers(req.all);
                let mut buf = Vec::new();
                resp.encode(&mut buf)?;
                let msg = KairoMessage::with_opcode(
                    MessageKind::Response,
                    Opcode::DockerListContainers,
                    request_id,
                    Bytes::from(buf),
                );
                self.send_frame(out_tx, msg).await?;
            }
            Opcode::DockerManageContainer => {
                let req = ManageContainerRequest::decode(message.payload)?;
                let action =
                    ContainerAction::try_from(req.action).unwrap_or(ContainerAction::Unspecified);
                let resp = self.system.manage_container(&req.container_id, action)?;
                let mut buf = Vec::new();
                resp.encode(&mut buf)?;
                let msg = KairoMessage::with_opcode(
                    MessageKind::Response,
                    Opcode::DockerManageContainer,
                    request_id,
                    Bytes::from(buf),
                );
                self.send_frame(out_tx, msg).await?;
            }
            Opcode::DockerContainerLogs => {
                let req = ContainerLogsRequest::decode(message.payload)?;
                let resp = self.system.container_logs(&req.container_id, req.tail)?;
                let mut buf = Vec::new();
                resp.encode(&mut buf)?;
                let msg = KairoMessage::with_opcode(
                    MessageKind::Response,
                    Opcode::DockerContainerLogs,
                    request_id,
                    Bytes::from(buf),
                );
                self.send_frame(out_tx, msg).await?;
            }
            Opcode::SystemListServices => {
                let _req = ListServicesRequest::decode(message.payload)?;
                let resp = self.system.list_services();
                let mut buf = Vec::new();
                resp.encode(&mut buf)?;
                let msg = KairoMessage::with_opcode(
                    MessageKind::Response,
                    Opcode::SystemListServices,
                    request_id,
                    Bytes::from(buf),
                );
                self.send_frame(out_tx, msg).await?;
            }
            Opcode::SystemManageService => {
                let req = ManageServiceRequest::decode(message.payload)?;
                let action =
                    ServiceAction::try_from(req.action).unwrap_or(ServiceAction::Unspecified);
                let resp = self.system.manage_service(&req.service_name, action)?;
                let mut buf = Vec::new();
                resp.encode(&mut buf)?;
                let msg = KairoMessage::with_opcode(
                    MessageKind::Response,
                    Opcode::SystemManageService,
                    request_id,
                    Bytes::from(buf),
                );
                self.send_frame(out_tx, msg).await?;
            }
            Opcode::AppList => {
                let _req = ListAppsRequest::decode(message.payload)?;
                let apps = self.app.list_applications().await;
                let resp = ListAppsResponse { apps };
                let mut buf = Vec::new();
                resp.encode(&mut buf)?;
                let msg = KairoMessage::with_opcode(
                    MessageKind::Response,
                    Opcode::AppList,
                    request_id,
                    Bytes::from(buf),
                );
                self.send_frame(out_tx, msg).await?;
            }
            Opcode::AppLaunch => {
                let req = LaunchAppRequest::decode(message.payload)?;
                match self.app.launch_app(req).await {
                    Ok(resp) => {
                        let mut buf = Vec::new();
                        resp.encode(&mut buf)?;
                        let msg = KairoMessage::with_opcode(
                            MessageKind::Response,
                            Opcode::AppLaunch,
                            request_id,
                            Bytes::from(buf),
                        );
                        self.send_frame(out_tx, msg).await?;
                    }
                    Err(e) => {
                        let err = KairoError {
                            code: ErrorCode::Internal as i32,
                            message: e.to_string(),
                            request_id: request_id.to_string(),
                        };
                        let mut buf = Vec::new();
                        err.encode(&mut buf)?;
                        let msg = KairoMessage::with_opcode(
                            MessageKind::Error,
                            Opcode::AppLaunch,
                            request_id,
                            Bytes::from(buf),
                        );
                        self.send_frame(out_tx, msg).await?;
                    }
                }
            }
            Opcode::SurfaceClose => {
                let req = CloseSurfaceRequest::decode(message.payload)?;
                let success = self.app.close_surface(&req.surface_id).await;
                let resp = CloseSurfaceResponse { success };
                let mut buf = Vec::new();
                resp.encode(&mut buf)?;
                let msg = KairoMessage::with_opcode(
                    MessageKind::Response,
                    Opcode::SurfaceClose,
                    request_id,
                    Bytes::from(buf),
                );
                self.send_frame(out_tx, msg).await?;
            }
            Opcode::SurfaceInput => {
                let a0 = std::time::Instant::now();
                let req = SurfaceInputEvent::decode(message.payload)?;
                info!(
                    "[AGENT WS] received input surface_id={} event_type={} key={} x={} y={} (decode: {:?})",
                    req.surface_id,
                    req.event_type,
                    req.key,
                    req.x,
                    req.y,
                    a0.elapsed()
                );
                self.app.handle_surface_input(req).await;
            }
            Opcode::SurfaceConfigure => {
                let req = ConfigureSurfaceRequest::decode(message.payload)?;
                let success = self
                    .app
                    .configure_surface(&req.surface_id, req.x, req.y, req.width, req.height)
                    .await
                    .is_ok();
                let resp = ConfigureSurfaceResponse { success };
                let mut buf = Vec::new();
                resp.encode(&mut buf)?;
                let msg = KairoMessage::with_opcode(
                    MessageKind::Response,
                    Opcode::SurfaceConfigure,
                    request_id,
                    Bytes::from(buf),
                );
                self.send_frame(out_tx, msg).await?;
            }
            Opcode::SurfaceFocus => {
                let req = FocusSurfaceRequest::decode(message.payload)?;
                let success = self.app.focus_surface(&req.surface_id).await.is_ok();
                let resp = FocusSurfaceResponse { success };
                let mut buf = Vec::new();
                resp.encode(&mut buf)?;
                let msg = KairoMessage::with_opcode(
                    MessageKind::Response,
                    Opcode::SurfaceFocus,
                    request_id,
                    Bytes::from(buf),
                );
                self.send_frame(out_tx, msg).await?;
            }
            Opcode::SurfaceList => {
                let _req = ListSurfacesRequest::decode(message.payload)?;
                let surfaces = self.app.list_surfaces().await;
                let resp = ListSurfacesResponse { surfaces };
                let mut buf = Vec::new();
                resp.encode(&mut buf)?;
                let msg = KairoMessage::with_opcode(
                    MessageKind::Response,
                    Opcode::SurfaceList,
                    request_id,
                    Bytes::from(buf),
                );
                self.send_frame(out_tx, msg).await?;
            }
            Opcode::GpuGetInfo => {
                let _req = GetGpuInfoRequest::decode(message.payload)?;
                let resp = self.gpu.get_gpu_info().await;
                let mut buf = Vec::new();
                resp.encode(&mut buf)?;
                let msg = KairoMessage::with_opcode(
                    MessageKind::Response,
                    Opcode::GpuGetInfo,
                    request_id,
                    Bytes::from(buf),
                );
                self.send_frame(out_tx, msg).await?;
            }
            Opcode::GpuStartStream => {
                let req = StartGpuStreamRequest::decode(message.payload)?;
                match self.gpu.start_stream(req).await {
                    Ok(resp) => {
                        let mut buf = Vec::new();
                        resp.encode(&mut buf)?;
                        let msg = KairoMessage::with_opcode(
                            MessageKind::Response,
                            Opcode::GpuStartStream,
                            request_id,
                            Bytes::from(buf),
                        );
                        self.send_frame(out_tx, msg).await?;
                    }
                    Err(e) => {
                        let err = KairoError {
                            code: ErrorCode::Internal as i32,
                            message: e.to_string(),
                            request_id: request_id.to_string(),
                        };
                        let mut buf = Vec::new();
                        err.encode(&mut buf)?;
                        let msg = KairoMessage::with_opcode(
                            MessageKind::Error,
                            Opcode::GpuStartStream,
                            request_id,
                            Bytes::from(buf),
                        );
                        self.send_frame(out_tx, msg).await?;
                    }
                }
            }
            Opcode::GpuStopStream => {
                let req = StopGpuStreamRequest::decode(message.payload)?;
                let success = self.gpu.stop_stream(&req.stream_id).await;
                let resp = StopGpuStreamResponse { success };
                let mut buf = Vec::new();
                resp.encode(&mut buf)?;
                let msg = KairoMessage::with_opcode(
                    MessageKind::Response,
                    Opcode::GpuStopStream,
                    request_id,
                    Bytes::from(buf),
                );
                self.send_frame(out_tx, msg).await?;
            }
            Opcode::GpuStreamStats => {
                let req = StopGpuStreamRequest::decode(message.payload)?;
                if let Some(stats) = self.gpu.get_stream_stats(&req.stream_id).await {
                    let mut buf = Vec::new();
                    stats.encode(&mut buf)?;
                    let msg = KairoMessage::with_opcode(
                        MessageKind::Response,
                        Opcode::GpuStreamStats,
                        request_id,
                        Bytes::from(buf),
                    );
                    self.send_frame(out_tx, msg).await?;
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
                self.send_frame(out_tx, msg).await?;
            }
        }

        Ok(())
    }

    async fn send_frame(
        &self,
        out_tx: &mpsc::Sender<WsMessage>,
        msg: KairoMessage,
    ) -> Result<(), SessionError> {
        let encoded = msg.encode()?;
        out_tx
            .send(WsMessage::Binary(encoded))
            .await
            .map_err(|e| SessionError::ConnectionClosed(e.to_string()))?;
        Ok(())
    }

    async fn send_fs_error(
        &self,
        out_tx: &mpsc::Sender<WsMessage>,
        opcode: Opcode,
        request_id: u64,
        err: FsError,
    ) -> Result<(), SessionError> {
        let code = match err {
            FsError::NotFound(_) => ErrorCode::NotFound,
            FsError::PermissionDenied(_) | FsError::PathTraversal(_) => ErrorCode::PermissionDenied,
            FsError::Conflict { .. } => ErrorCode::AlreadyExists,
            FsError::Io(_) | FsError::Watcher(_) => ErrorCode::Internal,
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

        self.send_frame(out_tx, msg).await?;
        Ok(())
    }
}
