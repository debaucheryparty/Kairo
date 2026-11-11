mod display;
mod hardware;
mod init;
mod isolation;
mod os_info;
mod packages;
mod privileges;
mod process_util;

use kairo_protocol::v1::{GpuInfo, IsolationCapabilities, PackageManager, SystemProfile};
use tracing::debug;

pub use isolation::IsolationReport;
pub use os_info::{OsRelease, classify_tier};
pub use privileges::PrivilegeReport;

/// Runs all discovery probes and returns a [`SystemProfile`] describing
/// the current host environment.
///
/// Discovery is entirely read-only, bounds all subcommands with timeouts,
/// and never modifies any system state. Every probe degrades gracefully —
/// missing files, restricted permissions, or unavailable commands yield
/// safe defaults rather than errors.
pub fn discover() -> SystemProfile {
    let os = os_info::detect();
    let arch = hardware::detect_architecture();
    let (cpu_cores, memory_total_bytes, disk_total_bytes) = hardware::detect_resources();
    let package_managers = packages::detect();
    let init_system = init::detect();
    let display_server = display::detect();
    let privs = privileges::detect();
    let gpu = hardware::detect_gpu();
    let username = privileges::current_username();
    let hostname = os_info::hostname();
    let iso = isolation::detect();

    debug!(
        os_id = %os.id,
        os_version = %os.version_id,
        arch = ?arch,
        init = ?init_system,
        display = ?display_server,
        support_tier = ?os.support_tier,
        "discovery complete"
    );

    let pkg_msgs: Vec<PackageManager> = package_managers
        .into_iter()
        .map(|p| PackageManager {
            name: p.name,
            version: p.version,
            is_usable: p.is_usable,
            path: p.path,
        })
        .collect();

    SystemProfile {
        profile_version: 2,
        os_family: os.family as i32,
        os_id: os.id,
        os_name: os.name,
        os_version: os.version,
        os_version_id: os.version_id,
        os_pretty_name: os.pretty_name,
        kernel_version: hardware::kernel_version(),
        architecture: arch as i32,
        cpu_cores,
        memory_total_bytes,
        disk_total_bytes,
        package_managers: pkg_msgs,
        init_system: init_system as i32,
        display_server: display_server as i32,
        privilege_level: privs.level as i32,
        gpu: Some(GpuInfo {
            available: gpu.available,
            devices: gpu.devices,
            has_hardware_encoder: gpu.has_hardware_encoder,
            encoder_type: gpu.encoder_type,
        }),
        has_sudo: privs.sudo_passwordless,
        username,
        hostname,
        is_elevated: privs.is_elevated,
        sudo_available: privs.sudo_available,
        sudo_passwordless: privs.sudo_passwordless,
        isolation: Some(IsolationCapabilities {
            cgroup_v2: iso.cgroup_v2,
            cgroup_v1: iso.cgroup_v1,
            cgroup_controllers: iso.cgroup_controllers,
            user_namespaces: iso.user_namespaces,
            pid_namespaces: iso.pid_namespaces,
            mount_namespaces: iso.mount_namespaces,
            network_namespaces: iso.network_namespaces,
            unprivileged_user_namespaces_allowed: iso.unprivileged_user_namespaces_allowed,
            restriction_reason: iso.restriction_reason,
        }),
        support_tier: os.support_tier as i32,
        native_adapter_available: os.native_adapter_available,
    }
}
