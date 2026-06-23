// ─────────────────────────────────────────────────────────────────────────
// Tauri Desktop App — Main Entry Point (Rust) — Phase 1 Step 2
// ─────────────────────────────────────────────────────────────────────────
// This version implements REAL sync logic:
//   1. Push: reads sync_queue, POSTs to Vercel /api/sync/push
//   2. Pull: GETs from Vercel /api/sync/pull, upserts into local SQLite
//   3. Local mirror tables: local_cheques, local_properties
//
// The sync agent runs every 30 seconds when online.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::Manager;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

// ── State ──────────────────────────────────────────────────────────────
struct DbState(Mutex<Connection>);
struct SyncState {
    last_sync: Mutex<Option<String>>,  // ISO timestamp
    pending_count: Mutex<u32>,
    is_online: Mutex<bool>,
    last_error: Mutex<Option<String>>,
    company_id: Mutex<Option<String>>,  // set by frontend after login
}

// ── API base URL ───────────────────────────────────────────────────────
// In dev mode: the Next.js app runs on localhost:3000
// In production: the Next.js standalone server runs on localhost:3000 (bundled)
const API_BASE: &str = "http://localhost:3000";

// ─────────────────────────────────────────────────────────────────────────
// TAURI COMMANDS — Functions that JavaScript can call
// ─────────────────────────────────────────────────────────────────────────

/// Returns the SQLite database version (health check).
#[tauri::command]
fn get_db_version(state: tauri::State<DbState>) -> String {
    let conn = state.0.lock().unwrap();
    conn.query_row("SELECT sqlite_version()", [], |row| row.get(0))
        .unwrap_or_else(|_| "unknown".to_string())
}

/// Returns the current sync status (for the UI badge).
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

/// Returns the count of local cheques (from the mirror table).
#[tauri::command]
fn get_local_cheque_count(state: tauri::State<DbState>) -> i64 {
    let conn = state.0.lock().unwrap();
    conn.query_row("SELECT count(*) FROM local_cheques", [], |row| row.get(0))
        .unwrap_or(0)
}

/// Manually trigger a sync cycle (called by the "Sync Now" button).
#[tauri::command]
async fn trigger_sync(app_handle: tauri::AppHandle) -> Result<String, String> {
    println!("[SYNC] Manual sync triggered");
    perform_sync_cycle(&app_handle).await;
    Ok("Sync completed".to_string())
}

/// Set the company ID (called by the frontend after login).
/// The sync agent uses this to know which company's data to sync.
#[tauri::command]
fn set_company_id(company_id: String, state: tauri::State<SyncState>) {
    println!("[SYNC] Company ID set: {}", company_id);
    *state.company_id.lock().unwrap() = Some(company_id);
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

    // Enable WAL mode for crash safety + performance
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;

    // ── App config table ──────────────────────────────────────────────
    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_config (
            key TEXT PRIMARY KEY,
            value TEXT
        );",
        [],
    )?;

    // ── Sync queue (tracks changes that need to be pushed to cloud) ──
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

    // ── Local mirror: cheques ────────────────────────────────────────
    conn.execute(
        "CREATE TABLE IF NOT EXISTS local_cheques (
            id TEXT PRIMARY KEY,
            companyId TEXT,
            propertyId TEXT,
            payeeName TEXT,
            payeeMobile TEXT,
            amount REAL,
            dueDate TEXT,
            chequeNumber TEXT,
            bankName TEXT,
            status TEXT,
            paidDate TEXT,
            notes TEXT,
            createdAt TEXT,
            updatedAt TEXT,
            totalPaid REAL DEFAULT 0,
            remaining REAL DEFAULT 0,
            property_name TEXT,
            property_type TEXT,
            last_synced TEXT
        );",
        [],
    )?;

    // ── Local mirror: properties ─────────────────────────────────────
    conn.execute(
        "CREATE TABLE IF NOT EXISTS local_properties (
            id TEXT PRIMARY KEY,
            name TEXT,
            nameAr TEXT,
            nameBn TEXT,
            nameUr TEXT,
            type TEXT,
            totalUnits INTEGER,
            last_synced TEXT
        );",
        [],
    )?;

    // Store schema version
    conn.execute(
        "INSERT OR REPLACE INTO app_config (key, value) VALUES ('schema_version', '1.1.0');",
        [],
    )?;

    println!("[DESKTOP] Database initialized (schema v1.1.0)");
    Ok(conn)
}

// ─────────────────────────────────────────────────────────────────────────
// SYNC AGENT (Background task — runs every 30 seconds)
// ─────────────────────────────────────────────────────────────────────────

async fn run_sync_agent(app_handle: tauri::AppHandle) {
    println!("[SYNC] Background sync agent started");

    // Initial sync on startup (wait 5 seconds for the app to fully load)
    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    perform_sync_cycle(&app_handle).await;

    loop {
        // Wait 30 seconds between sync cycles
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        perform_sync_cycle(&app_handle).await;
    }
}

async fn perform_sync_cycle(app_handle: &tauri::AppHandle) {
    let sync_state: tauri::State<SyncState> = app_handle.state();

    // Check if company ID is set (user must be logged in)
    let company_id = sync_state.company_id.lock().unwrap().clone();
    if company_id.is_none() {
        println!("[SYNC] No company ID set yet — skipping (user not logged in)");
        return;
    }
    let company_id = company_id.unwrap();

    // 1. Check if online (ping the local Next.js server)
    let is_online = check_online_status().await;
    *sync_state.is_online.lock().unwrap() = is_online;

    if !is_online {
        println!("[SYNC] Offline — skipping sync cycle");
        *sync_state.last_error.lock().unwrap() = None;
        return;
    }

    // 2. Push local changes to cloud
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

    // 3. Pull cloud changes to local
    let pull_result = pull_cloud_changes(app_handle, &company_id).await;
    match &pull_result {
        Ok(count) => {
            if *count > 0 {
                println!("[SYNC] Pulled {} changes from cloud", count);
            }
            // Update last_sync timestamp
            let now = chrono_now_iso();
            *sync_state.last_sync.lock().unwrap() = Some(now.clone());

            // Save last_sync to app_config
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

    // 4. Update pending count (unsynced items in sync_queue)
    if let Some(db_state) = app_handle.try_state::<DbState>() {
        let conn = db_state.0.lock().unwrap();
        let count: i64 = conn
            .query_row("SELECT count(*) FROM sync_queue WHERE synced = 0", [], |row| row.get(0))
            .unwrap_or(0);
        *sync_state.pending_count.lock().unwrap() = count as u32;
    }
}

/// Check if we can reach the local Next.js server (or the internet if running standalone).
async fn check_online_status() -> bool {
    // Try the local Next.js server first
    match reqwest::Client::new()
        .get(&format!("{}/api/health", API_BASE))
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
    {
        Ok(response) => response.status().is_success(),
        Err(_) => {
            // Local server not available — we're offline
            false
        }
    }
}

/// Push unsynced local changes to the cloud (via the local Next.js desktop route).
async fn push_local_changes(app_handle: &tauri::AppHandle, company_id: &str) -> Result<usize, String> {
    let db_state = app_handle
        .try_state::<DbState>()
        .ok_or("Database not initialized")?;

    // Read unsynced items from sync_queue
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

    // Build the push payload
    let changes_json: Vec<serde_json::Value> = changes
        .iter()
        .map(|(id, table, record_id, action, payload)| {
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

    // POST to local desktop sync-push endpoint
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

    // Mark all pushed items as synced
    {
        let conn = db_state.0.lock().unwrap();
        for (id, _, _, _, _) in &changes {
            let _ = conn.execute("UPDATE sync_queue SET synced = 1 WHERE id = ?1", rusqlite::params![id]);
        }
    }

    Ok(applied as usize)
}

/// Pull cloud changes and apply them to local SQLite (via the local Next.js desktop route).
async fn pull_cloud_changes(app_handle: &tauri::AppHandle, company_id: &str) -> Result<usize, String> {
    let db_state = app_handle
        .try_state::<DbState>()
        .ok_or("Database not initialized")?;

    // Get last_sync timestamp from app_config
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
        format!("{}/api/desktop/sync-pull?companyId={}", API_BASE, company_id)
    } else {
        format!("{}/api/desktop/sync-pull?companyId={}&since={}", API_BASE, company_id, since_param)
    };

    // GET from cloud sync/pull endpoint
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
        // Still update last_sync to server_time
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
    let now = chrono_now_iso();

    {
        let conn = db_state.0.lock().unwrap();

        for change in &changes {
            let table = change.get("table").and_then(|v| v.as_str()).unwrap_or("");
            let action = change.get("action").and_then(|v| v.as_str()).unwrap_or("");
            let record_id = change.get("recordId").and_then(|v| v.as_str()).unwrap_or("");
            let record = change.get("record").cloned().unwrap_or(serde_json::json!({}));

            if table == "cheques" && action == "upsert" {
                // Upsert into local_cheques
                let amount = record.get("amount").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let total_paid = record.get("totalPaid").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let remaining = record.get("remaining").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let property_name = record
                    .get("property")
                    .and_then(|p| p.get("name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let property_type = record
                    .get("property")
                    .and_then(|p| p.get("type"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                let _ = conn.execute(
                    "INSERT OR REPLACE INTO local_cheques
                    (id, companyId, propertyId, payeeName, payeeMobile, amount, dueDate,
                     chequeNumber, bankName, status, paidDate, notes, createdAt, updatedAt,
                     totalPaid, remaining, property_name, property_type, last_synced)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
                    rusqlite::params![
                        record_id,
                        record.get("companyId").and_then(|v| v.as_str()).unwrap_or(""),
                        record.get("propertyId").and_then(|v| v.as_str()).unwrap_or(""),
                        record.get("payeeName").and_then(|v| v.as_str()).unwrap_or(""),
                        record.get("payeeMobile").and_then(|v| v.as_str()).unwrap_or(""),
                        amount,
                        record.get("dueDate").and_then(|v| v.as_str()).unwrap_or(""),
                        record.get("chequeNumber").and_then(|v| v.as_str()).unwrap_or(""),
                        record.get("bankName").and_then(|v| v.as_str()).unwrap_or(""),
                        record.get("status").and_then(|v| v.as_str()).unwrap_or("pending"),
                        record.get("paidDate").and_then(|v| v.as_str()).unwrap_or(""),
                        record.get("notes").and_then(|v| v.as_str()).unwrap_or(""),
                        record.get("createdAt").and_then(|v| v.as_str()).unwrap_or(""),
                        record.get("updatedAt").and_then(|v| v.as_str()).unwrap_or(""),
                        total_paid,
                        remaining,
                        property_name,
                        property_type,
                        &now,
                    ],
                );
                applied += 1;
            } else if table == "cheques" && action == "delete" {
                let _ = conn.execute(
                    "DELETE FROM local_cheques WHERE id = ?1",
                    rusqlite::params![record_id],
                );
                applied += 1;
            } else if table == "properties" && action == "upsert" {
                let _ = conn.execute(
                    "INSERT OR REPLACE INTO local_properties
                    (id, name, nameAr, nameBn, nameUr, type, totalUnits, last_synced)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    rusqlite::params![
                        record_id,
                        record.get("name").and_then(|v| v.as_str()).unwrap_or(""),
                        record.get("nameAr").and_then(|v| v.as_str()).unwrap_or(""),
                        record.get("nameBn").and_then(|v| v.as_str()).unwrap_or(""),
                        record.get("nameUr").and_then(|v| v.as_str()).unwrap_or(""),
                        record.get("type").and_then(|v| v.as_str()).unwrap_or(""),
                        record.get("totalUnits").and_then(|v| v.as_i64()).unwrap_or(0),
                        &now,
                    ],
                );
                applied += 1;
            }
        }

        // Update last_sync to server_time
        if !server_time.is_empty() {
            let _ = conn.execute(
                "INSERT OR REPLACE INTO app_config (key, value) VALUES ('last_sync', ?1);",
                rusqlite::params![&server_time],
            );
        }
    }

    Ok(applied)
}

/// ISO 8601 timestamp for the current moment (used for sync tracking).
fn chrono_now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

// ─────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────

fn main() {
    println!("[DESKTOP] Al Reef Al Madeena Desktop App starting...");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let conn = init_database(app).expect("Failed to initialize database");
            app.manage(DbState(Mutex::new(conn)));
            app.manage(SyncState {
                last_sync: Mutex::new(None),
                pending_count: Mutex::new(0),
                is_online: Mutex::new(false),
                last_error: Mutex::new(None),
                company_id: Mutex::new(None),
            });

            // Launch the sync agent in the background
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
