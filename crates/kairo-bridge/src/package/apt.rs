use crate::common::{CommandRunner, check_apt_locks};
use crate::error::BridgeError;
use crate::package::validation::validate_package_names;
use crate::traits::PackageOps;
use kairo_protocol::v1::{InstallPackagesResponse, InstalledPackage, RemovePackagesResponse};
use std::sync::Arc;
use std::time::Duration;
use tracing::debug;

pub struct AptPackageManager {
    runner: Arc<dyn CommandRunner>,
    sudo_prefix: bool,
    can_modify: bool,
}

impl AptPackageManager {
    #[must_use]
    pub fn new(runner: Arc<dyn CommandRunner>, sudo_prefix: bool, can_modify: bool) -> Self {
        Self {
            runner,
            sudo_prefix,
            can_modify,
        }
    }
}

impl PackageOps for AptPackageManager {
    fn manager_name(&self) -> &'static str {
        "apt"
    }

    fn is_available(&self) -> bool {
        let res = self.runner.run(
            "dpkg-query",
            &["--version"],
            Duration::from_millis(1500),
            &[],
        );
        res.is_ok_and(|out| out.status.success())
    }

    fn list_installed(&self, filter: Option<&str>) -> Result<Vec<InstalledPackage>, BridgeError> {
        let output = self.runner.run(
            "dpkg-query",
            &[
                "-W",
                "-f=${Package}\t${Version}\t${Architecture}\t${binary:Summary}\n",
            ],
            Duration::from_secs(10),
            &[],
        )?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(BridgeError::ExecutionFailed(format!(
                "dpkg-query failed: {stderr}"
            )));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut packages = Vec::new();
        let filter_lower = filter.map(|f| f.to_lowercase());

        for line in stdout.lines() {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 3 {
                let name = parts[0].trim().to_string();
                let version = parts[1].trim().to_string();
                let architecture = parts[2].trim().to_string();
                let description = if parts.len() > 3 {
                    parts[3].trim().to_string()
                } else {
                    String::new()
                };

                if let Some(ref query) = filter_lower
                    && !name.to_lowercase().contains(query)
                    && !description.to_lowercase().contains(query)
                {
                    continue;
                }

                packages.push(InstalledPackage {
                    name,
                    version,
                    architecture,
                    description,
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

        check_apt_locks()?;

        debug!(packages = ?package_names, "executing apt-get install");

        let mut base_args = vec!["install", "-y", "--no-install-recommends"];
        base_args.extend_from_slice(package_names);

        let env = [("DEBIAN_FRONTEND", "noninteractive")];
        let timeout = Duration::from_secs(180);

        let output = if self.sudo_prefix {
            let mut sudo_args = vec!["-n", "apt-get"];
            sudo_args.extend_from_slice(&base_args);
            self.runner.run("sudo", &sudo_args, timeout, &env)?
        } else {
            self.runner.run("apt-get", &base_args, timeout, &env)?
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

        check_apt_locks()?;

        debug!(packages = ?package_names, "executing apt-get remove");

        let mut base_args = vec!["remove", "-y"];
        base_args.extend_from_slice(package_names);

        let env = [("DEBIAN_FRONTEND", "noninteractive")];
        let timeout = Duration::from_secs(180);

        let output = if self.sudo_prefix {
            let mut sudo_args = vec!["-n", "apt-get"];
            sudo_args.extend_from_slice(&base_args);
            self.runner.run("sudo", &sudo_args, timeout, &env)?
        } else {
            self.runner.run("apt-get", &base_args, timeout, &env)?
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
