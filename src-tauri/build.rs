// ─────────────────────────────────────────────────────────────────────────
// Tauri Build Script
// ─────────────────────────────────────────────────────────────────────────
// This runs before the Rust compiler. It tells Tauri to generate the
// necessary boilerplate for the desktop app wrapper.

fn main() {
    tauri_build::build()
}
