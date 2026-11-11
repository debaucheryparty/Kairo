use crate::common::CommandRunner;
use crate::error::BridgeError;
use crate::traits::ServiceOps;
use kairo_protocol::v1::{ManageServiceResponse, ServiceAction, SystemService};
use std::sync::Arc;
use std::time::Duration;
use tracing::debug;

pub struct OpenRcServiceManager {
    runner: Arc<dyn CommandRunner>,
    sudo_prefix: bool,
}

impl OpenRcServiceManager {
    #[must_use]
    pub fn new(runner: Arc<dyn CommandRunner>, sudo_prefix: bool) -> Self {
        Self {
            runner,
            sudo_prefix,
        }
    }
}

impl ServiceOps for OpenRcServiceManager {
    fn manager_name(&self) -> &'static str {
        "openrc"
    }

    fn is_available(&self) -> bool {
        let res = self.runner.run(
            "rc-status",
            &["--version"],
            Duration::from_millis(1500),
            &[],
        );
        res.is_ok_and(|out| out.status.success())
    }

    fn list_services(&self) -> Result<Vec<SystemService>, BridgeError> {
        let output = self.runner.run(
            "rc-status",
            &["--all", "--servicelist"],
            Duration::from_secs(5),
            &[],
        )?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(BridgeError::ExecutionFailed(format!(
                "rc-status failed: {stderr}"
            )));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut services = Vec::new();

        for line in stdout.lines() {
            let trimmed = line.trim();
            if let Some(open) = trimmed.rfind('[')
                && let Some(close) = trimmed.rfind(']')
                && open < close
            {
                let name = trimmed[..open].trim().to_string();
                if name.is_empty() {
                    continue;
                }
                let status_token = trimmed[open + 1..close].trim();
                let is_started = status_token.eq_ignore_ascii_case("started");

                services.push(SystemService {
                    name,
                    description: "OpenRC managed service".to_string(),
                    load_state: "loaded".to_string(),
                    active_state: if is_started {
                        "active".to_string()
                    } else {
                        "inactive".to_string()
                    },
                    sub_state: status_token.to_string(),
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

        if service_name.is_empty()
            || !service_name
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        {
            return Err(BridgeError::ExecutionFailed(format!(
                "invalid service name: {service_name}"
            )));
        }

        debug!(
            service = service_name,
            action = action_str,
            "dispatching OpenRC service management"
        );

        let output = if self.sudo_prefix {
            self.runner.run(
                "sudo",
                &["-n", "rc-service", service_name, action_str],
                Duration::from_secs(10),
                &[],
            )?
        } else {
            self.runner.run(
                "rc-service",
                &[service_name, action_str],
                Duration::from_secs(10),
                &[],
            )?
        };

        if output.status.success() {
            Ok(ManageServiceResponse {
                success: true,
                message: format!("service {service_name} {action_str}ed successfully via openrc"),
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
