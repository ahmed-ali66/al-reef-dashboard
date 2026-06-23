// ─────────────────────────────────────────────────────────────────────────
// Tauri Desktop App — Generic Sync Engine (Phase 1 Step 4)
// ─────────────────────────────────────────────────────────────────────────
// This version uses a GENERIC sync approach:
//   - One local_data table stores ALL records as JSON (keyed by table + id)
//   - One sync-pull-all endpoint pulls every table in one request
//   - Generic Tauri commands: get_local_data(tableName), save_local_data(...)
//   - Works for ANY table — no per-table code needed

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::Manager;
use rusqlite::Connection;
use serde::Serialize;
use std::process::{Command, Stdio};
use std::time::Duration;

// ── State ──────────────────────────────────────────────────────────────
struct DbState(Mutex<Connection>);
struct SyncState {
    last_sync: Mutex<Option<String>>,
    pending_count: Mutex<u32>,
    is_online: Mutex<bool>,
    last_error: Mutex<Option<String>>,
    company_id: Mutex<Option<String>>,
}
struct ServerProcess(Mutex<Option<std::process::Child>>);

const API_BASE: &str = "http://localhost:3000";

// ─────────────────────────────────────────────────────────────────────────
// TAURI COMMANDS
// ─────────────────────────────────────────────────────────────────────────

#[tauri::command]
fn get_db_version(state: tauri::State<DbState>) -> String {
    let conn = state.0.lock().unwrap();
    conn.query_row("SELECT sqlite_version()", [], |row| row.get(0))
        .unwrap_or_else(|_| "unknown".to_string())
}

#[tauri::command]
fn get_sync_status(state: tauri::State<SyncState>) -> SyncStatusResponse {
    let last_sync = state.last_sync.lock().unwrap();
    let pending = state.pending_count.lock().unwrap();
    let online = state.is_online.lock().unwrap();
    let error = state.last_error.lock().unwrap();
    SyncStatusResponse {
        last_sync: last_sync.clone(),
        pending_count: *pending,
        is_online: *online,
        last_error: error.clone(),
    }
}

#[derive(Serialize)]
struct SyncStatusResponse {
    last_sync: Option<String>,
    pending_count: u32,
    is_online: bool,
    last_error: Option<String>,
}

#[tauri::command]
fn get_local_cheque_count(state: tauri::State<DbState>) -> i64 {
    let conn = state.0.lock().unwrap();
    conn.query_row("SELECT count(*) FROM local_data WHERE table_name = 'cheques'", [], |row| row.get(0))
        .unwrap_or(0)
}

#[tauri::command]
async fn trigger_sync(app_handle: tauri::AppHandle) -> Result<String, String> {
    println!("[SYNC] Manual sync triggered");
    perform_sync_cycle(&app_handle).await;
    Ok("Sync completed".to_string())
}

#[tauri::command]
fn set_company_id(company_id: String, state: tauri::State<SyncState>) {
    println!("[SYNC] Company ID set: {}", company_id);
    *state.company_id.lock().unwrap() = Some(company_id);
}

// ─────────────────────────────────────────────────────────────────────────
// LICENSE SYSTEM — hardware fingerprinting + activation
// ─────────────────────────────────────────────────────────────────────────

/// Returns the hardware fingerprint for this machine.
/// Used by the license system to tie a license to one specific PC.
#[tauri::command]
fn get_hardware_fingerprint() -> String {
    let uid = machine_uid::get().unwrap_or_else(|_| "unknown".to_string());
    // Hash it with SHA-256 for a consistent, privacy-safe fingerprint
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(uid.as_bytes());
    let result = hasher.finalize();
    format!("{:x}", result)
}

/// Returns the machine name (hostname) for display purposes.
#[tauri::command]
fn get_machine_name() -> String {
    hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "Unknown".to_string())
}

/// Checks if a license is stored locally (already activated).
/// Returns the activation token if present, or null if not activated.
#[tauri::command]
fn get_stored_license(state: tauri::State<DbState>) -> Option<String> {
    let conn = state.0.lock().unwrap();
    conn.query_row(
        "SELECT value FROM app_config WHERE key = 'activation_token'",
        [],
        |row| row.get(0),
    )
    .ok()
}

/// Stores the activation token locally (after successful activation).
#[tauri::command]
fn store_license(activation_token: String, license_key: String, state: tauri::State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO app_config (key, value) VALUES ('activation_token', ?1);",
        rusqlite::params![&activation_token],
    ).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO app_config (key, value) VALUES ('license_key', ?1);",
        rusqlite::params![&license_key],
    ).map_err(|e| e.to_string())?;
    println!("[LICENSE] License stored locally: {}", license_key);
    Ok(())
}

/// Clears the stored license (deactivation).
#[tauri::command]
fn clear_stored_license(state: tauri::State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute("DELETE FROM app_config WHERE key IN ('activation_token', 'license_key');", [])
        .map_err(|e| e.to_string())?;
    println!("[LICENSE] License cleared");
    Ok(())
}

/// Returns the stored license key (for display in the license dialog).
#[tauri::command]
fn get_stored_license_key(state: tauri::State<DbState>) -> Option<String> {
    let conn = state.0.lock().unwrap();
    conn.query_row(
        "SELECT value FROM app_config WHERE key = 'license_key'",
        [],
        |row| row.get(0),
    )
    .ok()
}

// ─────────────────────────────────────────────────────────────────────────
// GENERIC DATA ACCESS — works for ANY table
// ─────────────────────────────────────────────────────────────────────────

/// Returns all records for a given table from local SQLite as JSON.
/// The frontend calls this instead of /api/<table> when offline.
/// Returns: { "data": [...records], "pagination": { "total": N } }
#[tauri::command]
fn get_local_data(table_name: String, state: tauri::State<DbState>) -> Result<String, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT data FROM local_data WHERE table_name = ?1 ORDER BY id")
        .map_err(|e| e.to_string())?;

    let rows: Vec<serde_json::Value> = stmt
        .query_map(rusqlite::params![&table_name], |row| {
            let data_str: String = row.get(0)?;
            Ok(serde_json::from_str(&data_str).unwrap_or(serde_json::json!({})))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let result = serde_json::json!({
        "data": rows,
        "pagination": { "total": rows.len() }
    });
    Ok(result.to_string())
}

/// Saves a record to local SQLite + adds it to the sync queue.
/// Works for ANY table — the record is stored as JSON.
#[tauri::command]
fn save_local_data(
    table_name: String,
    record_id: String,
    record_json: String,
    action: String,
    state: tauri::State<DbState>,
) -> Result<String, String> {
    let now = chrono::Utc::now().to_rfc3339();
    let conn = state.0.lock().unwrap();

    if action == "delete" {
        // Delete from local_data
        conn.execute(
            "DELETE FROM local_data WHERE table_name = ?1 AND id = ?2",
            rusqlite::params![&table_name, &record_id],
        ).map_err(|e| e.to_string())?;
    } else {
        // Upsert into local_data
        conn.execute(
            "INSERT OR REPLACE INTO local_data (table_name, id, data, last_synced) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![&table_name, &record_id, &record_json, &now],
        ).map_err(|e| e.to_string())?;
    }

    // Add to sync_queue
    conn.execute(
        "INSERT INTO sync_queue (table_name, record_id, action, payload) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![&table_name, &record_id, &action, &record_json],
    ).map_err(|e| e.to_string())?;

    println!("[DESKTOP] Saved {} {} locally + queued for sync (action: {})", table_name, record_id, action);
    Ok(record_id)
}

// ─────────────────────────────────────────────────────────────────────────
// DATABASE INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────

fn init_database(app: &tauri::App) -> Result<Connection, Box<dyn std::error::Error>> {
    let app_data_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&app_data_dir)?;

    let db_path = app_data_dir.join("al-reef-local.db");
    println!("[DESKTOP] Database path: {:?}", db_path);

    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;

    // App config
    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_config (
            key TEXT PRIMARY KEY,
            value TEXT
        );",
        [],
    )?;

    // Sync queue
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sync_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_name TEXT NOT NULL,
            record_id TEXT NOT NULL,
            action TEXT NOT NULL,
            payload TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            synced INTEGER NOT NULL DEFAULT 0
        );",
        [],
    )?;

    // ── GENERIC local_data table ──────────────────────────────────────
    // Stores ALL records from ALL tables as JSON. Keyed by (table_name, id).
    // This is the key insight: instead of mirroring the full Prisma schema
    // (20+ tables with different columns), we store everything as JSON.
    // The frontend reads/writes JSON — it doesn't care about columns.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS local_data (
            table_name TEXT NOT NULL,
            id TEXT NOT NULL,
            data TEXT NOT NULL,
            last_synced TEXT,
            PRIMARY KEY (table_name, id)
        );",
        [],
    )?;

    // Index for fast lookups by table name
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_local_data_table ON local_data(table_name);",
        [],
    )?;

    conn.execute(
        "INSERT OR REPLACE INTO app_config (key, value) VALUES ('schema_version', '2.0.0');",
        [],
    )?;

    println!("[DESKTOP] Database initialized (schema v2.0.0 — generic sync)");
    Ok(conn)
}

// ─────────────────────────────────────────────────────────────────────────
// SYNC AGENT
// ─────────────────────────────────────────────────────────────────────────

async fn run_sync_agent(app_handle: tauri::AppHandle) {
    println!("[SYNC] Background sync agent started");
    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    perform_sync_cycle(&app_handle).await;

    loop {
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        perform_sync_cycle(&app_handle).await;
    }
}

async fn perform_sync_cycle(app_handle: &tauri::AppHandle) {
    let sync_state: tauri::State<SyncState> = app_handle.state();

    let company_id = sync_state.company_id.lock().unwrap().clone();
    if company_id.is_none() {
        return;
    }
    let company_id = company_id.unwrap();

    let is_online = check_online_status().await;
    *sync_state.is_online.lock().unwrap() = is_online;

    if !is_online {
        *sync_state.last_error.lock().unwrap() = None;
        return;
    }

    // Push
    let push_result = push_local_changes(app_handle, &company_id).await;
    match &push_result {
        Ok(count) => {
            if *count > 0 {
                println!("[SYNC] Pushed {} changes to cloud", count);
            }
            *sync_state.last_error.lock().unwrap() = None;
        }
        Err(e) => {
            println!("[SYNC] Push error: {}", e);
            *sync_state.last_error.lock().unwrap() = Some(e.clone());
        }
    }

    // Pull (ALL tables)
    let pull_result = pull_cloud_changes(app_handle, &company_id).await;
    match &pull_result {
        Ok(count) => {
            if *count > 0 {
                println!("[SYNC] Pulled {} changes from cloud", count);
            }
            let now = chrono::Utc::now().to_rfc3339();
            *sync_state.last_sync.lock().unwrap() = Some(now.clone());
            if let Some(db_state) = app_handle.try_state::<DbState>() {
                let conn = db_state.0.lock().unwrap();
                let _ = conn.execute(
                    "INSERT OR REPLACE INTO app_config (key, value) VALUES ('last_sync', ?1);",
                    rusqlite::params![&now],
                );
            }
        }
        Err(e) => {
            println!("[SYNC] Pull error: {}", e);
            *sync_state.last_error.lock().unwrap() = Some(e.clone());
        }
    }

    // Update pending count
    if let Some(db_state) = app_handle.try_state::<DbState>() {
        let conn = db_state.0.lock().unwrap();
        let count: i64 = conn
            .query_row("SELECT count(*) FROM sync_queue WHERE synced = 0", [], |row| row.get(0))
            .unwrap_or(0);
        *sync_state.pending_count.lock().unwrap() = count as u32;
    }
}

async fn check_online_status() -> bool {
    match reqwest::Client::new()
        .get(&format!("{}/api/health", API_BASE))
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
    {
        Ok(response) => response.status().is_success(),
        Err(_) => false,
    }
}

/// Push unsynced local changes to the cloud.
async fn push_local_changes(app_handle: &tauri::AppHandle, company_id: &str) -> Result<usize, String> {
    let db_state = app_handle
        .try_state::<DbState>()
        .ok_or("Database not initialized")?;

    let changes: Vec<(i64, String, String, String, Option<String>)> = {
        let conn = db_state.0.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, table_name, record_id, action, payload FROM sync_queue WHERE synced = 0 ORDER BY id LIMIT 100")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
            })
            .map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };

    if changes.is_empty() {
        return Ok(0);
    }

    let changes_json: Vec<serde_json::Value> = changes
        .iter()
        .map(|(_id, table, record_id, action, payload)| {
            let record = payload
                .as_ref()
                .and_then(|p| serde_json::from_str(p).ok())
                .unwrap_or(serde_json::json!({}));
            serde_json::json!({
                "table": table,
                "action": action,
                "recordId": record_id,
                "record": record,
            })
        })
        .collect();

    let push_body = serde_json::json!({ "companyId": company_id, "changes": changes_json });

    let client = reqwest::Client::new();
    let response = client
        .post(&format!("{}/api/desktop/sync-push", API_BASE))
        .header("Content-Type", "application/json")
        .json(&push_body)
        .send()
        .await
        .map_err(|e| format!("Push request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Push returned HTTP {}", response.status()));
    }

    let result: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let applied = result.get("applied").and_then(|v| v.as_u64()).unwrap_or(0);

    {
        let conn = db_state.0.lock().unwrap();
        for (id, _, _, _, _) in &changes {
            let _ = conn.execute("UPDATE sync_queue SET synced = 1 WHERE id = ?1", rusqlite::params![id]);
        }
    }

    Ok(applied as usize)
}

/// Pull ALL cloud changes and apply them to local SQLite (generic).
async fn pull_cloud_changes(app_handle: &tauri::AppHandle, company_id: &str) -> Result<usize, String> {
    let db_state = app_handle
        .try_state::<DbState>()
        .ok_or("Database not initialized")?;

    let since: Option<String> = {
        let conn = db_state.0.lock().unwrap();
        conn.query_row(
            "SELECT value FROM app_config WHERE key = 'last_sync'",
            [],
            |row| row.get(0),
        )
        .ok()
    };

    let since_param = since.unwrap_or_default();
    let url = if since_param.is_empty() {
        format!("{}/api/desktop/sync-pull-all?companyId={}", API_BASE, company_id)
    } else {
        format!("{}/api/desktop/sync-pull-all?companyId={}&since={}", API_BASE, company_id, since_param)
    };

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Pull request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Pull returned HTTP {}", response.status()));
    }

    let result: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let changes = result.get("changes").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let server_time = result
        .get("serverTime")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if changes.is_empty() {
        if !server_time.is_empty() {
            let conn = db_state.0.lock().unwrap();
            let _ = conn.execute(
                "INSERT OR REPLACE INTO app_config (key, value) VALUES ('last_sync', ?1);",
                rusqlite::params![&server_time],
            );
        }
        return Ok(0);
    }

    let mut applied = 0;
    let now = chrono::Utc::now().to_rfc3339();

    {
        let conn = db_state.0.lock().unwrap();

        for change in &changes {
            let table = change.get("table").and_then(|v| v.as_str()).unwrap_or("");
            let action = change.get("action").and_then(|v| v.as_str()).unwrap_or("");
            let record_id = change.get("recordId").and_then(|v| v.as_str()).unwrap_or("");
            let record = change.get("record").cloned().unwrap_or(serde_json::json!({}));
            let record_str = record.to_string();

            if action == "upsert" {
                let _ = conn.execute(
                    "INSERT OR REPLACE INTO local_data (table_name, id, data, last_synced) VALUES (?1, ?2, ?3, ?4)",
                    rusqlite::params![table, record_id, &record_str, &now],
                );
                applied += 1;
            } else if action == "delete" {
                let _ = conn.execute(
                    "DELETE FROM local_data WHERE table_name = ?1 AND id = ?2",
                    rusqlite::params![table, record_id],
                );
                applied += 1;
            }
        }

        if !server_time.is_empty() {
            let _ = conn.execute(
                "INSERT OR REPLACE INTO app_config (key, value) VALUES ('last_sync', ?1);",
                rusqlite::params![&server_time],
            );
        }
    }

    Ok(applied)
}

// ─────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────

fn main() {
    println!("[DESKTOP] Al Reef Al Madeena Desktop App starting...");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // ── Start the Next.js server (production mode only) ────────
            // In dev mode, the Next.js dev server is already running (beforeDevCommand).
            // In production (built .exe), we need to start the standalone server.
            #[cfg(not(debug_assertions))]
            {
                let resource_path = app.path().resource_dir()
                    .expect("Failed to get resource dir");
                let server_dir = resource_path.join("desktop-server");

                println!("[DESKTOP] Starting Next.js server from: {:?}", server_dir);

                // Use bundled Node.js if available, otherwise fall back to system Node.js
                let node_portable = server_dir.join("node-portable").join("node.exe");
                let node_exe = if node_portable.exists() {
                    println!("[DESKTOP] Using bundled Node.js: {:?}", node_portable);
                    node_portable.to_string_lossy().to_string()
                } else {
                    println!("[DESKTOP] Using system Node.js (node-portable not found)");
                    "node".to_string()
                };

                // Start the Node.js standalone server
                let server_process = Command::new(&node_exe)
                    .arg("server.js")
                    .current_dir(&server_dir)
                    .env("NODE_ENV", "production")
                    .env("PORT", "3000")
                    .env("HOSTNAME", "127.0.0.1")
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn();

                match server_process {
                    Ok(child) => {
                        println!("[DESKTOP] Next.js server started (PID: {})", child.id());
                        // Store the child process so we can kill it on exit
                        app.manage(ServerProcess(Mutex::new(Some(child))));
                    }
                    Err(e) => {
                        println!("[DESKTOP] WARNING: Could not start Node.js server: {}", e);
                        println!("[DESKTOP] The app will try to connect to an existing server at localhost:3000");
                    }
                }

                // Wait for the server to be ready (up to 10 seconds)
                println!("[DESKTOP] Waiting for server to be ready...");
                let client = reqwest::blocking::Client::new();
                for i in 1..=20 {
                    if let Ok(resp) = client.get("http://127.0.0.1:3000/api/health").timeout(Duration::from_secs(1)).send() {
                        if resp.status().is_success() {
                            println!("[DESKTOP] Server is ready! (attempt {})", i);
                            break;
                        }
                    }
                    std::thread::sleep(Duration::from_millis(500));
                }
            }

            let conn = init_database(app).expect("Failed to initialize database");
            app.manage(DbState(Mutex::new(conn)));
            app.manage(SyncState {
                last_sync: Mutex::new(None),
                pending_count: Mutex::new(0),
                is_online: Mutex::new(false),
                last_error: Mutex::new(None),
                company_id: Mutex::new(None),
            });

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                run_sync_agent(app_handle).await;
            });

            println!("[DESKTOP] App ready — window opening");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_db_version,
            get_sync_status,
            get_local_cheque_count,
            trigger_sync,
            set_company_id,
            get_local_data,
            save_local_data,
            // License system
            get_hardware_fingerprint,
            get_machine_name,
            get_stored_license,
            store_license,
            clear_stored_license,
            get_stored_license_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
