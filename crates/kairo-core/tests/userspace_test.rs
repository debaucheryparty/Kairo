#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::path::Path;
use std::sync::Arc;

use kairo_bridge::common::MockCommandRunner;
use kairo_bridge::{PlatformBridge, select_adapter};
use kairo_core::{CoreConfig, KairoCore, ManagedUserspace, load_state, store_state};
use kairo_protocol::v1::{
    InitSystem, OsFamily, PackageManager, PlatformSupportTier, PrivilegeLevel, SystemProfile,
};
use serde::{Deserialize, Serialize};
use tempfile::TempDir;

fn make_profile() -> SystemProfile {
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
    }
}

fn make_core(data_dir: &Path) -> KairoCore {
    let runner = Arc::new(MockCommandRunner::new());
    runner.set_response("systemctl", "--version", 0, b"systemd 255\n", b"");
    let profile = make_profile();
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
struct DemoState {
    value: String,
}

const LAYOUT_DIRS: [&str; 7] = [
    "config", "packages", "services", "state", "logs", "cache", "tmp",
];

#[test]
fn test_userspace_init_creates_layout_and_manifest() {
    let temp = TempDir::new().unwrap();
    let space = ManagedUserspace::init(temp.path()).unwrap();

    for dir in LAYOUT_DIRS {
        assert!(temp.path().join(dir).is_dir(), "missing dir {dir}");
    }

    assert_eq!(space.state().generation, 1);
    assert_eq!(space.state().data.schema_version, 1);
    assert_eq!(space.state().data.directories.len(), LAYOUT_DIRS.len());
    assert!(space.root().starts_with(temp.path()));
    assert_eq!(space.state_file(), temp.path().join("state/userspace.json"));
}

#[test]
fn test_userspace_init_is_idempotent() {
    let temp = TempDir::new().unwrap();
    let first = ManagedUserspace::init(temp.path()).unwrap();
    let second = ManagedUserspace::init(temp.path()).unwrap();

    assert_eq!(first.state().generation, 1);
    assert_eq!(
        second.state().generation,
        1,
        "re-init must not bump generation"
    );
    assert_eq!(first.state().data, second.state().data);
}

#[test]
fn test_state_store_roundtrip_and_generation() {
    let temp = TempDir::new().unwrap();
    let path = temp.path().join("demo.json");

    assert!(load_state::<DemoState>(&path, "demo").unwrap().is_none());

    let gen1 = store_state(
        &path,
        "demo",
        &DemoState {
            value: "one".into(),
        },
    )
    .unwrap();
    assert_eq!(gen1, 1);

    let doc = load_state::<DemoState>(&path, "demo").unwrap().unwrap();
    assert_eq!(doc.generation, 1);
    assert_eq!(doc.data.value, "one");

    let gen2 = store_state(
        &path,
        "demo",
        &DemoState {
            value: "two".into(),
        },
    )
    .unwrap();
    assert_eq!(gen2, 2);
    let doc = load_state::<DemoState>(&path, "demo").unwrap().unwrap();
    assert_eq!(doc.data.value, "two");

    let leftovers: Vec<_> = std::fs::read_dir(temp.path())
        .unwrap()
        .flatten()
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| n.contains(".tmp-"))
        .collect();
    assert!(
        leftovers.is_empty(),
        "temp files left behind: {leftovers:?}"
    );
}

#[test]
fn test_state_kind_mismatch_is_an_error() {
    let temp = TempDir::new().unwrap();
    let path = temp.path().join("demo.json");
    store_state(&path, "demo", &DemoState { value: "x".into() }).unwrap();

    let err = load_state::<DemoState>(&path, "other").unwrap_err();
    assert!(err.to_string().contains("kind"));
}

#[test]
fn test_corrupt_state_is_quarantined_and_reset() {
    let temp = TempDir::new().unwrap();
    let path = temp.path().join("demo.json");
    store_state(
        &path,
        "demo",
        &DemoState {
            value: "good".into(),
        },
    )
    .unwrap();

    let corrupted = std::fs::read_to_string(&path)
        .unwrap()
        .replace("good", "evil");
    std::fs::write(&path, corrupted).unwrap();

    let loaded = load_state::<DemoState>(&path, "demo").unwrap();
    assert!(loaded.is_none(), "corrupt state must not load");

    let quarantined: Vec<_> = std::fs::read_dir(temp.path())
        .unwrap()
        .flatten()
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| n.contains(".corrupt-"))
        .collect();
    assert_eq!(quarantined.len(), 1, "corrupt file must be quarantined");

    // The store recovers by starting a fresh generation.
    let generation = store_state(
        &path,
        "demo",
        &DemoState {
            value: "new".into(),
        },
    )
    .unwrap();
    assert_eq!(generation, 1);
}

#[test]
fn test_kairo_core_initializes_userspace_under_managed_root() {
    let temp = TempDir::new().unwrap();
    let core = make_core(temp.path());

    let space = core.userspace().expect("userspace should initialize");
    assert!(space.root().starts_with(temp.path().join("managed")));
    assert!(space.config_dir().is_dir());
    assert!(space.packages_dir().is_dir());
}

#[test]
fn test_kairo_core_degrades_gracefully_when_userspace_cannot_init() {
    let temp = TempDir::new().unwrap();
    let blocked = temp.path().join("managed");
    std::fs::write(&blocked, b"occupied by a file").unwrap();

    let core = make_core(temp.path());
    assert!(
        core.userspace().is_none(),
        "init over an occupied path must degrade, not fail construction"
    );
}
