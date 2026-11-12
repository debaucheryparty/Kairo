#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::path::Path;
use std::sync::Arc;

use kairo_bridge::common::MockCommandRunner;
use kairo_bridge::{PlatformBridge, select_adapter};
use kairo_core::{
    ArtifactKind, AuthContext, ConfigDocument, CoreConfig, DriftItem, ExecutionTarget, KairoCore,
    ManagedFileSpec, ManagedServiceSpec, PackageManifest, RestartPolicy,
};
use kairo_protocol::v1::{
    InitSystem, OsFamily, PackageManager, PlatformSupportTier, PrivilegeLevel, SystemProfile,
};
use sha2::{Digest, Sha256};
use tempfile::TempDir;

fn make_core(data_dir: &Path) -> KairoCore {
    let runner = Arc::new(MockCommandRunner::new());
    runner.set_response("systemctl", "--version", 0, b"systemd 255\n", b"");
    let profile = SystemProfile {
        profile_version: 2,
        os_family: OsFamily::Linux as i32,
        os_id: "ubuntu".to_string(),
        os_name: "Ubuntu".to_string(),
        os_version: "24.04".to_string(),
        os_version_id: "24.04".to_string(),
        os_pretty_name: "Ubuntu 24.04 LTS".to_string(),
        kernel_version: "6.8.0-generic".to_string(),
        architecture: 2,
        cpu_cores: 4,
        memory_total_bytes: 8 * 1024 * 1024 * 1024,
        disk_total_bytes: 64 * 1024 * 1024 * 1024,
        package_managers: vec![PackageManager {
            name: "apt".to_string(),
            version: "2.7".to_string(),
            is_usable: true,
            path: "/usr/bin/apt".to_string(),
        }],
        init_system: InitSystem::Systemd as i32,
        display_server: 1,
        privilege_level: PrivilegeLevel::Sudo as i32,
        gpu: None,
        has_sudo: true,
        username: "testuser".to_string(),
        hostname: "ubuntu-test".to_string(),
        is_elevated: false,
        sudo_available: true,
        sudo_passwordless: true,
        isolation: None,
        support_tier: PlatformSupportTier::Tier1 as i32,
        native_adapter_available: true,
    };
    let adapter = select_adapter(&profile, runner);
    let bridge = Arc::new(PlatformBridge::new(adapter));
    KairoCore::new(
        bridge,
        profile,
        CoreConfig {
            data_dir: data_dir.to_string_lossy().to_string(),
            audit_capacity: 100,
        },
    )
}

fn auth() -> AuthContext {
    AuthContext::new("operator", false, true).with_confirmed(true)
}

fn file_spec(path: &str, content: &str) -> ManagedFileSpec {
    ManagedFileSpec {
        path: path.to_string(),
        content: content.to_string(),
        mode: None,
    }
}

fn file_package(name: &str, artifact: &Path, payload: &[u8]) -> PackageManifest {
    let mut hasher = Sha256::new();
    hasher.update(payload);
    PackageManifest {
        name: name.to_string(),
        version: "1.0.0".to_string(),
        description: format!("{name} config test package"),
        dependencies: Vec::new(),
        source: artifact.to_string_lossy().to_string(),
        sha256: format!("{:x}", hasher.finalize()),
        kind: ArtifactKind::SingleFile,
        dest_path: format!("{name}.bin"),
    }
}

fn empty_doc() -> ConfigDocument {
    ConfigDocument {
        version: 1,
        packages: Vec::new(),
        services: Vec::new(),
        files: Vec::new(),
    }
}

#[tokio::test]
async fn test_apply_empty_document_is_a_no_op() {
    let temp = TempDir::new().unwrap();
    let core = make_core(temp.path());

    let report = kairo_core::config::apply(&core, &empty_doc(), &auth())
        .await
        .unwrap();
    assert!(report.success);
    assert!(report.steps.is_empty());
}

#[tokio::test]
async fn test_file_apply_is_idempotent_with_backups_on_change() {
    let temp = TempDir::new().unwrap();
    let core = make_core(temp.path());

    let doc = ConfigDocument {
        files: vec![file_spec("etc/motd", "hello")],
        ..empty_doc()
    };

    let first = kairo_core::config::apply(&core, &doc, &auth())
        .await
        .unwrap();
    assert!(first.success);
    assert_eq!(
        first.steps[0].action,
        kairo_core::config::StepAction::Applied
    );

    let second = kairo_core::config::apply(&core, &doc, &auth())
        .await
        .unwrap();
    assert_eq!(
        second.steps[0].action,
        kairo_core::config::StepAction::Skipped
    );

    let changed = ConfigDocument {
        files: vec![file_spec("etc/motd", "hello v2")],
        ..empty_doc()
    };
    let third = kairo_core::config::apply(&core, &changed, &auth())
        .await
        .unwrap();
    assert_eq!(
        third.steps[0].action,
        kairo_core::config::StepAction::Applied
    );

    let content =
        std::fs::read_to_string(core.userspace().unwrap().root().join("etc/motd")).unwrap();
    assert_eq!(content, "hello v2");
}

#[tokio::test]
async fn test_drift_reports_file_state() {
    let temp = TempDir::new().unwrap();
    let core = make_core(temp.path());

    let doc = ConfigDocument {
        files: vec![file_spec("etc/present", "v1"), file_spec("etc/gone", "x")],
        ..empty_doc()
    };
    let report = kairo_core::config::apply(&core, &doc, &auth())
        .await
        .unwrap();
    assert!(report.success);

    // In sync: no drift for applied files.
    assert!(kairo_core::config::drift(&core, &doc).unwrap().is_empty());

    // Out-of-band modification is drift.
    let root = core.userspace().unwrap().root().to_path_buf();
    std::fs::write(root.join("etc/present"), "tampered").unwrap();
    let items = kairo_core::config::drift(&core, &doc).unwrap();
    assert!(items.contains(&DriftItem::FileMismatch {
        path: "etc/present".to_string()
    }));

    // A document declaring an unapplied file reports it missing.
    let fresh = ConfigDocument {
        files: vec![file_spec("etc/never-applied", "x")],
        ..empty_doc()
    };
    let items = kairo_core::config::drift(&core, &fresh).unwrap();
    assert!(items.contains(&DriftItem::FileMissing {
        path: "etc/never-applied".to_string()
    }));
}

#[tokio::test]
async fn test_apply_creates_packages_and_services() {
    let temp = TempDir::new().unwrap();
    let core = make_core(temp.path());

    let artifact_dir = TempDir::new().unwrap();
    let artifact = artifact_dir.path().join("cfgtool.bin");
    std::fs::write(&artifact, b"cfgtool payload").unwrap();

    let doc = ConfigDocument {
        version: 1,
        packages: vec![file_package("cfgtool", &artifact, b"cfgtool payload")],
        services: vec![ManagedServiceSpec {
            name: "cfgtool-sync".to_string(),
            description: "config-defined service".to_string(),
            command: "sleep".to_string(),
            args: vec!["30".to_string()],
            working_dir: None,
            env: Vec::new(),
            restart_policy: RestartPolicy::Never,
            autostart: false,
        }],
        files: vec![file_spec("etc/tool.conf", "mode=fast")],
    };

    let report = kairo_core::config::apply(&core, &doc, &auth())
        .await
        .unwrap();
    assert!(report.success, "steps: {:?}", report.steps);

    assert!(kairo_core::config::drift(&core, &doc).unwrap().is_empty());

    let installed = core
        .packages()
        .list_installed(Some("cfgtool"), ExecutionTarget::Managed)
        .unwrap();
    assert_eq!(installed.len(), 1);

    let definition = core
        .services()
        .managed_definition("cfgtool-sync")
        .unwrap()
        .expect("service defined by config");
    assert_eq!(definition.description, "config-defined service");

    // Re-applying the same document changes nothing.
    let again = kairo_core::config::apply(&core, &doc, &auth())
        .await
        .unwrap();
    assert!(again.success);
    assert!(
        again
            .steps
            .iter()
            .all(|s| s.action == kairo_core::config::StepAction::Skipped)
    );
}

#[cfg(unix)]
#[cfg(unix)]
#[tokio::test]
async fn test_failed_apply_rolls_back_file_changes() {
    let temp = TempDir::new().unwrap();
    let core = make_core(temp.path());

    let artifact_dir = TempDir::new().unwrap();
    let artifact = artifact_dir.path().join("broken.bin");
    std::fs::write(&artifact, b"payload").unwrap();

    let doc = ConfigDocument {
        version: 1,
        files: vec![file_spec("etc/before-failure", "written")],
        packages: vec![file_package("broken", &artifact, b"payload")].apply_bad_checksum(),
        services: Vec::new(),
    };

    let report = kairo_core::config::apply(&core, &doc, &auth())
        .await
        .unwrap();
    assert!(!report.success);

    // The file written before the package failure is rolled back.
    assert_eq!(report.rolled_back_files, vec!["etc/before-failure"]);
    let full = core.userspace().unwrap().root().join("etc/before-failure");
    assert!(!full.exists(), "rolled-back file must not remain");
}

#[cfg(unix)]
trait BadChecksum {
    fn apply_bad_checksum(self) -> Vec<PackageManifest>;
}

#[cfg(unix)]
impl BadChecksum for Vec<PackageManifest> {
    fn apply_bad_checksum(mut self) -> Vec<PackageManifest> {
        self[0].sha256 = "0".repeat(64);
        self
    }
}

#[tokio::test]
async fn test_invalid_documents_are_rejected_before_changes() {
    let temp = TempDir::new().unwrap();
    let core = make_core(temp.path());

    let wrong_version = ConfigDocument {
        version: 99,
        ..empty_doc()
    };
    assert!(
        kairo_core::config::apply(&core, &wrong_version, &auth())
            .await
            .is_err()
    );

    let duplicate_files = ConfigDocument {
        files: vec![file_spec("a.txt", "1"), file_spec("a.txt", "2")],
        ..empty_doc()
    };
    assert!(
        kairo_core::config::apply(&core, &duplicate_files, &auth())
            .await
            .is_err()
    );

    let escape = ConfigDocument {
        files: vec![file_spec("../escape.txt", "x")],
        ..empty_doc()
    };
    assert!(
        kairo_core::config::apply(&core, &escape, &auth())
            .await
            .is_err()
    );

    // Nothing was written.
    let root = core.userspace().unwrap().root().to_path_buf();
    assert!(!root.join("a.txt").exists());
    assert!(!root.join("escape.txt").exists());
}
