use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::sync::broadcast;

pub mod x11;

#[derive(Debug, Error)]
pub enum GuiError {
    #[error("X11 connection error: {0}")]
    ConnectionError(String),

    #[error("X11 protocol error: {0}")]
    ProtocolError(String),

    #[error("spawn error: {0}")]
    SpawnError(String),

    #[error("surface not found: {0}")]
    SurfaceNotFound(String),

    #[error("backend error: {0}")]
    BackendError(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SurfaceLifecycleState {
    Created,
    Configured,
    Focused,
    Unfocused,
    Destroyed,
    Transient,
}

impl SurfaceLifecycleState {
    #[must_use]
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Created => "created",
            Self::Configured => "configured",
            Self::Focused => "focused",
            Self::Unfocused => "unfocused",
            Self::Destroyed => "destroyed",
            Self::Transient => "transient",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteSurface {
    pub surface_id: String,
    pub app_id: String,
    pub title: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub state: SurfaceLifecycleState,
    pub is_transient: bool,
    pub parent_surface_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SurfaceLifecycleNotification {
    pub surface: RemoteSurface,
    pub state: SurfaceLifecycleState,
}

#[derive(Debug, Clone)]
pub struct SurfaceDamageFrame {
    pub surface_id: String,
    pub sequence: u64,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub codec: String,
    pub data: Vec<u8>,
    pub timestamp_us: u64,
}

#[derive(Debug, Clone)]
pub enum GuiInputEvent {
    MouseMove { x: i32, y: i32 },
    MouseDown { button: u32, x: i32, y: i32 },
    MouseUp { button: u32, x: i32, y: i32 },
    KeyDown { key: String, code: String },
    KeyUp { key: String, code: String },
    Wheel { delta_x: i32, delta_y: i32 },
}

#[async_trait]
pub trait RemoteGuiBackend: Send + Sync {
    /// Launch or connect the GUI backend display server
    async fn start(&self) -> Result<(), GuiError>;

    /// Spawn a GUI application under this backend
    async fn spawn_app(
        &self,
        app_id: &str,
        exec: &str,
        args: &[String],
        working_directory: &str,
    ) -> Result<u32, GuiError>;

    /// Request the window manager / X11 server to configure surface dimensions/position
    async fn configure_surface(
        &self,
        surface_id: &str,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
    ) -> Result<(), GuiError>;

    /// Request focus for a remote surface
    async fn focus_surface(&self, surface_id: &str) -> Result<(), GuiError>;

    /// Forward mouse / keyboard input to the surface
    async fn send_input(&self, surface_id: &str, event: GuiInputEvent) -> Result<(), GuiError>;

    /// Close / destroy a remote surface
    async fn close_surface(&self, surface_id: &str) -> Result<bool, GuiError>;

    /// List all currently known remote surfaces
    async fn list_surfaces(&self) -> Vec<RemoteSurface>;

    /// Refresh and resend full frames for a specific surface or all surfaces
    async fn refresh_surface(&self, surface_id: Option<&str>) -> Result<(), GuiError>;

    /// Subscribe to damage frame updates
    fn subscribe_frames(&self) -> broadcast::Receiver<SurfaceDamageFrame>;

    /// Subscribe to surface lifecycle events
    fn subscribe_lifecycle(&self) -> broadcast::Receiver<SurfaceLifecycleNotification>;
}
