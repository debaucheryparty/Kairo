mod config;

use anyhow::Result;
use clap::Parser;
use tracing::info;
use tracing_subscriber::EnvFilter;

#[derive(Parser)]
#[command(name = "kairo-agent", about = "Kairo server-side agent")]
struct Cli {
    #[arg(long, default_value = "0.0.0.0:9600")]
    bind: String,

    #[arg(long, default_value = "info")]
    log_level: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(&cli.log_level)),
        )
        .init();

    let config = config::AgentConfig {
        bind_address: cli.bind,
        ..Default::default()
    };

    info!(
        bind = %config.bind_address,
        data_dir = %config.data_dir,
        "kairo-agent starting"
    );
    info!("kairo-agent ready");

    Ok(())
}
