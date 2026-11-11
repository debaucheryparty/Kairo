pub mod capability;
pub mod common;
pub mod error;
pub mod linux;
pub mod package;
pub mod selector;
pub mod service;
pub mod traits;

pub use capability::PlatformCapabilities;
pub use common::{CommandRunner, MockCommandRunner, RealCommandRunner};
pub use error::BridgeError;
pub use selector::select_adapter;
pub use traits::{PackageOps, PlatformAdapter, ProcessOps, ServiceOps};

use kairo_protocol::v1::SystemProfile;
use std::sync::Arc;

pub struct PlatformBridge {
    adapter: Arc<dyn PlatformAdapter>,
}

impl PlatformBridge {
    #[must_use]
    pub fn new(adapter: Box<dyn PlatformAdapter>) -> Self {
        Self {
            adapter: Arc::from(adapter),
        }
    }

    #[must_use]
    pub fn from_profile(profile: &SystemProfile) -> Self {
        let runner = Arc::new(RealCommandRunner);
        let adapter = select_adapter(profile, runner);
        Self {
            adapter: Arc::from(adapter),
        }
    }

    #[must_use]
    pub fn adapter(&self) -> &dyn PlatformAdapter {
        self.adapter.as_ref()
    }

    #[must_use]
    pub fn adapter_arc(&self) -> Arc<dyn PlatformAdapter> {
        self.adapter.clone()
    }
}
