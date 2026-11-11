use std::path::{Path, PathBuf};
use std::sync::Arc;

use kairo_bridge::{PlatformAdapter, PlatformCapabilities};
use kairo_protocol::v1::SystemProfile;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemBoundaries {
    pub host_root: PathBuf,
    pub managed_root: PathBuf,
    pub data_dir: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemResources {
    pub cpu_cores: u32,
    pub memory_total_bytes: u64,
    pub disk_total_bytes: u64,
    pub kernel_version: String,
    pub architecture: i32,
}

pub struct SystemApi {
    profile: Arc<SystemProfile>,
    adapter: Arc<dyn PlatformAdapter>,
    boundaries: SystemBoundaries,
}

impl SystemApi {
    #[must_use]
    pub fn new(
        profile: Arc<SystemProfile>,
        adapter: Arc<dyn PlatformAdapter>,
        data_dir: impl AsRef<Path>,
    ) -> Self {
        let data_dir = data_dir.as_ref().to_path_buf();
        let managed_root = data_dir.join("managed");

        let host_root = if cfg!(windows) {
            std::env::var("SystemDrive")
                .map(|d| PathBuf::from(format!("{d}\\")))
                .unwrap_or_else(|_| PathBuf::from("C:\\"))
        } else {
            PathBuf::from("/")
        };

        Self {
            profile,
            adapter,
            boundaries: SystemBoundaries {
                host_root,
                managed_root,
                data_dir,
            },
        }
    }

    #[must_use]
    pub fn profile(&self) -> &SystemProfile {
        &self.profile
    }

    #[must_use]
    pub fn capabilities(&self) -> PlatformCapabilities {
        self.adapter.capabilities()
    }

    #[must_use]
    pub fn boundaries(&self) -> &SystemBoundaries {
        &self.boundaries
    }

    #[must_use]
    pub fn resources(&self) -> SystemResources {
        SystemResources {
            cpu_cores: self.profile.cpu_cores,
            memory_total_bytes: self.profile.memory_total_bytes,
            disk_total_bytes: self.profile.disk_total_bytes,
            kernel_version: self.profile.kernel_version.clone(),
            architecture: self.profile.architecture,
        }
    }
}
