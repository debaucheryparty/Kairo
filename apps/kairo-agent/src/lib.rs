#![allow(
    clippy::collapsible_if,
    clippy::manual_contains,
    clippy::bind_instead_of_map,
    clippy::too_many_arguments
)]

pub mod app_manager;
pub mod config;
pub mod fs;
pub mod gpu;
pub mod gui;
pub mod logging;
pub mod media;
pub mod metrics;
pub mod notification;
pub mod process;
pub mod pty;
pub mod server;
pub mod session;
pub mod system;

pub use app_manager::{AppError, AppManager};
pub use config::AgentConfig;
pub use fs::{FilesystemHandler, FsError};
pub use gpu::{GpuError, GpuManager};
pub use gui::x11::X11Backend;
pub use gui::{GuiError, GuiInputEvent, RemoteGuiBackend, RemoteSurface, SurfaceLifecycleState};
pub use media::{MediaError, MediaManager};
pub use metrics::MetricsCollector;
pub use notification::NotificationManager;
pub use process::{ProcessError, ProcessManager};
pub use pty::{PtyError, PtyManager};
pub use server::Server;
pub use session::{Session, SessionError, SessionState};
pub use system::{SystemError, SystemManager};
