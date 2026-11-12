mod commands;

use anyhow::Result;
use clap::{Parser, Subcommand};
use kairo_core::KairoCore;

#[derive(Parser)]
#[command(name = "kairo", version, about = "Kairo operator CLI")]
pub struct Cli {
    /// Data directory holding the managed userspace (default: ~/.kairo).
    #[arg(long, global = true)]
    pub data_dir: Option<std::path::PathBuf>,
    /// Emit machine-readable JSON instead of formatted text.
    #[arg(long, global = true)]
    pub json: bool,
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Subcommand)]
pub enum Command {
    /// Show the managed userspace summary.
    Status,
    /// Declarative configuration documents.
    Config {
        #[command(subcommand)]
        command: commands::config::ConfigCommand,
    },
    /// Managed and host packages.
    Pkg {
        #[command(subcommand)]
        command: commands::pkg::PkgCommand,
    },
    /// Managed services.
    Svc {
        #[command(subcommand)]
        command: commands::svc::SvcCommand,
    },
    /// Dotfile profiles.
    Dots {
        #[command(subcommand)]
        command: commands::dots::DotsCommand,
    },
}

pub fn build_core(data_dir: Option<&std::path::Path>) -> Result<KairoCore> {
    let data_dir = match data_dir {
        Some(dir) => dir.to_path_buf(),
        None => home_dir()?.join(".kairo"),
    };
    let profile = kairo_discovery::discover();
    let bridge = std::sync::Arc::new(kairo_bridge::PlatformBridge::from_profile(&profile));
    Ok(KairoCore::new(
        bridge,
        profile,
        kairo_core::CoreConfig {
            data_dir: data_dir.to_string_lossy().to_string(),
            audit_capacity: 1000,
        },
    ))
}

pub fn home_dir() -> Result<std::path::PathBuf> {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(std::path::PathBuf::from)
        .map_err(|_| anyhow::anyhow!("cannot determine the home directory"))
}

pub fn operator_auth(core: &KairoCore) -> kairo_core::AuthContext {
    let profile = core.system().profile();
    kairo_core::AuthContext::new("cli", profile.is_elevated, profile.has_sudo).with_confirmed(true)
}

pub fn emit(cli: &Cli, value: &impl serde::Serialize) -> Result<()> {
    if cli.json {
        let text = serde_json::to_string_pretty(value)
            .map_err(|e| anyhow::anyhow!("cannot serialize report: {e}"))?;
        println!("{text}");
    }
    Ok(())
}

#[derive(Clone, Copy)]
pub enum TargetArg {
    Managed,
    Host,
}

impl TargetArg {
    pub fn resolve(self) -> kairo_core::ExecutionTarget {
        match self {
            Self::Managed => kairo_core::ExecutionTarget::Managed,
            Self::Host => kairo_core::ExecutionTarget::Host,
        }
    }
}

impl std::str::FromStr for TargetArg {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, String> {
        match value {
            "managed" => Ok(Self::Managed),
            "host" => Ok(Self::Host),
            other => Err(format!(
                "invalid target '{other}' (expected managed or host)"
            )),
        }
    }
}

#[derive(Clone, Copy)]
pub enum SvcActionArg {
    Start,
    Stop,
    Restart,
}

impl SvcActionArg {
    pub fn resolve(self) -> kairo_protocol::v1::ServiceAction {
        match self {
            Self::Start => kairo_protocol::v1::ServiceAction::Start,
            Self::Stop => kairo_protocol::v1::ServiceAction::Stop,
            Self::Restart => kairo_protocol::v1::ServiceAction::Restart,
        }
    }
}

impl std::str::FromStr for SvcActionArg {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, String> {
        match value {
            "start" => Ok(Self::Start),
            "stop" => Ok(Self::Stop),
            "restart" => Ok(Self::Restart),
            other => Err(format!(
                "invalid action '{other}' (expected start, stop or restart)"
            )),
        }
    }
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let code = match run(&cli).await {
        Ok(()) => 0,
        Err(e) => {
            eprintln!("error: {e:#}");
            1
        }
    };
    std::process::exit(code);
}

async fn run(cli: &Cli) -> Result<()> {
    match &cli.command {
        Command::Status => commands::status::run(cli),
        Command::Config { command } => {
            let core = build_core(cli.data_dir.as_deref())?;
            commands::config::run(cli, &core, command).await
        }
        Command::Pkg { command } => {
            let core = build_core(cli.data_dir.as_deref())?;
            commands::pkg::run(cli, &core, command).await
        }
        Command::Svc { command } => {
            let core = build_core(cli.data_dir.as_deref())?;
            commands::svc::run(cli, &core, command).await
        }
        Command::Dots { command } => {
            let core = build_core(cli.data_dir.as_deref())?;
            commands::dots::run(cli, &core, command)
        }
    }
}
