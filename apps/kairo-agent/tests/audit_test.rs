#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::sync::Arc;
use std::time::Duration;

use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use kairo_agent::{AgentConfig, Session};
use kairo_common::KairoId;
use kairo_protocol::v1::{
    ErrorCode, HandshakeAck, HandshakeInit, KairoError, ListDirectoryRequest,
};
use kairo_protocol::{KairoMessage, MessageKind, Opcode};
use prost::Message as ProstMessage;
use tempfile::tempdir;
use tokio::net::TcpListener;
use tokio::time::timeout;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message as WsMessage;

async fn setup_test_session() -> (
    String,
    tempfile::TempDir,
    tokio::task::JoinHandle<Result<(), kairo_agent::SessionError>>,
) {
    let temp_dir = tempdir().expect("tempdir");
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind listener");
    let addr = listener.local_addr().expect("local addr");

    let config = Arc::new(AgentConfig {
        bind_address: addr.to_string(),
        data_dir: temp_dir.path().to_str().expect("utf8").to_string(),
        agent_id: KairoId::new(),
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

    (addr.to_string(), temp_dir, server_handle)
}

async fn complete_handshake(
    client_ws: &mut tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
) {
    let init = HandshakeInit {
        protocol_version: 1,
        client_id: "audit-client".to_string(),
        ..Default::default()
    };
    let mut payload = Vec::new();
    init.encode(&mut payload).expect("encode init");

    let msg = KairoMessage::new(MessageKind::HandshakeInit, 1, Bytes::from(payload));
    let encoded = msg.encode().expect("encode msg");
    client_ws
        .send(WsMessage::Binary(encoded))
        .await
        .expect("send init");

    let resp = timeout(Duration::from_secs(5), client_ws.next())
        .await
        .expect("handshake timeout")
        .expect("item")
        .expect("ws message");

    match resp {
        WsMessage::Binary(data) => {
            let resp_msg = KairoMessage::decode(data).expect("decode ack");
            assert_eq!(resp_msg.kind, MessageKind::HandshakeAck);
            let ack = HandshakeAck::decode(resp_msg.payload).expect("decode ack proto");
            assert!(ack.capabilities.contains(&"gpu.v1".to_string()));
            assert!(ack.capabilities.contains(&"app.v1".to_string()));
        }
        _ => panic!("expected binary ack"),
    }
}

#[tokio::test]
async fn test_security_audit_path_traversal_rejection() {
    let (addr, _dir, server_handle) = setup_test_session().await;
    let ws_url = format!("ws://{addr}");
    let (mut client_ws, _) = connect_async(&ws_url).await.expect("client connect");

    complete_handshake(&mut client_ws).await;

    let traversal_paths = [
        "../../etc/passwd",
        "../../../etc/shadow",
        "../../../../Windows/System32",
        "foo/../../bar/../../etc/passwd",
        "..\\..\\sensitive.txt",
    ];

    for (idx, path) in traversal_paths.iter().enumerate() {
        let req = ListDirectoryRequest {
            path: (*path).to_string(),
        };
        let mut payload = Vec::new();
        req.encode(&mut payload).expect("encode list req");

        let msg = KairoMessage::with_opcode(
            MessageKind::Request,
            Opcode::FsListDirectory,
            100 + idx as u64,
            Bytes::from(payload),
        );
        let encoded = msg.encode().expect("encode msg");
        client_ws
            .send(WsMessage::Binary(encoded))
            .await
            .expect("send req");

        let resp = timeout(Duration::from_secs(5), client_ws.next())
            .await
            .expect("timeout")
            .expect("item")
            .expect("msg");

        match resp {
            WsMessage::Binary(data) => {
                let resp_msg = KairoMessage::decode(data).expect("decode msg");
                assert_eq!(resp_msg.kind, MessageKind::Error);
                let err = KairoError::decode(resp_msg.payload).expect("decode error");
                assert_eq!(err.code, ErrorCode::PermissionDenied as i32);
            }
            _ => panic!("expected binary error"),
        }
    }

    client_ws.close(None).await.expect("close");
    let _ = server_handle.await;
}

#[tokio::test]
async fn test_security_audit_unknown_opcode_graceful_handling() {
    let (addr, _dir, server_handle) = setup_test_session().await;
    let ws_url = format!("ws://{addr}");
    let (mut client_ws, _) = connect_async(&ws_url).await.expect("client connect");

    complete_handshake(&mut client_ws).await;

    let dummy_opcode = Opcode::None;
    let msg = KairoMessage::with_opcode(
        MessageKind::Request,
        dummy_opcode,
        999,
        Bytes::from_static(b"unknown payload"),
    );
    let encoded = msg.encode().expect("encode msg");
    client_ws
        .send(WsMessage::Binary(encoded))
        .await
        .expect("send req");

    let resp = timeout(Duration::from_secs(5), client_ws.next())
        .await
        .expect("timeout")
        .expect("item")
        .expect("msg");

    match resp {
        WsMessage::Binary(data) => {
            let resp_msg = KairoMessage::decode(data).expect("decode msg");
            assert_eq!(resp_msg.kind, MessageKind::Error);
            let err = KairoError::decode(resp_msg.payload).expect("decode error");
            assert_eq!(err.code, ErrorCode::InvalidArgument as i32);
        }
        _ => panic!("expected binary error"),
    }

    client_ws.close(None).await.expect("close");
    let _ = server_handle.await;
}

#[tokio::test]
async fn test_security_audit_payload_overflow_rejection() {
    let oversized = vec![0u8; 17 * 1024 * 1024];
    let msg = KairoMessage::new(MessageKind::Request, 42, Bytes::from(oversized));
    let encode_res = msg.encode();
    assert!(encode_res.is_err());
}
