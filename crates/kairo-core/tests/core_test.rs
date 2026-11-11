#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::sync::Arc;

use kairo_bridge::common::MockCommandRunner;
use kairo_bridge::{PlatformBridge, select_adapter};
use kairo_core::{AuthContext, CoreConfig, ExecutionTarget, KairoCore, OperationLevel};
use kairo_protocol::v1::{
    InitSystem, OsFamily, PackageManager, PlatformSupportTier, PrivilegeLevel, ServiceAction,
    SystemProfile,
};
use tempfile::TempDir;

fn make_ubuntu_profile(elevated: bool, has_sudo: bool) -> SystemProfile {
    SystemProfile {
        profile_version: 2,
        os_family: OsFamily::Linux as i32,
        os_id: "ubuntu".to_string(),
        os_name: "Ubuntu".to_string(),
        os_version: "24.04".to_string(),
        os_version_id: "24.04".to_string(),
        os_pretty_name: "Ubuntu 24.04 LTS".to_string(),
        kernel_version: "6.8.0-generic".to_string(),
        architecture: 2,
        cpu_cores: 8,
        memory_total_bytes: 16 * 1024 * 1024 * 1024,
        disk_total_bytes: 256 * 1024 * 1024 * 1024,
        package_managers: vec![PackageManager {
            name: "apt".to_string(),
            version: "2.7.14".to_string(),
            is_usable: true,
            path: "/usr/bin/apt".to_string(),
        }],
        init_system: InitSystem::Systemd as i32,
        display_server: 1,
        privilege_level: if elevated {
            PrivilegeLevel::Root as i32
        } else if has_sudo {
            PrivilegeLevel::Sudo as i32
        } else {
            PrivilegeLevel::User as i32
        },
        gpu: None,
        has_sudo,
        username: "testuser".to_string(),
        hostname: "ubuntu-test".to_string(),
        is_elevated: elevated,
        sudo_available: has_sudo,
        sudo_passwordless: has_sudo,
        isolation: None,
        support_tier: PlatformSupportTier::Tier1 as i32,
        native_adapter_available: true,
    }
}

fn create_test_core(
    profile: SystemProfile,
    temp_dir: &TempDir,
    mock_runner: Arc<MockCommandRunner>,
) -> KairoCore {
    let adapter = select_adapter(&profile, mock_runner);
    let bridge = Arc::new(PlatformBridge::new(adapter));
    let config = CoreConfig {
        data_dir: temp_dir.path().to_string_lossy().to_string(),
        audit_capacity: 100,
    };
    KairoCore::new(bridge, profile, config)
}

fn mock_systemd_available(runner: &MockCommandRunner) {
    runner.set_response(
        "systemctl",
        "--version",
        0,
        b"systemd 255 (255.4-1ubuntu8.4)\n",
        b"",
    );
}

#[test]
fn test_system_api_boundaries_and_resources() {
    let temp = TempDir::new().unwrap();
    let runner = Arc::new(MockCommandRunner::new());
    mock_systemd_available(&runner);
    let profile = make_ubuntu_profile(false, true);
    let core = create_test_core(profile, &temp, runner);

    let res = core.system().resources();
    assert_eq!(res.cpu_cores, 8);
    assert_eq!(res.architecture, 2);
    assert_eq!(res.kernel_version, "6.8.0-generic");

    let boundaries = core.system().boundaries();
    assert!(boundaries.managed_root.starts_with(temp.path()));
    assert_eq!(core.system().profile().os_id, "ubuntu");

    let caps = core.system().capabilities();
    assert!(caps.can_manage_services);
    assert_eq!(caps.service_manager_name, "systemd");
    assert_eq!(caps.package_manager_name, "apt");
}

#[test]
fn test_permission_manager_levels() {
    let temp = TempDir::new().unwrap();
    let runner = Arc::new(MockCommandRunner::new());
    let profile = make_ubuntu_profile(false, false);
    let core = create_test_core(profile, &temp, runner);

    let user_auth = AuthContext::new("user1", false, false);
    let sudo_unconfirmed = AuthContext::new("sudoer", false, true);
    let sudo_confirmed = AuthContext::new("sudoer", false, true).with_confirmed(true);
    let root_auth = AuthContext::new("root", true, true);

    // Read allowed for all
    assert!(
        core.permissions()
            .require_level(&user_auth, OperationLevel::Read)
            .is_ok()
    );

    // Modify rejected for plain unprivileged user
    assert!(
        core.permissions()
            .require_level(&user_auth, OperationLevel::Modify)
            .is_err()
    );
    assert!(
        core.permissions()
            .require_level(&sudo_unconfirmed, OperationLevel::Modify)
            .is_ok()
    );

    // Privileged requires elevated or confirmed sudo
    assert!(
        core.permissions()
            .require_level(&user_auth, OperationLevel::Privileged)
            .is_err()
    );
    assert!(
        core.permissions()
            .require_level(&sudo_unconfirmed, OperationLevel::Privileged)
            .is_err()
    );
    assert!(
        core.permissions()
            .require_level(&sudo_confirmed, OperationLevel::Privileged)
            .is_ok()
    );
    assert!(
        core.permissions()
            .require_level(&root_auth, OperationLevel::Privileged)
            .is_ok()
    );
}

#[test]
fn test_filesystem_api_managed_boundary_enforcement() {
    let temp = TempDir::new().unwrap();
    let runner = Arc::new(MockCommandRunner::new());
    let profile = make_ubuntu_profile(false, false);
    let core = create_test_core(profile, &temp, runner);

    let auth = AuthContext::new("user1", false, false).with_confirmed(true);

    // Valid write inside managed environment
    let file_path = std::path::Path::new("test/nested/file.txt");
    let content = b"hello kairo managed environment";
    let write_res = core
        .fs()
        .write_file(file_path, content, ExecutionTarget::Managed, &auth);
    assert!(write_res.is_ok());

    // Read back
    let read_res = core
        .fs()
        .read_file(file_path, ExecutionTarget::Managed, &auth);
    assert!(read_res.is_ok());
    assert_eq!(read_res.unwrap(), content);

    // Path traversal attempt out of managed root must be rejected
    let escape_path = std::path::Path::new("../../../../../etc/shadow");
    let escape_res = core
        .fs()
        .read_file(escape_path, ExecutionTarget::Managed, &auth);
    assert!(escape_res.is_err());
}

#[test]
fn test_service_api_host_vs_managed() {
    let temp = TempDir::new().unwrap();
    let runner = Arc::new(MockCommandRunner::new());

    // Mock systemd availability probe and list-units
    mock_systemd_available(&runner);
    runner.set_response(
        "systemctl",
        "list-units",
        0,
        b"nginx.service loaded active running A high performance web server\n",
        b"",
    );

    let profile = make_ubuntu_profile(false, true);
    let core = create_test_core(profile, &temp, runner);

    let auth = AuthContext::new("admin", false, true).with_confirmed(true);

    // 1. Host services
    let host_services = core
        .services()
        .list_services(ExecutionTarget::Host)
        .unwrap();
    assert_eq!(host_services.len(), 1);
    assert_eq!(host_services[0].name, "nginx.service");

    // 2. Managed services
    let managed_services = core
        .services()
        .list_services(ExecutionTarget::Managed)
        .unwrap();
    assert!(managed_services.iter().any(|s| s.name == "kairo-agent"));

    // 3. Manage managed service state
    let manage_res = core
        .services()
        .manage_service(
            "kairo-agent",
            ServiceAction::Stop,
            ExecutionTarget::Managed,
            &auth,
        )
        .unwrap();
    assert!(manage_res.success);

    let updated_managed = core
        .services()
        .list_services(ExecutionTarget::Managed)
        .unwrap();
    let agent_srv = updated_managed
        .iter()
        .find(|s| s.name == "kairo-agent")
        .unwrap();
    assert_eq!(agent_srv.active_state, "inactive");
}

#[test]
fn test_package_api_host_vs_managed_and_audit_logging() {
    let temp = TempDir::new().unwrap();
    let runner = Arc::new(MockCommandRunner::new());

    let profile = make_ubuntu_profile(false, true);
    let core = create_test_core(profile, &temp, runner);

    let auth = AuthContext::new("operator", false, true).with_confirmed(true);

    // List initial managed packages
    let pkgs = core
        .packages()
        .list_installed(None, ExecutionTarget::Managed)
        .unwrap();
    assert_eq!(pkgs.len(), 1);
    assert_eq!(pkgs[0].name, "kairo-base");

    // Install managed package
    let install_res = core
        .packages()
        .install(&["curl", "htop"], ExecutionTarget::Managed, &auth)
        .unwrap();
    assert!(install_res.success);
    assert_eq!(install_res.installed_packages, vec!["curl", "htop"]);

    let updated_pkgs = core
        .packages()
        .list_installed(None, ExecutionTarget::Managed)
        .unwrap();
    assert_eq!(updated_pkgs.len(), 3);

    // Remove managed package
    let remove_res = core
        .packages()
        .remove(&["curl"], ExecutionTarget::Managed, &auth)
        .unwrap();
    assert!(remove_res.success);
    assert_eq!(remove_res.removed_packages, vec!["curl"]);

    // Verify audit log has recorded all events
    let recent_events = core.audit().get_recent(10);
    assert!(
        recent_events
            .iter()
            .any(|e| e.action == "package.install" && e.success)
    );
    assert!(
        recent_events
            .iter()
            .any(|e| e.action == "package.remove" && e.success)
    );
}

#[test]
fn test_environment_api_and_reserved_key_protection() {
    let temp = TempDir::new().unwrap();
    let runner = Arc::new(MockCommandRunner::new());
    let profile = make_ubuntu_profile(false, false);
    let core = create_test_core(profile, &temp, runner);

    let user_auth = AuthContext::new("user1", false, false).with_confirmed(true);
    let root_auth = AuthContext::new("root", true, true);

    // Regular variable set & get
    assert!(core.env().set("CUSTOM_SETTING", "42", &user_auth).is_ok());
    assert_eq!(core.env().get("CUSTOM_SETTING").as_deref(), Some("42"));

    // Reserved variable protection: unprivileged cannot override PATH or KAIRO_ROOT
    assert!(core.env().set("PATH", "/custom/bin", &user_auth).is_err());

    // Privileged user can override reserved variable
    assert!(core.env().set("PATH", "/custom/bin", &root_auth).is_ok());
    assert_eq!(core.env().get("PATH").as_deref(), Some("/custom/bin"));
}
