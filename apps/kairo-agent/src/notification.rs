use kairo_protocol::v1::{Notification, NotificationEvent};
use std::sync::Arc;
use tokio::sync::{RwLock, broadcast};

const MAX_NOTIFICATIONS: usize = 100;

#[derive(Clone)]
pub struct NotificationManager {
    notifications: Arc<RwLock<Vec<Notification>>>,
    events_tx: broadcast::Sender<NotificationEvent>,
}

impl Default for NotificationManager {
    fn default() -> Self {
        Self::new()
    }
}

impl NotificationManager {
    #[must_use]
    pub fn new() -> Self {
        let (events_tx, _) = broadcast::channel(64);
        Self {
            notifications: Arc::new(RwLock::new(Vec::new())),
            events_tx,
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<NotificationEvent> {
        self.events_tx.subscribe()
    }

    pub async fn list(&self) -> Vec<Notification> {
        self.notifications.read().await.clone()
    }

    pub async fn close(&self, id: &str) -> bool {
        let mut list = self.notifications.write().await;
        let initial_len = list.len();
        list.retain(|n| n.id != id);
        list.len() < initial_len
    }

    pub async fn invoke_action(&self, id: &str, _action_key: &str) -> bool {
        let list = self.notifications.read().await;
        list.iter().any(|n| n.id == id)
    }

    pub async fn push_notification(&self, notification: Notification) {
        {
            let mut list = self.notifications.write().await;
            list.retain(|n| n.id != notification.id);
            list.insert(0, notification.clone());
            if list.len() > MAX_NOTIFICATIONS {
                list.truncate(MAX_NOTIFICATIONS);
            }
        }

        let _ = self.events_tx.send(NotificationEvent {
            notification: Some(notification),
        });
    }
}
