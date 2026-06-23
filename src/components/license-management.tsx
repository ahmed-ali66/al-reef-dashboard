'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAppStore, isAdminOnly } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { KeyRound, Plus, Ban, CheckCircle2, Clock, Trash2, RefreshCw, Loader2, AlertCircle, Shield } from 'lucide-react'

const ADMIN_TOKEN = '967ce59955c50e059333bfb2f2d09a39af44cca5f0cb3cc2483de8bee9c08112'
const API_BASE = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  ? 'http://localhost:3000'
  : ''

interface License {
  id: number
  licenseKey: string
  companyName: string
  maxUsers: number
  maxProperties: number
  licenseType: string
  issuedAt: string
  expiryAt: string
  status: string
  activatedAt: string | null
  activatedOn: string | null
  machineName: string | null
  notes: string | null
  isExpired: boolean
  isActive: boolean
  daysUntilExpiry: number | null
}

export default function LicenseManagement() {
  const { authUser } = useAppStore()
  const isAdmin = authUser ? isAdminOnly(authUser.role) : false

  const [licenses, setLicenses] = useState<License[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Generate dialog state
  const [genDialogOpen, setGenDialogOpen] = useState(false)
  const [genForm, setGenForm] = useState({
    companyName: '',
    maxUsers: 5,
    maxProperties: 50,
    licenseType: 'standard',
    durationMonths: 12,
    notes: '',
  })

  // Renew dialog state
  const [renewDialogOpen, setRenewDialogOpen] = useState(false)
  const [renewLicense, setRenewLicense] = useState<License | null>(null)
  const [renewMonths, setRenewMonths] = useState(12)

  const fetchLicenses = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/license/list`, {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      })
      if (!res.ok) throw new Error('Failed to fetch licenses')
      const json = await res.json()
      setLicenses(json.licenses || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) fetchLicenses()
  }, [isAdmin, fetchLicenses])

  // ── Actions ──────────────────────────────────────────────────────────

  async function handleGenerate() {
    setActionLoading('generate')
    try {
      const res = await fetch(`${API_BASE}/api/license/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ADMIN_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(genForm),
      })
      if (!res.ok) throw new Error('Failed to generate license')
      setGenDialogOpen(false)
      setGenForm({ companyName: '', maxUsers: 5, maxProperties: 50, licenseType: 'standard', durationMonths: 12, notes: '' })
      await fetchLicenses()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleSuspend(license: License) {
    if (!confirm(`Suspend license for ${license.companyName}? Their app will stop working.`)) return
    setActionLoading(`suspend-${license.licenseKey}`)
    try {
      await fetch(`${API_BASE}/api/license/suspend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: license.licenseKey, reason: 'Suspended by admin' }),
      })
      await fetchLicenses()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReactivate(license: License) {
    setActionLoading(`reactivate-${license.licenseKey}`)
    try {
      await fetch(`${API_BASE}/api/license/suspend`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: license.licenseKey }),
      })
      await fetchLicenses()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleRenew() {
    if (!renewLicense) return
    setActionLoading(`renew-${renewLicense.licenseKey}`)
    try {
      await fetch(`${API_BASE}/api/license/renew`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: renewLicense.licenseKey, addMonths: renewMonths }),
      })
      setRenewDialogOpen(false)
      await fetchLicenses()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDelete(license: License) {
    if (!confirm(`PERMANENTLY DELETE license for ${license.companyName}? This cannot be undone.`)) return
    setActionLoading(`delete-${license.licenseKey}`)
    try {
      await fetch(`${API_BASE}/api/license/delete?licenseKey=${license.licenseKey}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      })
      await fetchLicenses()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setActionLoading(null)
    }
  }

  // ── Access control ───────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Shield className="w-5 h-5 mr-2" />
        Access denied — admin only
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <KeyRound className="w-6 h-6 text-terracotta" />
            License Management
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Generate, monitor, suspend, renew, and delete client licenses</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchLicenses} disabled={loading}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setGenDialogOpen(true)} className="bg-terracotta hover:bg-terracotta/90">
            <Plus className="w-4 h-4 mr-2" />
            Generate License
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">×</button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Active</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-xl font-bold mt-1">{licenses.filter(l => l.isActive).length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Not Activated</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-xl font-bold mt-1">{licenses.filter(l => l.status === 'active').length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Suspended</span>
              <Ban className="w-4 h-4 text-red-500" />
            </div>
            <p className="text-xl font-bold mt-1">{licenses.filter(l => l.status === 'suspended').length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-gray-400">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Expired</span>
              <AlertCircle className="w-4 h-4 text-gray-400" />
            </div>
            <p className="text-xl font-bold mt-1">{licenses.filter(l => l.isExpired).length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Licenses table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>License Key</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Machine</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Days Left</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : licenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No licenses yet. Click "Generate License" to create one.
                    </TableCell>
                  </TableRow>
                ) : (
                  licenses.map((license) => (
                    <TableRow key={license.licenseKey}>
                      <TableCell className="font-mono text-sm">{license.licenseKey}</TableCell>
                      <TableCell className="text-sm font-medium">{license.companyName}</TableCell>
                      <TableCell>
                        {license.status === 'activated' && !license.isExpired && (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Active</Badge>
                        )}
                        {license.status === 'active' && (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200">Not Activated</Badge>
                        )}
                        {license.status === 'suspended' && (
                          <Badge className="bg-red-100 text-red-800 border-red-200">Suspended</Badge>
                        )}
                        {license.isExpired && (
                          <Badge className="bg-gray-200 text-gray-700 border-gray-300">Expired</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {license.machineName || '—'}
                        {license.activatedOn && (
                          <div className="text-[10px] text-muted-foreground/60 font-mono">
                            {license.activatedOn.slice(0, 16)}…
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {license.expiryAt ? new Date(license.expiryAt).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {license.daysUntilExpiry !== null && (
                          <span className={license.daysUntilExpiry < 30 ? 'text-red-600 font-bold' : license.daysUntilExpiry < 90 ? 'text-amber-600' : ''}>
                            {license.daysUntilExpiry > 0 ? `${license.daysUntilExpiry}d` : 'Expired'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Renew */}
                          <button
                            onClick={() => { setRenewLicense(license); setRenewMonths(12); setRenewDialogOpen(true) }}
                            className="p-1.5 rounded hover:bg-blue-50 text-blue-600"
                            title="Renew / Extend"
                          >
                            <Clock className="w-3.5 h-3.5" />
                          </button>
                          {/* Suspend / Reactivate */}
                          {license.status === 'suspended' ? (
                            <button
                              onClick={() => handleReactivate(license)}
                              disabled={actionLoading === `reactivate-${license.licenseKey}`}
                              className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600"
                              title="Reactivate"
                            >
                              {actionLoading === `reactivate-${license.licenseKey}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleSuspend(license)}
                              disabled={actionLoading === `suspend-${license.licenseKey}`}
                              className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"
                              title="Suspend"
                            >
                              {actionLoading === `suspend-${license.licenseKey}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          {/* Delete */}
                          <button
                            onClick={() => handleDelete(license)}
                            disabled={actionLoading === `delete-${license.licenseKey}`}
                            className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"
                            title="Delete Permanently"
                          >
                            {actionLoading === `delete-${license.licenseKey}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Generate License Dialog */}
      <Dialog open={genDialogOpen} onOpenChange={setGenDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate New License</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Company Name *</Label>
              <Input value={genForm.companyName} onChange={e => setGenForm({ ...genForm, companyName: e.target.value })} placeholder="e.g. Dubai Properties LLC" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Max Users</Label>
                <Input type="number" value={genForm.maxUsers} onChange={e => setGenForm({ ...genForm, maxUsers: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Max Properties</Label>
                <Input type="number" value={genForm.maxProperties} onChange={e => setGenForm({ ...genForm, maxProperties: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>License Type</Label>
                <Select value={genForm.licenseType} onValueChange={v => setGenForm({ ...genForm, licenseType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Duration (months)</Label>
                <Select value={String(genForm.durationMonths)} onValueChange={v => setGenForm({ ...genForm, durationMonths: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">6 months</SelectItem>
                    <SelectItem value="12">1 year</SelectItem>
                    <SelectItem value="24">2 years</SelectItem>
                    <SelectItem value="36">3 years</SelectItem>
                    <SelectItem value="60">5 years</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input value={genForm.notes} onChange={e => setGenForm({ ...genForm, notes: e.target.value })} placeholder="e.g. Paid AED 5,000 on 2024-01-15" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleGenerate} disabled={actionLoading === 'generate' || !genForm.companyName} className="bg-terracotta hover:bg-terracotta/90">
              {actionLoading === 'generate' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Renew License Dialog */}
      <Dialog open={renewDialogOpen} onOpenChange={setRenewDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Renew License</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Extending <strong>{renewLicense?.companyName}</strong> ({renewLicense?.licenseKey})
            </p>
            <p className="text-sm">
              Current expiry: {renewLicense?.expiryAt ? new Date(renewLicense.expiryAt).toLocaleDateString() : '—'}
            </p>
            <div>
              <Label>Add Months</Label>
              <Select value={String(renewMonths)} onValueChange={v => setRenewMonths(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="6">+6 months</SelectItem>
                  <SelectItem value="12">+1 year</SelectItem>
                  <SelectItem value="24">+2 years</SelectItem>
                  <SelectItem value="36">+3 years</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRenew} disabled={actionLoading?.startsWith('renew-')} className="bg-blue-500 hover:bg-blue-600 text-white">
              {actionLoading?.startsWith('renew-') && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Renew License
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
