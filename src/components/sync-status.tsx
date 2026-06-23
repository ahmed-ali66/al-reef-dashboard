'use client'

import { useEffect, useState } from 'react'
import { Loader2, Cloud, CloudOff, RefreshCw, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// ─────────────────────────────────────────────────────────────────────────
// SyncStatus — shows the desktop sync status badge.
// ─────────────────────────────────────────────────────────────────────────
// This component ONLY renders when running inside the Tauri desktop app.
// In a browser (Vercel deployment), it renders nothing.
//
// The badge shows:
//   🟢 Synced    — online, no pending changes, last sync recent
//   🟡 Pending   — N changes waiting to be pushed to cloud
//   🔴 Offline   — no internet connection
//   ⚠ Error      — last sync failed (shows error tooltip)
//
// Also includes a "Sync Now" button to manually trigger a sync cycle.

interface SyncStatus {
  last_sync: string | null
  pending_count: number
  is_online: boolean
  last_error: string | null
}

// Detect if we're running inside Tauri (not a browser)
function isTauri(): boolean {
  if (typeof window === 'undefined') return false
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window
}

export default function SyncStatus() {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)

  // Check if we're in Tauri on mount
  useEffect(() => {
    setIsDesktop(isTauri())
  }, [])

  // Poll sync status every 10 seconds (only in Tauri)
  useEffect(() => {
    if (!isDesktop) return

    const fetchStatus = async () => {
      try {
        // Dynamic import of Tauri API (only available in desktop app)
        const { invoke } = await import('@tauri-apps/api/core')
        const result = await invoke<SyncStatus>('get_sync_status')
        setStatus(result)
      } catch (e) {
        // Silent fail — the app still works, just no status badge
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 10000)
    return () => clearInterval(interval)
  }, [isDesktop])

  // Handle manual sync trigger
  const handleSyncNow = async () => {
    if (!isDesktop) return
    setSyncing(true)
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('trigger_sync')
      // Refresh status after sync
      const result = await invoke<SyncStatus>('get_sync_status')
      setStatus(result)
    } catch (e) {
      // Silent fail
    } finally {
      setSyncing(false)
    }
  }

  // Don't render anything in a browser (only show in desktop app)
  if (!isDesktop || !status) return null

  // Determine badge state
  let badge = null
  if (!status.is_online) {
    badge = (
      <Badge className="bg-red-100 text-red-800 border-red-200 gap-1">
        <CloudOff className="w-3 h-3" />
        Offline
      </Badge>
    )
  } else if (status.pending_count > 0) {
    badge = (
      <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1">
        <Cloud className="w-3 h-3" />
        Pending ({status.pending_count})
      </Badge>
    )
  } else if (status.last_error) {
    badge = (
      <Badge className="bg-orange-100 text-orange-800 border-orange-200 gap-1" title={status.last_error}>
        <AlertCircle className="w-3 h-3" />
        Sync Error
      </Badge>
    )
  } else {
    badge = (
      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 gap-1">
        <Cloud className="w-3 h-3" />
        Synced
      </Badge>
    )
  }

  // Format last sync time (last_sync is an ISO 8601 string from the server)
  const lastSyncText = status.last_sync
    ? new Date(status.last_sync).toLocaleTimeString()
    : 'Never'

  return (
    <div className="flex items-center gap-2">
      {badge}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSyncNow}
        disabled={syncing || !status.is_online}
        className="h-7 px-2 text-xs"
        title={`Last sync: ${lastSyncText}${status.last_error ? `\nError: ${status.last_error}` : ''}`}
      >
        {syncing ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <RefreshCw className="w-3 h-3" />
        )}
      </Button>
    </div>
  )
}
