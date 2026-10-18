//! tico-core: what tico decides — moods, moments, behaviours, memory, reminders,
//! copy. No UI and no OS-specific code: each native shell draws what the core
//! says and tells it what happened. Exposed to the shells through UniFFI, the
//! same way Flint's core is.
//!
//! Only the skeleton exists so far: one object the shells can create, which
//! proves the whole chain (Rust → static library → generated bindings → app).

use std::sync::Arc;

uniffi::setup_scaffolding!("tico");

#[derive(uniffi::Object)]
pub struct TicoCore {}

#[uniffi::export]
impl TicoCore {
    #[uniffi::constructor]
    pub fn new() -> Arc<Self> {
        Arc::new(Self {})
    }

    /// The core's version, which the shell shows next to its own.
    pub fn version(&self) -> String {
        env!("CARGO_PKG_VERSION").to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_the_crate_version() {
        assert_eq!(TicoCore::new().version(), env!("CARGO_PKG_VERSION"));
    }
}
