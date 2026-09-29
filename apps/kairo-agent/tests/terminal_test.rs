#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::sync::Arc;
use std::time::Duration;

use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use kairo_agent::{AgentConfig, PtyManager, Session};
use kairo_common::KairoId;
use kairo_protocol::v1::{
    AttachPtyRequest, AttachPtyResponse, ClosePtyRequest, CreatePtyRequest, CreatePtyResponse,
    HandshakeAck, HandshakeInit, ListPtysRequest, ListPtysResponse, PtyInput, PtyOutput,
    ResizePtyRequest,
};
use kairo_protocol::{KairoMessage, MessageKind, Opcode};
use prost::Message as ProstMessage;
use tempfile::TempDir;
use tokio::net::TcpListener;
use tokio::time::timeout;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message as WsMessage;

#[tokio::test]
async fn test_terminal_pty_e2e_over_websocket() {
    let temp = TempDir::new().expect("create temp dir");
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind listener");
    let addr = listener.local_addr().expect("local addr");

    let config = Arc::new(AgentConfig {
        bind_address: addr.to_string(),
        data_dir: temp.path().to_string_lossy().to_string(),
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

    let ws_url = format!("ws://{addr}");
    let (mut client_ws, _) = connect_async(&ws_url).await.expect("client connect");

    let init = HandshakeInit {
        protocol_version: 1,
        client_id: "test-term-client".to_string(),
        ..Default::default()
    };
    let mut payload = Vec::new();
    init.encode(&mut payload).expect("encode init");
    let msg = KairoMessage::new(MessageKind::HandshakeInit, 1, Bytes::from(payload));
    client_ws
        .send(WsMessage::Binary(msg.encode().expect("encode msg")))
        .await
        .expect("send init");

    let ack_raw = timeout(Duration::from_secs(5), client_ws.next())
        .await
        .expect("ack timeout")
        .expect("ack item")
        .expect("ack ws");
    let ack_msg = match ack_raw {
        WsMessage::Binary(b) => KairoMessage::decode(b).expect("decode ack msg"),
        other => panic!("expected binary, got {other:?}"),
    };
    assert_eq!(ack_msg.kind, MessageKind::HandshakeAck);
    let _ = HandshakeAck::decode(ack_msg.payload).expect("decode ack");

    let create_req = CreatePtyRequest {
        shell: String::new(),
        cols: 80,
        rows: 24,
        working_directory: String::new(),
    };
    let mut create_payload = Vec::new();
    create_req
        .encode(&mut create_payload)
        .expect("encode create pty");
    let create_msg = KairoMessage::with_opcode(
        MessageKind::Request,
        Opcode::TerminalCreatePty,
        2,
        Bytes::from(create_payload),
    );
    client_ws
        .send(WsMessage::Binary(
            create_msg.encode().expect("encode create msg"),
        ))
        .await
        .expect("send create pty");

    let mut pty_id = String::new();
    let mut received_output = false;

    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    while tokio::time::Instant::now() < deadline && (pty_id.is_empty() || !received_output) {
        let next_msg = timeout(Duration::from_secs(2), client_ws.next()).await;
        let Ok(Some(Ok(WsMessage::Binary(b)))) = next_msg else {
            continue;
        };
        let Ok(parsed) = KairoMessage::decode(b) else {
            continue;
        };
        if parsed.opcode() == Opcode::TerminalCreatePty && parsed.kind == MessageKind::Response {
            let resp = CreatePtyResponse::decode(parsed.payload).expect("decode create pty resp");
            pty_id = resp.pty_id;
        } else if parsed.opcode() == Opcode::TerminalOutput {
            let out = PtyOutput::decode(parsed.payload).expect("decode pty out");
            if !out.data.is_empty() {
                received_output = true;
            }
        }
    }

    assert!(!pty_id.is_empty(), "should receive pty_id");

    let input_req = PtyInput {
        pty_id: pty_id.clone(),
        data: b"echo kairo_alive\n".to_vec(),
    };
    let mut input_payload = Vec::new();
    input_req.encode(&mut input_payload).expect("encode input");
    let input_msg = KairoMessage::with_opcode(
        MessageKind::Request,
        Opcode::TerminalInput,
        3,
        Bytes::from(input_payload),
    );
    client_ws
        .send(WsMessage::Binary(
            input_msg.encode().expect("encode input msg"),
        ))
        .await
        .expect("send input");

    let resize_req = ResizePtyRequest {
        pty_id: pty_id.clone(),
        cols: 120,
        rows: 40,
    };
    let mut resize_payload = Vec::new();
    resize_req
        .encode(&mut resize_payload)
        .expect("encode resize");
    let resize_msg = KairoMessage::with_opcode(
        MessageKind::Request,
        Opcode::TerminalResize,
        4,
        Bytes::from(resize_payload),
    );
    client_ws
        .send(WsMessage::Binary(
            resize_msg.encode().expect("encode resize msg"),
        ))
        .await
        .expect("send resize");

    let close_req = ClosePtyRequest {
        pty_id: pty_id.clone(),
    };
    let mut close_payload = Vec::new();
    close_req.encode(&mut close_payload).expect("encode close");
    let close_msg = KairoMessage::with_opcode(
        MessageKind::Request,
        Opcode::TerminalClose,
        5,
        Bytes::from(close_payload),
    );
    client_ws
        .send(WsMessage::Binary(
            close_msg.encode().expect("encode close msg"),
        ))
        .await
        .expect("send close");

    client_ws.close(None).await.expect("client close");
    let _ = server_handle.await;
}

#[tokio::test]
async fn test_terminal_reattach_and_backlog_replay_across_connection_loss() {
    let temp = TempDir::new().expect("create temp dir");
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind listener");
    let addr = listener.local_addr().expect("local addr");

    let config = Arc::new(AgentConfig {
        bind_address: addr.to_string(),
        data_dir: temp.path().to_string_lossy().to_string(),
        agent_id: KairoId::new(),
        ..Default::default()
    });

    let shared_pty = Arc::new(PtyManager::new());
    let s_pty1 = Arc::clone(&shared_pty);
    let s_config1 = Arc::clone(&config);

    let _server_handle = tokio::spawn(async move {
        while let Ok((stream, _)) = listener.accept().await {
            if let Ok(ws_stream) = tokio_tungstenite::accept_async(stream).await {
                let mut session = Session::with_pty(Arc::clone(&s_config1), Arc::clone(&s_pty1));
                tokio::spawn(async move {
                    let _ = session.run(ws_stream).await;
                });
            }
        }
    });

    let ws_url = format!("ws://{addr}");

    let (mut client_ws1, _) = connect_async(&ws_url).await.expect("client1 connect");

    let init1 = HandshakeInit {
        protocol_version: 1,
        client_id: "client-1".to_string(),
        ..Default::default()
    };
    let mut payload = Vec::new();
    init1.encode(&mut payload).expect("encode init1");
    let msg1 = KairoMessage::new(MessageKind::HandshakeInit, 1, Bytes::from(payload));
    client_ws1
        .send(WsMessage::Binary(msg1.encode().expect("encode msg1")))
        .await
        .expect("send init1");

    let ack1_raw = timeout(Duration::from_secs(5), client_ws1.next())
        .await
        .expect("ack1 timeout")
        .expect("ack1 item")
        .expect("ack1 ws");
    let ack1_msg = match ack1_raw {
        WsMessage::Binary(b) => KairoMessage::decode(b).expect("decode ack1"),
        _ => panic!("expected binary"),
    };
    assert_eq!(ack1_msg.kind, MessageKind::HandshakeAck);

    let create_req = CreatePtyRequest {
        shell: String::new(),
        cols: 80,
        rows: 24,
        working_directory: String::new(),
    };
    let mut create_payload = Vec::new();
    create_req
        .encode(&mut create_payload)
        .expect("encode create");
    let create_msg = KairoMessage::with_opcode(
        MessageKind::Request,
        Opcode::TerminalCreatePty,
        2,
        Bytes::from(create_payload),
    );
    client_ws1
        .send(WsMessage::Binary(
            create_msg.encode().expect("encode create"),
        ))
        .await
        .expect("send create");

    let mut pty_id = String::new();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    while tokio::time::Instant::now() < deadline && pty_id.is_empty() {
        let next_msg = timeout(Duration::from_secs(2), client_ws1.next()).await;
        let Ok(Some(Ok(WsMessage::Binary(b)))) = next_msg else {
            continue;
        };
        let Ok(parsed) = KairoMessage::decode(b) else {
            continue;
        };
        if parsed.opcode() == Opcode::TerminalCreatePty && parsed.kind == MessageKind::Response {
            let resp = CreatePtyResponse::decode(parsed.payload).expect("decode create resp");
            pty_id = resp.pty_id;
        }
    }
    assert!(!pty_id.is_empty(), "expected pty_id");

    let mut input_payload = Vec::new();
    PtyInput {
        pty_id: pty_id.clone(),
        data: b"\n".to_vec(),
    }
    .encode(&mut input_payload)
    .expect("encode input");
    let input_msg = KairoMessage::with_opcode(
        MessageKind::Request,
        Opcode::TerminalInput,
        3,
        Bytes::from(input_payload),
    );
    client_ws1
        .send(WsMessage::Binary(
            input_msg.encode().expect("encode input msg"),
        ))
        .await
        .expect("send input");

    let _ = timeout(Duration::from_secs(3), client_ws1.next()).await;

    drop(client_ws1);
    tokio::time::sleep(Duration::from_millis(200)).await;

    let (mut client_ws2, _) = connect_async(&ws_url).await.expect("client2 connect");

    let init2 = HandshakeInit {
        protocol_version: 1,
        client_id: "client-2".to_string(),
        ..Default::default()
    };
    let mut payload2 = Vec::new();
    init2.encode(&mut payload2).expect("encode init2");
    let msg2 = KairoMessage::new(MessageKind::HandshakeInit, 10, Bytes::from(payload2));
    client_ws2
        .send(WsMessage::Binary(msg2.encode().expect("encode msg2")))
        .await
        .expect("send init2");

    let ack2_raw = timeout(Duration::from_secs(5), client_ws2.next())
        .await
        .expect("ack2 timeout")
        .expect("ack2 item")
        .expect("ack2 ws");
    let ack2_msg = match ack2_raw {
        WsMessage::Binary(b) => KairoMessage::decode(b).expect("decode ack2"),
        _ => panic!("expected binary"),
    };
    assert_eq!(ack2_msg.kind, MessageKind::HandshakeAck);

    let mut list_payload = Vec::new();
    ListPtysRequest {}
        .encode(&mut list_payload)
        .expect("encode list");
    let list_msg = KairoMessage::with_opcode(
        MessageKind::Request,
        Opcode::TerminalList,
        11,
        Bytes::from(list_payload),
    );
    client_ws2
        .send(WsMessage::Binary(
            list_msg.encode().expect("encode list msg"),
        ))
        .await
        .expect("send list");

    let list_resp_raw = timeout(Duration::from_secs(5), client_ws2.next())
        .await
        .expect("list resp timeout")
        .expect("list resp item")
        .expect("list resp ws");
    let list_resp_msg = match list_resp_raw {
        WsMessage::Binary(b) => KairoMessage::decode(b).expect("decode list resp msg"),
        _ => panic!("expected binary"),
    };
    let list_resp = ListPtysResponse::decode(list_resp_msg.payload).expect("decode list resp");
    assert!(
        list_resp.sessions.iter().any(|s| s.pty_id == pty_id),
        "expected previously created PTY to survive client disconnect"
    );

    let mut attach_payload = Vec::new();
    AttachPtyRequest {
        pty_id: pty_id.clone(),
    }
    .encode(&mut attach_payload)
    .expect("encode attach");
    let attach_msg = KairoMessage::with_opcode(
        MessageKind::Request,
        Opcode::TerminalAttach,
        12,
        Bytes::from(attach_payload),
    );
    client_ws2
        .send(WsMessage::Binary(
            attach_msg.encode().expect("encode attach msg"),
        ))
        .await
        .expect("send attach");

    let attach_resp_raw = timeout(Duration::from_secs(5), client_ws2.next())
        .await
        .expect("attach resp timeout")
        .expect("attach resp item")
        .expect("attach resp ws");
    let attach_resp_msg = match attach_resp_raw {
        WsMessage::Binary(b) => KairoMessage::decode(b).expect("decode attach resp msg"),
        _ => panic!("expected binary"),
    };
    assert_eq!(attach_resp_msg.kind, MessageKind::Response);
    assert_eq!(attach_resp_msg.opcode(), Opcode::TerminalAttach);
    let attach_resp = AttachPtyResponse::decode(attach_resp_msg.payload).expect("decode attach");
    assert_eq!(attach_resp.pty_id, pty_id);
    assert!(
        !attach_resp.backlog.is_empty(),
        "backlog replay should contain output generated during or before disconnect"
    );

    let mut close_payload = Vec::new();
    ClosePtyRequest {
        pty_id: pty_id.clone(),
    }
    .encode(&mut close_payload)
    .expect("encode close");
    let close_msg = KairoMessage::with_opcode(
        MessageKind::Request,
        Opcode::TerminalClose,
        13,
        Bytes::from(close_payload),
    );
    client_ws2
        .send(WsMessage::Binary(
            close_msg.encode().expect("encode close msg"),
        ))
        .await
        .expect("send close");
}
