use crate::error::CoreError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum OperationLevel {
    Read,
    Modify,
    Privileged,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthContext {
    pub actor_id: String,
    pub is_elevated: bool,
    pub has_sudo: bool,
    pub confirmed: bool,
}

impl AuthContext {
    #[must_use]
    pub fn new(actor_id: impl Into<String>, is_elevated: bool, has_sudo: bool) -> Self {
        Self {
            actor_id: actor_id.into(),
            is_elevated,
            has_sudo,
            confirmed: false,
        }
    }

    #[must_use]
    pub fn with_confirmed(mut self, confirmed: bool) -> Self {
        self.confirmed = confirmed;
        self
    }

    #[must_use]
    pub fn is_privileged(&self) -> bool {
        self.is_elevated || (self.has_sudo && self.confirmed)
    }
}

#[derive(Debug, Default, Clone)]
pub struct PermissionManager;

impl PermissionManager {
    #[must_use]
    pub fn new() -> Self {
        Self
    }

    pub fn require_level(
        &self,
        auth: &AuthContext,
        required: OperationLevel,
    ) -> Result<(), CoreError> {
        match required {
            OperationLevel::Read => Ok(()),
            OperationLevel::Modify => {
                if auth.is_elevated || auth.has_sudo || auth.confirmed {
                    Ok(())
                } else {
                    Err(CoreError::PermissionDenied(format!(
                        "actor '{}' lacks modification authorization",
                        auth.actor_id
                    )))
                }
            }
            OperationLevel::Privileged => {
                if auth.is_privileged() {
                    Ok(())
                } else {
                    Err(CoreError::PermissionDenied(format!(
                        "actor '{}' lacks privileged authorization (elevated or confirmed sudo required)",
                        auth.actor_id
                    )))
                }
            }
        }
    }
}
