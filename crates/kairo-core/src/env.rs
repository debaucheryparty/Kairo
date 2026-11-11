use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use crate::audit::{AuditLog, AuditSeverity};
use crate::auth::{AuthContext, OperationLevel, PermissionManager};
use crate::error::CoreError;
use crate::target::ExecutionTarget;

const RESERVED_VARS: &[&str] = &["PATH", "KAIRO_ROOT", "KAIRO_VERSION", "KAIRO_DATA_DIR"];

pub struct EnvironmentApi {
    variables: RwLock<HashMap<String, String>>,
    permissions: PermissionManager,
    audit: Arc<AuditLog>,
}

impl EnvironmentApi {
    #[must_use]
    pub fn new(permissions: PermissionManager, audit: Arc<AuditLog>) -> Self {
        let mut initial = HashMap::new();
        initial.insert(
            "KAIRO_VERSION".to_string(),
            env!("CARGO_PKG_VERSION").to_string(),
        );
        initial.insert("KAIRO_MANAGED".to_string(), "1".to_string());

        Self {
            variables: RwLock::new(initial),
            permissions,
            audit,
        }
    }

    #[must_use]
    pub fn get(&self, key: &str) -> Option<String> {
        let vars = self
            .variables
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        vars.get(key).cloned()
    }

    pub fn set(&self, key: &str, val: &str, auth: &AuthContext) -> Result<(), CoreError> {
        let is_reserved = RESERVED_VARS.iter().any(|&r| r.eq_ignore_ascii_case(key));
        if is_reserved {
            self.permissions
                .require_level(auth, OperationLevel::Privileged)?;
        } else {
            self.permissions
                .require_level(auth, OperationLevel::Modify)?;
        }

        let mut vars = self
            .variables
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        vars.insert(key.to_string(), val.to_string());

        self.audit.record(
            &auth.actor_id,
            ExecutionTarget::Managed,
            "env.set",
            AuditSeverity::Info,
            true,
            &format!("set env variable {key}"),
        );

        Ok(())
    }

    pub fn remove(&self, key: &str, auth: &AuthContext) -> Result<(), CoreError> {
        let is_reserved = RESERVED_VARS.iter().any(|&r| r.eq_ignore_ascii_case(key));
        if is_reserved {
            return Err(CoreError::InvalidArgument(format!(
                "cannot remove reserved variable '{key}'"
            )));
        }

        self.permissions
            .require_level(auth, OperationLevel::Modify)?;

        let mut vars = self
            .variables
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let removed = vars.remove(key).is_some();

        self.audit.record(
            &auth.actor_id,
            ExecutionTarget::Managed,
            "env.remove",
            AuditSeverity::Info,
            removed,
            &format!("remove env variable {key}"),
        );

        Ok(())
    }

    #[must_use]
    pub fn list(&self) -> HashMap<String, String> {
        let vars = self
            .variables
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        vars.clone()
    }
}
