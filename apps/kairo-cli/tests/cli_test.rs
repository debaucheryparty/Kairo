#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::path::Path;
use std::process::Command;

use tempfile::TempDir;

/// Runs the compiled `kairo` binary against an isolated data directory.
fn kairo(data_dir: &Path, args: &[&str]) -> (String, String, bool) {
    let output = Command::new(env!("CARGO_BIN_EXE_kairo"))
        .arg("--data-dir")
        .arg(data_dir)
        .args(args)
        .output()
        .expect("kairo binary should run");
    (
        String::from_utf8_lossy(&output.stdout).to_string(),
        String::from_utf8_lossy(&output.stderr).to_string(),
        output.status.success(),
    )
}

fn write_config(dir: &Path, content: &str) -> std::path::PathBuf {
    let path = dir.join("config.json");
    std::fs::write(&path, content).unwrap();
    path
}

#[test]
fn test_status_reports_userspace() {
    let data = TempDir::new().unwrap();
    let (stdout, _, success) = kairo(data.path(), &["status"]);
    assert!(success, "{stdout}");
    assert!(stdout.contains("managed userspace:"), "{stdout}");
}

#[tokio::test]
async fn test_config_apply_drift_and_service_lifecycle() {
    let data = TempDir::new().unwrap();
    let home = TempDir::new().unwrap();
    let files = TempDir::new().unwrap();

    let tool = files.path().join("cfgtool.bin");
    std::fs::write(&tool, b"cfgtool").unwrap();

    let service_spec = if cfg!(windows) {
        r#"{ "name": "cfgsvc", "description": "config service", "command": "cmd",
             "args": ["/c", "ping", "-n", "30", "127.0.0.1"], "restart_policy": "never", "autostart": false }"#
    } else {
        r#"{ "name": "cfgsvc", "description": "config service", "command": "sh",
             "args": ["-c", "sleep 30"], "restart_policy": "never", "autostart": false }"#
    };

    let config = format!(
        r#"{{
            "version": 1,
            "files": [ {{ "path": "etc/hello.conf", "content": "hello" }} ],
            "services": [ {service_spec} ],
            "packages": []
        }}"#
    );
    let config_path = write_config(data.path(), &config);

    let (stdout, stderr, success) = kairo(
        data.path(),
        &["config", "apply", config_path.to_str().unwrap()],
    );
    assert!(success, "stdout: {stdout} stderr: {stderr}");

    let managed_root = data.path().join("managed");
    assert_eq!(
        std::fs::read_to_string(managed_root.join("etc/hello.conf")).unwrap(),
        "hello"
    );

    // Drift is clean right after apply.
    let (stdout, _, success) = kairo(
        data.path(),
        &["config", "drift", config_path.to_str().unwrap()],
    );
    assert!(success, "{stdout}");
    assert!(stdout.contains("in sync"), "{stdout}");

    // Out-of-band tampering shows up as drift.
    std::fs::write(managed_root.join("etc/hello.conf"), "tampered").unwrap();
    let (stdout, _, _) = kairo(
        data.path(),
        &["config", "drift", config_path.to_str().unwrap()],
    );
    assert!(stdout.contains("FileMismatch"), "{stdout}");

    // The service was defined and shows up in the listing (stopped: a
    // one-shot CLI cannot supervise; start/stop go through the agent).
    let (stdout, _, success) = kairo(data.path(), &["svc", "list", "--target", "managed"]);
    assert!(success, "{stdout}");
    assert!(stdout.contains("cfgsvc"), "{stdout}");

    let (_, stderr, success) = kairo(data.path(), &["svc", "start", "cfgsvc"]);
    assert!(!success);
    assert!(stderr.contains("kairo-agent"), "{stderr}");

    let _ = home;
    let _ = tool;
}

#[tokio::test]
async fn test_dots_apply_restore_via_cli() {
    let data = TempDir::new().unwrap();
    let home = TempDir::new().unwrap();

    let profile_dir = data.path().join("imported");
    std::fs::create_dir_all(profile_dir.join("files/.config")).unwrap();
    std::fs::write(
        profile_dir.join("profile.json"),
        r#"{
            "name": "mydots",
            "description": "cli dots",
            "files": [ { "path": ".config/tool.conf", "template": true } ]
        }"#,
    )
    .unwrap();
    std::fs::write(profile_dir.join("files/.config/tool.conf"), "home={{home}}").unwrap();

    let (stdout, stderr, success) = kairo(
        data.path(),
        &["dots", "save", profile_dir.to_str().unwrap()],
    );
    assert!(success, "stdout: {stdout} stderr: {stderr}");

    let home_arg = format!("--home={}", home.path().to_string_lossy());
    let (stdout, stderr, success) = kairo(
        data.path(),
        &["dots", "apply", "mydots", &home_arg, "--var=editor=helix"],
    );
    assert!(success, "stdout: {stdout} stderr: {stderr}");

    let content = std::fs::read_to_string(home.path().join(".config/tool.conf")).unwrap();
    assert!(content.contains(&format!("home={}", home.path().to_string_lossy())));

    // The file did not exist before: restore removes it.
    let (stdout, stderr, success) = kairo(data.path(), &["dots", "restore", "mydots"]);
    assert!(success, "stdout: {stdout} stderr: {stderr}");
    assert!(!home.path().join(".config/tool.conf").exists());
}

#[test]
fn test_invalid_document_is_rejected_with_nonzero_exit() {
    let data = TempDir::new().unwrap();
    let bad = write_config(data.path(), r#"{ "version": 42, "files": [] }"#);
    let (_, stderr, success) = kairo(data.path(), &["config", "apply", bad.to_str().unwrap()]);
    assert!(!success);
    assert!(stderr.contains("error"), "{stderr}");
}
