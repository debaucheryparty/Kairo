#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::sync::Arc;
use std::time::Duration;

use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use kairo_agent::{AgentConfig, Session};
use kairo_common::KairoId;
use kairo_protocol::v1::{
    DisplayServer, HandshakeAck, HandshakeInit, OsFamily, PlatformSupportTier, PrivilegeLevel,
};
use kairo_protocol::{KairoMessage, MessageKind};
use prost::Message as ProstMessage;
use tempfile::TempDir;
use tokio::net::TcpListener;
use tokio::time::timeout;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message as WsMessage;

async fn run_handshake(config: Arc<AgentConfig>) -> (HandshakeAck, impl Drop) {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind listener");
    let addr = listener.local_addr().expect("local addr");

    let server_handle = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.expect("accept");
        let ws = tokio_tungstenite::accept_async(stream)
            .await
            .expect("ws accept");
        let mut session = Session::new(config);
        let _ = session.run(ws).await;
    });

    let url = format!("ws://{addr}");
    let (mut ws, _) = connect_async(&url).await.expect("connect");

    let init = HandshakeInit {
        protocol_version: 1,
        client_id: "discovery-test-client".to_string(),
        ..Default::default()
    };
    let mut buf = Vec::new();
    init.encode(&mut buf).expect("encode init");
    let msg = KairoMessage::new(MessageKind::HandshakeInit, 1, Bytes::from(buf));
    ws.send(WsMessage::Binary(msg.encode().expect("encode msg")))
        .await
        .expect("send init");

    let raw = timeout(Duration::from_secs(5), ws.next())
        .await
        .expect("timeout")
        .expect("item")
        .expect("ws msg");

    let km = KairoMessage::decode(raw.into_data()).expect("decode km");
    assert_eq!(km.kind, MessageKind::HandshakeAck);
    let ack = HandshakeAck::decode(km.payload).expect("decode ack");

    ws.close(None).await.expect("close");
    (ack, server_handle)
}

#[tokio::test]
async fn test_handshake_ack_includes_system_profile() {
    let temp = TempDir::new().expect("tempdir");
    let config = Arc::new(AgentConfig {
        bind_address: "127.0.0.1:0".to_string(),
        data_dir: temp.path().to_string_lossy().to_string(),
        agent_id: KairoId::new(),
        ..Default::default()
    });

    let (ack, _server) = run_handshake(config).await;

    assert!(ack.authenticated);
    assert!(
        ack.capabilities.contains(&"discovery.v1".to_string()),
        "expected discovery.v1 in capabilities, got: {:?}",
        ack.capabilities
    );

    let profile = ack
        .system_profile
        .expect("system_profile must be present in HandshakeAck");

    assert_eq!(profile.profile_version, 2, "profile_version must be 2");
}

#[tokio::test]
async fn test_system_profile_os_family_and_tier() {
    let temp = TempDir::new().expect("tempdir");
    let config = Arc::new(AgentConfig {
        bind_address: "127.0.0.1:0".to_string(),
        data_dir: temp.path().to_string_lossy().to_string(),
        agent_id: KairoId::new(),
        ..Default::default()
    });

    let (ack, _server) = run_handshake(config).await;
    let profile = ack.system_profile.expect("profile present");

    let family = OsFamily::try_from(profile.os_family).expect("valid OsFamily variant");
    assert_ne!(
        family,
        OsFamily::Unknown,
        "os_family must not be Unknown on a real host"
    );

    let tier = PlatformSupportTier::try_from(profile.support_tier).expect("valid tier");
    assert_ne!(
        tier,
        PlatformSupportTier::Unspecified,
        "support_tier must be classified"
    );

    // Native adapter is available for supported Linux platforms in Milestone 2
    if cfg!(target_os = "linux") {
        assert!(profile.native_adapter_available);
    } else {
        assert!(!profile.native_adapter_available);
    }
}

#[tokio::test]
async fn test_system_profile_privilege_semantics() {
    let temp = TempDir::new().expect("tempdir");
    let config = Arc::new(AgentConfig {
        bind_address: "127.0.0.1:0".to_string(),
        data_dir: temp.path().to_string_lossy().to_string(),
        agent_id: KairoId::new(),
        ..Default::default()
    });

    let (ack, _server) = run_handshake(config).await;
    let profile = ack.system_profile.expect("profile present");

    let level = PrivilegeLevel::try_from(profile.privilege_level).expect("valid level");
    if profile.is_elevated {
        assert_eq!(level, PrivilegeLevel::Root);
    } else if profile.sudo_passwordless {
        assert_eq!(level, PrivilegeLevel::Sudo);
        assert!(profile.sudo_available);
    } else {
        assert_eq!(level, PrivilegeLevel::User);
    }

    assert_eq!(profile.has_sudo, profile.sudo_passwordless);
}

#[tokio::test]
async fn test_system_profile_isolation_capabilities() {
    let temp = TempDir::new().expect("tempdir");
    let config = Arc::new(AgentConfig {
        bind_address: "127.0.0.1:0".to_string(),
        data_dir: temp.path().to_string_lossy().to_string(),
        agent_id: KairoId::new(),
        ..Default::default()
    });

    let (ack, _server) = run_handshake(config).await;
    let profile = ack.system_profile.expect("profile present");

    let iso = profile.isolation.expect("isolation capabilities present");
    if cfg!(target_os = "linux") {
        let _ = iso.cgroup_v2;
        let _ = iso.user_namespaces;
    } else {
        assert!(!iso.restriction_reason.is_empty());
    }
}

#[tokio::test]
async fn test_system_profile_hardware_and_encoder_separation() {
    let temp = TempDir::new().expect("tempdir");
    let config = Arc::new(AgentConfig {
        bind_address: "127.0.0.1:0".to_string(),
        data_dir: temp.path().to_string_lossy().to_string(),
        agent_id: KairoId::new(),
        ..Default::default()
    });

    let (ack, _server) = run_handshake(config).await;
    let profile = ack.system_profile.expect("profile present");

    assert!(profile.cpu_cores > 0);
    assert!(profile.memory_total_bytes > 0);

    let gpu = profile.gpu.expect("gpu info present");
    if !gpu.available {
        assert!(!gpu.has_hardware_encoder);
        assert_eq!(gpu.encoder_type, "none");
    } else if !gpu.has_hardware_encoder {
        assert!(gpu.encoder_type == "none" || gpu.encoder_type == "unverified");
    }
}

#[tokio::test]
async fn test_system_profile_display_server_validity() {
    let temp = TempDir::new().expect("tempdir");
    let config = Arc::new(AgentConfig {
        bind_address: "127.0.0.1:0".to_string(),
        data_dir: temp.path().to_string_lossy().to_string(),
        agent_id: KairoId::new(),
        ..Default::default()
    });

    let (ack, _server) = run_handshake(config).await;
    let profile = ack.system_profile.expect("profile present");

    let ds = DisplayServer::try_from(profile.display_server).expect("valid display server");
    assert!(matches!(
        ds,
        DisplayServer::None | DisplayServer::X11 | DisplayServer::Wayland | DisplayServer::Both
    ));
}
