use std::sync::Arc;

use crate::audit::{AuditLog, AuditSeverity};
use crate::auth::{AuthContext, OperationLevel, PermissionManager};
use crate::error::CoreError;
use crate::target::ExecutionTarget;
use kairo_bridge::PlatformAdapter;
use kairo_protocol::v1::ProcessInfo;

pub struct ProcessApi {
    adapter: Arc<dyn PlatformAdapter>,
    permissions: PermissionManager,
    audit: Arc<AuditLog>,
}

impl ProcessApi {
    #[must_use]
    pub fn new(
        adapter: Arc<dyn PlatformAdapter>,
        permissions: PermissionManager,
        audit: Arc<AuditLog>,
    ) -> Self {
        Self {
            adapter,
            permissions,
            audit,
        }
    }

    pub fn list_processes(&self, target: ExecutionTarget) -> Result<Vec<ProcessInfo>, CoreError> {
        let procs = self.adapter.processes().list_processes()?;
        match target {
            ExecutionTarget::Host => Ok(procs),
            ExecutionTarget::Managed => {
                // In M3 managed processes are those executed within Kairo sessions or data directories
                // Filtering will expand in M4 with namespace / cgroup association
                Ok(procs)
            }
        }
    }

    pub fn inspect_process(&self, pid: u32) -> Result<ProcessInfo, CoreError> {
        let procs = self.adapter.processes().list_processes()?;
        procs
            .into_iter()
            .find(|p| p.pid == pid)
            .ok_or_else(|| CoreError::NotFound(format!("process {pid} not found")))
    }

    pub fn terminate_process(
        &self,
        pid: u32,
        signal: i32,
        auth: &AuthContext,
    ) -> Result<(), CoreError> {
        self.permissions
            .require_level(auth, OperationLevel::Modify)?;

        let outcome = self.adapter.processes().kill_process(pid, signal);
        match outcome {
            Ok(()) => {
                self.audit.record(
                    &auth.actor_id,
                    ExecutionTarget::Host,
                    "process.terminate",
                    AuditSeverity::Warning,
                    true,
                    &format!("terminated pid {pid} with signal {signal}"),
                );
                Ok(())
            }
            Err(e) => {
                self.audit.record(
                    &auth.actor_id,
                    ExecutionTarget::Host,
                    "process.terminate",
                    AuditSeverity::Warning,
                    false,
                    &format!("failed to terminate pid {pid}: {e}"),
                );
                Err(CoreError::Bridge(e))
            }
        }
    }
}
