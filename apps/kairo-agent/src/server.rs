use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::net::TcpListener;
use tokio_tungstenite::accept_async;
use tracing::{error, info, warn};

use crate::app_manager::AppManager;
use crate::config::AgentConfig;
use crate::gpu::GpuManager;
use crate::pty::PtyManager;
use crate::session::{Session, SessionError};

struct RateLimiter {
    attempts: Mutex<HashMap<IpAddr, (u32, Instant)>>,
    max_attempts: u32,
    window: Duration,
    lockout: Duration,
}

impl RateLimiter {
    fn new(max_attempts: u32, window: Duration, lockout: Duration) -> Self {
        Self {
            attempts: Mutex::new(HashMap::new()),
            max_attempts,
            window,
            lockout,
        }
    }

    fn is_allowed(&self, ip: &IpAddr) -> bool {
        let Ok(mut map) = self.attempts.lock() else {
            return true;
        };
        let now = Instant::now();
        map.retain(|_, (_, time)| now.duration_since(*time) < self.lockout);

        if let Some((count, time)) = map.get(ip) {
            return *count < self.max_attempts || now.duration_since(*time) >= self.lockout;
        }
        true
    }

    fn record_failure(&self, ip: IpAddr) {
        let Ok(mut map) = self.attempts.lock() else {
            return;
        };
        let now = Instant::now();
        let entry = map.entry(ip).or_insert((0, now));
        if now.duration_since(entry.1) > self.window {
            entry.0 = 1;
            entry.1 = now;
        } else {
            entry.0 += 1;
            entry.1 = now;
        }
    }

    fn record_success(&self, ip: &IpAddr) {
        let Ok(mut map) = self.attempts.lock() else {
            return;
        };
        map.remove(ip);
    }
}

pub struct Server {
    config: Arc<AgentConfig>,
    pty: Arc<PtyManager>,
    app: Arc<AppManager>,
    gpu: Arc<GpuManager>,
    limiter: Arc<RateLimiter>,
}

impl Server {
    #[must_use]
    pub fn new(mut config: AgentConfig) -> Self {
        if config.auth_token.is_none() {
            config.auth_token = config.resolved_auth_token();
        }
        Self {
            config: Arc::new(config),
            pty: Arc::new(PtyManager::new()),
            app: Arc::new(AppManager::new()),
            gpu: Arc::new(GpuManager::new()),
            limiter: Arc::new(RateLimiter::new(
                5,
                Duration::from_secs(60),
                Duration::from_secs(300),
            )),
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

                    if !self.limiter.is_allowed(&peer_addr.ip()) {
                        warn!(peer = %peer_addr, "dropping connection from rate-limited peer");
                        continue;
                    }

                    info!(peer = %peer_addr, "accepted tcp connection");

                    let config = Arc::clone(&self.config);
                    let pty = Arc::clone(&self.pty);
                    let app = Arc::clone(&self.app);
                    let gpu = Arc::clone(&self.gpu);
                    let limiter = Arc::clone(&self.limiter);
                    tokio::spawn(async move {
                        let ws_stream = match accept_async(tcp_stream).await {
                            Ok(ws) => ws,
                            Err(e) => {
                                warn!(peer = %peer_addr, error = %e, "websocket handshake failed");
                                return;
                            }
                        };

                        info!(peer = %peer_addr, "websocket connection established");

                        let mut session = Session::with_components(config, pty, app, gpu);
                        match session.run(ws_stream).await {
                            Ok(()) => {
                                limiter.record_success(&peer_addr.ip());
                            }
                            Err(e) => {
                                if matches!(e, SessionError::AuthenticationFailed) {
                                    limiter.record_failure(peer_addr.ip());
                                }
                                error!(
                                    peer = %peer_addr,
                                    session_id = %session.session_id(),
                                    state = ?session.state(),
                                    error = %e,
                                    "session ended with error"
                                );
                            }
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
