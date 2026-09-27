mod error;
mod message;

pub mod v1 {
    include!(concat!(env!("OUT_DIR"), "/kairo.v1.rs"));
}

pub use error::ProtocolError;
pub use message::{KairoMessage, MessageKind, Opcode};
