use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::UNIX_EPOCH;

use crate::audit::{AuditLog, AuditSeverity};
use crate::auth::{AuthContext, OperationLevel, PermissionManager};
use crate::error::CoreError;
use crate::system::SystemBoundaries;
use crate::target::ExecutionTarget;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMetadata {
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub readonly: bool,
    pub modified_ms: u64,
}

pub struct FilesystemApi {
    boundaries: SystemBoundaries,
    permissions: PermissionManager,
    audit: Arc<AuditLog>,
}

impl FilesystemApi {
    #[must_use]
    pub fn new(
        boundaries: SystemBoundaries,
        permissions: PermissionManager,
        audit: Arc<AuditLog>,
    ) -> Self {
        // Ensure managed_root exists on disk
        let _ = fs::create_dir_all(&boundaries.managed_root);

        Self {
            boundaries,
            permissions,
            audit,
        }
    }

    pub fn resolve_path(
        &self,
        relative_or_abs: &Path,
        target: ExecutionTarget,
    ) -> Result<PathBuf, CoreError> {
        match target {
            ExecutionTarget::Host => {
                if relative_or_abs.is_absolute() {
                    Ok(relative_or_abs.to_path_buf())
                } else {
                    Ok(self.boundaries.host_root.join(relative_or_abs))
                }
            }
            ExecutionTarget::Managed => {
                let clean = if relative_or_abs.is_absolute() {
                    // Strip prefix component to prevent root escape
                    let s = relative_or_abs.to_string_lossy();
                    let trimmed = s.trim_start_matches('/').trim_start_matches('\\');
                    self.boundaries.managed_root.join(trimmed)
                } else {
                    self.boundaries.managed_root.join(relative_or_abs)
                };

                // Canonicalize components or normalized path
                let normalized = clean
                    .components()
                    .fold(PathBuf::new(), |mut acc, component| {
                        match component {
                            std::path::Component::ParentDir => {
                                acc.pop();
                            }
                            std::path::Component::Normal(c) => {
                                acc.push(c);
                            }
                            _ => {}
                        }
                        acc
                    });

                let final_path = self.boundaries.managed_root.join(normalized);
                if !final_path.starts_with(&self.boundaries.managed_root) {
                    return Err(CoreError::BoundaryViolation {
                        path: relative_or_abs.to_string_lossy().to_string(),
                        target: "managed".to_string(),
                    });
                }

                Ok(final_path)
            }
        }
    }

    pub fn list_dir(
        &self,
        path: &Path,
        target: ExecutionTarget,
        auth: &AuthContext,
    ) -> Result<Vec<FileMetadata>, CoreError> {
        self.permissions.require_level(auth, OperationLevel::Read)?;
        let resolved = self.resolve_path(path, target)?;

        let entries = fs::read_dir(&resolved).map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                CoreError::NotFound(resolved.to_string_lossy().to_string())
            } else {
                CoreError::Io(e)
            }
        })?;

        let mut out = Vec::new();
        for entry in entries.flatten() {
            let metadata = entry.metadata().ok();
            let is_dir = metadata.as_ref().is_some_and(|m| m.is_dir());
            let size = metadata.as_ref().map_or(0, |m| m.len());
            let readonly = metadata
                .as_ref()
                .is_some_and(|m| m.permissions().readonly());
            let modified_ms = metadata
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);

            out.push(FileMetadata {
                path: entry.path().to_string_lossy().to_string(),
                is_dir,
                size,
                readonly,
                modified_ms,
            });
        }

        Ok(out)
    }

    pub fn read_file(
        &self,
        path: &Path,
        target: ExecutionTarget,
        auth: &AuthContext,
    ) -> Result<Vec<u8>, CoreError> {
        self.permissions.require_level(auth, OperationLevel::Read)?;
        let resolved = self.resolve_path(path, target)?;
        fs::read(&resolved).map_err(CoreError::Io)
    }

    pub fn write_file(
        &self,
        path: &Path,
        content: &[u8],
        target: ExecutionTarget,
        auth: &AuthContext,
    ) -> Result<(), CoreError> {
        let req_level = match target {
            ExecutionTarget::Host => OperationLevel::Privileged,
            ExecutionTarget::Managed => OperationLevel::Modify,
        };
        self.permissions.require_level(auth, req_level)?;

        let resolved = self.resolve_path(path, target)?;
        if let Some(parent) = resolved.parent() {
            fs::create_dir_all(parent)?;
        }

        let res = fs::write(&resolved, content);
        match res {
            Ok(()) => {
                self.audit.record(
                    &auth.actor_id,
                    target,
                    "fs.write",
                    AuditSeverity::Info,
                    true,
                    &format!(
                        "wrote {} bytes to {}",
                        content.len(),
                        resolved.to_string_lossy()
                    ),
                );
                Ok(())
            }
            Err(e) => {
                self.audit.record(
                    &auth.actor_id,
                    target,
                    "fs.write",
                    AuditSeverity::Warning,
                    false,
                    &format!("failed write to {}: {e}", resolved.to_string_lossy()),
                );
                Err(CoreError::Io(e))
            }
        }
    }

    pub fn delete(
        &self,
        path: &Path,
        target: ExecutionTarget,
        auth: &AuthContext,
    ) -> Result<(), CoreError> {
        let req_level = match target {
            ExecutionTarget::Host => OperationLevel::Privileged,
            ExecutionTarget::Managed => OperationLevel::Modify,
        };
        self.permissions.require_level(auth, req_level)?;

        let resolved = self.resolve_path(path, target)?;
        let res = if resolved.is_dir() {
            fs::remove_dir_all(&resolved)
        } else {
            fs::remove_file(&resolved)
        };

        match res {
            Ok(()) => {
                self.audit.record(
                    &auth.actor_id,
                    target,
                    "fs.delete",
                    AuditSeverity::Warning,
                    true,
                    &format!("deleted {}", resolved.to_string_lossy()),
                );
                Ok(())
            }
            Err(e) => {
                self.audit.record(
                    &auth.actor_id,
                    target,
                    "fs.delete",
                    AuditSeverity::Warning,
                    false,
                    &format!("failed delete {}: {e}", resolved.to_string_lossy()),
                );
                Err(CoreError::Io(e))
            }
        }
    }
}
