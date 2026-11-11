#![allow(clippy::unwrap_used, clippy::expect_used)]

use kairo_bridge::common::MockCommandRunner;
use kairo_bridge::error::BridgeError;
use kairo_bridge::package::validate_package_name;
use kairo_bridge::selector::select_adapter;
use kairo_protocol::v1::{
    InitSystem, PackageManager, PlatformSupportTier, ServiceAction, SystemProfile,
};
use std::sync::Arc;

fn make_test_profile(
    os_id: &str,
    init: InitSystem,
    pkg: &str,
    elevated: bool,
    sudo: bool,
) -> SystemProfile {
    SystemProfile {
        profile_version: 2,
        os_family: 1, // Linux
        os_id: os_id.to_string(),
        os_name: os_id.to_string(),
        init_system: init as i32,
        package_managers: vec![PackageManager {
            name: pkg.to_string(),
            version: "1.0".to_string(),
            is_usable: true,
            path: format!("/usr/bin/{pkg}"),
        }],
        is_elevated: elevated,
        sudo_available: sudo,
        sudo_passwordless: sudo,
        has_sudo: sudo,
        support_tier: PlatformSupportTier::Tier1 as i32,
        ..Default::default()
    }
}

#[test]
fn test_ubuntu_adapter_selection_with_systemd() {
    let profile = make_test_profile("ubuntu", InitSystem::Systemd, "apt", true, true);
    let mock = Arc::new(MockCommandRunner::new());
    mock.set_response("systemctl", "--version", 0, b"systemd 255\n", b"");
    mock.set_response("dpkg-query", "--version", 0, b"Debian dpkg-query\n", b"");

    let adapter = select_adapter(&profile, mock);
    assert_eq!(adapter.name(), "ubuntu");

    let caps = adapter.capabilities();
    assert!(caps.can_manage_services);
    assert_eq!(caps.service_manager_name, "systemd");
    assert!(caps.can_install_packages);
    assert_eq!(caps.package_manager_name, "apt");
}

#[test]
fn test_arch_adapter_selection_with_systemd() {
    let profile = make_test_profile("arch", InitSystem::Systemd, "pacman", true, true);
    let mock = Arc::new(MockCommandRunner::new());
    mock.set_response("systemctl", "--version", 0, b"systemd 255\n", b"");
    mock.set_response("pacman", "--version", 0, b"Pacman v6.1.0\n", b"");

    let adapter = select_adapter(&profile, mock);
    assert_eq!(adapter.name(), "arch");

    let caps = adapter.capabilities();
    assert!(caps.can_manage_services);
    assert_eq!(caps.service_manager_name, "systemd");
    assert!(caps.can_install_packages);
    assert_eq!(caps.package_manager_name, "pacman");
}

#[test]
fn test_debian_adapter_selection_with_openrc() {
    let profile = make_test_profile("debian", InitSystem::Openrc, "apt", false, true);
    let mock = Arc::new(MockCommandRunner::new());
    mock.set_response("rc-status", "--version", 0, b"rc-status 0.54\n", b"");
    mock.set_response("dpkg-query", "--version", 0, b"Debian dpkg-query\n", b"");

    let adapter = select_adapter(&profile, mock);
    assert_eq!(adapter.name(), "debian");

    let caps = adapter.capabilities();
    assert!(caps.can_manage_services);
    assert_eq!(caps.service_manager_name, "openrc");
    assert!(caps.can_install_packages);
    assert_eq!(caps.package_manager_name, "apt");
    assert!(caps.has_passwordless_sudo);
}

#[test]
fn test_missing_init_system_degrades_gracefully() {
    let profile = make_test_profile("ubuntu", InitSystem::Unknown, "apt", true, true);
    let mock = Arc::new(MockCommandRunner::new());
    mock.set_response("dpkg-query", "--version", 0, b"Debian dpkg-query\n", b"");

    let adapter = select_adapter(&profile, mock);
    let caps = adapter.capabilities();
    assert!(!caps.can_manage_services);
    assert_eq!(caps.service_manager_name, "unsupported");

    let err = adapter.services().list_services().unwrap_err();
    assert!(matches!(err, BridgeError::Unsupported(_)));
}

#[test]
fn test_missing_package_manager_degrades_gracefully() {
    let mut profile = make_test_profile("custom-linux", InitSystem::Systemd, "none", true, true);
    profile.package_managers.clear();
    let mock = Arc::new(MockCommandRunner::new());
    mock.set_response("systemctl", "--version", 0, b"systemd 255\n", b"");

    let adapter = select_adapter(&profile, mock);
    let caps = adapter.capabilities();
    assert!(!caps.can_install_packages);
    assert!(!caps.can_query_packages);
    assert_eq!(caps.package_manager_name, "unsupported");

    let err = adapter.packages().install_packages(&["curl"]).unwrap_err();
    assert!(matches!(err, BridgeError::Unsupported(_)));
}

#[test]
fn test_openrc_service_operations() {
    let profile = make_test_profile("alpine", InitSystem::Openrc, "apk", true, false);
    let mock = Arc::new(MockCommandRunner::new());
    mock.set_response("rc-status", "--version", 0, b"rc-status 0.54\n", b"");
    mock.set_response(
        "rc-status",
        "--all",
        0,
        b" sshd              [  started  ]\n cron              [  stopped  ]\n",
        b"",
    );
    mock.set_response(
        "rc-service",
        "sshd",
        0,
        b" * Starting sshd ... [ ok ]\n",
        b"",
    );

    let adapter = select_adapter(&profile, mock);
    let services = adapter.services().list_services().expect("list services");
    assert_eq!(services.len(), 2);
    assert_eq!(services[0].name, "sshd");
    assert_eq!(services[0].active_state, "active");
    assert_eq!(services[1].name, "cron");
    assert_eq!(services[1].active_state, "inactive");

    let resp = adapter
        .services()
        .manage_service("sshd", ServiceAction::Start)
        .expect("manage service");
    assert!(resp.success);
}

#[test]
fn test_package_permission_denied_for_unprivileged_user_without_sudo() {
    let profile = make_test_profile("ubuntu", InitSystem::Systemd, "apt", false, false);
    let mock = Arc::new(MockCommandRunner::new());
    mock.set_response("dpkg-query", "--version", 0, b"Debian dpkg-query\n", b"");

    let adapter = select_adapter(&profile, mock);
    let err = adapter.packages().install_packages(&["nginx"]).unwrap_err();
    assert!(matches!(err, BridgeError::PermissionDenied(_)));
}

#[test]
fn test_package_name_validation_rejects_injection() {
    assert!(validate_package_name("curl; rm -rf /").is_err());
    assert!(validate_package_name("pkg|sh").is_err());
    assert!(validate_package_name("pkg$(whoami)").is_err());
    assert!(validate_package_name("").is_err());
    assert!(validate_package_name("valid-pkg-1.0").is_ok());
    assert!(validate_package_name("libssl3_dev").is_ok());
}

#[test]
fn test_package_manager_timeout() {
    let profile = make_test_profile("ubuntu", InitSystem::Systemd, "apt", true, true);
    let mock = Arc::new(MockCommandRunner::new());
    mock.set_response("dpkg-query", "--version", 0, b"dpkg 1.0\n", b"");
    mock.set_timeout("apt-get", "install");

    let adapter = select_adapter(&profile, mock);
    let err = adapter.packages().install_packages(&["curl"]).unwrap_err();
    assert!(matches!(err, BridgeError::Timeout(_)));
}

#[test]
fn test_package_manager_partial_failure_reporting() {
    let profile = make_test_profile("arch", InitSystem::Systemd, "pacman", true, true);
    let mock = Arc::new(MockCommandRunner::new());
    mock.set_response("pacman", "--version", 0, b"Pacman v6.1.0\n", b"");
    mock.set_response(
        "pacman",
        "-S",
        1,
        b"",
        b"error: target not found: nonexistent-pkg-xyz\n",
    );

    let adapter = select_adapter(&profile, mock);
    let resp = adapter
        .packages()
        .install_packages(&["nonexistent-pkg-xyz"])
        .expect("returns structured failure response");
    assert!(!resp.success);
    assert_eq!(resp.failed_packages, vec!["nonexistent-pkg-xyz"]);
    assert!(resp.message.contains("target not found"));
}

#[test]
fn test_apt_list_installed_with_filter() {
    let profile = make_test_profile("ubuntu", InitSystem::Systemd, "apt", true, true);
    let mock = Arc::new(MockCommandRunner::new());
    mock.set_response("dpkg-query", "--version", 0, b"dpkg 1.0\n", b"");
    mock.set_response(
        "dpkg-query",
        "-W",
        0,
        b"curl\t7.88.1-10\tamd64\tcommand line tool for transferring data with URL syntax\npython3\t3.11.2-1\tamd64\tinteractive high-level object-oriented language\n",
        b"",
    );

    let adapter = select_adapter(&profile, mock);
    let pkgs = adapter
        .packages()
        .list_installed(Some("curl"))
        .expect("list installed");
    assert_eq!(pkgs.len(), 1);
    assert_eq!(pkgs[0].name, "curl");
    assert_eq!(pkgs[0].version, "7.88.1-10");
}
