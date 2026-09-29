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
use kairo_transport::tunnel::{ReverseTunnelClient, TunnelConfig, VirtualStream};

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

        let (tunnel_stream_tx, mut tunnel_stream_rx) = tokio::sync::mpsc::channel::<VirtualStream>(32);

        if let Some(tunnel_url) = &self.config.tunnel_url {
            let token = self
                .config
                .tunnel_token
                .clone()
                .or_else(|| self.config.auth_token.clone())
                .unwrap_or_default();
            let hostname = sysinfo::System::host_name().unwrap_or_else(|| "kairo-agent".to_string());
            let tunnel_cfg = TunnelConfig {
                relay_url: tunnel_url.clone(),
                agent_id: self.config.agent_id.to_string(),
                auth_token: token,
                hostname,
                keepalive_interval: Duration::from_secs(15),
            };
            let stream_sender = tunnel_stream_tx.clone();
            tokio::spawn(async move {
                let client = ReverseTunnelClient::new(tunnel_cfg);
                loop {
                    info!("starting reverse tunnel to relay");
                    if let Err(e) = client.run(stream_sender.clone()).await {
                        warn!("reverse tunnel connection ended: {e}, reconnecting in 5s");
                        tokio::time::sleep(Duration::from_secs(5)).await;
                    }
                }
            });
        }

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
                Some(vstream) = tunnel_stream_rx.recv() => {
                    info!(stream_id = vstream.stream_id, "accepted virtual tunnel stream");
                    let config = Arc::clone(&self.config);
                    let pty = Arc::clone(&self.pty);
                    let app = Arc::clone(&self.app);
                    let gpu = Arc::clone(&self.gpu);

                    tokio::spawn(async move {
                        let (v_sender, mut v_rx) = vstream.split();
                        let (client_duplex, server_duplex) = tokio::io::duplex(64 * 1024);
                        let (mut duplex_read, mut duplex_write) = tokio::io::split(client_duplex);

                        let pipe_to_vstream = tokio::spawn(async move {
                            use tokio::io::AsyncReadExt;
                            let mut buf = vec![0u8; 16384];
                            loop {
                                match duplex_read.read(&mut buf).await {
                                    Ok(0) => break,
                                    Ok(n) => {
                                        if v_sender.send(bytes::Bytes::copy_from_slice(&buf[..n])).await.is_err() {
                                            break;
                                        }
                                    }
                                    Err(_) => break,
                                }
                            }
                            let _ = v_sender.close().await;
                        });

                        let pipe_from_vstream = tokio::spawn(async move {
                            use tokio::io::AsyncWriteExt;
                            while let Some(chunk) = v_rx.recv().await {
                                if duplex_write.write_all(&chunk).await.is_err() {
                                    break;
                                }
                            }
                        });

                        let ws_stream = match accept_async(server_duplex).await {
                            Ok(ws) => ws,
                            Err(e) => {
                                warn!(error = %e, "tunnel virtual stream websocket handshake failed");
                                pipe_to_vstream.abort();
                                pipe_from_vstream.abort();
                                return;
                            }
                        };

                        let mut session = Session::with_components(config, pty, app, gpu);
                        let _ = session.run(ws_stream).await;
                        pipe_to_vstream.abort();
                        pipe_from_vstream.abort();
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
