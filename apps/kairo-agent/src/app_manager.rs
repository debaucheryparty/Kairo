use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

use bytes::Bytes;
use kairo_common::KairoId;
use kairo_protocol::v1::{
    LaunchAppRequest, LaunchAppResponse, LinuxApp, RemoteSurface, SurfaceFrame,
    SurfaceInputEvent,
};
use kairo_protocol::{KairoMessage, MessageKind, Opcode};
use prost::Message as ProstMessage;
use thiserror::Error;
use tokio::io::AsyncReadExt;
use tokio::sync::mpsc;
use tokio::sync::RwLock;
use tokio_tungstenite::tungstenite::Message as WsMessage;
use tracing::{debug, info, warn};

#[derive(Debug, Error)]
pub enum AppError {
    #[error("failed to spawn application process: {0}")]
    SpawnFailed(String),

    #[error("application not found: {0}")]
    NotFound(String),

    #[error("surface not found: {0}")]
    SurfaceNotFound(String),
}

static DISPLAY_COUNTER: AtomicU32 = AtomicU32::new(50);

pub struct ActiveSurface {
    pub surface: RemoteSurface,
    pub process_id: u32,
    pub display_num: u32,
    pub child_handle: Option<tokio::process::Child>,
    pub xvfb_handle: Option<tokio::process::Child>,
    pub capture_abort: Option<tokio::task::AbortHandle>,
}

#[derive(Clone)]
pub struct AppManager {
    surfaces: Arc<RwLock<HashMap<String, ActiveSurface>>>,
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
            surfaces: Arc::new(RwLock::new(HashMap::new())),
        }
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

    pub async fn launch_app(
        &self,
        req: LaunchAppRequest,
        out_tx: mpsc::Sender<WsMessage>,
    ) -> Result<LaunchAppResponse, AppError> {
        let surface_id = KairoId::new().to_string();
        let app_id = req.app_id.clone();
        let exec_cmd = if req.exec.is_empty() {
            req.app_id.clone()
        } else {
            req.exec.clone()
        };

        let display_num = DISPLAY_COUNTER.fetch_add(1, Ordering::Relaxed);
        let display_str = format!(":{display_num}");
        let width: u32 = 1280;
        let height: u32 = 720;

        let xvfb = tokio::process::Command::new("Xvfb")
            .arg(&display_str)
            .arg("-screen")
            .arg("0")
            .arg(format!("{width}x{height}x24"))
            .arg("-ac")
            .arg("-nolisten")
            .arg("tcp")
            .spawn()
            .map_err(|e| AppError::SpawnFailed(format!("Xvfb: {e}")))?;

        tokio::time::sleep(std::time::Duration::from_millis(300)).await;

        let mut parts = exec_cmd.split_whitespace();
        let binary = parts.next().unwrap_or("bash");
        let mut cmd = tokio::process::Command::new(binary);

        for arg in parts {
            if !arg.starts_with('%') {
                cmd.arg(arg);
            }
        }

        for arg in &req.args {
            cmd.arg(arg);
        }

        if !req.working_directory.is_empty() {
            cmd.current_dir(&req.working_directory);
        }

        cmd.env("DISPLAY", &display_str);

        let child = cmd
            .spawn()
            .map_err(|e| AppError::SpawnFailed(e.to_string()))?;

        let pid = child.id().unwrap_or(0);
        debug!(surface_id = %surface_id, pid = pid, app = %app_id, display = %display_str, "launched application on virtual display");

        let capture_sid = surface_id.clone();
        let capture_display = display_str.clone();
        let capture_task = tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            Self::run_frame_capture(
                capture_sid,
                capture_display,
                width,
                height,
                out_tx,
            )
            .await;
        });

        let surface = RemoteSurface {
            surface_id: surface_id.clone(),
            app_id,
            title: req.exec,
            width,
            height,
            backend: "xvfb-ffmpeg".to_string(),
            state: "streaming".to_string(),
        };

        let active = ActiveSurface {
            surface,
            process_id: pid,
            display_num,
            child_handle: Some(child),
            xvfb_handle: Some(xvfb),
            capture_abort: Some(capture_task.abort_handle()),
        };

        let mut map = self.surfaces.write().await;
        map.insert(surface_id.clone(), active);

        Ok(LaunchAppResponse {
            surface_id,
            process_id: pid.to_string(),
            state: "streaming".to_string(),
        })
    }

    async fn run_frame_capture(
        surface_id: String,
        display: String,
        width: u32,
        height: u32,
        out_tx: mpsc::Sender<WsMessage>,
    ) {
        let mut capture = match tokio::process::Command::new("ffmpeg")
            .args([
                "-f", "x11grab",
                "-video_size", &format!("{width}x{height}"),
                "-framerate", "15",
                "-i", &display,
                "-vf", "scale=1280:720",
                "-f", "image2pipe",
                "-vcodec", "mjpeg",
                "-q:v", "8",
                "-update", "1",
                "pipe:1",
            ])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => {
                warn!(error = %e, "ffmpeg capture failed to start");
                return;
            }
        };

        let Some(stdout) = capture.stdout.take() else {
            warn!("ffmpeg stdout not available");
            return;
        };

        let mut reader = tokio::io::BufReader::new(stdout);
        let mut sequence: u64 = 0;
        let mut scan_buf = Vec::with_capacity(256 * 1024);

        loop {
            let mut byte = [0u8; 1];
            match reader.read(&mut byte).await {
                Ok(0) => break,
                Ok(_) => scan_buf.push(byte[0]),
                Err(_) => break,
            }

            if scan_buf.len() < 2 {
                continue;
            }

            let len = scan_buf.len();
            if scan_buf[len - 2] == 0xFF && scan_buf[len - 1] == 0xD9 {
                if let Some(soi) = find_jpeg_start(&scan_buf) {
                    let jpeg_data = scan_buf[soi..].to_vec();
                    sequence += 1;

                    let frame = SurfaceFrame {
                        surface_id: surface_id.clone(),
                        sequence,
                        width,
                        height,
                        codec: "mjpeg".to_string(),
                        data: jpeg_data,
                    };

                    let mut buf = Vec::new();
                    if frame.encode(&mut buf).is_ok() {
                        let msg = KairoMessage::with_opcode(
                            MessageKind::Event,
                            Opcode::SurfaceFrame,
                            0,
                            Bytes::from(buf),
                        );
                        if let Ok(encoded) = msg.encode() {
                            if out_tx.send(WsMessage::Binary(encoded)).await.is_err() {
                                break;
                            }
                        }
                    }
                }

                scan_buf.clear();
            }

            if scan_buf.len() > 2 * 1024 * 1024 {
                scan_buf.clear();
            }
        }

        let _ = capture.kill().await;
    }

    pub async fn handle_surface_input(&self, event: SurfaceInputEvent) {
        let display_num = {
            let map = self.surfaces.read().await;
            match map.get(&event.surface_id) {
                Some(s) => s.display_num,
                None => return,
            }
        };

        let display = format!(":{display_num}");

        match event.event_type.as_str() {
            "mousemove" => {
                let _ = tokio::process::Command::new("xdotool")
                    .args(["mousemove", "--screen", "0", &event.x.to_string(), &event.y.to_string()])
                    .env("DISPLAY", &display)
                    .output()
                    .await;
            }
            "mousedown" => {
                let btn = (event.button + 1).to_string();
                let _ = tokio::process::Command::new("xdotool")
                    .args(["mousemove", "--screen", "0", &event.x.to_string(), &event.y.to_string()])
                    .env("DISPLAY", &display)
                    .output()
                    .await;
                let _ = tokio::process::Command::new("xdotool")
                    .args(["mousedown", &btn])
                    .env("DISPLAY", &display)
                    .output()
                    .await;
            }
            "mouseup" => {
                let btn = (event.button + 1).to_string();
                let _ = tokio::process::Command::new("xdotool")
                    .args(["mouseup", &btn])
                    .env("DISPLAY", &display)
                    .output()
                    .await;
            }
            "keydown" => {
                if let Some(xkey) = web_key_to_xdotool(&event.key) {
                    let _ = tokio::process::Command::new("xdotool")
                        .args(["keydown", xkey])
                        .env("DISPLAY", &display)
                        .output()
                        .await;
                }
            }
            "keyup" => {
                if let Some(xkey) = web_key_to_xdotool(&event.key) {
                    let _ = tokio::process::Command::new("xdotool")
                        .args(["keyup", xkey])
                        .env("DISPLAY", &display)
                        .output()
                        .await;
                }
            }
            "wheel" => {
                let direction = if event.delta_y < 0 { "4" } else { "5" };
                let clicks = ((event.delta_y.unsigned_abs() / 120).max(1)).to_string();
                let _ = tokio::process::Command::new("xdotool")
                    .args(["click", "--repeat", &clicks, direction])
                    .env("DISPLAY", &display)
                    .output()
                    .await;
            }
            _ => {}
        }
    }

    pub async fn close_surface(&self, surface_id: &str) -> bool {
        let mut map = self.surfaces.write().await;
        if let Some(mut active) = map.remove(surface_id) {
            if let Some(handle) = active.capture_abort.take() {
                handle.abort();
            }
            if let Some(mut child) = active.child_handle.take() {
                let _ = child.kill().await;
            }
            if let Some(mut xvfb) = active.xvfb_handle.take() {
                let _ = xvfb.kill().await;
            }
            info!(surface_id = %surface_id, "surface closed");
            true
        } else {
            false
        }
    }

    pub async fn list_surfaces(&self) -> Vec<RemoteSurface> {
        let map = self.surfaces.read().await;
        map.values().map(|a| a.surface.clone()).collect()
    }
}

fn find_jpeg_start(buf: &[u8]) -> Option<usize> {
    for i in 0..buf.len().saturating_sub(1) {
        if buf[i] == 0xFF && buf[i + 1] == 0xD8 {
            return Some(i);
        }
    }
    None
}

fn web_key_to_xdotool(key: &str) -> Option<&str> {
    match key {
        "Enter" => Some("Return"),
        "Backspace" => Some("BackSpace"),
        "Tab" => Some("Tab"),
        "Escape" => Some("Escape"),
        "ArrowUp" => Some("Up"),
        "ArrowDown" => Some("Down"),
        "ArrowLeft" => Some("Left"),
        "ArrowRight" => Some("Right"),
        "Delete" => Some("Delete"),
        "Home" => Some("Home"),
        "End" => Some("End"),
        "PageUp" => Some("Page_Up"),
        "PageDown" => Some("Page_Down"),
        "Control" => Some("Control_L"),
        "Shift" => Some("Shift_L"),
        "Alt" => Some("Alt_L"),
        "Meta" => Some("Super_L"),
        " " => Some("space"),
        k if k.len() == 1 => Some(k),
        _ => None,
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
