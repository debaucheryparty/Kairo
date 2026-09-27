use std::sync::Arc;
use tokio::net::TcpListener;
use tokio_tungstenite::accept_async;
use tracing::{error, info, warn};

use crate::config::AgentConfig;
use crate::session::Session;

pub struct Server {
    config: Arc<AgentConfig>,
}

impl Server {
    #[must_use]
    pub fn new(config: AgentConfig) -> Self {
        Self {
            config: Arc::new(config),
        }
    }

    pub async fn run(self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let listener = TcpListener::bind(&self.config.bind_address).await?;
        info!(
            bind = %self.config.bind_address,
            data_dir = %self.config.data_dir,
            agent_id = %self.config.agent_id,
            "kairo-agent listener started"
        );

        loop {
            tokio::select! {
                accept_res = listener.accept() => {
                    let (tcp_stream, peer_addr) = match accept_res {
                        Ok(res) => res,
                        Err(e) => {
                            warn!(error = %e, "failed to accept tcp connection");
                            continue;
                        }
                    };

                    info!(peer = %peer_addr, "accepted tcp connection");

                    let config = Arc::clone(&self.config);
                    tokio::spawn(async move {
                        let ws_stream = match accept_async(tcp_stream).await {
                            Ok(ws) => ws,
                            Err(e) => {
                                warn!(peer = %peer_addr, error = %e, "websocket handshake failed");
                                return;
                            }
                        };

                        info!(peer = %peer_addr, "websocket connection established");

                        let mut session = Session::new(config);
                        if let Err(e) = session.run(ws_stream).await {
                            error!(
                                peer = %peer_addr,
                                session_id = %session.session_id(),
                                state = ?session.state(),
                                error = %e,
                                "session ended with error"
                            );
                        }
                    });
                }
                _ = tokio::signal::ctrl_c() => {
                    info!("received shutdown signal, shutting down kairo-agent listener");
                    break;
                }
            }
        }

        Ok(())
    }
}
