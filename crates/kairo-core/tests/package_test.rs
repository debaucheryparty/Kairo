#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::Arc;

use flate2::Compression;
use kairo_bridge::common::MockCommandRunner;
use kairo_bridge::{PlatformBridge, select_adapter};
use kairo_core::{
    ArtifactKind, AuthContext, CoreConfig, ExecutionTarget, KairoCore, PackageManifest,
};
use kairo_protocol::v1::{
    InitSystem, OsFamily, PackageManager, PlatformSupportTier, PrivilegeLevel, SystemProfile,
};
use sha2::{Digest, Sha256};
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

fn auth() -> AuthContext {
    AuthContext::new("operator", false, true).with_confirmed(true)
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn manifest(
    name: &str,
    version: &str,
    source: &Path,
    sha256: &str,
    kind: ArtifactKind,
    deps: Vec<String>,
) -> PackageManifest {
    PackageManifest {
        name: name.to_string(),
        version: version.to_string(),
        description: format!("{name} test package"),
        dependencies: deps,
        source: source.to_string_lossy().to_string(),
        sha256: sha256.to_string(),
        kind,
        dest_path: format!("{name}.bin"),
    }
}

fn build_tar_gz(dest: &Path, files: &[(&str, &[u8], u32)]) {
    let file = std::fs::File::create(dest).unwrap();
    let encoder = flate2::write::GzEncoder::new(file, Compression::fast());
    let mut builder = tar::Builder::new(encoder);
    for (name, content, mode) in files {
        let mut header = tar::Header::new_gnu();
        header.set_size(content.len() as u64);
        header.set_mode(*mode);
        header.set_entry_type(tar::EntryType::Regular);
        header.set_cksum();
        builder.append_data(&mut header, name, *content).unwrap();
    }
    builder.into_inner().unwrap().finish().unwrap();
}

#[cfg(unix)]
fn build_tar_gz_with_link(dest: &Path, target: &str, link: &str) {
    let file = std::fs::File::create(dest).unwrap();
    let encoder = flate2::write::GzEncoder::new(file, Compression::fast());
    let mut builder = tar::Builder::new(encoder);
    let mut header = tar::Header::new_gnu();
    header.set_size(0);
    header.set_entry_type(tar::EntryType::Symlink);
    header.set_mode(0o777);
    builder.append_link(&mut header, link, target).unwrap();
    builder.into_inner().unwrap().finish().unwrap();
}

// The tar crate refuses to build archives with `..` paths, so malicious
// fixtures are written byte by byte.
fn build_raw_tar_gz(dest: &Path, entries: &[(&str, &[u8])]) {
    let mut tar_data = Vec::new();
    for (name, content) in entries {
        let mut header = [0u8; 512];
        header[..name.len()].copy_from_slice(name.as_bytes());
        header[100..108].copy_from_slice(b"0000644\0");
        header[108..116].copy_from_slice(b"0000000\0");
        header[116..124].copy_from_slice(b"0000000\0");
        header[124..136].copy_from_slice(format!("{:011o}\0", content.len()).as_bytes());
        header[136..148].copy_from_slice(b"00000000000\0");
        header[156] = b'0';
        header[257..263].copy_from_slice(b"ustar\0");
        header[263..265].copy_from_slice(b"00");
        for byte in &mut header[148..156] {
            *byte = b' ';
        }
        let sum: u32 = header.iter().map(|b| u32::from(*b)).sum();
        header[148..156].copy_from_slice(format!("{:06o}\0 ", sum).as_bytes());
        tar_data.extend_from_slice(&header);
        tar_data.extend_from_slice(content);
        let padding = (512 - (content.len() % 512)) % 512;
        tar_data.extend(std::iter::repeat_n(0u8, padding));
    }
    tar_data.extend(std::iter::repeat_n(0u8, 1024));
    let file = std::fs::File::create(dest).unwrap();
    let mut encoder = flate2::write::GzEncoder::new(file, Compression::fast());
    encoder.write_all(&tar_data).unwrap();
    encoder.finish().unwrap();
}

fn install_dir_of(core: &KairoCore, name: &str, version: &str) -> std::path::PathBuf {
    core.userspace()
        .unwrap()
        .packages_dir()
        .join(name)
        .join(version)
}

#[test]
fn test_tar_gz_install_with_paths_and_exec_bit() {
    let temp = TempDir::new().unwrap();
    let core = make_core(temp.path());

    let artifact_dir = TempDir::new().unwrap();
    let archive = artifact_dir.path().join("tool.tar.gz");
    build_tar_gz(
        &archive,
        &[
            ("bin/hello", b"#!/bin/sh\necho hi\n", 0o755),
            ("share/hello/readme.txt", b"readme", 0o644),
        ],
    );
    let digest = sha256_hex(&std::fs::read(&archive).unwrap());

    let manifests = vec![manifest(
        "hello",
        "2.1.0",
        &archive,
        &digest,
        ArtifactKind::TarGz,
        Vec::new(),
    )];
    let response = core
        .packages()
        .install_manifests(&manifests, ExecutionTarget::Managed, &auth())
        .unwrap();
    assert!(response.success);

    let dir = install_dir_of(&core, "hello", "2.1.0");
    assert_eq!(
        std::fs::read(dir.join("bin/hello")).unwrap(),
        b"#!/bin/sh\necho hi\n"
    );
    assert_eq!(
        std::fs::read(dir.join("share/hello/readme.txt")).unwrap(),
        b"readme"
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(dir.join("bin/hello"))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o111, 0o111, "executable bit must be preserved");
    }
}

#[test]
fn test_tar_gz_rejects_path_escape() {
    let temp = TempDir::new().unwrap();
    let core = make_core(temp.path());

    let artifact_dir = TempDir::new().unwrap();
    let archive = artifact_dir.path().join("evil.tar.gz");
    build_raw_tar_gz(&archive, &[("../outside.txt", b"escaped")]);
    let digest = sha256_hex(&std::fs::read(&archive).unwrap());

    let manifests = vec![manifest(
        "evil",
        "1.0.0",
        &archive,
        &digest,
        ArtifactKind::TarGz,
        Vec::new(),
    )];
    let response = core
        .packages()
        .install_manifests(&manifests, ExecutionTarget::Managed, &auth())
        .unwrap();
    assert!(!response.success);
    assert_eq!(response.installed_packages.len(), 0);
    assert!(
        !install_dir_of(&core, "evil", "1.0.0").exists(),
        "failed installs must leave no directory"
    );

    let installed = core
        .packages()
        .list_installed(None, ExecutionTarget::Managed)
        .unwrap();
    assert!(installed.is_empty(), "no receipt for a failed install");
}

#[cfg(unix)]
#[test]
fn test_tar_gz_rejects_symlinks() {
    let temp = TempDir::new().unwrap();
    let core = make_core(temp.path());

    let artifact_dir = TempDir::new().unwrap();
    let archive = artifact_dir.path().join("link.tar.gz");
    build_tar_gz_with_link(&archive, "/etc/shadow", "shadow");
    let digest = sha256_hex(&std::fs::read(&archive).unwrap());

    let manifests = vec![manifest(
        "linker",
        "1.0.0",
        &archive,
        &digest,
        ArtifactKind::TarGz,
        Vec::new(),
    )];
    let response = core
        .packages()
        .install_manifests(&manifests, ExecutionTarget::Managed, &auth())
        .unwrap();
    assert!(!response.success);
}

#[test]
fn test_checksum_mismatch_is_transactional() {
    let temp = TempDir::new().unwrap();
    let core = make_core(temp.path());

    let artifact_dir = TempDir::new().unwrap();
    let payload = artifact_dir.path().join("payload.bin");
    std::fs::write(&payload, b"payload").unwrap();
    let wrong = "0".repeat(64);

    let manifests = vec![manifest(
        "mismatched",
        "1.0.0",
        &payload,
        &wrong,
        ArtifactKind::SingleFile,
        Vec::new(),
    )];
    let response = core
        .packages()
        .install_manifests(&manifests, ExecutionTarget::Managed, &auth())
        .unwrap();
    assert!(!response.success);
    assert!(!install_dir_of(&core, "mismatched", "1.0.0").exists());

    // No tmp files left behind in the userspace tmp dir.
    let leftovers: Vec<_> = std::fs::read_dir(core.userspace().unwrap().tmp_dir())
        .unwrap()
        .flatten()
        .collect();
    assert!(
        leftovers.is_empty(),
        "staged artifacts left behind: {leftovers:?}"
    );
}

#[test]
fn test_dependency_ordering_cycle_and_missing() {
    let temp = TempDir::new().unwrap();
    let core = make_core(temp.path());
    let artifact_dir = TempDir::new().unwrap();

    let a = artifact_dir.path().join("a.bin");
    std::fs::write(&a, b"a").unwrap();
    let b = artifact_dir.path().join("b.bin");
    std::fs::write(&b, b"b").unwrap();

    // Cycle: c depends on d, d depends on c. Set-level errors fail hard
    // before any artifact is touched.
    let manifests = vec![
        manifest(
            "c",
            "1.0.0",
            &a,
            &sha256_hex(b"a"),
            ArtifactKind::SingleFile,
            vec!["d".into()],
        ),
        manifest(
            "d",
            "1.0.0",
            &b,
            &sha256_hex(b"b"),
            ArtifactKind::SingleFile,
            vec!["c".into()],
        ),
    ];
    let error = core
        .packages()
        .install_manifests(&manifests, ExecutionTarget::Managed, &auth())
        .unwrap_err();
    assert!(error.to_string().contains("cycle"));

    // Missing dependency: neither in the set nor installed.
    let manifests = vec![manifest(
        "lonely",
        "1.0.0",
        &a,
        &sha256_hex(b"a"),
        ArtifactKind::SingleFile,
        vec!["ghost".into()],
    )];
    let error = core
        .packages()
        .install_manifests(&manifests, ExecutionTarget::Managed, &auth())
        .unwrap_err();
    assert!(error.to_string().contains("ghost"));

    // Dependency in the same set installs first: b depends on a, listed last.
    let manifests = vec![
        manifest(
            "tool-b",
            "1.0.0",
            &b,
            &sha256_hex(b"b"),
            ArtifactKind::SingleFile,
            vec!["tool-a".into()],
        ),
        manifest(
            "tool-a",
            "1.0.0",
            &a,
            &sha256_hex(b"a"),
            ArtifactKind::SingleFile,
            Vec::new(),
        ),
    ];
    let response = core
        .packages()
        .install_manifests(&manifests, ExecutionTarget::Managed, &auth())
        .unwrap();
    assert!(response.success);
    assert_eq!(
        response.installed_packages,
        vec!["tool-a".to_string(), "tool-b".to_string()]
    );
}

#[test]
fn test_upgrade_rollback_and_removal() {
    let temp = TempDir::new().unwrap();
    let core = make_core(temp.path());
    let artifact_dir = TempDir::new().unwrap();

    let v1 = artifact_dir.path().join("app-1.bin");
    std::fs::write(&v1, b"version-one").unwrap();
    let v2 = artifact_dir.path().join("app-2.bin");
    std::fs::write(&v2, b"version-two").unwrap();

    let install_v1 = vec![manifest(
        "app",
        "1.0.0",
        &v1,
        &sha256_hex(b"version-one"),
        ArtifactKind::SingleFile,
        Vec::new(),
    )];
    core.packages()
        .install_manifests(&install_v1, ExecutionTarget::Managed, &auth())
        .unwrap()
        .success
        .then_some(())
        .unwrap();

    let install_v2 = vec![manifest(
        "app",
        "2.0.0",
        &v2,
        &sha256_hex(b"version-two"),
        ArtifactKind::SingleFile,
        Vec::new(),
    )];
    core.packages()
        .install_manifests(&install_v2, ExecutionTarget::Managed, &auth())
        .unwrap()
        .success
        .then_some(())
        .unwrap();

    let installed = core
        .packages()
        .list_installed(None, ExecutionTarget::Managed)
        .unwrap();
    assert_eq!(installed.len(), 1, "only the active version is listed");
    assert_eq!(installed[0].version, "2.0.0");

    let message = core
        .packages()
        .rollback("app", ExecutionTarget::Managed, &auth())
        .unwrap();
    assert!(message.contains("1.0.0"));
    let installed = core
        .packages()
        .list_installed(None, ExecutionTarget::Managed)
        .unwrap();
    assert_eq!(installed[0].version, "1.0.0");

    // Idempotent reinstall of the active version is a no-op success.
    let again = vec![manifest(
        "app",
        "1.0.0",
        &v1,
        &sha256_hex(b"version-one"),
        ArtifactKind::SingleFile,
        Vec::new(),
    )];
    let response = core
        .packages()
        .install_manifests(&again, ExecutionTarget::Managed, &auth())
        .unwrap();
    assert!(response.success);
    assert_eq!(response.installed_packages, vec!["app".to_string()]);

    let remove = core
        .packages()
        .remove(&["app"], ExecutionTarget::Managed, &auth())
        .unwrap();
    assert!(remove.success);
    assert!(!install_dir_of(&core, "app", "1.0.0").exists());
    let installed = core
        .packages()
        .list_installed(None, ExecutionTarget::Managed)
        .unwrap();
    assert!(installed.is_empty());
}

#[test]
fn test_manifest_validation_rejects_bad_input() {
    let temp = TempDir::new().unwrap();
    let core = make_core(temp.path());
    let artifact_dir = TempDir::new().unwrap();
    let payload = artifact_dir.path().join("x.bin");
    std::fs::write(&payload, b"x").unwrap();

    let cases = vec![
        manifest(
            "../evil",
            "1.0.0",
            &payload,
            &sha256_hex(b"x"),
            ArtifactKind::SingleFile,
            Vec::new(),
        ),
        manifest(
            "bad name",
            "1.0.0",
            &payload,
            &sha256_hex(b"x"),
            ArtifactKind::SingleFile,
            Vec::new(),
        ),
        manifest(
            "ok",
            "not a version!",
            &payload,
            &sha256_hex(b"x"),
            ArtifactKind::SingleFile,
            Vec::new(),
        ),
        manifest(
            "ok",
            "1.0.0",
            &payload,
            "tooshort",
            ArtifactKind::SingleFile,
            Vec::new(),
        ),
        manifest(
            "ok",
            "1.0.0",
            &payload,
            &sha256_hex(b"x"),
            ArtifactKind::SingleFile,
            vec!["bad dep name!".into()],
        ),
    ];

    for case in cases {
        let error = core
            .packages()
            .install_manifests(&[case], ExecutionTarget::Managed, &auth())
            .unwrap_err();
        assert!(
            error.to_string().contains("invalid")
                || error.to_string().contains("sha256")
                || error.to_string().contains("dest_path"),
            "unexpected error: {error}"
        );
    }
}

#[test]
fn test_http_acquisition_end_to_end() {
    if std::env::var("KAIRO_TEST_HTTP").as_deref() != Ok("1") {
        return;
    }

    let temp = TempDir::new().unwrap();
    let core = make_core(temp.path());

    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);

    let payload = b"payload over http";
    let webroot = TempDir::new().unwrap();
    let artifact = webroot.path().join("hello.bin");
    std::fs::write(&artifact, payload).unwrap();

    let script = format!(
        "const http=require('http'),fs=require('fs'),path=require('path');const root=process.argv[1];\
         http.createServer((q,s)=>{{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]).replace(/^\\//,''));\
         fs.readFile(f,(e,d)=>{{if(e){{s.writeHead(404);s.end()}}else{{s.writeHead(200);s.end(d)}}}})}}).listen({port},'127.0.0.1')",
        port = port
    );
    let mut server = Command::new("node")
        .arg("-e")
        .arg(script)
        .arg(webroot.path())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("node must be available for the http test");

    let mut reachable = false;
    for _ in 0..50 {
        if std::net::TcpStream::connect(("127.0.0.1", port)).is_ok() {
            reachable = true;
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    assert!(reachable, "test http server did not come up");

    let url = format!("http://127.0.0.1:{port}/hello.bin");
    let manifests = vec![manifest(
        "webhello",
        "1.0.0",
        Path::new(&url),
        &sha256_hex(payload),
        ArtifactKind::SingleFile,
        Vec::new(),
    )];
    let response = core
        .packages()
        .install_manifests(&manifests, ExecutionTarget::Managed, &auth())
        .unwrap();
    assert!(response.success, "{:?}", response.failed_packages);

    let installed_file = install_dir_of(&core, "webhello", "1.0.0").join("webhello.bin");
    assert_eq!(std::fs::read(&installed_file).unwrap(), payload);

    let _ = server.kill();
    let _ = server.wait();
    let _ = std::io::stdout().flush();
}
