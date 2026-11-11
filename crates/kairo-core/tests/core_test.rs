#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::sync::Arc;

use kairo_bridge::common::MockCommandRunner;
use kairo_bridge::{PlatformBridge, select_adapter};
use kairo_core::{
    ArtifactKind, AuthContext, CoreConfig, CoreError, ExecutionTarget, KairoCore, OperationLevel,
    PackageManifest,
};
use kairo_protocol::v1::{
    InitSystem, OsFamily, PackageManager, PlatformSupportTier, PrivilegeLevel,
    SystemProfile,
};
use sha2::{Digest, Sha256};
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
fn test_service_api_host_listing_with_mock() {
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

    // 1. Host services come from the systemd adapter via the mock.
    let host_services = core
        .services()
        .list_services(ExecutionTarget::Host)
        .unwrap();
    assert_eq!(host_services.len(), 1);
    assert_eq!(host_services[0].name, "nginx.service");

    // 2. Managed services are supervisor-backed and start empty; they are
    // exercised in runtime_test.rs.
    let managed_services = core
        .services()
        .list_services(ExecutionTarget::Managed)
        .unwrap();
    assert!(managed_services.is_empty());
}

fn manifest_for(name: &str, artifact_path: &std::path::Path, deps: Vec<String>) -> PackageManifest {
    let bytes = std::fs::read(artifact_path).unwrap();
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    PackageManifest {
        name: name.to_string(),
        version: "1.0.0".to_string(),
        description: format!("{name} test package"),
        dependencies: deps,
        source: artifact_path.to_string_lossy().to_string(),
        sha256: format!("{:x}", hasher.finalize()),
        kind: ArtifactKind::SingleFile,
        dest_path: format!("{name}.bin"),
    }
}

#[test]
fn test_package_api_managed_manifest_install_and_audit_logging() {
    let temp = TempDir::new().unwrap();
    let runner = Arc::new(MockCommandRunner::new());
    let profile = make_ubuntu_profile(false, true);
    let core = create_test_core(profile, &temp, runner);
    let auth = AuthContext::new("operator", false, true).with_confirmed(true);

    let artifacts = TempDir::new().unwrap();
    let a_path = artifacts.path().join("a-tool.bin");
    std::fs::write(&a_path, b"tool-a-payload").unwrap();
    let b_path = artifacts.path().join("b-tool.bin");
    std::fs::write(&b_path, b"tool-b-payload").unwrap();

    // b-tool depends on a-tool; the set must install a-tool first.
    let manifests = vec![
        manifest_for("b-tool", &b_path, vec!["a-tool".to_string()]),
        manifest_for("a-tool", &a_path, Vec::new()),
    ];

    let response = core
        .packages()
        .install_manifests(&manifests, ExecutionTarget::Managed, &auth)
        .unwrap();
    assert!(response.success);
    assert_eq!(response.installed_packages.len(), 2);

    let space = core.userspace().unwrap();
    let payload = std::fs::read(
        space
            .packages_dir()
            .join("a-tool")
            .join("1.0.0")
            .join("a-tool.bin"),
    )
    .unwrap();
    assert_eq!(payload, b"tool-a-payload");

    let installed = core
        .packages()
        .list_installed(Some("tool"), ExecutionTarget::Managed)
        .unwrap();
    assert_eq!(installed.len(), 2);

    // The registry persists across a fresh core on the same data dir.
    let core2 = create_test_core(
        make_ubuntu_profile(false, true),
        &temp,
        Arc::new(MockCommandRunner::new()),
    );
    let persisted = core2
        .packages()
        .list_installed(None, ExecutionTarget::Managed)
        .unwrap();
    assert_eq!(persisted.len(), 2);

    // Bare-name managed installs were the old registry-only fake and must be refused.
    assert!(
        core.packages()
            .install(&["x"], ExecutionTarget::Managed, &auth)
            .is_err()
    );

    let recent_events = core.audit().get_recent(10);
    assert!(
        recent_events
            .iter()
            .any(|e| e.action == "package.install" && e.success)
    );

    let remove_res = core
        .packages()
        .remove(&["b-tool"], ExecutionTarget::Managed, &auth)
        .unwrap();
    assert!(remove_res.success);
    assert_eq!(remove_res.removed_packages, vec!["b-tool"]);

    let recent_events = core.audit().get_recent(10);
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

#[test]
fn test_filesystem_rejects_escape_attempts() {
    let temp = TempDir::new().unwrap();
    let runner = Arc::new(MockCommandRunner::new());
    let profile = make_ubuntu_profile(false, false);
    let core = create_test_core(profile, &temp, runner);

    let auth = AuthContext::new("user1", false, false).with_confirmed(true);

    // ParentDir escaping above the managed root is an error, not a silent clamp
    let escape = core.fs().read_file(
        std::path::Path::new("sub/../../escape.txt"),
        ExecutionTarget::Managed,
        &auth,
    );
    assert!(matches!(escape, Err(CoreError::BoundaryViolation { .. })));

    // A bare ParentDir prefix escapes by construction
    let dotdot = core.fs().write_file(
        std::path::Path::new("../outside.txt"),
        b"x",
        ExecutionTarget::Managed,
        &auth,
    );
    assert!(matches!(dotdot, Err(CoreError::BoundaryViolation { .. })));

    // Windows drive-letter paths cannot address the managed root
    #[cfg(windows)]
    assert!(matches!(
        core.fs().read_file(
            std::path::Path::new("C:\\Windows\\system32\\config"),
            ExecutionTarget::Managed,
            &auth,
        ),
        Err(CoreError::BoundaryViolation { .. })
    ));
}

#[cfg(unix)]
#[test]
fn test_filesystem_symlink_containment() {
    use std::os::unix::fs::symlink;

    let temp = TempDir::new().unwrap();
    let runner = Arc::new(MockCommandRunner::new());
    let profile = make_ubuntu_profile(false, false);
    let core = create_test_core(profile, &temp, runner);
    let auth = AuthContext::new("user1", false, false).with_confirmed(true);

    let managed_root = core
        .fs()
        .resolve_path(std::path::Path::new(""), ExecutionTarget::Managed)
        .unwrap();

    let outside_dir = TempDir::new().unwrap();
    let outside_file = outside_dir.path().join("secret.txt");
    std::fs::write(&outside_file, b"outside").unwrap();

    symlink(&outside_file, managed_root.join("leak")).unwrap();
    let leak = core.fs().read_file(
        std::path::Path::new("leak"),
        ExecutionTarget::Managed,
        &auth,
    );
    assert!(matches!(leak, Err(CoreError::BoundaryViolation { .. })));

    // A dangling symlink must not become a creation target either
    symlink(
        outside_dir.path().join("missing.txt"),
        managed_root.join("dangling"),
    )
    .unwrap();
    let via_dangling = core.fs().write_file(
        std::path::Path::new("dangling"),
        b"x",
        ExecutionTarget::Managed,
        &auth,
    );
    assert!(matches!(
        via_dangling,
        Err(CoreError::BoundaryViolation { .. })
    ));

    // Links that stay inside the root keep working
    core.fs()
        .write_file(
            std::path::Path::new("inner.txt"),
            b"inner",
            ExecutionTarget::Managed,
            &auth,
        )
        .unwrap();
    symlink(
        managed_root.join("inner.txt"),
        managed_root.join("alias.txt"),
    )
    .unwrap();
    let alias = core
        .fs()
        .read_file(
            std::path::Path::new("alias.txt"),
            ExecutionTarget::Managed,
            &auth,
        )
        .unwrap();
    assert_eq!(alias, b"inner");
}

#[test]
fn test_filesystem_write_is_atomic_and_leaves_no_temp_files() {
    let temp = TempDir::new().unwrap();
    let runner = Arc::new(MockCommandRunner::new());
    let profile = make_ubuntu_profile(false, false);
    let core = create_test_core(profile, &temp, runner);
    let auth = AuthContext::new("user1", false, false).with_confirmed(true);

    core.fs()
        .write_file(
            std::path::Path::new("nested/dir/file.txt"),
            b"payload",
            ExecutionTarget::Managed,
            &auth,
        )
        .unwrap();

    let managed_root = core
        .fs()
        .resolve_path(std::path::Path::new(""), ExecutionTarget::Managed)
        .unwrap();
    let leftovers: Vec<String> = fs_walk(&managed_root)
        .into_iter()
        .filter(|p| p.contains(".tmp-"))
        .collect();
    assert!(
        leftovers.is_empty(),
        "temp files left behind: {leftovers:?}"
    );

    let content = core
        .fs()
        .read_file(
            std::path::Path::new("nested/dir/file.txt"),
            ExecutionTarget::Managed,
            &auth,
        )
        .unwrap();
    assert_eq!(content, b"payload");
}

fn fs_walk(root: &std::path::Path) -> Vec<String> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(root) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            out.extend(fs_walk(&path));
        } else {
            out.push(path.to_string_lossy().to_string());
        }
    }
    out
}
