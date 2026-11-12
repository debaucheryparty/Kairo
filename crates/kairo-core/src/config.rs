//! Declarative configuration: a versioned desired-state document describing
//! managed files, packages and services, applied idempotently against the
//! managed userspace.
//!
//! Application order is files, then packages (dependency-ordered by the
//! package system), then services. Package and service steps are each
//! individually transactional (see their modules); file changes made during
//! an apply are rolled back if any step fails afterwards. Section-scoped
//! dependencies (e.g. a service needing a package from the same document)
//! are not expressible in schema version 1.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::auth::AuthContext;
use crate::error::CoreError;
use crate::package::manifest::PackageManifest;
use crate::runtime::{ManagedServiceSpec, ServiceSupervisor};
use crate::state::store_state;
use crate::target::ExecutionTarget;
use kairo_protocol::v1::ServiceAction;

pub const CONFIG_SCHEMA_VERSION: u32 = 1;
const APPLIED_CONFIG_KIND: &str = "kairo-applied-config";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ManagedFileSpec {
    /// Path relative to the managed userspace root.
    pub path: String,
    /// UTF-8 file content.
    pub content: String,
    /// Unix permission bits (e.g. 0o644). Ignored on Windows.
    #[serde(default)]
    pub mode: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ConfigDocument {
    pub version: u32,
    #[serde(default)]
    pub packages: Vec<PackageManifest>,
    #[serde(default)]
    pub services: Vec<ManagedServiceSpec>,
    #[serde(default)]
    pub files: Vec<ManagedFileSpec>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StepAction {
    Applied,
    Skipped,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StepResult {
    pub kind: String,
    pub name: String,
    pub action: StepAction,
    #[serde(default)]
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplyReport {
    pub success: bool,
    pub steps: Vec<StepResult>,
    #[serde(default)]
    pub rolled_back_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DriftItem {
    FileMissing { path: String },
    FileMismatch { path: String },
    PackageMissing { name: String, version: String },
    ServiceMissing { name: String },
    ServiceModified { name: String },
    ServiceNotRunning { name: String },
}

struct FileBackup {
    relative: String,
    previous: Option<Vec<u8>>,
}

impl ConfigDocument {
    pub fn validate(&self) -> Result<(), CoreError> {
        if self.version != CONFIG_SCHEMA_VERSION {
            return Err(CoreError::InvalidArgument(format!(
                "config schema version {} is not supported (expected {CONFIG_SCHEMA_VERSION})",
                self.version
            )));
        }

        let mut package_names = std::collections::HashSet::new();
        for package in &self.packages {
            package.validate()?;
            if !package_names.insert(package.name.as_str()) {
                return Err(CoreError::InvalidArgument(format!(
                    "package '{}' appears twice in the document",
                    package.name
                )));
            }
        }

        let mut service_names = std::collections::HashSet::new();
        for service in &self.services {
            ServiceSupervisor::validate_spec(service)?;
            if !service_names.insert(service.name.as_str()) {
                return Err(CoreError::InvalidArgument(format!(
                    "service '{}' appears twice in the document",
                    service.name
                )));
            }
        }

        let mut file_paths = std::collections::HashSet::new();
        for file in &self.files {
            validated_relative(file)?;
            if !file_paths.insert(file.path.as_str()) {
                return Err(CoreError::InvalidArgument(format!(
                    "file '{}' appears twice in the document",
                    file.path
                )));
            }
        }
        Ok(())
    }
}

fn validated_relative(file: &ManagedFileSpec) -> Result<String, CoreError> {
    if file.content.len() > 32 * 1024 * 1024 {
        return Err(CoreError::InvalidArgument(format!(
            "file '{}' exceeds the 32 MiB content limit",
            file.path
        )));
    }
    let relative = crate::fs::managed_relative(Path::new(&file.path))?;
    if relative.as_os_str().is_empty() {
        return Err(CoreError::InvalidArgument(
            "file path must name a file inside the managed root".to_string(),
        ));
    }
    let normalized = relative
        .components()
        .map(|component| component.as_os_str().to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join("/");
    Ok(normalized)
}

/// Applies the document. See the module docs for ordering and rollback
/// semantics.
pub async fn apply(
    core: &crate::KairoCore,
    document: &ConfigDocument,
    auth: &AuthContext,
) -> Result<ApplyReport, CoreError> {
    document.validate()?;
    core.permissions()
        .require_level(auth, crate::auth::OperationLevel::Modify)?;
    let space = core.userspace().ok_or_else(|| {
        CoreError::TargetUnsupported(
            "the managed userspace is unavailable on this host".to_string(),
        )
    })?;

    let mut steps: Vec<StepResult> = Vec::new();
    let mut backups: Vec<FileBackup> = Vec::new();

    let mut report_failed = match apply_files(core, auth, &document.files, &mut steps, &mut backups)
    {
        Ok(()) => false,
        Err(_) => true,
    };

    if !report_failed && !document.packages.is_empty() {
        let active_keys: std::collections::HashSet<String> = core
            .packages()
            .list_installed(None, ExecutionTarget::Managed)?
            .into_iter()
            .map(|p| format!("{}@{}", p.name, p.version))
            .collect();
        let mut pending = Vec::new();
        for package in &document.packages {
            let key = format!("{}@{}", package.name, package.version);
            if active_keys.contains(&key) {
                steps.push(StepResult {
                    kind: "package".to_string(),
                    name: package.name.clone(),
                    action: StepAction::Skipped,
                    detail: String::new(),
                });
            } else {
                pending.push(package.clone());
            }
        }
        if pending.is_empty() {
            return Ok(ApplyReport {
                success: true,
                steps,
                rolled_back_files: Vec::new(),
            });
        }
        let response =
            core.packages()
                .install_manifests(&pending, ExecutionTarget::Managed, auth)?;
        for installed in &response.installed_packages {
            steps.push(StepResult {
                kind: "package".to_string(),
                name: installed.clone(),
                action: StepAction::Applied,
                detail: String::new(),
            });
        }
        for failed in &response.failed_packages {
            steps.push(StepResult {
                kind: "package".to_string(),
                name: failed.clone(),
                action: StepAction::Failed,
                detail: String::new(),
            });
        }
        report_failed = !response.failed_packages.is_empty();
    }

    if !report_failed {
        for spec in &document.services {
            match apply_service(core, spec, auth).await {
                Ok(applied) => steps.push(applied),
                Err(e) => {
                    steps.push(StepResult {
                        kind: "service".to_string(),
                        name: spec.name.clone(),
                        action: StepAction::Failed,
                        detail: e.to_string(),
                    });
                    report_failed = true;
                    break;
                }
            }
        }
    }

    if report_failed && !backups.is_empty() {
        let rolled_back = rollback_files(core, auth, &mut backups);
        for path in rolled_back {
            steps.push(StepResult {
                kind: "file".to_string(),
                name: path.clone(),
                action: StepAction::Failed,
                detail: "rolled back".to_string(),
            });
        }
        let names = backups.iter().map(|b| b.relative.clone()).collect();
        return Ok(ApplyReport {
            success: false,
            steps,
            rolled_back_files: names,
        });
    }

    if !report_failed {
        store_state(
            &space.root().join("state").join("applied-config.json"),
            APPLIED_CONFIG_KIND,
            document,
        )?;
    }

    Ok(ApplyReport {
        success: !report_failed,
        steps,
        rolled_back_files: Vec::new(),
    })
}

fn apply_files(
    core: &crate::KairoCore,
    auth: &AuthContext,
    files: &[ManagedFileSpec],
    steps: &mut Vec<StepResult>,
    backups: &mut Vec<FileBackup>,
) -> Result<(), CoreError> {
    for file in files {
        validated_relative(file)?;
        let previous = core
            .fs()
            .read_file(Path::new(&file.path), ExecutionTarget::Managed, auth)
            .ok();

        let unchanged = previous
            .as_deref()
            .is_some_and(|existing| existing == file.content.as_bytes());
        #[cfg(unix)]
        let mode_unchanged = match (file.mode, &previous) {
            (Some(wanted), Some(_)) => {
                let full = core
                    .fs()
                    .resolve_path(Path::new(&file.path), ExecutionTarget::Managed)?;
                std::fs::metadata(&full)
                    .map(|meta| {
                        use std::os::unix::fs::PermissionsExt;
                        meta.permissions().mode() & 0o777 == wanted
                    })
                    .unwrap_or(false)
            }
            _ => true,
        };
        #[cfg(not(unix))]
        let mode_unchanged = true;

        if unchanged && mode_unchanged {
            steps.push(StepResult {
                kind: "file".to_string(),
                name: file.path.clone(),
                action: StepAction::Skipped,
                detail: String::new(),
            });
            continue;
        }

        backups.push(FileBackup {
            relative: file.path.clone(),
            previous: previous.clone(),
        });
        if let Err(e) = core.fs().write_file(
            Path::new(&file.path),
            file.content.as_bytes(),
            ExecutionTarget::Managed,
            auth,
        ) {
            steps.push(StepResult {
                kind: "file".to_string(),
                name: file.path.clone(),
                action: StepAction::Failed,
                detail: e.to_string(),
            });
            return Err(e);
        }
        #[cfg(unix)]
        if let Some(wanted) = file.mode {
            let full = core
                .fs()
                .resolve_path(Path::new(&file.path), ExecutionTarget::Managed)?;
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&full, std::fs::Permissions::from_mode(wanted))?;
        }
        steps.push(StepResult {
            kind: "file".to_string(),
            name: file.path.clone(),
            action: StepAction::Applied,
            detail: String::new(),
        });
    }
    Ok(())
}

fn rollback_files(
    core: &crate::KairoCore,
    auth: &AuthContext,
    backups: &mut [FileBackup],
) -> Vec<String> {
    let mut rolled_back = Vec::new();
    for backup in backups.iter_mut() {
        let result = match &backup.previous {
            Some(content) => core.fs().write_file(
                Path::new(&backup.relative),
                content,
                ExecutionTarget::Managed,
                auth,
            ),
            None => core
                .fs()
                .delete(Path::new(&backup.relative), ExecutionTarget::Managed, auth),
        };
        if result.is_ok() {
            rolled_back.push(backup.relative.clone());
        } else {
            tracing::warn!(path = %backup.relative, "failed to roll back managed file");
        }
    }
    rolled_back
}

async fn apply_service(
    core: &crate::KairoCore,
    spec: &ManagedServiceSpec,
    auth: &AuthContext,
) -> Result<StepResult, CoreError> {
    let existing = core.services().managed_definition(&spec.name)?;

    if existing.as_ref() == Some(spec) {
        if spec.autostart {
            let running = core
                .services()
                .list_services(ExecutionTarget::Managed)?
                .into_iter()
                .any(|service| service.name == spec.name && service.active_state == "active");
            if !running {
                core.services()
                    .manage_service(
                        &spec.name,
                        ServiceAction::Start,
                        ExecutionTarget::Managed,
                        auth,
                    )
                    .await?;
                return Ok(StepResult {
                    kind: "service".to_string(),
                    name: spec.name.clone(),
                    action: StepAction::Applied,
                    detail: "started".to_string(),
                });
            }
        }
        return Ok(StepResult {
            kind: "service".to_string(),
            name: spec.name.clone(),
            action: StepAction::Skipped,
            detail: String::new(),
        });
    }

    if let Some(current) = &existing
        && current != spec
    {
        // A changed definition needs the old process gone first.
        core.services()
            .manage_service(
                &spec.name,
                ServiceAction::Stop,
                ExecutionTarget::Managed,
                auth,
            )
            .await?;
    }
    core.services().define_managed_service(spec.clone(), auth)?;
    if spec.autostart {
        core.services()
            .manage_service(
                &spec.name,
                ServiceAction::Start,
                ExecutionTarget::Managed,
                auth,
            )
            .await?;
    }
    Ok(StepResult {
        kind: "service".to_string(),
        name: spec.name.clone(),
        action: StepAction::Applied,
        detail: String::new(),
    })
}

/// Compares the document against the live userspace without changing it.
pub fn drift(
    core: &crate::KairoCore,
    document: &ConfigDocument,
) -> Result<Vec<DriftItem>, CoreError> {
    document.validate()?;

    let mut drift = Vec::new();

    for file in &document.files {
        let relative = validated_relative(file)?;
        let full = core
            .fs()
            .resolve_path(Path::new(&file.path), ExecutionTarget::Managed)?;
        match std::fs::read(&full) {
            Ok(content) => {
                if content != file.content.as_bytes() {
                    drift.push(DriftItem::FileMismatch { path: relative });
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                drift.push(DriftItem::FileMissing { path: relative });
            }
            Err(e) => return Err(CoreError::Io(e)),
        }
    }

    for package in &document.packages {
        let active = core
            .packages()
            .list_installed(None, ExecutionTarget::Managed)
            .map(|installed| {
                installed
                    .iter()
                    .any(|p| p.name == package.name && p.version == package.version)
            })?;
        if !active {
            drift.push(DriftItem::PackageMissing {
                name: package.name.clone(),
                version: package.version.clone(),
            });
        }
    }

    for spec in &document.services {
        let defined = core.services().managed_definition(&spec.name)?;
        match defined {
            None => drift.push(DriftItem::ServiceMissing {
                name: spec.name.clone(),
            }),
            Some(current) if &current != spec => {
                drift.push(DriftItem::ServiceModified {
                    name: spec.name.clone(),
                });
            }
            _ if spec.autostart => {
                let running = core
                    .services()
                    .list_services(ExecutionTarget::Managed)?
                    .into_iter()
                    .any(|service| service.name == spec.name && service.active_state == "active");
                if !running {
                    drift.push(DriftItem::ServiceNotRunning {
                        name: spec.name.clone(),
                    });
                }
            }
            _ => {}
        }
    }

    Ok(drift)
}
