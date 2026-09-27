use bytes::Bytes;
use std::time::Duration;
use tracing::{debug, warn};

use crate::{Transport, TransportError, WebSocketTransport};

pub struct FallbackTransport {
    endpoints: Vec<String>,
    active_idx: usize,
    active_transport: Option<WebSocketTransport>,
    connect_timeout: Duration,
}

impl FallbackTransport {
    pub async fn connect(endpoints: Vec<String>) -> Result<Self, TransportError> {
        Self::connect_with_timeout(endpoints, Duration::from_secs(5)).await
    }

    pub async fn connect_with_timeout(
        endpoints: Vec<String>,
        connect_timeout: Duration,
    ) -> Result<Self, TransportError> {
        if endpoints.is_empty() {
            return Err(TransportError::ConnectionFailed(
                "no endpoints provided".to_string(),
            ));
        }

        let mut last_err = None;

        for (idx, endpoint) in endpoints.iter().enumerate() {
            debug!("attempting transport connection to {endpoint}");
            let connect_res =
                tokio::time::timeout(connect_timeout, WebSocketTransport::connect(endpoint)).await;

            match connect_res {
                Ok(Ok(transport)) => {
                    debug!("successfully connected to endpoint {endpoint}");
                    return Ok(Self {
                        endpoints,
                        active_idx: idx,
                        active_transport: Some(transport),
                        connect_timeout,
                    });
                }
                Ok(Err(e)) => {
                    warn!("failed to connect to {endpoint}: {e}");
                    last_err = Some(e);
                }
                Err(_) => {
                    warn!("connection to {endpoint} timed out after {connect_timeout:?}");
                    last_err = Some(TransportError::Timeout(connect_timeout));
                }
            }
        }

        Err(last_err.unwrap_or_else(|| {
            TransportError::ConnectionFailed("all endpoints failed to connect".to_string())
        }))
    }

    pub fn active_url(&self) -> Option<&str> {
        self.endpoints.get(self.active_idx).map(String::as_str)
    }

    pub fn is_fallback(&self) -> bool {
        self.active_idx > 0
    }

    pub async fn reconnect(&mut self) -> Result<(), TransportError> {
        if let Some(mut existing) = self.active_transport.take() {
            let _ = existing.close().await;
        }

        let mut last_err = None;

        for (idx, endpoint) in self.endpoints.iter().enumerate() {
            debug!("reconnecting: trying endpoint {endpoint}");
            let connect_res =
                tokio::time::timeout(self.connect_timeout, WebSocketTransport::connect(endpoint))
                    .await;

            match connect_res {
                Ok(Ok(transport)) => {
                    debug!("reconnected to endpoint {endpoint}");
                    self.active_idx = idx;
                    self.active_transport = Some(transport);
                    return Ok(());
                }
                Ok(Err(e)) => {
                    warn!("reconnect to {endpoint} failed: {e}");
                    last_err = Some(e);
                }
                Err(_) => {
                    warn!("reconnect to {endpoint} timed out");
                    last_err = Some(TransportError::Timeout(self.connect_timeout));
                }
            }
        }

        Err(last_err.unwrap_or_else(|| {
            TransportError::ConnectionFailed("reconnect failed on all endpoints".to_string())
        }))
    }
}

impl Transport for FallbackTransport {
    async fn send(&mut self, data: Bytes) -> Result<(), TransportError> {
        match self.active_transport.as_mut() {
            Some(t) => t.send(data).await,
            None => Err(TransportError::ConnectionClosed),
        }
    }

    async fn recv(&mut self) -> Result<Bytes, TransportError> {
        match self.active_transport.as_mut() {
            Some(t) => t.recv().await,
            None => Err(TransportError::ConnectionClosed),
        }
    }

    async fn close(&mut self) -> Result<(), TransportError> {
        if let Some(mut t) = self.active_transport.take() {
            t.close().await
        } else {
            Ok(())
        }
    }

    fn is_connected(&self) -> bool {
        self.active_transport
            .as_ref()
            .is_some_and(|t| t.is_connected())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_empty_endpoints_fails() {
        let res = FallbackTransport::connect(vec![]).await;
        assert!(res.is_err());
    }

    #[tokio::test]
    async fn test_all_invalid_endpoints_fails() {
        let res = FallbackTransport::connect_with_timeout(
            vec![
                "ws://127.0.0.1:59998".to_string(),
                "ws://127.0.0.1:59999".to_string(),
            ],
            Duration::from_millis(50),
        )
        .await;
        assert!(res.is_err());
    }
}
