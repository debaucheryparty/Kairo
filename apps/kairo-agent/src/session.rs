use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use kairo_common::KairoId;
use kairo_protocol::v1::{
    AttachPtyRequest, AttachPtyResponse, ClosePtyRequest, CloseSurfaceRequest, CloseSurfaceResponse,
    ContainerAction, ContainerLogsRequest, CreatePtyRequest, CreatePtyResponse, ErrorCode,
    GetGpuInfoRequest, GetMetricsRequest, GetMetricsResponse, HandshakeAck, HandshakeInit,
    KairoError, KillProcessRequest, LaunchAppRequest, ListAppsRequest, ListAppsResponse,
    ListContainersRequest, ListDirectoryRequest, ListProcessesRequest, ListProcessesResponse,
    ListPtysRequest, ListPtysResponse, ListServicesRequest, ManageContainerRequest,
    ManageServiceRequest, PtyInput, PtyOutput, ReadFileRequest, ResizePtyRequest, ServiceAction,
    StartGpuStreamRequest, StopGpuStreamRequest, StopGpuStreamResponse, SurfaceInputEvent,
    WatchRequest, WatchResponse, WriteFileRequest,
};
use kairo_protocol::{KairoMessage, MessageKind, Opcode, ProtocolError};
use prost::Message as ProstMessage;
use thiserror::Error;
use tokio::net::TcpStream;
use tokio::sync::mpsc;
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
        let fs = FilesystemHandler::new(&config.data_dir);
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

        let (mut ws_tx, mut ws_rx) = stream.split();
        let (out_tx, mut out_rx) = mpsc::channel::<WsMessage>(256);

        let writer_handle = tokio::spawn(async move {
            while let Some(msg) = out_rx.recv().await {
                if ws_tx.send(msg).await.is_err() {
                    break;
                }
            }
        });

        while let Some(msg_res) = ws_rx.next().await {
            let ws_msg = msg_res.map_err(|e| SessionError::ConnectionClosed(e.to_string()))?;

            match ws_msg {
                WsMessage::Binary(data) => {
                    self.handle_message(&out_tx, data).await?;
                }
                WsMessage::Close(_) => {
                    info!(session_id = %self.session_id, "client closed connection");
                    break;
                }
                WsMessage::Ping(payload) => {
                    let _ = out_tx.send(WsMessage::Pong(payload)).await;
                }
                _ => {}
            }
        }

        self.state = SessionState::Terminated;
        self.watcher = None;
        drop(out_tx);
        let _ = writer_handle.await;

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
                "docker.v1".to_string(),
                "system.v1".to_string(),
                "app.v1".to_string(),
                "gpu.v1".to_string(),
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
                let _req = SurfaceInputEvent::decode(message.payload)?;
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
