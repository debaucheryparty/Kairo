#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::sync::Arc;
use std::time::Duration;

use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use kairo_agent::{AgentConfig, Session};
use kairo_common::KairoId;
use kairo_protocol::v1::{HandshakeAck, HandshakeInit};
use kairo_protocol::{KairoMessage, MessageKind};
use prost::Message as ProstMessage;
use tokio::net::TcpListener;
use tokio::time::timeout;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message as WsMessage;

#[tokio::test]
async fn test_successful_handshake() {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind listener");
    let addr = listener.local_addr().expect("local addr");

    let agent_id = KairoId::new();
    let config = Arc::new(AgentConfig {
        bind_address: addr.to_string(),
        data_dir: "/tmp".to_string(),
        agent_id: agent_id.clone(),
    });

    let server_handle = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.expect("accept connection");
        let ws_stream = tokio_tungstenite::accept_async(stream)
            .await
            .expect("ws accept");
        let mut session = Session::new(config);
        session.run(ws_stream).await
    });

    let ws_url = format!("ws://{addr}");
    let (mut client_ws, _) = connect_async(&ws_url).await.expect("client connect");

    let init = HandshakeInit {
        protocol_version: 1,
        client_id: "test-client".to_string(),
    };
    let mut payload = Vec::new();
    init.encode(&mut payload).expect("encode init");

    let msg = KairoMessage::new(MessageKind::HandshakeInit, 100, Bytes::from(payload));
    let encoded = msg.encode().expect("encode kairo message");

    client_ws
        .send(WsMessage::Binary(encoded))
        .await
        .expect("send init");

    let response = timeout(Duration::from_secs(5), client_ws.next())
        .await
        .expect("response timeout")
        .expect("stream item")
        .expect("ws message");

    match response {
        WsMessage::Binary(data) => {
            let resp_msg = KairoMessage::decode(data).expect("decode kairo message");
            assert_eq!(resp_msg.kind, MessageKind::HandshakeAck);
            assert_eq!(resp_msg.request_id, 100);

            let ack = HandshakeAck::decode(resp_msg.payload).expect("decode handshake ack");
            assert_eq!(ack.protocol_version, 1);
            assert_eq!(ack.agent_id, agent_id.to_string());
            assert!(!ack.session_id.is_empty());
            assert!(ack.capabilities.contains(&"filesystem.v1".to_string()));
            assert!(ack.capabilities.contains(&"terminal.v1".to_string()));
            assert!(ack.capabilities.contains(&"process.v1".to_string()));
            assert!(ack.capabilities.contains(&"metrics.v1".to_string()));
        }
        other => panic!("expected binary response, got {other:?}"),
    }

    client_ws.close(None).await.expect("client close");
    let _ = server_handle.await;
}

#[tokio::test]
async fn test_version_mismatch_handshake_rejected() {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind listener");
    let addr = listener.local_addr().expect("local addr");

    let config = Arc::new(AgentConfig {
        bind_address: addr.to_string(),
        data_dir: "/tmp".to_string(),
        agent_id: KairoId::new(),
    });

    let server_handle = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.expect("accept connection");
        let ws_stream = tokio_tungstenite::accept_async(stream)
            .await
            .expect("ws accept");
        let mut session = Session::new(config);
        session.run(ws_stream).await
    });

    let ws_url = format!("ws://{addr}");
    let (mut client_ws, _) = connect_async(&ws_url).await.expect("client connect");

    let init = HandshakeInit {
        protocol_version: 999,
        client_id: "incompatible-client".to_string(),
    };
    let mut payload = Vec::new();
    init.encode(&mut payload).expect("encode init");

    let msg = KairoMessage::new(MessageKind::HandshakeInit, 101, Bytes::from(payload));
    let encoded = msg.encode().expect("encode kairo message");

    client_ws
        .send(WsMessage::Binary(encoded))
        .await
        .expect("send init");

    let server_result = server_handle.await.expect("server join");
    assert!(server_result.is_err());
}
