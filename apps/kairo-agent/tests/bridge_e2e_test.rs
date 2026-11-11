#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::sync::Arc;
use std::time::Duration;

use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use kairo_agent::{AgentConfig, Session};
use kairo_common::KairoId;
use kairo_protocol::v1::{
    HandshakeAck, HandshakeInit, InstallPackagesRequest, InstallPackagesResponse,
    ListPackagesRequest, ListPackagesResponse, ListServicesRequest, ListServicesResponse,
    RemovePackagesRequest, RemovePackagesResponse,
};
use kairo_protocol::{KairoMessage, MessageKind, Opcode};
use prost::Message as ProstMessage;
use tempfile::TempDir;
use tokio::net::TcpListener;
use tokio::time::timeout;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message as WsMessage;

#[tokio::test]
async fn test_bridge_services_and_packages_e2e_over_websocket() {
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

    // 1. Handshake
    let init = HandshakeInit {
        protocol_version: 1,
        client_id: "test-bridge-client".to_string(),
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
    let ack = HandshakeAck::decode(ack_msg.payload).expect("decode ack");
    assert!(
        ack.capabilities.contains(&"bridge.v1".to_string()),
        "capabilities must contain bridge.v1"
    );
    assert!(
        ack.capabilities.contains(&"package.v1".to_string()),
        "capabilities must contain package.v1"
    );
    assert!(
        ack.capabilities.contains(&"core.v1".to_string()),
        "capabilities must contain core.v1"
    );

    // 2. List Services
    let service_req = ListServicesRequest {};
    let mut service_payload = Vec::new();
    service_req
        .encode(&mut service_payload)
        .expect("encode service");
    let service_msg = KairoMessage::with_opcode(
        MessageKind::Request,
        Opcode::SystemListServices,
        2,
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
    assert_eq!(service_resp_msg.opcode(), Opcode::SystemListServices);
    let service_resp =
        ListServicesResponse::decode(service_resp_msg.payload).expect("decode service resp");
    if service_resp.service_manager_available {
        assert!(!service_resp.manager_name.is_empty());
    }

    // 3. List Packages
    let pkg_list_req = ListPackagesRequest {
        filter: String::new(),
    };
    let mut pkg_list_payload = Vec::new();
    pkg_list_req
        .encode(&mut pkg_list_payload)
        .expect("encode pkg list");
    let pkg_list_msg = KairoMessage::with_opcode(
        MessageKind::Request,
        Opcode::PackageList,
        3,
        Bytes::from(pkg_list_payload),
    );
    client_ws
        .send(WsMessage::Binary(
            pkg_list_msg.encode().expect("encode pkg list msg"),
        ))
        .await
        .expect("send pkg list req");

    let pkg_list_raw = timeout(Duration::from_secs(5), client_ws.next())
        .await
        .expect("pkg list timeout")
        .expect("item")
        .expect("ws");
    let pkg_list_msg_resp = match pkg_list_raw {
        WsMessage::Binary(b) => KairoMessage::decode(b).expect("decode pkg list resp"),
        other => panic!("expected binary, got {other:?}"),
    };
    assert_eq!(pkg_list_msg_resp.opcode(), Opcode::PackageList);
    let pkg_list_resp =
        ListPackagesResponse::decode(pkg_list_msg_resp.payload).expect("decode pkg list");
    if pkg_list_resp.package_manager_available {
        assert!(!pkg_list_resp.manager_name.is_empty());
    }

    // 4. Install Packages (validation / unsupported / permissions test)
    let install_req = InstallPackagesRequest {
        package_names: vec!["curl".to_string()],
    };
    let mut install_payload = Vec::new();
    install_req
        .encode(&mut install_payload)
        .expect("encode install req");
    let install_msg = KairoMessage::with_opcode(
        MessageKind::Request,
        Opcode::PackageInstall,
        4,
        Bytes::from(install_payload),
    );
    client_ws
        .send(WsMessage::Binary(
            install_msg.encode().expect("encode install msg"),
        ))
        .await
        .expect("send install req");

    let install_raw = timeout(Duration::from_secs(5), client_ws.next())
        .await
        .expect("install timeout")
        .expect("item")
        .expect("ws");
    let install_msg_resp = match install_raw {
        WsMessage::Binary(b) => KairoMessage::decode(b).expect("decode install resp"),
        other => panic!("expected binary, got {other:?}"),
    };
    assert_eq!(install_msg_resp.opcode(), Opcode::PackageInstall);
    let install_resp =
        InstallPackagesResponse::decode(install_msg_resp.payload).expect("decode install");
    // In unprivileged test environment or unsupported OS, it cleanly returns structured response
    assert!(!install_resp.message.is_empty() || install_resp.success);

    // 5. Remove Packages
    let remove_req = RemovePackagesRequest {
        package_names: vec!["curl".to_string()],
    };
    let mut remove_payload = Vec::new();
    remove_req
        .encode(&mut remove_payload)
        .expect("encode remove req");
    let remove_msg = KairoMessage::with_opcode(
        MessageKind::Request,
        Opcode::PackageRemove,
        5,
        Bytes::from(remove_payload),
    );
    client_ws
        .send(WsMessage::Binary(
            remove_msg.encode().expect("encode remove msg"),
        ))
        .await
        .expect("send remove req");

    let remove_raw = timeout(Duration::from_secs(5), client_ws.next())
        .await
        .expect("remove timeout")
        .expect("item")
        .expect("ws");
    let remove_msg_resp = match remove_raw {
        WsMessage::Binary(b) => KairoMessage::decode(b).expect("decode remove resp"),
        other => panic!("expected binary, got {other:?}"),
    };
    assert_eq!(remove_msg_resp.opcode(), Opcode::PackageRemove);
    let remove_resp =
        RemovePackagesResponse::decode(remove_msg_resp.payload).expect("decode remove");
    assert!(!remove_resp.message.is_empty() || remove_resp.success);

    client_ws.close(None).await.expect("client close");
    let _ = server_handle.await;
}
