use std::path::{Path, PathBuf};
use std::sync::Arc;

use bytes::Bytes;
use kairo_protocol::v1::{
    LaunchAppRequest, LaunchAppResponse, LinuxApp, RemoteSurface, SurfaceFrame,
    SurfaceInputEvent,
};
use kairo_protocol::{KairoMessage, MessageKind, Opcode};
use prost::Message as ProstMessage;
use thiserror::Error;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message as WsMessage;
use std::time::Duration;
use tracing::{info, warn};

use crate::gui::{x11::X11Backend, GuiInputEvent, RemoteGuiBackend};

#[derive(Debug, Error)]
pub enum AppError {
    #[error("failed to spawn application process: {0}")]
    SpawnFailed(String),

    #[error("application not found: {0}")]
    NotFound(String),

    #[error("surface not found: {0}")]
    SurfaceNotFound(String),
}

#[derive(Clone)]
pub struct AppManager {
    gui_backend: Arc<dyn RemoteGuiBackend>,
}

impl Default for AppManager {
    fn default() -> Self {
        Self::new()
    }
}

impl AppManager {
    #[must_use]
    pub fn new() -> Self {
        Self {
            gui_backend: Arc::new(X11Backend::new(None)),
        }
    }

    #[must_use]
    pub fn with_backend(gui_backend: Arc<dyn RemoteGuiBackend>) -> Self {
        Self { gui_backend }
    }

    pub async fn list_applications(&self) -> Vec<LinuxApp> {
        let mut apps = Vec::new();
        let mut app_dirs = vec![
            PathBuf::from("/usr/share/applications"),
            PathBuf::from("/usr/local/share/applications"),
            PathBuf::from("/var/lib/flatpak/exports/share/applications"),
            PathBuf::from("/var/lib/snapd/desktop/applications"),
        ];

        if let Ok(home) = std::env::var("HOME") {
            app_dirs.push(PathBuf::from(home).join(".local/share/applications"));
        }

        for dir in &app_dirs {
            if let Ok(mut entries) = tokio::fs::read_dir(dir).await {
                while let Ok(Some(entry)) = entries.next_entry().await {
                    let path = entry.path();
                    if path.extension().is_none_or(|ext| ext != "desktop") {
                        continue;
                    }
                    if let Some(app) = Self::parse_desktop_file(&path).await {
                        if !apps.iter().any(|existing: &LinuxApp| existing.app_id == app.app_id || existing.exec == app.exec) {
                            apps.push(app);
                        }
                    }
                }
            }
        }

        apps.sort_by(|a, b| a.name.cmp(&b.name));
        apps
    }

    async fn parse_desktop_file(path: &Path) -> Option<LinuxApp> {
        let content = tokio::fs::read_to_string(path).await.ok()?;
        let mut name = None;
        let mut generic_name = None;
        let mut comment = None;
        let mut icon = None;
        let mut exec = None;
        let mut categories = Vec::new();
        let mut is_terminal = false;
        let mut no_display = false;

        let mut in_entry_section = false;

        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with('[') && trimmed.ends_with(']') {
                in_entry_section = trimmed == "[Desktop Entry]";
                continue;
            }

            if !in_entry_section || trimmed.starts_with('#') {
                continue;
            }

            if let Some((k, v)) = trimmed.split_once('=') {
                let key = k.trim();
                let val = v.trim();
                match key {
                    "Name" if name.is_none() => name = Some(val.to_string()),
                    "GenericName" => generic_name = Some(val.to_string()),
                    "Comment" => comment = Some(val.to_string()),
                    "Icon" => icon = Some(val.to_string()),
                    "Exec" => {
                        let cleaned = val
                            .split_whitespace()
                            .filter(|part| !part.starts_with('%'))
                            .collect::<Vec<_>>()
                            .join(" ");
                        exec = Some(cleaned);
                    }
                    "NoDisplay" => no_display = val.eq_ignore_ascii_case("true"),
                    "Terminal" => is_terminal = val.eq_ignore_ascii_case("true"),
                    "Categories" => {
                        categories = val
                            .split(';')
                            .map(str::trim)
                            .filter(|s| !s.is_empty())
                            .map(ToString::to_string)
                            .collect();
                    }
                    _ => {}
                }
            }
        }

        if no_display || name.is_none() || exec.is_none() {
            return None;
        }

        let app_id = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("app")
            .to_string();

        Some(LinuxApp {
            app_id,
            name: name.unwrap_or_default(),
            generic_name: generic_name.unwrap_or_default(),
            comment: comment.unwrap_or_default(),
            icon: icon.unwrap_or_default(),
            exec: exec.unwrap_or_default(),
            categories,
            is_terminal,
        })
    }

    pub fn attach_session(&self, out_tx: mpsc::Sender<WsMessage>) {
        let mut frame_rx = self.gui_backend.subscribe_frames();
        let frame_tx = out_tx.clone();
        tokio::spawn(async move {
            while let Ok(frame) = frame_rx.recv().await {
                let proto_frame = SurfaceFrame {
                    surface_id: frame.surface_id,
                    sequence: frame.sequence,
                    width: frame.width,
                    height: frame.height,
                    codec: frame.codec,
                    data: frame.data,
                    x: frame.x,
                    y: frame.y,
                    timestamp_us: frame.timestamp_us,
                };
                let mut buf = Vec::new();
                let seq = proto_frame.sequence;
                let sid = proto_frame.surface_id.clone();
                let data_len = proto_frame.data.len();
                if proto_frame.encode(&mut buf).is_ok() {
                    let msg = KairoMessage::with_opcode(
                        MessageKind::Event,
                        Opcode::SurfaceFrame,
                        0,
                        Bytes::from(buf),
                    );
                    if let Ok(encoded) = msg.encode() {
                        let t_send = std::time::Instant::now();
                        if frame_tx.send(WsMessage::Binary(encoded)).await.is_err() {
                            break;
                        }
                        let elapsed = t_send.elapsed();
                        if elapsed > Duration::from_millis(15) {
                            warn!("[AGENT FRAME QUEUE SLOW] queued sid={} seq={} bytes={} in {:?}", sid, seq, data_len, elapsed);
                        }
                    }
                }
            }
        });

        let mut lifecycle_rx = self.gui_backend.subscribe_lifecycle();
        let lc_tx = out_tx;
        tokio::spawn(async move {
            while let Ok(notif) = lifecycle_rx.recv().await {
                let proto_event = kairo_protocol::v1::SurfaceLifecycleEvent {
                    surface_id: notif.surface.surface_id,
                    state: notif.state.as_str().to_string(),
                    title: notif.surface.title,
                    x: notif.surface.x,
                    y: notif.surface.y,
                    width: notif.surface.width,
                    height: notif.surface.height,
                    parent_id: notif.surface.parent_surface_id.unwrap_or_default(),
                    is_transient: notif.surface.is_transient,
                };
                let mut buf = Vec::new();
                if proto_event.encode(&mut buf).is_ok() {
                    let msg = KairoMessage::with_opcode(
                        MessageKind::Event,
                        Opcode::SurfaceLifecycle,
                        0,
                        Bytes::from(buf),
                    );
                    if let Ok(encoded) = msg.encode() {
                        if lc_tx.send(WsMessage::Binary(encoded)).await.is_err() {
                            break;
                        }
                    }
                }
            }
        });

        let backend = self.gui_backend.clone();
        tokio::spawn(async move {
            tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
            let _ = backend.refresh_surface(None).await;
        });
    }

    pub async fn launch_app(
        &self,
        req: LaunchAppRequest,
    ) -> Result<LaunchAppResponse, AppError> {
        let t0 = std::time::Instant::now();
        info!("[APP LAUNCH] starting GUI backend for app_id={}", req.app_id);
        self.gui_backend
            .start()
            .await
            .map_err(|e| AppError::SpawnFailed(e.to_string()))?;
        info!("[APP LAUNCH] GUI backend ready in {:?}", t0.elapsed());

        let exec_cmd = if req.exec.is_empty() {
            req.app_id.clone()
        } else {
            req.exec.clone()
        };

        let t1 = std::time::Instant::now();
        let pid = self
            .gui_backend
            .spawn_app(&req.app_id, &exec_cmd, &req.args, &req.working_directory)
            .await
            .map_err(|e| AppError::SpawnFailed(e.to_string()))?;
        info!("[APP LAUNCH] app spawned pid={} in {:?}", pid, t1.elapsed());

        let surface_id = format!("app-{pid}");
        Ok(LaunchAppResponse {
            surface_id,
            process_id: pid.to_string(),
            state: "running".to_string(),
        })
    }

    pub async fn configure_surface(
        &self,
        surface_id: &str,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
    ) -> Result<(), AppError> {
        self.gui_backend
            .configure_surface(surface_id, x, y, width, height)
            .await
            .map_err(|e| AppError::SpawnFailed(e.to_string()))
    }

    pub async fn focus_surface(&self, surface_id: &str) -> Result<(), AppError> {
        self.gui_backend
            .focus_surface(surface_id)
            .await
            .map_err(|e| AppError::SpawnFailed(e.to_string()))
    }

    pub async fn handle_surface_input(&self, event: SurfaceInputEvent) {
        let gui_event = match event.event_type.as_str() {
            "mousemove" => GuiInputEvent::MouseMove {
                x: event.x,
                y: event.y,
            },
            "mousedown" => GuiInputEvent::MouseDown {
                button: event.button,
                x: event.x,
                y: event.y,
            },
            "mouseup" => GuiInputEvent::MouseUp {
                button: event.button,
                x: event.x,
                y: event.y,
            },
            "keydown" => GuiInputEvent::KeyDown {
                key: event.key,
                code: String::new(),
            },
            "keyup" => GuiInputEvent::KeyUp {
                key: event.key,
                code: String::new(),
            },
            "wheel" => GuiInputEvent::Wheel {
                delta_x: event.delta_x,
                delta_y: event.delta_y,
            },
            _ => return,
        };

        if let Err(e) = self.gui_backend.send_input(&event.surface_id, gui_event).await {
            warn!(surface_id = %event.surface_id, error = %e, "failed to send GUI surface input");
        }
    }

    pub async fn close_surface(&self, surface_id: &str) -> bool {
        self.gui_backend
            .close_surface(surface_id)
            .await
            .unwrap_or(false)
    }

    pub async fn list_surfaces(&self) -> Vec<RemoteSurface> {
        let surfaces = self.gui_backend.list_surfaces().await;
        surfaces
            .into_iter()
            .map(|s| RemoteSurface {
                surface_id: s.surface_id,
                app_id: s.app_id,
                title: s.title,
                width: s.width,
                height: s.height,
                backend: "x11-composite-damage".to_string(),
                state: s.state.as_str().to_string(),
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_parse_desktop_file() {
        let temp = tempfile::tempdir().unwrap();
        let desktop_path = temp.path().join("test-app.desktop");
        tokio::fs::write(
            &desktop_path,
            "[Desktop Entry]\nType=Application\nName=Test GUI App\nExec=test-gui %u\nCategories=Development;IDE;\n",
        )
        .await
        .unwrap();

        let parsed = AppManager::parse_desktop_file(&desktop_path).await;
        assert!(parsed.is_some());
        let app = parsed.unwrap();
        assert_eq!(app.name, "Test GUI App");
        assert_eq!(app.exec, "test-gui");
        assert_eq!(app.categories, vec!["Development", "IDE"]);
    }

    #[tokio::test]
    async fn test_close_nonexistent_surface() {
        let manager = AppManager::new();
        assert!(!manager.close_surface("invalid-id").await);
    }
}
