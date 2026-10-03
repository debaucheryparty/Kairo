use kairo_agent::{AgentConfig, Server};

use anyhow::Result;
use clap::Parser;
use tracing_subscriber::EnvFilter;

#[derive(Parser)]
#[command(name = "kairo-agent", about = "Kairo server-side agent")]
struct Cli {
    #[arg(long, default_value = "0.0.0.0:9600")]
    bind: String,

    #[arg(long, default_value = "info")]
    log_level: String,

    #[arg(long)]
    data_dir: Option<String>,

    #[arg(long)]
    auth_token: Option<String>,

    #[arg(long)]
    no_auth: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(&cli.log_level)),
        )
        .init();

    let mut config = AgentConfig {
        bind_address: cli.bind,
        no_auth: cli.no_auth,
        ..Default::default()
    };
    if let Some(dir) = cli.data_dir {
        config.data_dir = dir;
    }
    if let Some(token) = cli.auth_token {
        config.auth_token = Some(token);
    }

    let server = Server::new(config);
    server.run().await.map_err(|e| anyhow::anyhow!("{e}"))?;

    Ok(())
}
