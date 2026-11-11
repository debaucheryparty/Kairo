use crate::capability::PlatformCapabilities;
use crate::common::{CommandRunner, CommonProcessManager};
use crate::linux::GenericLinuxAdapter;
use crate::package::{AptPackageManager, PacmanPackageManager, UnsupportedPackageManager};
use crate::service::{OpenRcServiceManager, SystemdServiceManager, UnsupportedServiceManager};
use crate::traits::{PackageOps, PlatformAdapter, ServiceOps};
use kairo_protocol::v1::{InitSystem, OsFamily, SystemProfile};
use std::sync::Arc;

pub fn select_adapter(
    profile: &SystemProfile,
    runner: Arc<dyn CommandRunner>,
) -> Box<dyn PlatformAdapter> {
    let is_elevated = profile.is_elevated;
    let has_sudo = profile.sudo_passwordless || profile.has_sudo;
    let can_modify = is_elevated || has_sudo;
    let sudo_prefix = !is_elevated && has_sudo;

    // 1. Service Manager Selection (independent of distribution name!)
    let service_mgr: Box<dyn ServiceOps> = match InitSystem::try_from(profile.init_system) {
        Ok(InitSystem::Systemd) => {
            Box::new(SystemdServiceManager::new(runner.clone(), sudo_prefix))
        }
        Ok(InitSystem::Openrc) => Box::new(OpenRcServiceManager::new(runner.clone(), sudo_prefix)),
        _ => Box::new(UnsupportedServiceManager::new(
            "no supported init system (neither systemd nor openrc detected)",
        )),
    };

    // 2. Package Manager Selection based on actual detected tools & distribution
    let has_pkg = |name: &str| {
        profile
            .package_managers
            .iter()
            .any(|p| p.name.eq_ignore_ascii_case(name))
    };

    let os_id = profile.os_id.to_lowercase();

    let package_mgr: Box<dyn PackageOps> =
        if has_pkg("pacman") || os_id == "arch" || os_id == "archarm" {
            Box::new(PacmanPackageManager::new(
                runner.clone(),
                sudo_prefix,
                can_modify,
            ))
        } else if has_pkg("apt")
            || has_pkg("apt-get")
            || matches!(os_id.as_str(), "ubuntu" | "debian" | "parrot")
        {
            Box::new(AptPackageManager::new(
                runner.clone(),
                sudo_prefix,
                can_modify,
            ))
        } else {
            Box::new(UnsupportedPackageManager::new(format!(
                "no supported native package manager for distribution '{os_id}'"
            )))
        };

    let can_manage_services = service_mgr.is_available();
    let service_manager_name = service_mgr.manager_name().to_string();
    let can_query_packages = package_mgr.is_available();
    let can_install_packages = can_query_packages && can_modify;
    let package_manager_name = package_mgr.manager_name().to_string();

    let capabilities = PlatformCapabilities {
        can_manage_services,
        service_manager_name,
        can_install_packages,
        can_query_packages,
        package_manager_name,
        can_manage_processes: true,
        is_elevated,
        has_passwordless_sudo: has_sudo,
    };

    let adapter_name: &'static str = match os_id.as_str() {
        "ubuntu" => "ubuntu",
        "debian" => "debian",
        "arch" | "archarm" => "arch",
        _ => {
            if profile.os_family == OsFamily::Linux as i32 {
                "generic-linux"
            } else {
                "unsupported-platform"
            }
        }
    };

    Box::new(GenericLinuxAdapter::new(
        adapter_name,
        service_mgr,
        package_mgr,
        Box::new(CommonProcessManager::new()),
        capabilities,
    ))
}
