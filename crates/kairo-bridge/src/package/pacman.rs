use crate::common::{CommandRunner, check_pacman_lock};
use crate::error::BridgeError;
use crate::package::validation::validate_package_names;
use crate::traits::PackageOps;
use kairo_protocol::v1::{InstallPackagesResponse, InstalledPackage, RemovePackagesResponse};
use std::sync::Arc;
use std::time::Duration;
use tracing::debug;

pub struct PacmanPackageManager {
    runner: Arc<dyn CommandRunner>,
    sudo_prefix: bool,
    can_modify: bool,
}

impl PacmanPackageManager {
    #[must_use]
    pub fn new(runner: Arc<dyn CommandRunner>, sudo_prefix: bool, can_modify: bool) -> Self {
        Self {
            runner,
            sudo_prefix,
            can_modify,
        }
    }
}

impl PackageOps for PacmanPackageManager {
    fn manager_name(&self) -> &'static str {
        "pacman"
    }

    fn is_available(&self) -> bool {
        let res = self
            .runner
            .run("pacman", &["--version"], Duration::from_millis(1500), &[]);
        res.is_ok_and(|out| out.status.success())
    }

    fn list_installed(&self, filter: Option<&str>) -> Result<Vec<InstalledPackage>, BridgeError> {
        let output = self
            .runner
            .run("pacman", &["-Q"], Duration::from_secs(10), &[])?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(BridgeError::ExecutionFailed(format!(
                "pacman -Q failed: {stderr}"
            )));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut packages = Vec::new();
        let filter_lower = filter.map(|f| f.to_lowercase());

        for line in stdout.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                let name = parts[0].trim().to_string();
                let version = parts[1].trim().to_string();

                if let Some(ref query) = filter_lower
                    && !name.to_lowercase().contains(query)
                {
                    continue;
                }

                packages.push(InstalledPackage {
                    name,
                    version,
                    architecture: "any".to_string(),
                    description: String::new(),
                });
            }
        }

        Ok(packages)
    }

    fn install_packages(
        &self,
        package_names: &[&str],
    ) -> Result<InstallPackagesResponse, BridgeError> {
        validate_package_names(package_names)?;

        if !self.can_modify {
            return Err(BridgeError::PermissionDenied(
                "installing packages requires root or passwordless sudo".into(),
            ));
        }

        check_pacman_lock()?;

        debug!(packages = ?package_names, "executing pacman -S");

        let mut base_args = vec!["-S", "--noconfirm", "--needed"];
        base_args.extend_from_slice(package_names);

        let timeout = Duration::from_secs(180);

        let output = if self.sudo_prefix {
            let mut sudo_args = vec!["-n", "pacman"];
            sudo_args.extend_from_slice(&base_args);
            self.runner.run("sudo", &sudo_args, timeout, &[])?
        } else {
            self.runner.run("pacman", &base_args, timeout, &[])?
        };

        if output.status.success() {
            Ok(InstallPackagesResponse {
                success: true,
                message: format!("successfully installed: {}", package_names.join(", ")),
                installed_packages: package_names.iter().map(|s| s.to_string()).collect(),
                failed_packages: Vec::new(),
            })
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            Ok(InstallPackagesResponse {
                success: false,
                message: stderr,
                installed_packages: Vec::new(),
                failed_packages: package_names.iter().map(|s| s.to_string()).collect(),
            })
        }
    }

    fn remove_packages(
        &self,
        package_names: &[&str],
    ) -> Result<RemovePackagesResponse, BridgeError> {
        validate_package_names(package_names)?;

        if !self.can_modify {
            return Err(BridgeError::PermissionDenied(
                "removing packages requires root or passwordless sudo".into(),
            ));
        }

        check_pacman_lock()?;

        debug!(packages = ?package_names, "executing pacman -R");

        let mut base_args = vec!["-R", "--noconfirm"];
        base_args.extend_from_slice(package_names);

        let timeout = Duration::from_secs(180);

        let output = if self.sudo_prefix {
            let mut sudo_args = vec!["-n", "pacman"];
            sudo_args.extend_from_slice(&base_args);
            self.runner.run("sudo", &sudo_args, timeout, &[])?
        } else {
            self.runner.run("pacman", &base_args, timeout, &[])?
        };

        if output.status.success() {
            Ok(RemovePackagesResponse {
                success: true,
                message: format!("successfully removed: {}", package_names.join(", ")),
                removed_packages: package_names.iter().map(|s| s.to_string()).collect(),
                failed_packages: Vec::new(),
            })
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            Ok(RemovePackagesResponse {
                success: false,
                message: stderr,
                removed_packages: Vec::new(),
                failed_packages: package_names.iter().map(|s| s.to_string()).collect(),
            })
        }
    }
}
