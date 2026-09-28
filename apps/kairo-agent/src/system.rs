use kairo_protocol::v1::{
    ContainerAction, ContainerLogsResponse, DockerContainer, ListContainersResponse,
    ListServicesResponse, ManageContainerResponse, ManageServiceResponse, ServiceAction,
    SystemService,
};
use serde_json::Value;
use std::process::Command;
use thiserror::Error;
use tracing::{debug, warn};

#[derive(Debug, Error)]
pub enum SystemError {
    #[error("docker command failed: {0}")]
    Docker(String),

    #[error("systemd command failed: {0}")]
    Service(String),

    #[error("invalid argument: {0}")]
    InvalidArgument(String),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Default)]
pub struct SystemManager;

impl SystemManager {
    #[must_use]
    pub fn new() -> Self {
        Self
    }

    #[must_use]
    pub fn list_containers(&self, all: bool) -> ListContainersResponse {
        let mut cmd = Command::new("docker");
        cmd.arg("ps").arg("--format").arg("{{json .}}");
        if all {
            cmd.arg("--all");
        }

        let output = match cmd.output() {
            Ok(out) => out,
            Err(e) => {
                debug!(error = %e, "docker is not available or not in PATH");
                return ListContainersResponse {
                    containers: Vec::new(),
                    docker_available: false,
                };
            }
        };

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            debug!(stderr = %stderr, "docker ps returned non-zero exit code");
            return ListContainersResponse {
                containers: Vec::new(),
                docker_available: false,
            };
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut containers = Vec::new();

        for line in stdout.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            if let Ok(val) = serde_json::from_str::<Value>(line) {
                let id = val["ID"].as_str().unwrap_or("").to_string();
                let name = val["Names"].as_str().unwrap_or("").to_string();
                let image = val["Image"].as_str().unwrap_or("").to_string();
                let state = val["State"].as_str().unwrap_or("").to_string();
                let status = val["Status"].as_str().unwrap_or("").to_string();
                let ports_str = val["Ports"].as_str().unwrap_or("");
                let ports = if ports_str.is_empty() {
                    Vec::new()
                } else {
                    ports_str.split(',').map(|s| s.trim().to_string()).collect()
                };

                containers.push(DockerContainer {
                    id,
                    name,
                    image,
                    state,
                    status,
                    created_at: 0,
                    ports,
                });
            }
        }

        ListContainersResponse {
            containers,
            docker_available: true,
        }
    }

    pub fn manage_container(
        &self,
        container_id: &str,
        action: ContainerAction,
    ) -> Result<ManageContainerResponse, SystemError> {
        let action_str = match action {
            ContainerAction::Start => "start",
            ContainerAction::Stop => "stop",
            ContainerAction::Restart => "restart",
            _ => return Err(SystemError::InvalidArgument("unspecified action".into())),
        };

        let output = Command::new("docker")
            .arg(action_str)
            .arg(container_id)
            .output()?;

        if output.status.success() {
            Ok(ManageContainerResponse {
                success: true,
                message: format!("container {container_id} {action_str}ed successfully"),
            })
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            Ok(ManageContainerResponse {
                success: false,
                message: stderr,
            })
        }
    }

    pub fn container_logs(
        &self,
        container_id: &str,
        tail: u32,
    ) -> Result<ContainerLogsResponse, SystemError> {
        let tail_val = if tail == 0 { 100 } else { tail };
        let output = Command::new("docker")
            .arg("logs")
            .arg("--tail")
            .arg(tail_val.to_string())
            .arg(container_id)
            .output()?;

        let mut logs = String::from_utf8_lossy(&output.stdout).to_string();
        if logs.is_empty() && !output.stderr.is_empty() {
            logs = String::from_utf8_lossy(&output.stderr).to_string();
        }

        Ok(ContainerLogsResponse { logs })
    }

    #[must_use]
    pub fn list_services(&self) -> ListServicesResponse {
        let output = Command::new("systemctl")
            .args([
                "list-units",
                "--type=service",
                "--no-legend",
                "--no-pager",
                "--plain",
            ])
            .output();

        match output {
            Ok(out) if out.status.success() => {
                let stdout = String::from_utf8_lossy(&out.stdout);
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

                ListServicesResponse {
                    services,
                    systemd_available: true,
                }
            }
            _ => {
                warn!("systemctl not available on this platform or host");
                ListServicesResponse {
                    services: Vec::new(),
                    systemd_available: false,
                }
            }
        }
    }

    pub fn manage_service(
        &self,
        service_name: &str,
        action: ServiceAction,
    ) -> Result<ManageServiceResponse, SystemError> {
        let action_str = match action {
            ServiceAction::Start => "start",
            ServiceAction::Stop => "stop",
            ServiceAction::Restart => "restart",
            _ => return Err(SystemError::InvalidArgument("unspecified action".into())),
        };

        let output = Command::new("systemctl")
            .arg(action_str)
            .arg(service_name)
            .output()?;

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

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;

    #[test]
    fn test_list_containers_graceful_when_unavailable() {
        let manager = SystemManager::new();
        let resp = manager.list_containers(false);
        assert!(resp.docker_available || resp.containers.is_empty());
    }

    #[test]
    fn test_list_services_graceful_when_unavailable() {
        let manager = SystemManager::new();
        let resp = manager.list_services();
        assert!(resp.systemd_available || resp.services.is_empty());
    }

    #[test]
    fn test_invalid_action_rejected() {
        let manager = SystemManager::new();
        let err = manager
            .manage_container("test-id", ContainerAction::Unspecified)
            .unwrap_err();
        assert!(matches!(err, SystemError::InvalidArgument(_)));

        let s_err = manager
            .manage_service("test-service", ServiceAction::Unspecified)
            .unwrap_err();
        assert!(matches!(s_err, SystemError::InvalidArgument(_)));
    }
}
