#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::sync::Arc;
use std::time::Duration;

use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use kairo_agent::{AgentConfig, Session};
use kairo_common::KairoId;
use kairo_protocol::v1::{
    FileEvent, HandshakeAck, HandshakeInit, ListDirectoryRequest, ListDirectoryResponse,
    ReadFileRequest, ReadFileResponse, WatchRequest, WatchResponse, WriteFileRequest,
    WriteFileResponse,
};
use kairo_protocol::{KairoMessage, MessageKind, Opcode};
use prost::Message as ProstMessage;
use tempfile::TempDir;
use tokio::net::TcpListener;
use tokio::time::timeout;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message as WsMessage;

#[tokio::test]
async fn test_filesystem_e2e_over_websocket() {
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

    let init = HandshakeInit {
        protocol_version: 1,
        client_id: "test-fs-client".to_string(),
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

    let write_req = WriteFileRequest {
        path: "hello.txt".to_string(),
        content: b"remote linux filesystem test".to_vec(),
        expected_revision: String::new(),
    };
    let mut write_payload = Vec::new();
    write_req.encode(&mut write_payload).expect("encode write");
    let write_msg = KairoMessage::with_opcode(
        MessageKind::Request,
        Opcode::FsWriteFile,
        2,
        Bytes::from(write_payload),
    );
    client_ws
        .send(WsMessage::Binary(
            write_msg.encode().expect("encode write msg"),
        ))
        .await
        .expect("send write");

    let write_resp_raw = timeout(Duration::from_secs(5), client_ws.next())
        .await
        .expect("write resp timeout")
        .expect("item")
        .expect("ws");
    let write_resp_msg = match write_resp_raw {
        WsMessage::Binary(b) => KairoMessage::decode(b).expect("decode write resp"),
        other => panic!("expected binary, got {other:?}"),
    };
    assert_eq!(write_resp_msg.kind, MessageKind::Response);
    assert_eq!(write_resp_msg.opcode(), Opcode::FsWriteFile);
    let write_resp = WriteFileResponse::decode(write_resp_msg.payload).expect("decode write resp");
    assert!(!write_resp.revision.is_empty());

    let list_req = ListDirectoryRequest {
        path: String::new(),
    };
    let mut list_payload = Vec::new();
    list_req.encode(&mut list_payload).expect("encode list");
    let list_msg = KairoMessage::with_opcode(
        MessageKind::Request,
        Opcode::FsListDirectory,
        3,
        Bytes::from(list_payload),
    );
    client_ws
        .send(WsMessage::Binary(
            list_msg.encode().expect("encode list msg"),
        ))
        .await
        .expect("send list");

    let list_resp_raw = timeout(Duration::from_secs(5), client_ws.next())
        .await
        .expect("list timeout")
        .expect("item")
        .expect("ws");
    let list_resp_msg = match list_resp_raw {
        WsMessage::Binary(b) => KairoMessage::decode(b).expect("decode list resp"),
        other => panic!("expected binary, got {other:?}"),
    };
    assert_eq!(list_resp_msg.kind, MessageKind::Response);
    let list_resp = ListDirectoryResponse::decode(list_resp_msg.payload).expect("decode list resp");
    assert_eq!(list_resp.entries.len(), 1);
    assert_eq!(list_resp.entries[0].path, "hello.txt");

    let read_req = ReadFileRequest {
        path: "hello.txt".to_string(),
        offset: 0,
        length: 0,
    };
    let mut read_payload = Vec::new();
    read_req.encode(&mut read_payload).expect("encode read");
    let read_msg = KairoMessage::with_opcode(
        MessageKind::Request,
        Opcode::FsReadFile,
        4,
        Bytes::from(read_payload),
    );
    client_ws
        .send(WsMessage::Binary(
            read_msg.encode().expect("encode read msg"),
        ))
        .await
        .expect("send read");

    let read_resp_raw = timeout(Duration::from_secs(5), client_ws.next())
        .await
        .expect("read timeout")
        .expect("item")
        .expect("ws");
    let read_resp_msg = match read_resp_raw {
        WsMessage::Binary(b) => KairoMessage::decode(b).expect("decode read resp"),
        other => panic!("expected binary, got {other:?}"),
    };
    assert_eq!(read_resp_msg.kind, MessageKind::Response);
    let read_resp = ReadFileResponse::decode(read_resp_msg.payload).expect("decode read resp");
    assert_eq!(read_resp.content, b"remote linux filesystem test");
    assert_eq!(read_resp.revision, write_resp.revision);

    client_ws.close(None).await.expect("client close");
    let _ = server_handle.await;
}

#[tokio::test]
async fn test_filesystem_watch_e2e_over_websocket() {
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

    let init = HandshakeInit {
        protocol_version: 1,
        client_id: "test-watch-client".to_string(),
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

    let watch_req = WatchRequest {
        path: String::new(),
        recursive: false,
    };
    let mut watch_payload = Vec::new();
    watch_req.encode(&mut watch_payload).expect("encode watch");
    let watch_msg = KairoMessage::with_opcode(
        MessageKind::Request,
        Opcode::FsWatch,
        2,
        Bytes::from(watch_payload),
    );
    client_ws
        .send(WsMessage::Binary(
            watch_msg.encode().expect("encode watch msg"),
        ))
        .await
        .expect("send watch");

    let watch_resp_raw = timeout(Duration::from_secs(5), client_ws.next())
        .await
        .expect("watch resp timeout")
        .expect("item")
        .expect("ws");
    let watch_resp_msg = match watch_resp_raw {
        WsMessage::Binary(b) => KairoMessage::decode(b).expect("decode watch resp"),
        other => panic!("expected binary, got {other:?}"),
    };
    assert_eq!(watch_resp_msg.kind, MessageKind::Response);
    let watch_resp = WatchResponse::decode(watch_resp_msg.payload).expect("decode watch resp");
    assert!(watch_resp.success);

    let write_req = WriteFileRequest {
        path: "watched_file.txt".to_string(),
        content: b"live sync event test".to_vec(),
        expected_revision: String::new(),
    };
    let mut write_payload = Vec::new();
    write_req.encode(&mut write_payload).expect("encode write");
    let write_msg = KairoMessage::with_opcode(
        MessageKind::Request,
        Opcode::FsWriteFile,
        3,
        Bytes::from(write_payload),
    );
    client_ws
        .send(WsMessage::Binary(
            write_msg.encode().expect("encode write msg"),
        ))
        .await
        .expect("send write");

    let mut got_write_resp = false;
    let mut got_file_event = false;

    for _ in 0..5 {
        let msg_raw = timeout(Duration::from_secs(5), client_ws.next())
            .await
            .expect("msg timeout")
            .expect("item")
            .expect("ws");
        let msg = match msg_raw {
            WsMessage::Binary(b) => KairoMessage::decode(b).expect("decode msg"),
            other => panic!("expected binary, got {other:?}"),
        };

        if msg.kind == MessageKind::Response && msg.opcode() == Opcode::FsWriteFile {
            got_write_resp = true;
        } else if msg.kind == MessageKind::Event && msg.opcode() == Opcode::FsWatch {
            let event = FileEvent::decode(msg.payload).expect("decode file event");
            if event.path.contains("watched_file.txt") {
                got_file_event = true;
            }
        }

        if got_write_resp && got_file_event {
            break;
        }
    }

    assert!(got_write_resp, "should receive write response");
    assert!(got_file_event, "should receive real-time watch event");

    client_ws.close(None).await.expect("client close");
    let _ = server_handle.await;
}
