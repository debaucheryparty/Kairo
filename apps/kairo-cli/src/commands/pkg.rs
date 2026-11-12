use anyhow::Result;
use clap::Subcommand;
use kairo_core::KairoCore;

use crate::{Cli, emit, operator_auth};

#[derive(Subcommand)]
pub enum PkgCommand {
    /// List installed packages.
    List {
        #[arg(long, default_value = "managed")]
        target: crate::TargetArg,
        filter: Option<String>,
    },
    /// Install managed packages from manifest files, or host packages by
    /// name through the native adapter.
    Install {
        #[arg(long, default_value = "managed")]
        target: crate::TargetArg,
        /// Manifest files (managed) or package names (host).
        items: Vec<String>,
    },
    /// Remove packages.
    Remove {
        #[arg(long, default_value = "managed")]
        target: crate::TargetArg,
        names: Vec<String>,
    },
    /// Restore the previous version of a managed package.
    Rollback { name: String },
}

pub async fn run(cli: &Cli, core: &KairoCore, command: &PkgCommand) -> Result<()> {
    let auth = operator_auth(core);
    match command {
        PkgCommand::List { target, filter } => {
            let target = target.resolve();
            let packages = core.packages().list_installed(filter.as_deref(), target)?;
            if cli.json {
                let values: Vec<serde_json::Value> = packages
                    .iter()
                    .map(|p| {
                        serde_json::json!({ "name": p.name, "version": p.version, "description": p.description })
                    })
                    .collect();
                emit(cli, &values)?;
            } else if packages.is_empty() {
                println!("no packages");
            } else {
                for package in packages {
                    println!(
                        "{:<24} {:<12} {}",
                        package.name, package.version, package.description
                    );
                }
            }
            Ok(())
        }
        PkgCommand::Install { target, items } => match target.resolve() {
            kairo_core::ExecutionTarget::Managed => {
                let manifests = items
                    .iter()
                    .map(|path| {
                        let bytes = std::fs::read(path)
                            .map_err(|e| anyhow::anyhow!("cannot read {}: {e}", path))?;
                        serde_json::from_slice::<kairo_core::PackageManifest>(&bytes)
                            .map_err(|e| anyhow::anyhow!("manifest {} is invalid: {e}", path))
                    })
                    .collect::<Result<Vec<_>>>()?;
                let response = core.packages().install_manifests(
                    &manifests,
                    kairo_core::ExecutionTarget::Managed,
                    &auth,
                )?;
                report_install(cli, &response)
            }
            kairo_core::ExecutionTarget::Host => {
                let names: Vec<&str> = items.iter().map(String::as_str).collect();
                let response =
                    core.packages()
                        .install(&names, kairo_core::ExecutionTarget::Host, &auth)?;
                report_install(cli, &response)
            }
        },
        PkgCommand::Remove { target, names } => {
            let names: Vec<&str> = names.iter().map(String::as_str).collect();
            let response = core.packages().remove(&names, target.resolve(), &auth)?;
            if cli.json {
                let value = serde_json::json!({ "success": response.success, "removed": response.removed_packages, "failed": response.failed_packages });
                emit(cli, &value)?;
            } else {
                for name in &response.removed_packages {
                    println!("removed {name}");
                }
                for name in &response.failed_packages {
                    println!("failed  {name}");
                }
            }
            anyhow::ensure!(response.success, "removal failed");
            Ok(())
        }
        PkgCommand::Rollback { name } => {
            let message =
                core.packages()
                    .rollback(name, kairo_core::ExecutionTarget::Managed, &auth)?;
            if cli.json {
                emit(
                    cli,
                    &serde_json::json!({ "rolled_back": name, "message": message }),
                )?;
            } else {
                println!("{message}");
            }
            Ok(())
        }
    }
}

fn report_install(cli: &Cli, response: &kairo_protocol::v1::InstallPackagesResponse) -> Result<()> {
    if cli.json {
        let value = serde_json::json!({
            "success": response.success,
            "installed": response.installed_packages,
            "failed": response.failed_packages,
        });
        emit(cli, &value)?;
    } else {
        for name in &response.installed_packages {
            println!("installed {name}");
        }
        for name in &response.failed_packages {
            println!("failed  {name}");
        }
    }
    anyhow::ensure!(response.success, "install failed");
    Ok(())
}
