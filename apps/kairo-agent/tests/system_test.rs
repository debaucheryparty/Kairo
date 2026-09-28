#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::sync::Arc;
use std::time::Duration;

use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use kairo_agent::{AgentConfig, Session};
use kairo_common::KairoId;
use kairo_protocol::v1::{
    HandshakeAck, HandshakeInit, ListContainersRequest, ListContainersResponse,
    ListServicesRequest, ListServicesResponse,
};
use kairo_protocol::{KairoMessage, MessageKind, Opcode};
use prost::Message as ProstMessage;
use tempfile::TempDir;
use tokio::net::TcpListener;
use tokio::time::timeout;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message as WsMessage;

#[tokio::test]
async fn test_system_and_docker_e2e_over_websocket() {
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
        client_id: "test-system-client".to_string(),
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
    let ack = HandshakeAck::decode(ack_msg.payload).expect("decode ack");
    assert!(ack.capabilities.contains(&"docker.v1".to_string()));
    assert!(ack.capabilities.contains(&"system.v1".to_string()));

    let docker_req = ListContainersRequest { all: true };
    let mut docker_payload = Vec::new();
    docker_req
        .encode(&mut docker_payload)
        .expect("encode docker");
    let docker_msg = KairoMessage::with_opcode(
        MessageKind::Request,
        Opcode::DockerListContainers,
        2,
        Bytes::from(docker_payload),
    );
    client_ws
        .send(WsMessage::Binary(
            docker_msg.encode().expect("encode docker msg"),
        ))
        .await
        .expect("send docker req");

    let docker_resp_raw = timeout(Duration::from_secs(5), client_ws.next())
        .await
        .expect("docker resp timeout")
        .expect("item")
        .expect("ws");
    let docker_resp_msg = match docker_resp_raw {
        WsMessage::Binary(b) => KairoMessage::decode(b).expect("decode docker resp msg"),
        other => panic!("expected binary, got {other:?}"),
    };
    assert_eq!(docker_resp_msg.kind, MessageKind::Response);
    assert_eq!(docker_resp_msg.opcode(), Opcode::DockerListContainers);
    let docker_resp =
        ListContainersResponse::decode(docker_resp_msg.payload).expect("decode docker resp");
    assert!(docker_resp.docker_available || docker_resp.containers.is_empty());

    let service_req = ListServicesRequest {};
    let mut service_payload = Vec::new();
    service_req
        .encode(&mut service_payload)
        .expect("encode service");
    let service_msg = KairoMessage::with_opcode(
        MessageKind::Request,
        Opcode::SystemListServices,
        3,
        Bytes::from(service_payload),
    );
    client_ws
        .send(WsMessage::Binary(
            service_msg.encode().expect("encode service msg"),
        ))
        .await
        .expect("send service req");

    let service_resp_raw = timeout(Duration::from_secs(5), client_ws.next())
        .await
        .expect("service resp timeout")
        .expect("item")
        .expect("ws");
    let service_resp_msg = match service_resp_raw {
        WsMessage::Binary(b) => KairoMessage::decode(b).expect("decode service resp msg"),
        other => panic!("expected binary, got {other:?}"),
    };
    assert_eq!(service_resp_msg.kind, MessageKind::Response);
    assert_eq!(service_resp_msg.opcode(), Opcode::SystemListServices);
    let service_resp =
        ListServicesResponse::decode(service_resp_msg.payload).expect("decode service resp");
    assert!(service_resp.systemd_available || service_resp.services.is_empty());

    client_ws.close(None).await.expect("client close");
    let _ = server_handle.await;
}
