'use client'

import { useEffect, useState } from 'react'
import { Loader2, KeyRound, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// ─────────────────────────────────────────────────────────────────────────
// License Activation Dialog
// ─────────────────────────────────────────────────────────────────────────
// Shows on first launch (when no license is stored) or when license expires.
// The user enters their license key → app activates online → stores token locally.

type LicenseState = 'checking' | 'unlicensed' | 'activating' | 'activated' | 'error'

export default function LicenseGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LicenseState>('checking')
  const [licenseKey, setLicenseKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [licenseInfo, setLicenseInfo] = useState<any>(null)

  // Check if running in Tauri (desktop app)
  const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)

  useEffect(() => {
    if (!isTauri) {
      // Browser mode — no license needed
      setState('activated')
      return
    }

    checkLicense()
  }, [isTauri])

  async function checkLicense() {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const token = await invoke<string | null>('get_stored_license')
      if (token) {
        // License exists — try to parse it
        try {
          const decoded = JSON.parse(atob(token))
          setLicenseInfo(decoded)
          setState('activated')
        } catch {
          setState('unlicensed')
        }
      } else {
        setState('unlicensed')
      }
    } catch {
      setState('unlicensed')
    }
  }

  async function handleActivate() {
    if (!licenseKey.trim()) {
      setError('Please enter a license key')
      return
    }

    setState('activating')
    setError(null)

    try {
      const { invoke } = await import('@tauri-apps/api/core')

      // Get hardware fingerprint
      const fingerprint = await invoke<string>('get_hardware_fingerprint')
      const machineName = await invoke<string>('get_machine_name')

      // Call activation API
      const response = await fetch('https://al-reef-al-junoobi.vercel.app/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseKey: licenseKey.trim().toUpperCase(),
          hardwareFingerprint: fingerprint,
          machineName,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Activation failed')
      }

      // Store the activation token locally
      await invoke('store_license', {
        activationToken: result.activationToken,
        licenseKey: licenseKey.trim().toUpperCase(),
      })

      setLicenseInfo(result.license)
      setState('activated')
    } catch (e: any) {
      setError(e.message || 'Activation failed')
      setState('error')
    }
  }

  // Browser mode or already licensed → show the app
  if (state === 'activated' || !isTauri) {
    return <>{children}</>
  }

  // Checking license → loading
  if (state === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <Loader2 className="w-8 h-8 animate-spin text-terracotta" />
      </div>
    )
  }

  // License activation screen
  return (
    <div className="min-h-screen flex items-center justify-center bg-cream p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <div className="w-16 h-16 rounded-full bg-terracotta/10 flex items-center justify-center">
              <KeyRound className="w-8 h-8 text-terracotta" />
            </div>
          </div>
          <CardTitle className="text-2xl">Activate Your License</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Enter your license key to activate Al Reef Al Madeena Desktop Edition
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label>License Key</Label>
            <Input
              placeholder="ALR-XXXX-XXXX-XXXX-XXXX"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && state !== 'activating' && handleActivate()}
              className="font-mono text-center text-lg tracking-wider"
              disabled={state === 'activating'}
            />
            <p className="text-xs text-muted-foreground">
              Your license key was provided with your purchase. Format: ALR-XXXX-XXXX-XXXX-XXXX
            </p>
          </div>

          <Button
            onClick={handleActivate}
            disabled={state === 'activating' || !licenseKey.trim()}
            className="w-full bg-terracotta hover:bg-terracotta/90"
          >
            {state === 'activating' ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Activating...
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4 mr-2" />
                Activate License
              </>
            )}
          </Button>

          <div className="text-center text-xs text-muted-foreground space-y-1 pt-2 border-t">
            <p>Need a license? Contact your software provider.</p>
            <p>The license is tied to this specific computer for security.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
