use kairo_common::KairoId;
use kairo_protocol::v1::{LaunchAppRequest, LaunchAppResponse, LinuxApp, RemoteSurface};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::RwLock;
use tracing::{debug, info};

#[derive(Debug, Error)]
pub enum AppError {
    #[error("failed to spawn application process: {0}")]
    SpawnFailed(String),

    #[error("application not found: {0}")]
    NotFound(String),

    #[error("surface not found: {0}")]
    SurfaceNotFound(String),
}

pub struct ActiveSurface {
    pub surface: RemoteSurface,
    pub process_id: u32,
    pub child_handle: Option<tokio::process::Child>,
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

    pub async fn launch_app(&self, req: LaunchAppRequest) -> Result<LaunchAppResponse, AppError> {
        let surface_id = KairoId::new().to_string();
        let app_id = req.app_id.clone();
        let exec_cmd = if req.exec.is_empty() {
            req.app_id.clone()
        } else {
            req.exec.clone()
        };

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

        let child = cmd
            .spawn()
            .map_err(|e| AppError::SpawnFailed(e.to_string()))?;

        let pid = child.id().unwrap_or(0);
        debug!(surface_id = %surface_id, pid = pid, app = %app_id, "launched application");

        let surface = RemoteSurface {
            surface_id: surface_id.clone(),
            app_id,
            title: req.exec,
            width: 800,
            height: 600,
            backend: "headless-xvfb".to_string(),
            state: "surface-created".to_string(),
        };

        let active = ActiveSurface {
            surface,
            process_id: pid,
            child_handle: Some(child),
        };

        let mut map = self.surfaces.write().await;
        map.insert(surface_id.clone(), active);

        Ok(LaunchAppResponse {
            surface_id,
            process_id: pid.to_string(),
            state: "surface-created".to_string(),
        })
    }

    pub async fn close_surface(&self, surface_id: &str) -> bool {
        let mut map = self.surfaces.write().await;
        if let Some(mut active) = map.remove(surface_id) {
            if let Some(mut child) = active.child_handle.take() {
                let _ = child.kill().await;
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
