#![allow(clippy::unwrap_used, clippy::expect_used)]

use kairo_agent::media::MediaManager;
use kairo_agent::notification::NotificationManager;
use kairo_protocol::v1::{
    MediaControlAction, MediaControlRequest, Notification, NotificationUrgency,
};

#[tokio::test]
async fn test_media_manager_graceful_empty_discovery() {
    let manager = MediaManager::new();
    let resp = manager.get_players().await;
    // On systems without playerctl / running MPRIS players, should safely return empty without error
    if resp.players.is_empty() {
        assert_eq!(resp.active_player_id, "");
    }
}

#[tokio::test]
async fn test_media_manager_safe_control() {
    let manager = MediaManager::new();
    let req = MediaControlRequest {
        player_id: "nonexistent-player".to_string(),
        action: MediaControlAction::PlayPause as i32,
        seek_offset_us: 0,
        volume: 0.8,
    };
    let res = manager.control(req).await;
    assert!(res.is_ok());
}

#[tokio::test]
async fn test_notification_manager_lifecycle() {
    let manager = NotificationManager::new();
    let mut rx = manager.subscribe();

    let notif = Notification {
        id: "notif-1".to_string(),
        app_name: "Spotify".to_string(),
        title: "Song Playing".to_string(),
        body: "Artist - Title".to_string(),
        icon: "music_note".to_string(),
        image: String::new(),
        timestamp: 123456789,
        urgency: NotificationUrgency::Normal as i32,
        actions: Vec::new(),
        category: "media".to_string(),
    };

    manager.push_notification(notif.clone()).await;

    let received = rx.recv().await.expect("receive notification event");
    assert_eq!(
        received.notification.expect("notification present").id,
        "notif-1"
    );

    let list = manager.list().await;
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].id, "notif-1");

    let action_res = manager.invoke_action("notif-1", "default").await;
    assert!(action_res);

    let closed = manager.close("notif-1").await;
    assert!(closed);

    let list_after = manager.list().await;
    assert_eq!(list_after.len(), 0);
}
