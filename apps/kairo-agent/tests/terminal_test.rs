use std::sync::Arc;
use std::time::Duration;

use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use kairo_agent::{AgentConfig, Session};
use kairo_common::KairoId;
use kairo_protocol::v1::{
    ClosePtyRequest, CreatePtyRequest, CreatePtyResponse, HandshakeAck, HandshakeInit, PtyInput,
    PtyOutput, ResizePtyRequest,
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

    // 1. Handshake
    let init = HandshakeInit {
        protocol_version: 1,
        client_id: "test-term-client".to_string(),
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

    // 2. Create PTY
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

    // We may receive CreatePtyResponse and/or immediate terminal output events
    let mut pty_id = String::new();
    let mut received_output = false;

    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    while tokio::time::Instant::now() < deadline && (pty_id.is_empty() || !received_output) {
        if let Ok(Some(Ok(WsMessage::Binary(b)))) =
            timeout(Duration::from_secs(2), client_ws.next()).await
        {
            if let Ok(parsed) = KairoMessage::decode(b) {
                if parsed.opcode() == Opcode::TerminalCreatePty
                    && parsed.kind == MessageKind::Response
                {
                    let resp =
                        CreatePtyResponse::decode(parsed.payload).expect("decode create pty resp");
                    pty_id = resp.pty_id;
                } else if parsed.opcode() == Opcode::TerminalOutput {
                    let out = PtyOutput::decode(parsed.payload).expect("decode pty out");
                    if !out.data.is_empty() {
                        received_output = true;
                    }
                }
            }
        }
    }

    assert!(!pty_id.is_empty(), "should receive pty_id");

    // 3. Write input to PTY
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

    // 4. Resize PTY
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

    // 5. Close PTY
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
