use crate::error::BridgeError;
use crate::traits::PackageOps;
use kairo_protocol::v1::{InstallPackagesResponse, InstalledPackage, RemovePackagesResponse};

#[derive(Default, Clone)]
pub struct UnsupportedPackageManager {
    reason: String,
}

impl UnsupportedPackageManager {
    #[must_use]
    pub fn new(reason: impl Into<String>) -> Self {
        Self {
            reason: reason.into(),
        }
    }
}

impl PackageOps for UnsupportedPackageManager {
    fn manager_name(&self) -> &'static str {
        "unsupported"
    }

    fn is_available(&self) -> bool {
        false
    }

    fn list_installed(&self, _filter: Option<&str>) -> Result<Vec<InstalledPackage>, BridgeError> {
        Err(BridgeError::Unsupported(self.reason.clone()))
    }

    fn install_packages(
        &self,
        _package_names: &[&str],
    ) -> Result<InstallPackagesResponse, BridgeError> {
        Err(BridgeError::Unsupported(self.reason.clone()))
    }

    fn remove_packages(
        &self,
        _package_names: &[&str],
    ) -> Result<RemovePackagesResponse, BridgeError> {
        Err(BridgeError::Unsupported(self.reason.clone()))
    }
}
