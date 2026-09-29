use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use prost::Message;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message as WsMessage;
use tracing::{info, warn};

use crate::TransportError;
use kairo_protocol::v1::{
    TunnelHeartbeat, TunnelRegisterRequest, TunnelRegisterResponse, TunnelStreamFrame,
};
use kairo_protocol::{KairoMessage, MessageKind, Opcode};

#[derive(Clone, Debug)]
pub struct TunnelConfig {
    pub relay_url: String,
    pub agent_id: String,
    pub auth_token: String,
    pub hostname: String,
    pub keepalive_interval: Duration,
}

pub struct VirtualStream {
    pub stream_id: u64,
    pub incoming_rx: mpsc::Receiver<Bytes>,
    outbound_tx: mpsc::Sender<TunnelStreamFrame>,
}

impl VirtualStream {
    pub fn new(
        stream_id: u64,
        incoming_rx: mpsc::Receiver<Bytes>,
        outbound_tx: mpsc::Sender<TunnelStreamFrame>,
    ) -> Self {
        Self {
            stream_id,
            incoming_rx,
            outbound_tx,
        }
    }

    pub async fn send(&self, payload: Bytes) -> Result<(), TransportError> {
        let frame = TunnelStreamFrame {
            stream_id: self.stream_id,
            flags: 2,
            payload: payload.to_vec(),
        };
        self.outbound_tx
            .send(frame)
            .await
            .map_err(|e| TransportError::SendFailed(e.to_string()))
    }

    pub async fn recv(&mut self) -> Option<Bytes> {
        self.incoming_rx.recv().await
    }

    pub async fn close(&self) -> Result<(), TransportError> {
        let frame = TunnelStreamFrame {
            stream_id: self.stream_id,
            flags: 4,
            payload: Vec::new(),
        };
        self.outbound_tx
            .send(frame)
            .await
            .map_err(|e| TransportError::SendFailed(e.to_string()))
    }
}

pub struct ReverseTunnelClient {
    config: TunnelConfig,
}

impl ReverseTunnelClient {
    #[must_use]
    pub fn new(config: TunnelConfig) -> Self {
        Self { config }
    }

    pub async fn run(
        &self,
        new_stream_tx: mpsc::Sender<VirtualStream>,
    ) -> Result<(), TransportError> {
        let (mut ws_stream, _) = connect_async(&self.config.relay_url)
            .await
            .map_err(|e| TransportError::ConnectionFailed(e.to_string()))?;

        let register_req = TunnelRegisterRequest {
            protocol_version: 1,
            agent_id: self.config.agent_id.clone(),
            auth_token: self.config.auth_token.clone(),
            hostname: self.config.hostname.clone(),
            keepalive_interval_secs: self.config.keepalive_interval.as_secs() as u32,
        };

        let mut req_buf = Vec::new();
        register_req
            .encode(&mut req_buf)
            .map_err(|e| TransportError::SendFailed(e.to_string()))?;

        let register_msg = KairoMessage::with_opcode(
            MessageKind::Request,
            Opcode::TunnelRegister,
            1,
            Bytes::from(req_buf),
        );
        ws_stream
            .send(WsMessage::Binary(
                register_msg
                    .encode()
                    .map_err(|e| TransportError::SendFailed(e.to_string()))?,
            ))
            .await
            .map_err(|e| TransportError::SendFailed(e.to_string()))?;

        let first_msg = tokio::time::timeout(Duration::from_secs(10), ws_stream.next())
            .await
            .map_err(|_| TransportError::Timeout(Duration::from_secs(10)))?
            .ok_or(TransportError::ConnectionClosed)?
            .map_err(|e| TransportError::ReceiveFailed(e.to_string()))?;

        let resp_data = match first_msg {
            WsMessage::Binary(bin) => bin,
            _ => {
                return Err(TransportError::TunnelRegistrationFailed(
                    "unexpected non-binary response".to_string(),
                ));
            }
        };

        let kairo_msg = KairoMessage::decode(resp_data)
            .map_err(|e| TransportError::TunnelRegistrationFailed(e.to_string()))?;
        let reg_resp = TunnelRegisterResponse::decode(kairo_msg.payload)
            .map_err(|e| TransportError::TunnelRegistrationFailed(e.to_string()))?;

        if !reg_resp.success {
            return Err(TransportError::TunnelRegistrationFailed(
                reg_resp.error_message,
            ));
        }

        info!(
            tunnel_id = %reg_resp.tunnel_id,
            relay = %reg_resp.relay_address,
            endpoint = %reg_resp.assigned_endpoint,
            "reverse tunnel successfully registered"
        );

        let (outbound_tx, mut outbound_rx) = mpsc::channel::<TunnelStreamFrame>(128);
        let active_streams: Arc<Mutex<HashMap<u64, mpsc::Sender<Bytes>>>> =
            Arc::new(Mutex::new(HashMap::new()));

        let (mut ws_sink, mut ws_source) = ws_stream.split();

        let keepalive_interval = self.config.keepalive_interval;
        let keepalive_tx = outbound_tx.clone();
        let keepalive_handle = tokio::spawn(async move {
            let mut ticker = tokio::time::interval(keepalive_interval);
            loop {
                ticker.tick().await;
                let heartbeat = TunnelHeartbeat {
                    timestamp: chrono_now_ms(),
                    latency_ms: 0,
                };
                let mut buf = Vec::new();
                if heartbeat.encode(&mut buf).is_ok() {
                    let frame = TunnelStreamFrame {
                        stream_id: 0,
                        flags: 0,
                        payload: buf,
                    };
                    if keepalive_tx.send(frame).await.is_err() {
                        break;
                    }
                }
            }
        });

        let writer_handle = tokio::spawn(async move {
            let mut req_counter = 100u64;
            while let Some(frame) = outbound_rx.recv().await {
                let mut frame_buf = Vec::new();
                if frame.encode(&mut frame_buf).is_ok() {
                    req_counter += 1;
                    let msg = KairoMessage::with_opcode(
                        MessageKind::Request,
                        Opcode::TunnelFrame,
                        req_counter,
                        Bytes::from(frame_buf),
                    );
                    let Ok(encoded) = msg.encode() else {
                        continue;
                    };
                    if ws_sink.send(WsMessage::Binary(encoded)).await.is_err() {
                        break;
                    }
                }
            }
        });

        while let Some(msg_result) = ws_source.next().await {
            let ws_msg = match msg_result {
                Ok(m) => m,
                Err(e) => {
                    warn!("error reading tunnel socket: {e}");
                    break;
                }
            };

            let data = match ws_msg {
                WsMessage::Binary(bin) => bin,
                WsMessage::Close(_) => break,
                _ => continue,
            };

            let Ok(kmsg) = KairoMessage::decode(data) else {
                continue;
            };

            if kmsg.kind == MessageKind::Request && kmsg.payload.is_empty() {
                continue;
            }

            let Ok(frame) = TunnelStreamFrame::decode(kmsg.payload) else {
                continue;
            };

            if frame.stream_id == 0 {
                continue;
            }

            if frame.flags & 1 != 0 {
                let (stream_in_tx, stream_in_rx) = mpsc::channel::<Bytes>(64);
                let vstream = VirtualStream::new(frame.stream_id, stream_in_rx, outbound_tx.clone());

                let mut streams = active_streams.lock().await;
                streams.insert(frame.stream_id, stream_in_tx.clone());

                if !frame.payload.is_empty() {
                    let _ = stream_in_tx.send(Bytes::from(frame.payload)).await;
                }

                if new_stream_tx.send(vstream).await.is_err() {
                    break;
                }
            } else if frame.flags & 4 != 0 || frame.flags & 8 != 0 {
                let mut streams = active_streams.lock().await;
                streams.remove(&frame.stream_id);
            } else {
                let streams = active_streams.lock().await;
                if let Some(stream_tx) = streams.get(&frame.stream_id) {
                    let _ = stream_tx.send(Bytes::from(frame.payload)).await;
                }
            }
        }

        keepalive_handle.abort();
        writer_handle.abort();
        Ok(())
    }
}

fn chrono_now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_virtual_stream_send_recv() {
        let (in_tx, in_rx) = mpsc::channel::<Bytes>(10);
        let (out_tx, mut out_rx) = mpsc::channel::<TunnelStreamFrame>(10);

        let mut stream = VirtualStream::new(42, in_rx, out_tx);

        in_tx.send(Bytes::from_static(b"hello virtual stream")).await.unwrap();
        let received = stream.recv().await.unwrap();
        assert_eq!(&received[..], b"hello virtual stream");

        stream.send(Bytes::from_static(b"response data")).await.unwrap();
        let out_frame = out_rx.recv().await.unwrap();
        assert_eq!(out_frame.stream_id, 42);
        assert_eq!(out_frame.flags, 2);
        assert_eq!(&out_frame.payload[..], b"response data");

        stream.close().await.unwrap();
        let close_frame = out_rx.recv().await.unwrap();
        assert_eq!(close_frame.stream_id, 42);
        assert_eq!(close_frame.flags, 4);
    }
}
