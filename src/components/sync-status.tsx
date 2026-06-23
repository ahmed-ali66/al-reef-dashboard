'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Cloud, CloudOff, RefreshCw, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// ─────────────────────────────────────────────────────────────────────────
// SyncStatus — shows the desktop sync status badge.
// ─────────────────────────────────────────────────────────────────────────
// This component ONLY renders when running inside the Tauri desktop app.
// In a browser (Vercel deployment), it renders nothing.

interface SyncStatus {
  last_sync: string | null
  pending_count: number
  is_online: boolean
  last_error: string | null
}

// Detect if we're running inside Tauri (not a browser)
// Tauri v2 injects __TAURI_INTERNALS__ and __TAURI_OS__ etc.
function isTauriEnv(): boolean {
  if (typeof window === 'undefined') return false
  // Check multiple possible Tauri v2 globals
  return '__TAURI_INTERNALS__' in window ||
         '__TAURI__' in window ||
         (typeof (window as any).invoke === 'function')
}

export default function SyncStatus() {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const [debugInfo, setDebugInfo] = useState<string>('')

  // Check if we're in Tauri on mount + poll (the global might appear late)
  useEffect(() => {
    const check = () => {
      const detected = isTauriEnv()
      if (detected) {
        setIsDesktop(true)
        setDebugInfo('')
      } else if (!isDesktop) {
        // Show debug info briefly so we can see why it's not detecting
        const globals = Object.keys(window).filter(k => k.startsWith('__TAURI'))
        setDebugInfo(`Not Tauri. Globals: ${globals.length > 0 ? globals.join(', ') : 'none'}`)
      }
    }
    check()
    // Re-check every 2 seconds for the first 10 seconds (Tauri global might be late)
    const interval = setInterval(check, 2000)
    const stopTimer = setTimeout(() => clearInterval(interval), 10000)
    return () => { clearInterval(interval); clearTimeout(stopTimer) }
  }, [isDesktop])

  // Poll sync status every 5 seconds (only in Tauri)
  const fetchStatus = useCallback(async () => {
    if (!isTauriEnv()) return
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const result = await invoke<SyncStatus>('get_sync_status')
      setStatus(result)
    } catch (e: any) {
      // If invoke fails, we might not be in Tauri after all
      console.log('[SyncStatus] invoke failed:', e?.message || e)
    }
  }, [])

  useEffect(() => {
    if (!isDesktop) return
    fetchStatus()
    const interval = setInterval(fetchStatus, 5000)
    return () => clearInterval(interval)
  }, [isDesktop, fetchStatus])

  // Handle manual sync trigger
  const handleSyncNow = async () => {
    if (!isTauriEnv()) return
    setSyncing(true)
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('trigger_sync')
      await fetchStatus()
    } catch (e) {
      // Silent fail
    } finally {
      setSyncing(false)
    }
  }

  // In browser mode, show debug text briefly (so we can see it's not Tauri)
  if (!isDesktop) {
    // Only show debug during development — remove for production
    if (debugInfo) {
      return (
        <div className="text-[10px] text-white/30 text-center px-2">
          {debugInfo}
        </div>
      )
    }
    return null
  }

  // Loading state — show a spinner while we fetch the first status
  if (!status) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="gap-1 text-white/60 border-white/20">
          <Loader2 className="w-3 h-3 animate-spin" />
          Connecting...
        </Badge>
      </div>
    )
  }

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

  // Format last sync time
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
        className="h-7 px-2 text-xs hover:bg-white/10"
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
