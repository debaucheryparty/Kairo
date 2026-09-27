use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpStream;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async, tungstenite::Message};
use tracing::debug;

use crate::{Transport, TransportError};

pub struct WebSocketTransport {
    stream: WebSocketStream<MaybeTlsStream<TcpStream>>,
    connected: bool,
}

impl WebSocketTransport {
    pub async fn connect(url: &str) -> Result<Self, TransportError> {
        let (stream, _response) = connect_async(url)
            .await
            .map_err(|e| TransportError::ConnectionFailed(e.to_string()))?;

        debug!("websocket connected to {url}");

        Ok(Self {
            stream,
            connected: true,
        })
    }
}

impl Transport for WebSocketTransport {
    async fn send(&mut self, data: Bytes) -> Result<(), TransportError> {
        if !self.connected {
            return Err(TransportError::ConnectionClosed);
        }

        self.stream
            .send(Message::Binary(data))
            .await
            .map_err(|e| TransportError::SendFailed(e.to_string()))
    }

    async fn recv(&mut self) -> Result<Bytes, TransportError> {
        loop {
            if !self.connected {
                return Err(TransportError::ConnectionClosed);
            }

            let msg = self
                .stream
                .next()
                .await
                .ok_or(TransportError::ConnectionClosed)?
                .map_err(|e| TransportError::ReceiveFailed(e.to_string()))?;

            match msg {
                Message::Binary(data) => return Ok(data),
                Message::Close(_) => {
                    self.connected = false;
                    return Err(TransportError::ConnectionClosed);
                }
                _ => continue,
            }
        }
    }

    async fn close(&mut self) -> Result<(), TransportError> {
        self.connected = false;
        self.stream
            .close(None)
            .await
            .map_err(|e| TransportError::SendFailed(e.to_string()))
    }

    fn is_connected(&self) -> bool {
        self.connected
    }
}
