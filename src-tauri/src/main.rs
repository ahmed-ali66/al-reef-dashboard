// ─────────────────────────────────────────────────────────────────────────
// Tauri Desktop App — Main Entry Point (Rust)
// ─────────────────────────────────────────────────────────────────────────
// This is the first code that runs when the user opens the desktop app.
// It sets up the native window, loads the Next.js app, starts the local
// database, and launches the background sync agent.
//
// THINK OF THIS AS: The engine room of the desktop app. The Next.js app
// is the dashboard/steering wheel; this Rust code is the engine + transmission.

// Prevents additional console window on Windows in release mode
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::Manager;

// ── Local SQLite database ──────────────────────────────────────────────
// We store the database connection in Tauri's state so all commands can
// access it. Mutex ensures only one thread writes at a time (SQLite isn't
// thread-safe by default).
use rusqlite::Connection;

struct DbState(Mutex<Connection>);

// ── Sync agent state ───────────────────────────────────────────────────
// Tracks whether sync is running, last sync time, pending changes count.
struct SyncState {
    last_sync: Mutex<Option<std::time::SystemTime>>,
    pending_count: Mutex<u32>,
    is_online: Mutex<bool>,
}

// ─────────────────────────────────────────────────────────────────────────
// TAURI COMMANDS — Functions that JavaScript can call
// ─────────────────────────────────────────────────────────────────────────
// These are like API endpoints, but instead of HTTP, the Next.js app calls
// them directly through Tauri's IPC (inter-process communication).
//
// Example from JavaScript:
//   import { invoke } from '@tauri-apps/api/core'
//   const result = await invoke('get_db_version')
//
// This is FAST — no network, no HTTP overhead. Just a function call
// between the web view and the Rust process.

/// Returns the SQLite database version (health check command).
#[tauri::command]
fn get_db_version(state: tauri::State<DbState>) -> String {
    let conn = state.0.lock().unwrap();
    conn.query_row("SELECT sqlite_version()", [], |row| row.get(0))
        .unwrap_or_else(|_| "unknown".to_string())
}

/// Returns the current sync status (for the UI indicator).
#[tauri::command]
fn get_sync_status(state: tauri::State<SyncState>) -> SyncStatusResponse {
    let last_sync = state.last_sync.lock().unwrap();
    let pending = state.pending_count.lock().unwrap();
    let online = state.is_online.lock().unwrap();

    SyncStatusResponse {
        last_sync: last_sync.map(|t| {
            t.duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0)
        }),
        pending_count: *pending,
        is_online: *online,
    }
}

#[derive(serde::Serialize)]
struct SyncStatusResponse {
    last_sync: Option<u64>,
    pending_count: u32,
    is_online: bool,
}

// ─────────────────────────────────────────────────────────────────────────
// DATABASE INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────
// On first launch, we create the local SQLite database and set up the
// schema. This is a simplified schema for the POC — in Phase 2, we'll
// switch to PostgreSQL and mirror the full Prisma schema.

fn init_database(app: &tauri::App) -> Result<Connection, Box<dyn std::error::Error>> {
    // Store the database file in the app's data directory
    // (e.g., C:\Users\<user>\AppData\Roaming\Al Reef Al Madeena\ on Windows)
    let app_data_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&app_data_dir)?;

    let db_path = app_data_dir.join("al-reef-local.db");
    println!("[DESKTOP] Database path: {:?}", db_path);

    let conn = Connection::open(db_path)?;

    // Enable WAL mode (Write-Ahead Logging) for better performance + crash safety
    conn.execute("PRAGMA journal_mode=WAL;", [])?;
    conn.execute("PRAGMA foreign_keys=ON;", [])?;

    // Create a simple config table for storing app state
    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_config (
            key TEXT PRIMARY KEY,
            value TEXT
        );",
        [],
    )?;

    // Create a sync queue table — tracks changes that need to be pushed to cloud
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sync_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_name TEXT NOT NULL,
            record_id TEXT NOT NULL,
            action TEXT NOT NULL,  -- 'create', 'update', 'delete'
            payload TEXT,          -- JSON of the changed data
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            synced INTEGER NOT NULL DEFAULT 0
        );",
        [],
    )?;

    // Store the database version
    conn.execute(
        "INSERT OR REPLACE INTO app_config (key, value) VALUES ('schema_version', '1.0.0');",
        [],
    )?;

    println!("[DESKTOP] Database initialized successfully");
    Ok(conn)
}

// ─────────────────────────────────────────────────────────────────────────
// SYNC AGENT (Background task)
// ─────────────────────────────────────────────────────────────────────────
// This runs in the background, periodically pushing local changes to the
// Vercel cloud and pulling cloud changes to the local database.
// For the POC, it just logs that it's running — we'll implement the actual
// sync logic in Phase 2.

async fn run_sync_agent(app_handle: tauri::AppHandle) {
    println!("[SYNC] Background sync agent started");

    loop {
        // Wait 30 seconds between sync cycles
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;

        // Get sync state
        let sync_state: tauri::State<SyncState> = app_handle.state();

        // Check if we're online (simplified — in Phase 2 we'll do a proper health check)
        let is_online = check_online_status().await;
        *sync_state.is_online.lock().unwrap() = is_online;

        if is_online {
            // In Phase 2, this will:
            // 1. Read unsynced records from sync_queue
            // 2. Push them to POST /api/sync/push on Vercel
            // 3. Pull changes from GET /api/sync/pull?since=<last_sync>
            // 4. Apply pulled changes to local DB
            // 5. Update last_sync timestamp

            println!("[SYNC] Online — would sync now (Phase 2 will implement this)");
            *sync_state.last_sync.lock().unwrap() = Some(std::time::SystemTime::now());
        } else {
            println!("[SYNC] Offline — skipping sync cycle");
        }
    }
}

async fn check_online_status() -> bool {
    // Simple connectivity check — try to reach the Vercel health endpoint
    // In Phase 2, we'll make this more robust (timeout, retry, etc.)
    match reqwest::get("https://al-reef-al-junoobi.vercel.app/api/health").await {
        Ok(response) => response.status().is_success(),
        Err(_) => false,
    }
}

// ─────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────
// This is the first function that runs when the app launches.

fn main() {
    println!("[DESKTOP] Al Reef Al Madeena Desktop App starting...");

    tauri::Builder::default()
        // Register the shell plugin (allows opening URLs in browser, etc.)
        .plugin(tauri_plugin_shell::init())
        // Set up the database before the window opens
        .setup(|app| {
            let conn = init_database(app).expect("Failed to initialize database");
            app.manage(DbState(Mutex::new(conn)));
            app.manage(SyncState {
                last_sync: Mutex::new(None),
                pending_count: Mutex::new(0),
                is_online: Mutex::new(false),
            });

            // Launch the sync agent in the background
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                run_sync_agent(app_handle).await;
            });

            println!("[DESKTOP] App ready — window opening");
            Ok(())
        })
        // Register commands that JavaScript can call
        .invoke_handler(tauri::generate_handler![
            get_db_version,
            get_sync_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
