pub mod dots;
pub mod pkg;
pub mod svc;

use std::path::Path;

use anyhow::Result;
use clap::Subcommand;
use kairo_core::{ApplyReport, ConfigDocument, KairoCore};

use crate::Cli;

fn load_document(path: &Path) -> Result<ConfigDocument> {
    let bytes = std::fs::read(path)
        .map_err(|e| anyhow::anyhow!("cannot read config document {}: {e}", path.display()))?;
    serde_json::from_slice(&bytes)
        .map_err(|e| anyhow::anyhow!("config document {} is invalid: {e}", path.display()))
}

pub mod status {
    use super::*;

    pub fn run(cli: &Cli) -> Result<()> {
        let core = crate::build_core(cli.data_dir.as_deref())?;
        let profile = core.system().profile();
        let userspace = core
            .userspace()
            .map(|space| space.root().to_string_lossy().to_string());

        if cli.json {
            let summary = serde_json::json!({
                "os": profile.os_pretty_name,
                "hostname": profile.hostname,
                "user": profile.username,
                "elevated": profile.is_elevated,
                "managed_userspace": userspace,
                "package_manager": core.system().capabilities().package_manager_name,
                "service_manager": core.system().capabilities().service_manager_name,
            });
            println!("{summary:#}");
            return Ok(());
        }

        println!("os:               {}", profile.os_pretty_name);
        println!("hostname:         {}", profile.hostname);
        println!("user:             {}", profile.username);
        println!("elevated:         {}", profile.is_elevated);
        println!(
            "managed userspace: {}",
            userspace.as_deref().unwrap_or("<unavailable>")
        );
        let caps = core.system().capabilities();
        println!("package manager:  {}", caps.package_manager_name);
        println!("service manager:  {}", caps.service_manager_name);
        Ok(())
    }
}

pub mod config {
    use super::*;

    #[derive(Subcommand)]
    pub enum ConfigCommand {
        /// Validate a config document without applying it.
        Validate { path: std::path::PathBuf },
        /// Show what would change without applying.
        Drift { path: std::path::PathBuf },
        /// Apply a config document (files, packages, services). File changes
        /// are rolled back if a later step fails.
        Apply { path: std::path::PathBuf },
    }

    pub async fn run(cli: &Cli, core: &KairoCore, command: &ConfigCommand) -> Result<()> {
        match command {
            ConfigCommand::Validate { path } => {
                let document = load_document(path)?;
                document.validate().map_err(|e| anyhow::anyhow!("{e}"))?;
                if !cli.json {
                    println!("ok");
                }
                Ok(())
            }
            ConfigCommand::Drift { path } => {
                let document = load_document(path)?;
                let items = kairo_core::config::drift(core, &document)?;
                if cli.json {
                    crate::emit(cli, &items)?;
                } else if items.is_empty() {
                    println!("in sync");
                } else {
                    for item in items {
                        println!("drift: {item:?}");
                    }
                }
                Ok(())
            }
            ConfigCommand::Apply { path } => {
                let document = load_document(path)?;
                let auth = crate::operator_auth(core);
                let report = kairo_core::config::apply(core, &document, &auth).await?;
                finish_apply(cli, report)
            }
        }
    }

    fn finish_apply(cli: &Cli, report: ApplyReport) -> Result<()> {
        if cli.json {
            crate::emit(cli, &report)?;
        } else {
            for step in &report.steps {
                println!(
                    "{:>8} {:<8} {}",
                    format!("{:?}", step.action).to_lowercase(),
                    step.kind,
                    step.name
                );
                if !step.detail.is_empty() {
                    println!("                 {}", step.detail);
                }
            }
            if report.success {
                println!("applied");
            } else {
                println!("FAILED");
            }
        }
        anyhow::ensure!(report.success, "configuration apply failed");
        Ok(())
    }
}
