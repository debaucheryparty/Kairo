//! Package management. Host packages are delegated to the native adapter;
//! managed packages are installed from manifests as real artifacts into the
//! managed userspace, with receipts persisted in the registry.

pub mod acquire;
pub mod extract;
pub mod manifest;
pub mod registry;

use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::audit::{AuditLog, AuditSeverity};
use crate::auth::{AuthContext, OperationLevel, PermissionManager};
use crate::error::CoreError;
use crate::target::ExecutionTarget;
use crate::userspace::ManagedUserspace;
use kairo_bridge::PlatformAdapter;
use kairo_protocol::v1::{InstallPackagesResponse, InstalledPackage, RemovePackagesResponse};
use manifest::dependency_parts;
use registry::{PackageReceipt, PackageRegistry};
use tracing::warn;

pub use manifest::{ArtifactKind, PackageManifest};

pub struct PackageApi {
    adapter: Arc<dyn PlatformAdapter>,
    permissions: PermissionManager,
    audit: Arc<AuditLog>,
    userspace: Option<Arc<ManagedUserspace>>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

impl PackageApi {
    #[must_use]
    pub fn new(
        adapter: Arc<dyn PlatformAdapter>,
        permissions: PermissionManager,
        audit: Arc<AuditLog>,
        userspace: Option<Arc<ManagedUserspace>>,
    ) -> Self {
        Self {
            adapter,
            permissions,
            audit,
            userspace,
        }
    }

    fn managed_space(&self) -> Result<&ManagedUserspace, CoreError> {
        self.userspace.as_deref().ok_or_else(|| {
            CoreError::TargetUnsupported(
                "the managed userspace is unavailable on this host".to_string(),
            )
        })
    }

    fn registry_file(&self, space: &ManagedUserspace) -> std::path::PathBuf {
        registry::registry_path(&space.root().join("state"))
    }

    pub fn list_installed(
        &self,
        filter: Option<&str>,
        target: ExecutionTarget,
    ) -> Result<Vec<InstalledPackage>, CoreError> {
        match target {
            ExecutionTarget::Host => Ok(self.adapter.packages().list_installed(filter)?),
            ExecutionTarget::Managed => {
                let space = self.managed_space()?;
                let stored = registry::load(&self.registry_file(space))?;
                let registry = stored.map_or_else(PackageRegistry::default, |doc| doc.data);
                let lowered = filter.map(str::to_lowercase);
                Ok(registry
                    .packages
                    .into_iter()
                    .filter(|receipt| receipt.active)
                    .filter(|receipt| {
                        lowered.as_ref().is_none_or(|needle| {
                            receipt.name.to_lowercase().contains(needle)
                                || receipt.manifest.description.to_lowercase().contains(needle)
                        })
                    })
                    .map(|receipt| InstalledPackage {
                        name: receipt.name,
                        version: receipt.version,
                        architecture: "kairo".to_string(),
                        description: receipt.manifest.description,
                    })
                    .collect())
            }
        }
    }

    pub fn install(
        &self,
        package_names: &[&str],
        target: ExecutionTarget,
        auth: &AuthContext,
    ) -> Result<InstallPackagesResponse, CoreError> {
        match target {
            ExecutionTarget::Host => {
                self.permissions
                    .require_level(auth, OperationLevel::Privileged)?;

                let outcome = self.adapter.packages().install_packages(package_names);
                match outcome {
                    Ok(resp) => {
                        self.audit.record(
                            &auth.actor_id,
                            ExecutionTarget::Host,
                            "package.install",
                            AuditSeverity::Info,
                            resp.success,
                            &format!("host install: {:?}", package_names),
                        );
                        Ok(resp)
                    }
                    Err(e) => {
                        self.audit.record(
                            &auth.actor_id,
                            ExecutionTarget::Host,
                            "package.install",
                            AuditSeverity::Warning,
                            false,
                            &format!("failed host install {:?}: {e}", package_names),
                        );
                        Err(CoreError::Bridge(e))
                    }
                }
            }
            ExecutionTarget::Managed => Err(CoreError::InvalidArgument(
                "managed installs require package manifests; use install_manifests".to_string(),
            )),
        }
    }

    /// Installs managed packages from manifests. Dependencies listed in the
    /// same set are ordered and installed first; dependencies already active
    /// in the registry are accepted as satisfied. Each package install is
    /// transactional: on failure its directory is removed and no receipt is
    /// written.
    pub fn install_manifests(
        &self,
        manifests: &[PackageManifest],
        target: ExecutionTarget,
        auth: &AuthContext,
    ) -> Result<InstallPackagesResponse, CoreError> {
        if target != ExecutionTarget::Managed {
            return Err(CoreError::TargetUnsupported(
                "package manifests install into the managed environment only".to_string(),
            ));
        }
        self.permissions
            .require_level(auth, OperationLevel::Modify)?;

        for manifest in manifests {
            manifest.validate()?;
        }
        let space = self.managed_space()?;
        let registry_file = self.registry_file(space);
        let mut registry =
            registry::load(&registry_file)?.map_or_else(PackageRegistry::default, |doc| doc.data);

        let order = resolve_order(manifests, &registry)?;

        let mut installed = Vec::new();
        let mut failed = Vec::new();
        let mut changed = false;

        for index in order {
            let manifest = &manifests[index];
            let already_active = registry.packages.iter().any(|receipt| {
                receipt.active
                    && receipt.name == manifest.name
                    && receipt.version == manifest.version
            });
            if already_active {
                installed.push(manifest.name.clone());
                continue;
            }

            match self.install_one(manifest, space, &mut registry) {
                Ok(()) => {
                    changed = true;
                    installed.push(manifest.name.clone());
                    self.audit.record(
                        &auth.actor_id,
                        ExecutionTarget::Managed,
                        "package.install",
                        AuditSeverity::Info,
                        true,
                        &format!("managed install {}@{}", manifest.name, manifest.version),
                    );
                }
                Err(e) => {
                    self.audit.record(
                        &auth.actor_id,
                        ExecutionTarget::Managed,
                        "package.install",
                        AuditSeverity::Warning,
                        false,
                        &format!(
                            "failed managed install {}@{}: {e}",
                            manifest.name, manifest.version
                        ),
                    );
                    failed.push(format!("{}@{}: {e}", manifest.name, manifest.version));
                }
            }
        }

        if changed {
            registry::store(&registry_file, &registry)?;
        }

        Ok(InstallPackagesResponse {
            success: failed.is_empty(),
            message: if failed.is_empty() {
                format!("{} managed package(s) installed", installed.len())
            } else {
                format!("{} installed, {} failed", installed.len(), failed.len())
            },
            installed_packages: installed,
            failed_packages: failed,
        })
    }

    fn install_one(
        &self,
        manifest: &PackageManifest,
        space: &ManagedUserspace,
        registry: &mut PackageRegistry,
    ) -> Result<(), CoreError> {
        let install_dir = space
            .packages_dir()
            .join(&manifest.name)
            .join(&manifest.version);
        if install_dir.exists() {
            return Err(CoreError::InvalidArgument(format!(
                "{}@{} already has an install directory; remove it first",
                manifest.name, manifest.version
            )));
        }

        let artifact = space.tmp_dir().join(format!(
            "pkgsrc-{}-{}-{}",
            manifest.name,
            manifest.version,
            now_ms()
        ));

        let files = match self.stage_install(manifest, &artifact, &install_dir) {
            Ok(files) => files,
            Err(e) => {
                let _ = fs::remove_dir_all(&install_dir);
                if let Err(cleanup) = fs::remove_file(&artifact)
                    && cleanup.kind() != std::io::ErrorKind::NotFound
                {
                    warn!(path = %artifact.display(), error = %cleanup, "failed to remove staged artifact");
                }
                return Err(e);
            }
        };

        if let Err(e) = fs::remove_file(&artifact)
            && e.kind() != std::io::ErrorKind::NotFound
        {
            warn!(path = %artifact.display(), error = %e, "failed to remove staged artifact");
        }

        // The previous version keeps its files but stops being active, so a
        // later rollback can restore it without re-downloading.
        for receipt in registry.packages.iter_mut() {
            if receipt.active && receipt.name == manifest.name {
                receipt.active = false;
            }
        }
        registry.packages.push(PackageReceipt {
            name: manifest.name.clone(),
            version: manifest.version.clone(),
            installed_at_ms: now_ms(),
            manifest: manifest.clone(),
            files,
            active: true,
        });
        Ok(())
    }

    fn stage_install(
        &self,
        manifest: &PackageManifest,
        artifact: &Path,
        install_dir: &Path,
    ) -> Result<Vec<String>, CoreError> {
        let digest = acquire::acquire(&manifest.source, artifact)?;
        if !digest.eq_ignore_ascii_case(&manifest.sha256) {
            return Err(CoreError::InvalidArgument(format!(
                "artifact checksum mismatch for '{}': expected {}, got {digest}",
                manifest.name, manifest.sha256
            )));
        }
        fs::create_dir_all(install_dir)?;
        extract::extract(&manifest.kind, artifact, install_dir, &manifest.dest_path)
    }

    pub fn remove(
        &self,
        package_names: &[&str],
        target: ExecutionTarget,
        auth: &AuthContext,
    ) -> Result<RemovePackagesResponse, CoreError> {
        match target {
            ExecutionTarget::Host => {
                self.permissions
                    .require_level(auth, OperationLevel::Privileged)?;

                let outcome = self.adapter.packages().remove_packages(package_names);
                match outcome {
                    Ok(resp) => {
                        self.audit.record(
                            &auth.actor_id,
                            ExecutionTarget::Host,
                            "package.remove",
                            AuditSeverity::Info,
                            resp.success,
                            &format!("host remove: {:?}", package_names),
                        );
                        Ok(resp)
                    }
                    Err(e) => {
                        self.audit.record(
                            &auth.actor_id,
                            ExecutionTarget::Host,
                            "package.remove",
                            AuditSeverity::Warning,
                            false,
                            &format!("failed host remove {:?}: {e}", package_names),
                        );
                        Err(CoreError::Bridge(e))
                    }
                }
            }
            ExecutionTarget::Managed => {
                self.permissions
                    .require_level(auth, OperationLevel::Modify)?;
                let space = self.managed_space()?;
                let registry_file = self.registry_file(space);
                let mut registry = registry::load(&registry_file)?
                    .map_or_else(PackageRegistry::default, |doc| doc.data);

                let mut removed = Vec::new();
                let mut failed = Vec::new();

                for name in package_names {
                    let Some(index) = registry
                        .packages
                        .iter()
                        .position(|receipt| receipt.active && receipt.name == *name)
                    else {
                        failed.push((*name).to_string());
                        continue;
                    };
                    let receipt = registry.packages[index].clone();
                    let dir = space
                        .packages_dir()
                        .join(&receipt.name)
                        .join(&receipt.version);
                    if let Err(e) = fs::remove_dir_all(&dir)
                        && e.kind() != std::io::ErrorKind::NotFound
                    {
                        failed.push(format!("{name}: {e}"));
                        continue;
                    }
                    registry.packages.remove(index);
                    removed.push((*name).to_string());
                }

                if !removed.is_empty() {
                    registry::store(&registry_file, &registry)?;
                }

                self.audit.record(
                    &auth.actor_id,
                    ExecutionTarget::Managed,
                    "package.remove",
                    AuditSeverity::Info,
                    failed.is_empty(),
                    &format!("managed remove: {removed:?}, failed: {failed:?}"),
                );

                Ok(RemovePackagesResponse {
                    success: failed.is_empty(),
                    message: if failed.is_empty() {
                        format!("removed {} managed package(s)", removed.len())
                    } else {
                        format!("removed {}, {} failed", removed.len(), failed.len())
                    },
                    removed_packages: removed,
                    failed_packages: failed,
                })
            }
        }
    }

    /// Restores the most recently superseded version of a package whose
    /// files are still on disk. Returns a human-readable message.
    pub fn rollback(
        &self,
        package_name: &str,
        target: ExecutionTarget,
        auth: &AuthContext,
    ) -> Result<String, CoreError> {
        if target != ExecutionTarget::Managed {
            return Err(CoreError::TargetUnsupported(
                "rollback applies to managed packages only".to_string(),
            ));
        }
        self.permissions
            .require_level(auth, OperationLevel::Modify)?;

        let space = self.managed_space()?;
        let registry_file = self.registry_file(space);
        let mut registry =
            registry::load(&registry_file)?.map_or_else(PackageRegistry::default, |doc| doc.data);

        let active_index = registry
            .packages
            .iter()
            .position(|receipt| receipt.active && receipt.name == package_name)
            .ok_or_else(|| CoreError::NotFound(format!("no active install of '{package_name}'")))?;
        let previous_index = registry
            .packages
            .iter()
            .rposition(|receipt| !receipt.active && receipt.name == package_name)
            .ok_or_else(|| {
                CoreError::NotFound(format!(
                    "no previous version of '{package_name}' to roll back to"
                ))
            })?;

        let previous = registry.packages[previous_index].clone();
        let dir = space
            .packages_dir()
            .join(&previous.name)
            .join(&previous.version);
        if !dir.is_dir() {
            return Err(CoreError::NotFound(format!(
                "files for {}@{} are no longer on disk",
                previous.name, previous.version
            )));
        }

        registry.packages[active_index].active = false;
        registry.packages[previous_index].active = true;
        registry::store(&registry_file, &registry)?;

        self.audit.record(
            &auth.actor_id,
            ExecutionTarget::Managed,
            "package.rollback",
            AuditSeverity::Info,
            true,
            &format!("rolled back {package_name} to {}", previous.version),
        );

        Ok(format!(
            "rolled back '{package_name}' to {}",
            previous.version
        ))
    }
}

/// Orders manifests so dependencies in the set install before their
/// dependants; dependencies outside the set must already be active.
fn resolve_order(
    manifests: &[PackageManifest],
    registry: &PackageRegistry,
) -> Result<Vec<usize>, CoreError> {
    let mut by_name: HashMap<&str, usize> = HashMap::new();
    for (index, manifest) in manifests.iter().enumerate() {
        if let Some(&previous) = by_name.get(manifest.name.as_str())
            && manifests[previous] != *manifest
        {
            return Err(CoreError::InvalidArgument(format!(
                "conflicting manifests for '{}'",
                manifest.name
            )));
        }
        by_name.entry(manifest.name.as_str()).or_insert(index);
    }

    let mut state = vec![Visit::Unvisited; manifests.len()];
    let mut order = Vec::with_capacity(manifests.len());
    for index in 0..manifests.len() {
        visit(index, manifests, &by_name, registry, &mut state, &mut order)?;
    }
    Ok(order)
}

#[derive(Clone, Copy, PartialEq)]
enum Visit {
    Unvisited,
    Visiting,
    Done,
}

fn visit(
    index: usize,
    manifests: &[PackageManifest],
    by_name: &HashMap<&str, usize>,
    registry: &PackageRegistry,
    state: &mut [Visit],
    order: &mut Vec<usize>,
) -> Result<(), CoreError> {
    match state[index] {
        Visit::Done => return Ok(()),
        Visit::Visiting => {
            return Err(CoreError::InvalidArgument(format!(
                "dependency cycle through '{}'",
                manifests[index].name
            )));
        }
        Visit::Unvisited => {}
    }
    state[index] = Visit::Visiting;

    for dependency in &manifests[index].dependencies {
        let (dep_name, dep_version) = dependency_parts(dependency);
        if let Some(&dep_index) = by_name.get(dep_name) {
            visit(dep_index, manifests, by_name, registry, state, order)?;
            continue;
        }
        let satisfied = registry.packages.iter().any(|receipt| {
            receipt.active
                && receipt.name == dep_name
                && dep_version.is_none_or(|v| receipt.version == v)
        });
        if !satisfied {
            return Err(CoreError::InvalidArgument(format!(
                "dependency '{dependency}' of '{}' is neither in the manifest set nor installed",
                manifests[index].name
            )));
        }
    }

    state[index] = Visit::Done;
    order.push(index);
    Ok(())
}
