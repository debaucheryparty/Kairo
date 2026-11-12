#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::collections::BTreeMap;
use std::path::Path;
use std::sync::Arc;

use kairo_core::{DotContext, DotProfile, DotfileSpec, ManagedUserspace};
use tempfile::TempDir;

fn auth() -> kairo_core::AuthContext {
    kairo_core::AuthContext::new("operator", false, true).with_confirmed(true)
}

fn context(home: &Path) -> DotContext {
    DotContext {
        home: home.to_path_buf(),
        vars: BTreeMap::new(),
    }
}

fn save_profile(space: &Arc<ManagedUserspace>, profile: &DotProfile, files: &[(&str, &[u8])]) {
    let payloads: BTreeMap<String, Vec<u8>> = files
        .iter()
        .map(|(path, content)| ((*path).to_string(), content.to_vec()))
        .collect();
    kairo_core::DotsEngine::new(Arc::clone(space))
        .save_profile(profile, &payloads)
        .unwrap();
}

fn engine(space: &Arc<ManagedUserspace>) -> kairo_core::DotsEngine {
    kairo_core::DotsEngine::new(Arc::clone(space))
}

fn base_profile() -> DotProfile {
    DotProfile {
        name: "base".to_string(),
        description: "base".to_string(),
        extends: None,
        vars: BTreeMap::new(),
        files: vec![DotfileSpec {
            path: ".shellrc".to_string(),
            template: false,
            mode: None,
        }],
    }
}

#[tokio::test]
async fn test_apply_new_files_is_idempotent() {
    let temp = TempDir::new().unwrap();
    let space = Arc::new(ManagedUserspace::init(temp.path()).unwrap());
    let home = TempDir::new().unwrap();

    let profile = DotProfile {
        files: vec![
            DotfileSpec {
                path: ".bashrc".to_string(),
                template: false,
                mode: None,
            },
            DotfileSpec {
                path: ".config/app/settings.conf".to_string(),
                template: false,
                mode: None,
            },
        ],
        ..base_profile()
    };
    save_profile(
        &space,
        &profile,
        &[
            (".bashrc", b"export EDITOR=helix"),
            (".config/app/settings.conf", b"key=value"),
        ],
    );

    let dots = engine(&space);
    let report = dots
        .apply("base", &context(home.path()), false, &auth())
        .unwrap();
    assert!(report.success);
    assert_eq!(report.files.len(), 2);
    assert!(
        report
            .files
            .iter()
            .all(|f| f.action == kairo_core::DotfileAction::Applied)
    );

    assert_eq!(
        std::fs::read_to_string(home.path().join(".bashrc")).unwrap(),
        "export EDITOR=helix"
    );
    assert_eq!(
        std::fs::read_to_string(home.path().join(".config/app/settings.conf")).unwrap(),
        "key=value"
    );

    let again = dots
        .apply("base", &context(home.path()), false, &auth())
        .unwrap();
    assert!(
        again
            .files
            .iter()
            .all(|f| f.action == kairo_core::DotfileAction::Skipped)
    );
}

#[tokio::test]
async fn test_conflict_requires_authorization_and_backs_up() {
    let temp = TempDir::new().unwrap();
    let space = Arc::new(ManagedUserspace::init(temp.path()).unwrap());
    let home = TempDir::new().unwrap();

    std::fs::write(home.path().join(".bashrc"), "original user content").unwrap();

    let profile = DotProfile {
        files: vec![DotfileSpec {
            path: ".bashrc".to_string(),
            template: false,
            mode: None,
        }],
        ..base_profile()
    };
    save_profile(&space, &profile, &[(".bashrc", b"kairo content")]);

    let dots = engine(&space);

    // Without authorization the unmanaged file is untouched.
    let blocked = dots
        .apply("base", &context(home.path()), false, &auth())
        .unwrap();
    assert!(!blocked.success);
    assert_eq!(
        blocked.files[0].action,
        kairo_core::DotfileAction::Conflicted
    );
    assert_eq!(
        std::fs::read_to_string(home.path().join(".bashrc")).unwrap(),
        "original user content"
    );

    // With authorization the original is backed up and the file applied.
    let applied = dots
        .apply("base", &context(home.path()), true, &auth())
        .unwrap();
    assert!(applied.success);
    let detail = &applied.files[0].detail;
    assert!(detail.starts_with("backup: "), "detail: {detail}");
    let backup_path = detail.strip_prefix("backup: ").unwrap();
    assert_eq!(
        std::fs::read_to_string(backup_path).unwrap(),
        "original user content"
    );

    // Restore brings the original back.
    let restored = dots.restore("base", &auth()).unwrap();
    assert!(
        restored
            .iter()
            .all(|f| f.action == kairo_core::DotfileAction::Restored)
    );
    assert_eq!(
        std::fs::read_to_string(home.path().join(".bashrc")).unwrap(),
        "original user content"
    );
}

#[tokio::test]
async fn test_restore_removes_files_kairo_created() {
    let temp = TempDir::new().unwrap();
    let space = Arc::new(ManagedUserspace::init(temp.path()).unwrap());
    let home = TempDir::new().unwrap();

    let profile = DotProfile {
        files: vec![DotfileSpec {
            path: ".created-by-kairo".to_string(),
            template: false,
            mode: None,
        }],
        ..base_profile()
    };
    save_profile(&space, &profile, &[(".created-by-kairo", b"x")]);

    let dots = engine(&space);
    dots.apply("base", &context(home.path()), false, &auth())
        .unwrap();
    assert!(home.path().join(".created-by-kairo").exists());

    dots.restore("base", &auth()).unwrap();
    assert!(!home.path().join(".created-by-kairo").exists());
}

#[tokio::test]
async fn test_inheritance_layers_child_over_base() {
    let temp = TempDir::new().unwrap();
    let space = Arc::new(ManagedUserspace::init(temp.path()).unwrap());
    let home = TempDir::new().unwrap();

    let base = DotProfile {
        files: vec![
            DotfileSpec {
                path: ".shellrc".to_string(),
                template: false,
                mode: None,
            },
            DotfileSpec {
                path: ".base-only".to_string(),
                template: false,
                mode: None,
            },
        ],
        ..base_profile()
    };
    save_profile(
        &space,
        &base,
        &[(".shellrc", b"base shell"), (".base-only", b"from base")],
    );

    let child = DotProfile {
        name: "child".to_string(),
        description: "child".to_string(),
        extends: Some("base".to_string()),
        vars: BTreeMap::new(),
        files: vec![
            DotfileSpec {
                path: ".shellrc".to_string(),
                template: false,
                mode: None,
            },
            DotfileSpec {
                path: ".child-only".to_string(),
                template: false,
                mode: None,
            },
        ],
    };
    save_profile(
        &space,
        &child,
        &[(".shellrc", b"child shell"), (".child-only", b"from child")],
    );

    let dots = engine(&space);
    let report = dots
        .apply("child", &context(home.path()), false, &auth())
        .unwrap();
    assert!(report.success);
    assert_eq!(report.files.len(), 3);

    assert_eq!(
        std::fs::read_to_string(home.path().join(".shellrc")).unwrap(),
        "child shell"
    );
    assert_eq!(
        std::fs::read_to_string(home.path().join(".base-only")).unwrap(),
        "from base"
    );
    assert_eq!(
        std::fs::read_to_string(home.path().join(".child-only")).unwrap(),
        "from child"
    );
}

#[tokio::test]
async fn test_templates_render_with_variables() {
    let temp = TempDir::new().unwrap();
    let space = Arc::new(ManagedUserspace::init(temp.path()).unwrap());
    let home = TempDir::new().unwrap();

    let mut vars = BTreeMap::new();
    vars.insert("editor".to_string(), "helix".to_string());
    let profile = DotProfile {
        files: vec![DotfileSpec {
            path: ".config/tool.conf".to_string(),
            template: true,
            mode: None,
        }],
        vars,
        ..base_profile()
    };
    save_profile(
        &space,
        &profile,
        &[(
            ".config/tool.conf",
            b"editor={{editor}}\nhome={{home}}\nprofile={{profile}}\n",
        )],
    );

    let mut context = context(home.path());
    context
        .vars
        .insert("hostname".to_string(), "test-box".to_string());
    let dots = engine(&space);
    let report = dots.apply("base", &context, false, &auth()).unwrap();
    assert!(report.success, "{:?}", report.files);

    let content = std::fs::read_to_string(home.path().join(".config/tool.conf")).unwrap();
    assert!(content.contains("editor=helix"));
    assert!(content.contains(&format!("home={}", home.path().to_string_lossy())));
    assert!(content.contains("profile=base"));
    assert!(
        !content.contains("hostname"),
        "unknown variables are errors, not silently kept"
    );

    // Drift detects out-of-band edits of rendered dotfiles.
    std::fs::write(home.path().join(".config/tool.conf"), "tampered").unwrap();
    let drift = dots.drift("base").unwrap();
    assert!(matches!(drift[0], kairo_core::DotDrift::Modified { .. }));
}

#[cfg(unix)]
#[tokio::test]
async fn test_mode_bits_are_applied() {
    use std::os::unix::fs::PermissionsExt;

    let temp = TempDir::new().unwrap();
    let space = Arc::new(ManagedUserspace::init(temp.path()).unwrap());
    let home = TempDir::new().unwrap();

    let profile = DotProfile {
        files: vec![DotfileSpec {
            path: ".secret".to_string(),
            template: false,
            mode: Some(0o600),
        }],
        ..base_profile()
    };
    save_profile(&space, &profile, &[(".secret", b"s3cr3t")]);

    let dots = engine(&space);
    dots.apply("base", &context(home.path()), false, &auth())
        .unwrap();
    let mode = std::fs::metadata(home.path().join(".secret"))
        .unwrap()
        .permissions()
        .mode();
    assert_eq!(mode & 0o777, 0o600);
}

#[tokio::test]
async fn test_drift_reports_missing_and_modified() {
    let temp = TempDir::new().unwrap();
    let space = Arc::new(ManagedUserspace::init(temp.path()).unwrap());
    let home = TempDir::new().unwrap();

    let profile = DotProfile {
        files: vec![DotfileSpec {
            path: ".driftme".to_string(),
            template: false,
            mode: None,
        }],
        ..base_profile()
    };
    save_profile(&space, &profile, &[(".driftme", b"stable")]);

    let dots = engine(&space);
    dots.apply("base", &context(home.path()), false, &auth())
        .unwrap();
    assert!(dots.drift("base").unwrap().is_empty());

    std::fs::remove_file(home.path().join(".driftme")).unwrap();
    let drift = dots.drift("base").unwrap();
    assert!(matches!(drift[0], kairo_core::DotDrift::Missing { .. }));

    // Re-apply repairs drift, and drift is clean afterwards.
    dots.apply("base", &context(home.path()), false, &auth())
        .unwrap();
    assert!(dots.drift("base").unwrap().is_empty());
}

#[tokio::test]
async fn test_export_and_git_import_roundtrip() {
    let temp = TempDir::new().unwrap();
    let space = Arc::new(ManagedUserspace::init(temp.path()).unwrap());

    let profile = DotProfile {
        files: vec![DotfileSpec {
            path: ".roundtrip".to_string(),
            template: false,
            mode: None,
        }],
        ..base_profile()
    };
    save_profile(&space, &profile, &[(".roundtrip", b"shared")]);

    let dots = engine(&space);
    let export_target = TempDir::new().unwrap();
    let exported = dots.export("base", export_target.path()).unwrap();
    assert!(exported.join(".git").exists(), "export must be git-backed");

    // A different userspace imports the exported repository.
    let other_temp = TempDir::new().unwrap();
    let other_space = Arc::new(ManagedUserspace::init(other_temp.path()).unwrap());
    let other_dots = engine(&other_space);
    let imported = other_dots
        .import(exported.to_string_lossy().as_ref(), &auth())
        .unwrap();
    assert_eq!(imported, "base");

    let reloaded = other_dots.load_profile("base").unwrap();
    assert_eq!(reloaded.files[0].path, ".roundtrip");

    // And the imported profile applies for real.
    let home = TempDir::new().unwrap();
    let report = other_dots
        .apply("base", &context(home.path()), false, &auth())
        .unwrap();
    assert!(report.success);
    assert_eq!(
        std::fs::read_to_string(home.path().join(".roundtrip")).unwrap(),
        "shared"
    );
}

#[tokio::test]
async fn test_apply_requires_authorization_level() {
    let temp = TempDir::new().unwrap();
    let space = Arc::new(ManagedUserspace::init(temp.path()).unwrap());
    let home = TempDir::new().unwrap();

    let profile = base_profile();
    save_profile(&space, &profile, &[(".shellrc", b"x")]);

    let dots = engine(&space);
    let unprivileged = kairo_core::AuthContext::new("user1", false, false);
    let err = dots
        .apply("base", &context(home.path()), false, &unprivileged)
        .unwrap_err();
    assert!(err.to_string().contains("permission denied"));
}

#[tokio::test]
async fn test_managed_file_recreated_without_conflict() {
    let temp = TempDir::new().unwrap();
    let space = Arc::new(ManagedUserspace::init(temp.path()).unwrap());
    let home = TempDir::new().unwrap();

    let profile = DotProfile {
        files: vec![DotfileSpec {
            path: ".managed".to_string(),
            template: false,
            mode: None,
        }],
        ..base_profile()
    };
    save_profile(&space, &profile, &[(".managed", b"kairo owns this")]);

    let dots = engine(&space);
    dots.apply("base", &context(home.path()), false, &auth())
        .unwrap();
    std::fs::remove_file(home.path().join(".managed")).unwrap();

    // The file was created by Kairo: re-applying recreates it without an
    // authorization prompt even though it is now missing.
    let report = dots
        .apply("base", &context(home.path()), false, &auth())
        .unwrap();
    assert!(report.success, "{:?}", report.files);
    assert_eq!(
        std::fs::read_to_string(home.path().join(".managed")).unwrap(),
        "kairo owns this"
    );
}
