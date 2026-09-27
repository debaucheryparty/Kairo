use std::sync::Arc;
use std::time::Duration;

use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use kairo_agent::{AgentConfig, Session};
use kairo_common::KairoId;
use kairo_protocol::v1::{GetMetricsRequest, GetMetricsResponse, HandshakeAck, HandshakeInit};
use kairo_protocol::{KairoMessage, MessageKind, Opcode};
use prost::Message as ProstMessage;
use tokio::net::TcpListener;
use tokio::time::timeout;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message as WsMessage;

#[tokio::test]
async fn test_metrics_e2e_over_websocket() {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind listener");
    let addr = listener.local_addr().expect("local addr");

    let agent_id = KairoId::new();
    let config = Arc::new(AgentConfig {
        bind_address: addr.to_string(),
        data_dir: std::env::temp_dir().to_string_lossy().to_string(),
        agent_id: agent_id.clone(),
    });

    let _server_handle = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.expect("accept connection");
        let ws_stream = tokio_tungstenite::accept_async(stream)
            .await
            .expect("ws accept");
        let mut session = Session::new(config);
        session.run(ws_stream).await
    });

    let ws_url = format!("ws://{addr}");
    let (mut client_ws, _) = connect_async(&ws_url).await.expect("client connect");

    // 1. Handshake
    let init = HandshakeInit {
        protocol_version: 1,
        client_id: "test-metrics-client".to_string(),
    };
    let mut payload = Vec::new();
    init.encode(&mut payload).expect("encode init");
    let msg = KairoMessage::new(MessageKind::HandshakeInit, 1, Bytes::from(payload));
    client_ws
        .send(WsMessage::Binary(msg.encode().expect("encode init msg")))
        .await
        .expect("send init");

    let ack_raw = timeout(Duration::from_secs(5), client_ws.next())
        .await
        .expect("ack timeout")
        .expect("stream item")
        .expect("ws ok");
    let ack_msg = KairoMessage::decode(ack_raw.into_data()).expect("decode ack");
    assert_eq!(ack_msg.kind, MessageKind::HandshakeAck);
    let ack = HandshakeAck::decode(ack_msg.payload).expect("decode handshake ack");
    assert!(ack.capabilities.contains(&"metrics.v1".to_string()));

    // 2. Request Metrics
    let req = GetMetricsRequest {};
    let mut req_payload = Vec::new();
    req.encode(&mut req_payload).expect("encode metrics req");
    let get_metrics_msg = KairoMessage::with_opcode(
        MessageKind::Request,
        Opcode::MetricsGet,
        42,
        Bytes::from(req_payload),
    );
    client_ws
        .send(WsMessage::Binary(
            get_metrics_msg.encode().expect("encode get metrics msg"),
        ))
        .await
        .expect("send get metrics");

    let resp_raw = timeout(Duration::from_secs(5), client_ws.next())
        .await
        .expect("metrics response timeout")
        .expect("stream item")
        .expect("ws ok");
    let resp_msg = KairoMessage::decode(resp_raw.into_data()).expect("decode response");
    assert_eq!(resp_msg.kind, MessageKind::Response);
    assert_eq!(resp_msg.opcode(), Opcode::MetricsGet);
    assert_eq!(resp_msg.request_id, 42);

    let metrics_resp = GetMetricsResponse::decode(resp_msg.payload).expect("decode metrics resp");
    let metrics = metrics_resp.metrics.expect("metrics field present");
    assert!(metrics.memory_total_bytes > 0);
}
