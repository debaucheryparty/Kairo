use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use crate::audit::{AuditLog, AuditSeverity};
use crate::auth::{AuthContext, OperationLevel, PermissionManager};
use crate::error::CoreError;
use crate::target::ExecutionTarget;
use kairo_bridge::PlatformAdapter;
use kairo_protocol::v1::{InstallPackagesResponse, InstalledPackage, RemovePackagesResponse};

pub struct PackageApi {
    adapter: Arc<dyn PlatformAdapter>,
    permissions: PermissionManager,
    audit: Arc<AuditLog>,
    managed_packages: RwLock<HashMap<String, InstalledPackage>>,
}

impl PackageApi {
    #[must_use]
    pub fn new(
        adapter: Arc<dyn PlatformAdapter>,
        permissions: PermissionManager,
        audit: Arc<AuditLog>,
    ) -> Self {
        let mut initial_managed = HashMap::new();
        initial_managed.insert(
            "kairo-base".to_string(),
            InstalledPackage {
                name: "kairo-base".to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
                architecture: "all".to_string(),
                description: "Kairo Universal Operating Environment Core Runtime".to_string(),
            },
        );

        Self {
            adapter,
            permissions,
            audit,
            managed_packages: RwLock::new(initial_managed),
        }
    }

    pub fn list_installed(
        &self,
        filter: Option<&str>,
        target: ExecutionTarget,
    ) -> Result<Vec<InstalledPackage>, CoreError> {
        match target {
            ExecutionTarget::Host => {
                let pkgs = self.adapter.packages().list_installed(filter)?;
                Ok(pkgs)
            }
            ExecutionTarget::Managed => {
                let managed = self
                    .managed_packages
                    .read()
                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                let list = managed
                    .values()
                    .filter(|p| {
                        if let Some(f) = filter {
                            p.name.contains(f) || p.description.contains(f)
                        } else {
                            true
                        }
                    })
                    .cloned()
                    .collect();
                Ok(list)
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
            ExecutionTarget::Managed => {
                self.permissions
                    .require_level(auth, OperationLevel::Modify)?;

                let mut managed = self
                    .managed_packages
                    .write()
                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                let mut installed = Vec::new();
                for &pkg in package_names {
                    let item = InstalledPackage {
                        name: pkg.to_string(),
                        version: "1.0.0".to_string(),
                        architecture: "kairo".to_string(),
                        description: format!("Kairo Managed Package '{pkg}'"),
                    };
                    managed.insert(pkg.to_string(), item);
                    installed.push(pkg.to_string());
                }

                self.audit.record(
                    &auth.actor_id,
                    ExecutionTarget::Managed,
                    "package.install",
                    AuditSeverity::Info,
                    true,
                    &format!("managed install: {:?}", installed),
                );

                Ok(InstallPackagesResponse {
                    success: true,
                    message: format!("successfully installed {} packages", installed.len()),
                    installed_packages: installed,
                    failed_packages: Vec::new(),
                })
            }
        }
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

                let mut managed = self
                    .managed_packages
                    .write()
                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                let mut removed = Vec::new();
                let mut failed = Vec::new();

                for &pkg in package_names {
                    if managed.remove(pkg).is_some() {
                        removed.push(pkg.to_string());
                    } else {
                        failed.push(pkg.to_string());
                    }
                }

                self.audit.record(
                    &auth.actor_id,
                    ExecutionTarget::Managed,
                    "package.remove",
                    AuditSeverity::Info,
                    failed.is_empty(),
                    &format!("managed remove: {:?}, failed: {:?}", removed, failed),
                );

                Ok(RemovePackagesResponse {
                    success: failed.is_empty(),
                    message: if failed.is_empty() {
                        format!("successfully removed {} packages", removed.len())
                    } else {
                        format!(
                            "removed {} packages, {} not found",
                            removed.len(),
                            failed.len()
                        )
                    },
                    removed_packages: removed,
                    failed_packages: failed,
                })
            }
        }
    }
}
