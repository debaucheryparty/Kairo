use kairo_agent::{AgentConfig, Server};

use anyhow::Result;
use clap::Parser;

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

    #[arg(long)]
    log_dir: Option<String>,

    #[arg(long)]
    log_json: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    let mut config = AgentConfig {
        bind_address: cli.bind,
        no_auth: cli.no_auth,
        log_dir: cli.log_dir,
        log_json: cli.log_json,
        ..Default::default()
    };
    if let Some(dir) = cli.data_dir {
        config.data_dir = dir;
    }
    if let Some(token) = cli.auth_token {
        config.auth_token = Some(token);
    }

    let _logging =
        kairo_agent::logging::init(config.log_dir.as_deref(), config.log_json, &cli.log_level);

    let server = Server::new(config);
    server.run().await.map_err(|e| anyhow::anyhow!("{e}"))?;

    Ok(())
}
