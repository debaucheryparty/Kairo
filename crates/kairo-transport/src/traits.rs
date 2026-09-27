use crate::TransportError;
use bytes::Bytes;

#[allow(async_fn_in_trait)]
pub trait Transport: Send + Sync {
    async fn send(&mut self, data: Bytes) -> Result<(), TransportError>;
    async fn recv(&mut self) -> Result<Bytes, TransportError>;
    async fn close(&mut self) -> Result<(), TransportError>;
    fn is_connected(&self) -> bool;
}
