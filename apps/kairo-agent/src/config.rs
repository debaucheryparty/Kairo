use std::fmt;
use std::fs;
use std::path::Path;
use kairo_common::KairoId;
use serde::Deserialize;

#[derive(Clone, Deserialize)]
pub struct AgentConfig {
    pub bind_address: String,
    pub data_dir: String,
    pub agent_id: KairoId,
    pub auth_token: Option<String>,
    pub tls_cert: Option<String>,
    pub tls_key: Option<String>,
    pub tunnel_url: Option<String>,
    pub tunnel_token: Option<String>,
}

impl AgentConfig {
    #[must_use]
    pub fn resolved_auth_token(&self) -> Option<String> {
        if let Some(token) = &self.auth_token {
            let trimmed = token.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }

        let token_path = Path::new(&self.data_dir).join("token");
        if let Ok(content) = fs::read_to_string(&token_path) {
            let trimmed = content.trim().to_string();
            if !trimmed.is_empty() {
                return Some(trimmed);
            }
        }

        let token = format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        );

        if let Some(parent) = token_path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        #[cfg(unix)]
        {
            use std::io::Write;
            use std::os::unix::fs::OpenOptionsExt;
            if let Ok(mut file) = fs::OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .mode(0o600)
                .open(&token_path)
            {
                let _ = file.write_all(token.as_bytes());
            }
        }

        #[cfg(not(unix))]
        {
            let _ = fs::write(&token_path, token.as_bytes());
        }

        Some(token)
    }
}

impl fmt::Debug for AgentConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("AgentConfig")
            .field("bind_address", &self.bind_address)
            .field("data_dir", &self.data_dir)
            .field("agent_id", &self.agent_id)
            .field("auth_token", &self.auth_token.as_ref().map(|_| "[REDACTED]"))
            .field("tls_cert", &self.tls_cert)
            .field("tls_key", &self.tls_key.as_ref().map(|_| "[REDACTED]"))
            .field("tunnel_url", &self.tunnel_url)
            .field("tunnel_token", &self.tunnel_token.as_ref().map(|_| "[REDACTED]"))
            .finish()
    }
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            bind_address: "0.0.0.0:9600".to_string(),
            data_dir: "/var/lib/kairo".to_string(),
            agent_id: KairoId::new(),
            auth_token: None,
            tls_cert: None,
            tls_key: None,
            tunnel_url: None,
            tunnel_token: None,
        }
    }
}
