use anyhow::Result;
use clap::Subcommand;
use kairo_core::{DotContext, KairoCore};

use crate::{Cli, emit, home_dir, operator_auth};

#[derive(Subcommand)]
pub enum DotsCommand {
    /// Save a profile directory (profile.json + files/) into the userspace.
    Save { dir: std::path::PathBuf },
    /// List saved profiles.
    List,
    /// Apply a profile to a home directory (--home, default: your home).
    Apply {
        name: String,
        /// Overwrite existing unmanaged files (they are backed up first).
        #[arg(long)]
        authorize_existing: bool,
        #[arg(long)]
        home: Option<std::path::PathBuf>,
        /// Extra template variables as key=value.
        #[arg(long = "var")]
        vars: Vec<String>,
    },
    /// Show drift between the last-applied profile and the home files.
    Drift { name: String },
    /// Restore the home files a profile last changed.
    Restore { name: String },
    /// Export a saved profile as a git repository.
    Export {
        name: String,
        #[arg(long)]
        to: std::path::PathBuf,
    },
    /// Import a profile from a git URL or local path.
    Import { source: String },
}

pub fn run(cli: &Cli, core: &KairoCore, command: &DotsCommand) -> Result<()> {
    let dots = core
        .dots()
        .ok_or_else(|| anyhow::anyhow!("the managed userspace is unavailable on this host"))?;
    let auth = operator_auth(core);

    match command {
        DotsCommand::Save { dir } => {
            let manifest_path = dir.join("profile.json");
            let bytes = std::fs::read(&manifest_path)
                .map_err(|e| anyhow::anyhow!("cannot read {}: {e}", manifest_path.display()))?;
            let profile: kairo_core::DotProfile = serde_json::from_slice(&bytes)
                .map_err(|e| anyhow::anyhow!("profile.json is invalid: {e}"))?;
            let files_root = dir.join("files");
            let mut payloads = BTreeMap::new();
            for spec in &profile.files {
                let payload = std::fs::read(files_root.join(&spec.path)).map_err(|e| {
                    anyhow::anyhow!(
                        "profile declares '{}' but {}: {e}",
                        spec.path,
                        files_root.join(&spec.path).display()
                    )
                })?;
                payloads.insert(spec.path.clone(), payload);
            }
            dots.save_profile(&profile, &payloads)?;
            if !cli.json {
                println!("saved {}", profile.name);
            }
            Ok(())
        }
        DotsCommand::List => {
            let profiles = dots.list_profiles()?;
            if cli.json {
                emit(cli, &profiles)?;
            } else if profiles.is_empty() {
                println!("no profiles");
            } else {
                for name in profiles {
                    println!("{name}");
                }
            }
            Ok(())
        }
        DotsCommand::Apply {
            name,
            authorize_existing,
            home,
            vars,
        } => {
            let home = home.clone().map_or_else(home_dir, Ok)?;
            let mut context_vars = BTreeMap::new();
            for entry in vars {
                let (key, value) = entry
                    .split_once('=')
                    .ok_or_else(|| anyhow::anyhow!("--var expects key=value, got '{entry}'"))?;
                context_vars.insert(key.to_string(), value.to_string());
            }
            let context = DotContext {
                home,
                vars: context_vars,
            };
            let report = dots.apply(name, &context, *authorize_existing, &auth)?;
            if cli.json {
                emit(cli, &report)?;
            } else {
                for file in &report.files {
                    println!(
                        "{:>10} {} {}",
                        format!("{:?}", file.action).to_lowercase(),
                        file.path,
                        file.detail
                    );
                }
                println!(
                    "{}",
                    if report.success {
                        "applied"
                    } else {
                        "CONFLICTS — nothing conflicting was changed"
                    }
                );
            }
            anyhow::ensure!(report.success, "dot profile application has conflicts");
            Ok(())
        }
        DotsCommand::Drift { name } => {
            let items = dots.drift(name)?;
            if cli.json {
                emit(cli, &items)?;
            } else if items.is_empty() {
                println!("in sync");
            } else {
                for item in items {
                    println!("drift: {item:?}");
                }
            }
            Ok(())
        }
        DotsCommand::Restore { name } => {
            let results = dots.restore(name, &auth)?;
            if cli.json {
                emit(cli, &results)?;
            } else {
                for file in &results {
                    println!(
                        "{:>8} {}",
                        format!("{:?}", file.action).to_lowercase(),
                        file.path
                    );
                }
            }
            anyhow::ensure!(
                results
                    .iter()
                    .all(|file| file.action == kairo_core::DotfileAction::Restored),
                "some files could not be restored"
            );
            Ok(())
        }
        DotsCommand::Export { name, to } => {
            let path = dots.export(name, to)?;
            if !cli.json {
                println!("exported to {}", path.display());
            }
            Ok(())
        }
        DotsCommand::Import { source } => {
            let name = dots.import(source, &auth)?;
            if !cli.json {
                println!("imported {name}");
            }
            Ok(())
        }
    }
}

use std::collections::BTreeMap;
