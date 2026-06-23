// ─────────────────────────────────────────────────────────────────────────
// Desktop Data Adapter — GENERIC VERSION (works for ALL tables)
// ─────────────────────────────────────────────────────────────────────────
// This module provides functions that automatically route data requests to
// either the cloud API (when online) or the local SQLite database (when offline).
//
// In browser mode: always uses fetch() to the cloud API.
// In desktop mode: tries the cloud API first; if it fails, falls back to
// local Tauri commands that read from the local SQLite mirror.

export function isDesktop(): boolean {
  if (typeof window === 'undefined') return false
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window
}

async function tauriInvoke<T>(command: string, args?: any): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

// ── Generic data fetch — works for ANY table ───────────────────────────

/// Fetches data from a given API endpoint — tries cloud first, falls back to local SQLite.
/// Use this for any GET /api/<endpoint> call.
///
/// Example:
///   const result = await fetchWithOfflineFallback('/api/cheques?limit=1000', 'cheques')
///   const result = await fetchWithOfflineFallback('/api/tenants?limit=1000', 'tenants')
///   const result = await fetchWithOfflineFallback('/api/properties?limit=200', 'properties')
export async function fetchWithOfflineFallback<T = any>(
  apiPath: string,
  tableName: string,
  timeoutMs: number = 5000
): Promise<{ data: T[] }> {
  if (!isDesktop()) {
    // Browser mode — use cloud API
    const res = await fetch(apiPath)
    if (!res.ok) throw new Error(`Failed to fetch ${tableName}`)
    const json = await res.json()
    return { data: Array.isArray(json.data) ? json.data : [] }
  }

  // Desktop mode — try cloud first, fall back to local SQLite
  try {
    const res = await fetch(apiPath, { signal: AbortSignal.timeout(timeoutMs) })
    if (res.ok) {
      const json = await res.json()
      return { data: Array.isArray(json.data) ? json.data : [] }
    }
    throw new Error('Cloud API failed')
  } catch {
    // Cloud failed — use local SQLite
    console.log(`[DESKTOP] Cloud unavailable — reading ${tableName} from local SQLite`)
    const localJson = await tauriInvoke<string>('get_local_data', { tableName })
    const result = JSON.parse(localJson)
    return { data: result.data || [] }
  }
}

/// Saves a record — tries cloud API first, saves to local SQLite + sync queue.
/// Use this for any POST/PATCH call.
///
/// Example:
///   await saveWithOfflineFallback('/api/cheques', `/api/cheques/${id}`, 'cheques', record, isEdit)
export async function saveWithOfflineFallback(
  createPath: string,
  updatePath: string,
  tableName: string,
  record: any,
  isEdit: boolean
): Promise<{ data: any }> {
  if (!isDesktop()) {
    // Browser mode — use cloud API
    const url = isEdit ? updatePath : createPath
    const method = isEdit ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `HTTP ${res.status}`)
    }
    const json = await res.json()
    return { data: json.data }
  }

  // Desktop mode — try cloud first, fall back to local SQLite
  try {
    const url = isEdit ? updatePath : createPath
    const method = isEdit ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const json = await res.json()
      return { data: json.data }
    }
    throw new Error('Cloud API failed')
  } catch {
    // Cloud failed — save to local SQLite + queue for sync
    console.log(`[DESKTOP] Cloud unavailable — saving ${tableName} to local SQLite + sync queue`)
    const action = isEdit ? 'update' : 'create'
    const recordWithId = {
      ...record,
      id: record.id || `local-${Date.now()}`,
      createdAt: record.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await tauriInvoke('save_local_data', {
      tableName,
      recordId: recordWithId.id,
      recordJson: JSON.stringify(recordWithId),
      action,
    })
    return { data: recordWithId }
  }
}

// ── Convenience wrappers for common tables ─────────────────────────────

export async function fetchCheques(params?: URLSearchParams): Promise<{ data: any[] }> {
  const query = params ? `?${params.toString()}` : ''
  return fetchWithOfflineFallback(`/api/cheques${query}`, 'cheques')
}

export async function fetchProperties(): Promise<{ data: any[] }> {
  return fetchWithOfflineFallback('/api/properties?limit=200', 'properties')
}

export async function fetchTenants(): Promise<{ data: any[] }> {
  return fetchWithOfflineFallback('/api/tenants?limit=1000', 'tenants')
}

export async function fetchPayments(): Promise<{ data: any[] }> {
  return fetchWithOfflineFallback('/api/payments?limit=1000', 'payments')
}

export async function fetchExpenses(): Promise<{ data: any[] }> {
  return fetchWithOfflineFallback('/api/expenses?limit=1000', 'expenses')
}

export async function fetchMaintenance(): Promise<{ data: any[] }> {
  return fetchWithOfflineFallback('/api/maintenance?limit=1000', 'maintenance')
}

export async function fetchRecurringBills(): Promise<{ data: any[] }> {
  return fetchWithOfflineFallback('/api/recurring-bills?limit=1000', 'recurring_bills')
}

export async function fetchReservations(): Promise<{ data: any[] }> {
  return fetchWithOfflineFallback('/api/reservations?limit=1000', 'reservations')
}

export async function fetchNotifications(): Promise<{ data: any[] }> {
  return fetchWithOfflineFallback('/api/notifications?limit=200', 'notifications')
}

// ── Sync status ────────────────────────────────────────────────────────

export interface SyncStatusData {
  last_sync: string | null
  pending_count: number
  is_online: boolean
  last_error: string | null
}

export async function fetchSyncStatus(): Promise<SyncStatusData | null> {
  if (!isDesktop()) return null
  try {
    return await tauriInvoke<SyncStatusData>('get_sync_status')
  } catch {
    return null
  }
}

export async function triggerSync(): Promise<void> {
  if (!isDesktop()) return
  try {
    await tauriInvoke('trigger_sync')
  } catch {
    // silent
  }
}

export async function setCompanyId(companyId: string): Promise<void> {
  if (!isDesktop()) return
  try {
    await tauriInvoke('set_company_id', { companyId })
  } catch {
    // silent
  }
}
