use std::sync::Arc;

use crate::audit::{AuditLog, AuditSeverity};
use crate::auth::{AuthContext, OperationLevel, PermissionManager};
use crate::error::CoreError;
use crate::runtime::{ManagedServiceSpec, ServiceState, ServiceStatus, ServiceSupervisor};
use crate::target::ExecutionTarget;
use kairo_bridge::PlatformAdapter;
use kairo_protocol::v1::{ManageServiceResponse, ServiceAction, SystemService};

pub struct ServiceApi {
    adapter: Arc<dyn PlatformAdapter>,
    permissions: PermissionManager,
    audit: Arc<AuditLog>,
    supervisor: Option<Arc<ServiceSupervisor>>,
}

impl ServiceApi {
    #[must_use]
    pub fn new(
        adapter: Arc<dyn PlatformAdapter>,
        permissions: PermissionManager,
        audit: Arc<AuditLog>,
        supervisor: Option<Arc<ServiceSupervisor>>,
    ) -> Self {
        Self {
            adapter,
            permissions,
            audit,
            supervisor,
        }
    }

    fn supervisor(&self) -> Result<&ServiceSupervisor, CoreError> {
        self.supervisor.as_deref().ok_or_else(|| {
            CoreError::TargetUnsupported(
                "the managed userspace is unavailable on this host".to_string(),
            )
        })
    }

    pub fn list_services(&self, target: ExecutionTarget) -> Result<Vec<SystemService>, CoreError> {
        match target {
            ExecutionTarget::Host => Ok(self.adapter.services().list_services()?),
            ExecutionTarget::Managed => {
                let statuses: Vec<ServiceStatus> = self.supervisor()?.list().into_iter().collect();
                Ok(statuses
                    .into_iter()
                    .map(|status| SystemService {
                        name: status.name,
                        description: status.description,
                        load_state: "managed".to_string(),
                        active_state: match status.state {
                            ServiceState::Running => "active".to_string(),
                            ServiceState::Stopped => "inactive".to_string(),
                            ServiceState::Exited => "exited".to_string(),
                            ServiceState::Failed => "failed".to_string(),
                        },
                        sub_state: status.pid.map_or_else(String::new, |pid| pid.to_string()),
                    })
                    .collect())
            }
        }
    }

    pub async fn manage_service(
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
                let supervisor = self.supervisor()?;

                let result = match action {
                    ServiceAction::Start | ServiceAction::Restart => {
                        supervisor.start_service(service_name).await
                    }
                    ServiceAction::Stop => supervisor.stop_service(service_name).await,
                    ServiceAction::Unspecified => Err(CoreError::InvalidArgument(
                        "unspecified service action".to_string(),
                    )),
                };

                match result {
                    Ok(()) => {
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
                    Err(e) => {
                        self.audit.record(
                            &auth.actor_id,
                            ExecutionTarget::Managed,
                            "service.manage",
                            AuditSeverity::Warning,
                            false,
                            &format!("failed managed service {service_name}: {e}"),
                        );
                        Err(e)
                    }
                }
            }
        }
    }

    pub fn define_managed_service(
        &self,
        spec: ManagedServiceSpec,
        auth: &AuthContext,
    ) -> Result<(), CoreError> {
        self.permissions
            .require_level(auth, OperationLevel::Modify)?;
        let supervisor = self.supervisor()?;
        supervisor.define_service(spec)?;
        self.audit.record(
            &auth.actor_id,
            ExecutionTarget::Managed,
            "service.define",
            AuditSeverity::Info,
            true,
            "managed service definition updated",
        );
        Ok(())
    }

    pub fn remove_managed_service(&self, name: &str, auth: &AuthContext) -> Result<(), CoreError> {
        self.permissions
            .require_level(auth, OperationLevel::Modify)?;
        let supervisor = self.supervisor()?;
        supervisor.remove_service(name)?;
        self.audit.record(
            &auth.actor_id,
            ExecutionTarget::Managed,
            "service.remove",
            AuditSeverity::Info,
            true,
            &format!("managed service {name} removed"),
        );
        Ok(())
    }

    #[must_use]
    pub fn managed_status(&self) -> Vec<ServiceStatus> {
        self.supervisor
            .as_deref()
            .map(ServiceSupervisor::list)
            .unwrap_or_default()
    }

    /// Starts persisted services flagged for autostart; called once per
    /// agent process at startup.
    pub async fn start_autostart_services(&self) -> Result<Vec<String>, CoreError> {
        self.supervisor()?.start_autostart().await
    }
}
