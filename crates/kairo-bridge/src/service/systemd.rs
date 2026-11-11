use crate::common::CommandRunner;
use crate::error::BridgeError;
use crate::traits::ServiceOps;
use kairo_protocol::v1::{ManageServiceResponse, ServiceAction, SystemService};
use std::sync::Arc;
use std::time::Duration;
use tracing::debug;

pub struct SystemdServiceManager {
    runner: Arc<dyn CommandRunner>,
    sudo_prefix: bool,
}

impl SystemdServiceManager {
    #[must_use]
    pub fn new(runner: Arc<dyn CommandRunner>, sudo_prefix: bool) -> Self {
        Self {
            runner,
            sudo_prefix,
        }
    }
}

impl ServiceOps for SystemdServiceManager {
    fn manager_name(&self) -> &'static str {
        "systemd"
    }

    fn is_available(&self) -> bool {
        let res = self.runner.run(
            "systemctl",
            &["--version"],
            Duration::from_millis(1500),
            &[],
        );
        res.is_ok_and(|out| out.status.success())
    }

    fn list_services(&self) -> Result<Vec<SystemService>, BridgeError> {
        let output = self.runner.run(
            "systemctl",
            &[
                "list-units",
                "--type=service",
                "--no-legend",
                "--no-pager",
                "--plain",
            ],
            Duration::from_secs(5),
            &[],
        )?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(BridgeError::ExecutionFailed(format!(
                "systemctl list-units failed: {stderr}"
            )));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut services = Vec::new();

        for line in stdout.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 4 {
                let name = parts[0].to_string();
                let load_state = parts[1].to_string();
                let active_state = parts[2].to_string();
                let sub_state = parts[3].to_string();
                let description = if parts.len() > 4 {
                    parts[4..].join(" ")
                } else {
                    String::new()
                };

                services.push(SystemService {
                    name,
                    description,
                    load_state,
                    active_state,
                    sub_state,
                });
            }
        }

        Ok(services)
    }

    fn manage_service(
        &self,
        service_name: &str,
        action: ServiceAction,
    ) -> Result<ManageServiceResponse, BridgeError> {
        let action_str = match action {
            ServiceAction::Start => "start",
            ServiceAction::Stop => "stop",
            ServiceAction::Restart => "restart",
            _ => {
                return Err(BridgeError::ExecutionFailed(
                    "unspecified service action".into(),
                ));
            }
        };

        // Validate service name: only alphanumeric, -, _, @, ., /
        if service_name.is_empty()
            || !service_name
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '@' | '.' | '/'))
        {
            return Err(BridgeError::ExecutionFailed(format!(
                "invalid service name: {service_name}"
            )));
        }

        debug!(
            service = service_name,
            action = action_str,
            "dispatching systemd service management"
        );

        let output = if self.sudo_prefix {
            self.runner.run(
                "sudo",
                &["-n", "systemctl", action_str, service_name],
                Duration::from_secs(10),
                &[],
            )?
        } else {
            self.runner.run(
                "systemctl",
                &[action_str, service_name],
                Duration::from_secs(10),
                &[],
            )?
        };

        if output.status.success() {
            Ok(ManageServiceResponse {
                success: true,
                message: format!("service {service_name} {action_str}ed successfully"),
            })
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            Ok(ManageServiceResponse {
                success: false,
                message: stderr,
            })
        }
    }
}
