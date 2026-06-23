// ─────────────────────────────────────────────────────────────────────────
// Desktop Data Adapter
// ─────────────────────────────────────────────────────────────────────────
// This module provides functions that automatically route data requests to
// either the cloud API (when online) or the local SQLite database (when offline).
//
// In browser mode (Vercel deployment): always uses fetch() to the cloud API.
// In desktop mode (Tauri): tries the cloud API first; if it fails, falls back
// to local Tauri commands that read from the local SQLite mirror.
//
// This is the key abstraction that enables offline mode without changing
// every component. Components call these functions instead of fetch() directly.

// Detect if we're running inside Tauri
export function isDesktop(): boolean {
  if (typeof window === 'undefined') return false
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window
}

// Dynamic import of Tauri invoke (only works in desktop app)
async function tauriInvoke<T>(command: string, args?: any): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

// ── Cheques ────────────────────────────────────────────────────────────

export interface ChequeData {
  id: string
  companyId: string
  propertyId: string
  payeeName: string
  payeeMobile: string | null
  amount: number
  dueDate: string
  chequeNumber: string | null
  bankName: string | null
  status: string
  paidDate: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  totalPaid: number
  remaining: number
  property?: { name: string; type: string }
}

/// Fetch cheques — tries cloud API first, falls back to local SQLite.
export async function fetchCheques(params?: URLSearchParams): Promise<{ data: ChequeData[] }> {
  if (!isDesktop()) {
    // Browser mode — use cloud API
    const query = params ? `?${params.toString()}` : ''
    const res = await fetch(`/api/cheques${query}`)
    if (!res.ok) throw new Error('Failed to fetch cheques')
    const json = await res.json()
    return { data: Array.isArray(json.data) ? json.data : [] }
  }

  // Desktop mode — try cloud first, fall back to local
  try {
    const query = params ? `?${params.toString()}` : ''
    const res = await fetch(`/api/cheques${query}`, { signal: AbortSignal.timeout(5000) })
    if (res.ok) {
      const json = await res.json()
      return { data: Array.isArray(json.data) ? json.data : [] }
    }
    throw new Error('Cloud API failed')
  } catch {
    // Cloud failed — use local SQLite
    console.log('[DESKTOP] Cloud unavailable — reading cheques from local SQLite')
    const localJson = await tauriInvoke<string>('get_local_cheques')
    const result = JSON.parse(localJson)
    return { data: result.data || [] }
  }
}

/// Save a cheque — tries cloud API first, saves to local SQLite + sync queue.
export async function saveCheque(
  cheque: Partial<ChequeData>,
  isEdit: boolean
): Promise<{ data: ChequeData }> {
  if (!isDesktop()) {
    // Browser mode — use cloud API
    const url = isEdit ? `/api/cheques/${cheque.id}` : '/api/cheques'
    const method = isEdit ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cheque),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `HTTP ${res.status}`)
    }
    const json = await res.json()
    return { data: json.data }
  }

  // Desktop mode — try cloud first, fall back to local
  try {
    const url = isEdit ? `/api/cheques/${cheque.id}` : '/api/cheques'
    const method = isEdit ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cheque),
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const json = await res.json()
      return { data: json.data }
    }
    throw new Error('Cloud API failed')
  } catch {
    // Cloud failed — save to local SQLite + queue for sync
    console.log('[DESKTOP] Cloud unavailable — saving cheque to local SQLite + sync queue')
    const action = isEdit ? 'update' : 'create'
    const chequeWithId = {
      ...cheque,
      id: cheque.id || `local-${Date.now()}`,
      createdAt: cheque.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await tauriInvoke('save_local_cheque', {
      chequeJson: JSON.stringify(chequeWithId),
      action,
    })
    return { data: chequeWithId as ChequeData }
  }
}

// ── Properties ─────────────────────────────────────────────────────────

export interface PropertyData {
  id: string
  name: string
  nameAr: string | null
  nameBn: string | null
  nameUr: string | null
  type: string
  totalUnits: number
}

/// Fetch properties — tries cloud API first, falls back to local SQLite.
export async function fetchProperties(): Promise<{ data: PropertyData[] }> {
  if (!isDesktop()) {
    const res = await fetch('/api/properties?limit=200')
    if (!res.ok) return { data: [] }
    const json = await res.json()
    return { data: Array.isArray(json.data) ? json.data : [] }
  }

  try {
    const res = await fetch('/api/properties?limit=200', { signal: AbortSignal.timeout(5000) })
    if (res.ok) {
      const json = await res.json()
      return { data: Array.isArray(json.data) ? json.data : [] }
    }
    throw new Error('Cloud API failed')
  } catch {
    console.log('[DESKTOP] Cloud unavailable — reading properties from local SQLite')
    const localJson = await tauriInvoke<string>('get_local_properties')
    const result = JSON.parse(localJson)
    return { data: result.data || [] }
  }
}

// ── Sync Status ────────────────────────────────────────────────────────

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
