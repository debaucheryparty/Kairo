use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use crate::audit::{AuditLog, AuditSeverity};
use crate::auth::{AuthContext, OperationLevel, PermissionManager};
use crate::error::CoreError;
use crate::target::ExecutionTarget;
use kairo_bridge::PlatformAdapter;
use kairo_protocol::v1::{ManageServiceResponse, ServiceAction, SystemService};

#[derive(Debug, Clone)]
pub struct ManagedServiceDefinition {
    pub name: String,
    pub description: String,
    pub command: String,
    pub active: bool,
}

pub struct ServiceApi {
    adapter: Arc<dyn PlatformAdapter>,
    permissions: PermissionManager,
    audit: Arc<AuditLog>,
    managed_services: RwLock<HashMap<String, ManagedServiceDefinition>>,
}

impl ServiceApi {
    #[must_use]
    pub fn new(
        adapter: Arc<dyn PlatformAdapter>,
        permissions: PermissionManager,
        audit: Arc<AuditLog>,
    ) -> Self {
        let mut initial_managed = HashMap::new();
        initial_managed.insert(
            "kairo-agent".to_string(),
            ManagedServiceDefinition {
                name: "kairo-agent".to_string(),
                description: "Kairo Universal Operating Environment Agent".to_string(),
                command: "kairo-agent".to_string(),
                active: true,
            },
        );

        Self {
            adapter,
            permissions,
            audit,
            managed_services: RwLock::new(initial_managed),
        }
    }

    pub fn list_services(&self, target: ExecutionTarget) -> Result<Vec<SystemService>, CoreError> {
        match target {
            ExecutionTarget::Host => {
                let services = self.adapter.services().list_services()?;
                Ok(services)
            }
            ExecutionTarget::Managed => {
                let managed = self
                    .managed_services
                    .read()
                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                let list = managed
                    .values()
                    .map(|s| SystemService {
                        name: s.name.clone(),
                        description: s.description.clone(),
                        load_state: "loaded".to_string(),
                        active_state: if s.active {
                            "active".to_string()
                        } else {
                            "inactive".to_string()
                        },
                        sub_state: if s.active {
                            "running".to_string()
                        } else {
                            "dead".to_string()
                        },
                    })
                    .collect();
                Ok(list)
            }
        }
    }

    pub fn manage_service(
        &self,
        service_name: &str,
        action: ServiceAction,
        target: ExecutionTarget,
        auth: &AuthContext,
    ) -> Result<ManageServiceResponse, CoreError> {
        match target {
            ExecutionTarget::Host => {
                self.permissions
                    .require_level(auth, OperationLevel::Modify)?;

                let outcome = self.adapter.services().manage_service(service_name, action);
                match outcome {
                    Ok(resp) => {
                        self.audit.record(
                            &auth.actor_id,
                            ExecutionTarget::Host,
                            "service.manage",
                            AuditSeverity::Info,
                            resp.success,
                            &format!("host service {service_name} action {action:?}"),
                        );
                        Ok(resp)
                    }
                    Err(e) => {
                        self.audit.record(
                            &auth.actor_id,
                            ExecutionTarget::Host,
                            "service.manage",
                            AuditSeverity::Warning,
                            false,
                            &format!("failed host service {service_name}: {e}"),
                        );
                        Err(CoreError::Bridge(e))
                    }
                }
            }
            ExecutionTarget::Managed => {
                self.permissions
                    .require_level(auth, OperationLevel::Modify)?;

                let mut managed = self
                    .managed_services
                    .write()
                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                let service = managed.get_mut(service_name).ok_or_else(|| {
                    CoreError::NotFound(format!("managed service '{service_name}' not found"))
                })?;

                match action {
                    ServiceAction::Start | ServiceAction::Restart => {
                        service.active = true;
                    }
                    ServiceAction::Stop => {
                        service.active = false;
                    }
                    _ => {
                        return Err(CoreError::InvalidArgument("unspecified action".to_string()));
                    }
                }

                self.audit.record(
                    &auth.actor_id,
                    ExecutionTarget::Managed,
                    "service.manage",
                    AuditSeverity::Info,
                    true,
                    &format!("managed service {service_name} action {action:?}"),
                );

                Ok(ManageServiceResponse {
                    success: true,
                    message: format!("managed service {service_name} updated"),
                })
            }
        }
    }
}
