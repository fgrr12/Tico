//! Thin FFI artifact crate: links `tico-core` into a static/dynamic library
//! and re-exports its UniFFI scaffolding. No logic lives here.

tico_core::uniffi_reexport_scaffolding!();
