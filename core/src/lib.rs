//! tico-core: what tico decides — moods, moments, behaviours, memory, reminders,
//! copy. No UI and no OS-specific code: each native shell draws what the core
//! says and tells it what happened. Exposed to the shells through UniFFI, the
//! same way Flint's core is.
//!
//! - [`data`]: the pure functions of `src/data/companion.ts` (time, energy,
//!   feelings, palette, apps, dances, familiarity, what he wears).
//! - [`copy`]: what he says, in both languages, from `art/copy.json`.
//! - [`store`]: `tico.json` and `memory.json`, as the Tauri build writes them.
//! - [`brain`]: the poll that decides on its own — sleep, waking, feelings,
//!   and which [`moments`] he has unprompted.

use std::sync::Arc;

uniffi::setup_scaffolding!("tico");

pub mod brain;
pub mod copy;
pub mod data;
pub mod moments;
pub mod store;

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
