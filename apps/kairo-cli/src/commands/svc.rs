use anyhow::Result;
use clap::Subcommand;
use kairo_core::KairoCore;

use crate::{Cli, emit, operator_auth};

#[derive(Subcommand)]
pub enum SvcCommand {
    /// List services (managed definitions or host services).
    List {
        #[arg(long, default_value = "managed")]
        target: crate::TargetArg,
    },
    /// Define or replace a managed service from a spec file.
    Define { path: std::path::PathBuf },
    /// Start a managed service.
    Start { name: String },
    /// Stop a managed service.
    Stop { name: String },
    /// Remove a managed service definition (must be stopped).
    Remove { name: String },
    /// Manage a host service through the native init system.
    Host {
        action: crate::SvcActionArg,
        name: String,
    },
}

pub async fn run(cli: &Cli, core: &KairoCore, command: &SvcCommand) -> Result<()> {
    let auth = operator_auth(core);
    match command {
        SvcCommand::List { target } => {
            let services = core.services().list_services(target.resolve())?;
            if cli.json {
                let values: Vec<serde_json::Value> = services
                    .iter()
                    .map(|s| {
                        serde_json::json!({ "name": s.name, "state": s.active_state, "description": s.description })
                    })
                    .collect();
                emit(cli, &values)?;
            } else if services.is_empty() {
                println!("no services");
            } else {
                for service in services {
                    println!(
                        "{:<28} {:<10} {}",
                        service.name, service.active_state, service.description
                    );
                }
            }
            Ok(())
        }
        SvcCommand::Define { path } => {
            let bytes = std::fs::read(path)
                .map_err(|e| anyhow::anyhow!("cannot read service spec {}: {e}", path.display()))?;
            let spec: kairo_core::ManagedServiceSpec = serde_json::from_slice(&bytes)
                .map_err(|e| anyhow::anyhow!("service spec is invalid: {e}"))?;
            core.services().define_managed_service(spec, &auth)?;
            if !cli.json {
                println!("defined");
            }
            Ok(())
        }
        SvcCommand::Start { name } => {
            // Supervision lives in the long-running agent process; a one-shot
            // CLI process cannot keep restart policies or state alive.
            anyhow::bail!(
                "services are supervised by the running kairo-agent; define '{}' here and start it through the agent",
                name
            );
        }
        SvcCommand::Stop { name } => {
            anyhow::bail!(
                "services are supervised by the running kairo-agent; stop '{}' through the agent",
                name
            );
        }
        SvcCommand::Remove { name } => {
            core.services().remove_managed_service(name, &auth)?;
            if !cli.json {
                println!("removed {name}");
            }
            Ok(())
        }
        SvcCommand::Host { action, name } => {
            let response = core
                .services()
                .manage_service(
                    name,
                    action.resolve(),
                    kairo_core::ExecutionTarget::Host,
                    &auth,
                )
                .await?;
            if cli.json {
                let value =
                    serde_json::json!({ "success": response.success, "message": response.message });
                emit(cli, &value)?;
            } else {
                println!("{}", response.message);
            }
            anyhow::ensure!(response.success, "host service operation failed");
            Ok(())
        }
    }
}
