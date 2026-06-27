'use client'

import { useState, useEffect, useCallback } from 'react'

// ═══════════════════════════════════════════════════════════════════════════
// usePushNotifications — Browser push notification hook
// ═══════════════════════════════════════════════════════════════════════════
//
// Uses the Web Notifications API (built into all modern browsers, completely free).
// Shows notifications on the user's desktop/device even when the browser tab is
// in the background or minimized (as long as the browser is running).
//
// NO third-party service required. NO Firebase Cloud Messaging. NO VAPID keys.
// Just the native browser Notification API.
//
// Usage:
//   const { permission, requestPermission, showNotification } = usePushNotifications()
//
//   // Check if permission is granted
//   if (permission === 'granted') { ... }
//
//   // Request permission (call from a user click handler — browsers require user gesture)
//   <button onClick={requestPermission}>Enable notifications</button>
//
//   // Show a notification
//   showNotification({
//     title: 'Cheque Due Tomorrow',
//     body: 'AED 40,000 to Rashid for Khalifa Villa',
//     tag: 'cheque-reminder',  // replaces existing notifications with same tag
//   })

interface PushNotificationOptions {
  title: string
  body?: string
  tag?: string
  icon?: string
  onClick?: () => void
}

interface NotificationPreferences {
  pushEnabled: boolean
  soundEnabled: boolean
  toastEnabled: boolean
  disabledTypes: string  // comma-separated
  soundFile: string
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    pushEnabled: true,
    soundEnabled: true,
    toastEnabled: true,
    disabledTypes: '',
    soundFile: 'chime',
  })
  // ─── Initialize: check permission + load preferences ───
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission)
    }

    // Load user preferences
    fetch('/api/notifications/preferences')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setPrefs({
            pushEnabled: data.pushEnabled ?? true,
            soundEnabled: data.soundEnabled ?? true,
            toastEnabled: data.toastEnabled ?? true,
            disabledTypes: data.disabledTypes || '',
            soundFile: data.soundFile || 'chime',
          })
        }
      })
      .catch(() => { /* silent fail — use defaults */ })

    // Create audio element for sound alerts (uses Web Audio API to generate a chime — no MP3 file needed)
    if (typeof window !== 'undefined') {
      // We'll use the Web Audio API in playSound() instead of an MP3 file
      // This avoids needing to bundle an audio file
    }
  }, [])

  // ─── Play a notification chime using Web Audio API (no MP3 file needed) ───
  const playChime = useCallback(() => {
    if (typeof window === 'undefined') return
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioContext) return
      const ctx = new AudioContext()

      // Play a pleasant 2-note chime (E5 → A5)
      const playNote = (frequency: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = frequency
        osc.type = 'sine'
        gain.gain.setValueAtTime(0, startTime)
        gain.gain.linearRampToValueAtTime(0.3, startTime + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
        osc.start(startTime)
        osc.stop(startTime + duration)
      }

      // E5 (659.25 Hz) then A5 (880 Hz) — a pleasant ascending interval
      playNote(659.25, ctx.currentTime, 0.15)        // E5
      playNote(880.00, ctx.currentTime + 0.12, 0.25) // A5

      // Close the audio context after the sound finishes to free resources
      setTimeout(() => ctx.close(), 500)
    } catch (e) {
      // Silent fail — autoplay policy may block until user interacts with page
    }
  }, [])

  // ─── Request permission (must be called from user gesture) ───
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.warn('[PUSH] This browser does not support notifications')
      return false
    }

    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      return result === 'granted'
    } catch (e) {
      console.error('[PUSH] Failed to request permission:', e)
      return false
    }
  }, [])

  // ─── Check if a notification type is enabled ───
  const isTypeEnabled = useCallback((type: string): boolean => {
    const disabled = prefs.disabledTypes.split(',').map(t => t.trim()).filter(Boolean)
    return !disabled.includes(type)
  }, [prefs.disabledTypes])

  // ─── Show a browser notification + play sound ───
  const showNotification = useCallback((opts: PushNotificationOptions) => {
    const { title, body, tag, onClick } = opts

    // Check if this type is enabled
    if (!isTypeEnabled(tag || 'general')) {
      return
    }

    // Play sound if enabled
    if (prefs.soundEnabled) {
      playChime()
    }

    // Show browser notification if enabled and permission granted
    if (prefs.pushEnabled && permission === 'granted' && typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const notification = new Notification(title, {
          body,
          tag: tag || 'al-reef',
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          requireInteraction: false,  // auto-dismiss after a few seconds
        })

        if (onClick) {
          notification.onclick = () => {
            window.focus()
            onClick()
            notification.close()
          }
        }

        // Auto-close after 10 seconds
        setTimeout(() => notification.close(), 10000)
      } catch (e) {
        console.error('[PUSH] Failed to show notification:', e)
      }
    }
  }, [permission, prefs, isTypeEnabled])

  // ─── Update preferences ───
  const updatePreferences = useCallback(async (updates: Partial<NotificationPreferences>) => {
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        const data = await res.json()
        setPrefs({
          pushEnabled: data.pushEnabled ?? true,
          soundEnabled: data.soundEnabled ?? true,
          toastEnabled: data.toastEnabled ?? true,
          disabledTypes: data.disabledTypes || '',
          soundFile: data.soundFile || 'chime',
        })
        return true
      }
    } catch (e) {
      console.error('[PUSH] Failed to update preferences:', e)
    }
    return false
  }, [])

  return {
    permission,
    isSupported: typeof window !== 'undefined' && 'Notification' in window,
    requestPermission,
    showNotification,
    preferences: prefs,
    updatePreferences,
    isTypeEnabled,
  }
}
