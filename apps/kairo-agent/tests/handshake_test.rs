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
        auth_token: None,
        ..Default::default()
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
        auth_token: String::new(),
        timestamp: 0,
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
            assert!(ack.authenticated);
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
        auth_token: None,
        ..Default::default()
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
        auth_token: String::new(),
        timestamp: 0,
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

#[tokio::test]
async fn test_token_authentication_success_and_failure() {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind listener");
    let addr = listener.local_addr().expect("local addr");

    let expected_token = "kairo-super-secret-token-98765".to_string();
    let config = Arc::new(AgentConfig {
        bind_address: addr.to_string(),
        data_dir: "/tmp".to_string(),
        agent_id: KairoId::new(),
        auth_token: Some(expected_token.clone()),
        ..Default::default()
    });

    let config_clone = Arc::clone(&config);
    let server_handle = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.expect("accept connection");
        let ws_stream = tokio_tungstenite::accept_async(stream)
            .await
            .expect("ws accept");
        let mut session = Session::new(config_clone);
        let res1 = session.run(ws_stream).await;

        let (stream2, _) = listener.accept().await.expect("accept connection 2");
        let ws_stream2 = tokio_tungstenite::accept_async(stream2)
            .await
            .expect("ws accept 2");
        let mut session2 = Session::new(config);
        let res2 = session2.run(ws_stream2).await;

        (res1, res2)
    });

    let ws_url = format!("ws://{addr}");
    let (mut bad_client, _) = connect_async(&ws_url).await.expect("client connect");

    let bad_init = HandshakeInit {
        protocol_version: 1,
        client_id: "bad-client".to_string(),
        auth_token: "wrong-password".to_string(),
        timestamp: 0,
    };
    let mut bad_payload = Vec::new();
    bad_init.encode(&mut bad_payload).expect("encode bad init");
    let bad_msg = KairoMessage::new(MessageKind::HandshakeInit, 1, Bytes::from(bad_payload));
    bad_client.send(WsMessage::Binary(bad_msg.encode().expect("encode msg"))).await.expect("send bad init");

    let bad_resp = timeout(Duration::from_secs(5), bad_client.next())
        .await
        .expect("timeout")
        .expect("item")
        .expect("ws msg");
    match bad_resp {
        WsMessage::Binary(data) => {
            let resp_msg = KairoMessage::decode(data).expect("decode msg");
            let ack = HandshakeAck::decode(resp_msg.payload).expect("decode ack");
            assert!(!ack.authenticated);
            assert!(ack.error_message.contains("authentication failed"));
        }
        WsMessage::Close(_) => {}
        other => panic!("expected binary or close, got {other:?}"),
    }

    let (mut good_client, _) = connect_async(&ws_url).await.expect("good client connect");
    let good_init = HandshakeInit {
        protocol_version: 1,
        client_id: "good-client".to_string(),
        auth_token: expected_token,
        timestamp: 0,
    };
    let mut good_payload = Vec::new();
    good_init.encode(&mut good_payload).expect("encode good init");
    let good_msg = KairoMessage::new(MessageKind::HandshakeInit, 2, Bytes::from(good_payload));
    good_client.send(WsMessage::Binary(good_msg.encode().expect("encode good msg"))).await.expect("send good init");

    let good_resp = timeout(Duration::from_secs(5), good_client.next())
        .await
        .expect("timeout")
        .expect("item")
        .expect("ws msg");
    match good_resp {
        WsMessage::Binary(data) => {
            let resp_msg = KairoMessage::decode(data).expect("decode msg");
            let ack = HandshakeAck::decode(resp_msg.payload).expect("decode ack");
            assert!(ack.authenticated);
            assert_eq!(ack.protocol_version, 1);
        }
        other => panic!("expected binary response, got {other:?}"),
    }
    good_client.close(None).await.expect("close good client");

    let (res1, res2) = server_handle.await.expect("server handle");
    assert!(res1.is_err());
    assert!(res2.is_ok());
}
