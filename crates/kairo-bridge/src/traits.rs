use crate::capability::PlatformCapabilities;
use crate::error::BridgeError;
use kairo_protocol::v1::{
    InstallPackagesResponse, InstalledPackage, ManageServiceResponse, ProcessInfo,
    RemovePackagesResponse, ServiceAction, SystemService,
};

pub trait ServiceOps: Send + Sync {
    fn manager_name(&self) -> &'static str;
    fn is_available(&self) -> bool;
    fn list_services(&self) -> Result<Vec<SystemService>, BridgeError>;
    fn manage_service(
        &self,
        service_name: &str,
        action: ServiceAction,
    ) -> Result<ManageServiceResponse, BridgeError>;
}

pub trait PackageOps: Send + Sync {
    fn manager_name(&self) -> &'static str;
    fn is_available(&self) -> bool;
    fn list_installed(&self, filter: Option<&str>) -> Result<Vec<InstalledPackage>, BridgeError>;
    fn install_packages(
        &self,
        package_names: &[&str],
    ) -> Result<InstallPackagesResponse, BridgeError>;
    fn remove_packages(
        &self,
        package_names: &[&str],
    ) -> Result<RemovePackagesResponse, BridgeError>;
}

pub trait ProcessOps: Send + Sync {
    fn list_processes(&self) -> Result<Vec<ProcessInfo>, BridgeError>;
    fn kill_process(&self, pid: u32, signal: i32) -> Result<(), BridgeError>;
}

pub trait PlatformAdapter: Send + Sync {
    fn name(&self) -> &'static str;
    fn capabilities(&self) -> PlatformCapabilities;
    fn services(&self) -> &dyn ServiceOps;
    fn packages(&self) -> &dyn PackageOps;
    fn processes(&self) -> &dyn ProcessOps;
}
