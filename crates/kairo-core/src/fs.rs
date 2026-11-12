use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::audit::{AuditLog, AuditSeverity};
use crate::auth::{AuthContext, OperationLevel, PermissionManager};
use crate::error::CoreError;
use crate::system::SystemBoundaries;
use crate::target::ExecutionTarget;
use serde::{Deserialize, Serialize};
use tracing::warn;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMetadata {
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub readonly: bool,
    pub modified_ms: u64,
}

fn boundary_violation(path: &Path) -> CoreError {
    CoreError::BoundaryViolation {
        path: path.to_string_lossy().to_string(),
        target: "managed".to_string(),
    }
}

pub(crate) fn managed_relative(relative_or_abs: &Path) -> Result<PathBuf, CoreError> {
    let text = relative_or_abs.to_string_lossy();
    let trimmed = text.trim_start_matches(['/', '\\']);

    let mut normalized = PathBuf::new();
    for component in Path::new(trimmed).components() {
        match component {
            Component::Normal(c) => normalized.push(c),
            Component::CurDir => {}
            Component::ParentDir => {
                if !normalized.pop() {
                    return Err(boundary_violation(relative_or_abs));
                }
            }
            _ => return Err(boundary_violation(relative_or_abs)),
        }
    }
    Ok(normalized)
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
        if let Err(e) = fs::create_dir_all(&boundaries.managed_root) {
            warn!(
                root = %boundaries.managed_root.display(),
                error = %e,
                "managed root unavailable; managed filesystem operations will fail"
            );
        }

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
                let relative = managed_relative(relative_or_abs)?;
                Ok(self.boundaries.managed_root.join(relative))
            }
        }
    }

    // Lexical normalization alone cannot stop symlink escapes, so managed
    // operations additionally confirm that the real (canonicalized) path
    // stays inside the managed root. When the target does not exist yet,
    // the deepest existing ancestor is checked and dangling symlinks among
    // the missing components are rejected: writing through one would follow
    // the link outside the root.
    fn verify_contained(&self, path: &Path) -> Result<(), CoreError> {
        let root = fs::canonicalize(&self.boundaries.managed_root)?;
        let mut existing = path.to_path_buf();

        loop {
            match fs::canonicalize(&existing) {
                Ok(real) => {
                    if real != root && !real.starts_with(&root) {
                        return Err(boundary_violation(path));
                    }
                    return Ok(());
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    if let Ok(meta) = fs::symlink_metadata(&existing)
                        && meta.file_type().is_symlink()
                    {
                        return Err(boundary_violation(path));
                    }
                    if !existing.pop() {
                        return Err(boundary_violation(path));
                    }
                }
                Err(e) => return Err(CoreError::Io(e)),
            }
        }
    }

    fn require_target_level(
        &self,
        target: ExecutionTarget,
        auth: &AuthContext,
    ) -> Result<(), CoreError> {
        let req_level = match target {
            ExecutionTarget::Host => OperationLevel::Privileged,
            ExecutionTarget::Managed => OperationLevel::Modify,
        };
        self.permissions.require_level(auth, req_level)
    }

    pub fn list_dir(
        &self,
        path: &Path,
        target: ExecutionTarget,
        auth: &AuthContext,
    ) -> Result<Vec<FileMetadata>, CoreError> {
        self.permissions.require_level(auth, OperationLevel::Read)?;
        let resolved = self.resolve_path(path, target)?;
        if target == ExecutionTarget::Managed {
            self.verify_contained(&resolved)?;
        }

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
        if target == ExecutionTarget::Managed {
            self.verify_contained(&resolved)?;
        }
        fs::read(&resolved).map_err(CoreError::Io)
    }

    pub fn write_file(
        &self,
        path: &Path,
        content: &[u8],
        target: ExecutionTarget,
        auth: &AuthContext,
    ) -> Result<(), CoreError> {
        self.require_target_level(target, auth)?;

        let resolved = self.resolve_path(path, target)?;
        if target == ExecutionTarget::Managed {
            self.verify_contained(&resolved)?;
        }
        if let Some(parent) = resolved.parent() {
            fs::create_dir_all(parent)?;
        }

        // Write a unique sibling temp file and rename it into place so a
        // crash mid-write cannot leave a half-written file at the target.
        let tmp = resolved.with_file_name(format!(
            ".{}.tmp-{}-{}",
            resolved
                .file_name()
                .map_or_else(|| "file".to_string(), |n| n.to_string_lossy().to_string()),
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_or(0, |d| d.subsec_nanos()),
        ));

        let res = fs::write(&tmp, content).and_then(|()| fs::rename(&tmp, &resolved));
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
                if let Err(cleanup_err) = fs::remove_file(&tmp)
                    && cleanup_err.kind() != std::io::ErrorKind::NotFound
                {
                    warn!(
                        tmp = %tmp.display(),
                        error = %cleanup_err,
                        "failed to remove temp file after failed write"
                    );
                }
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
        self.require_target_level(target, auth)?;

        let resolved = self.resolve_path(path, target)?;
        if target == ExecutionTarget::Managed {
            self.verify_contained(&resolved)?;
        }

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
