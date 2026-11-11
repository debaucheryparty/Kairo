pub mod audit;
pub mod auth;
pub mod env;
pub mod error;
pub mod fs;
pub mod package;
pub mod process;
pub mod runtime;
pub mod service;
pub mod state;
pub mod system;
pub mod target;
pub mod userspace;

use std::sync::Arc;
use std::time::Duration;

pub use audit::{AuditEvent, AuditLog, AuditSeverity};
pub use auth::{AuthContext, OperationLevel, PermissionManager};
pub use env::EnvironmentApi;
pub use error::CoreError;
pub use fs::{FileMetadata, FilesystemApi};
pub use package::{ArtifactKind, PackageApi, PackageManifest};
pub use process::ProcessApi;
pub use runtime::{
    ManagedServiceSpec, RestartPolicy, ServiceState, ServiceStatus, ServiceSupervisor,
};
pub use service::ServiceApi;
pub use state::{StateDocument, load_state, store_state};
pub use system::{SystemApi, SystemBoundaries, SystemResources};
pub use target::ExecutionTarget;
pub use userspace::{ManagedUserspace, UserspaceState};

use kairo_bridge::PlatformBridge;
use kairo_protocol::v1::SystemProfile;
use tracing::warn;

pub struct CoreConfig {
    pub data_dir: String,
    pub audit_capacity: usize,
}

impl Default for CoreConfig {
    fn default() -> Self {
        Self {
            data_dir: String::new(),
            audit_capacity: 1000,
        }
    }
}

pub struct KairoCore {
    system: SystemApi,
    process: ProcessApi,
    service: ServiceApi,
    package: PackageApi,
    fs: FilesystemApi,
    env: EnvironmentApi,
    audit: Arc<AuditLog>,
    permissions: PermissionManager,
    userspace: Option<Arc<ManagedUserspace>>,
}

impl KairoCore {
    #[must_use]
    pub fn new(bridge: Arc<PlatformBridge>, profile: SystemProfile, config: CoreConfig) -> Self {
        let adapter = bridge.adapter_arc();
        let profile_arc = Arc::new(profile);
        let audit = Arc::new(AuditLog::new(config.audit_capacity));
        let permissions = PermissionManager::new();

        let system = SystemApi::new(profile_arc, adapter.clone(), &config.data_dir);
        let boundaries = system.boundaries().clone();
        let managed_root = boundaries.managed_root.clone();

        let userspace: Option<Arc<ManagedUserspace>> = match ManagedUserspace::init(&managed_root) {
            Ok(space) => Some(Arc::new(space)),
            Err(e) => {
                warn!(
                    root = %managed_root.display(),
                    error = %e,
                    "managed userspace init failed; userspace-backed features are unavailable"
                );
                None
            }
        };

        let supervisor = userspace
            .clone()
            .map(|space| Arc::new(ServiceSupervisor::new(space, Duration::from_secs(1))));

        let process = ProcessApi::new(adapter.clone(), permissions.clone(), audit.clone());
        let service = ServiceApi::new(
            adapter.clone(),
            permissions.clone(),
            audit.clone(),
            supervisor,
        );
        let package = PackageApi::new(
            adapter,
            permissions.clone(),
            audit.clone(),
            userspace.clone(),
        );
        let fs = FilesystemApi::new(boundaries, permissions.clone(), audit.clone());
        let env = EnvironmentApi::new(permissions.clone(), audit.clone());

        Self {
            system,
            process,
            service,
            package,
            fs,
            env,
            audit,
            permissions,
            userspace,
        }
    }

    #[must_use]
    pub fn system(&self) -> &SystemApi {
        &self.system
    }

    #[must_use]
    pub fn processes(&self) -> &ProcessApi {
        &self.process
    }

    #[must_use]
    pub fn services(&self) -> &ServiceApi {
        &self.service
    }

    #[must_use]
    pub fn packages(&self) -> &PackageApi {
        &self.package
    }

    #[must_use]
    pub fn fs(&self) -> &FilesystemApi {
        &self.fs
    }

    #[must_use]
    pub fn env(&self) -> &EnvironmentApi {
        &self.env
    }

    #[must_use]
    pub fn audit(&self) -> &Arc<AuditLog> {
        &self.audit
    }

    #[must_use]
    pub fn permissions(&self) -> &PermissionManager {
        &self.permissions
    }

    #[must_use]
    pub fn userspace(&self) -> Option<&ManagedUserspace> {
        self.userspace.as_deref()
    }
}
