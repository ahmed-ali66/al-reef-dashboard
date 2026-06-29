'use client'

import { useState, useEffect } from 'react'
import { useAppStore, isOwnerOrAdmin } from '@/lib/store'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2, Calendar, Save, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

interface CompanyInfo {
  id: string
  name: string
  systemGoLiveDate: string | null
  updatedAt: string
}

export default function SystemSettings() {
  const { authUser } = useAppStore()
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [goLiveDate, setGoLiveDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const canEdit = isOwnerOrAdmin(authUser?.role || '')

  useEffect(() => {
    fetchCompany()
  }, [])

  const fetchCompany = async () => {
    try {
      const res = await fetch('/api/company')
      if (!res.ok) throw new Error('Failed to fetch company info')
      const data = await res.json()
      setCompany(data)
      // Convert ISO date to YYYY-MM-DD for the date input
      if (data.systemGoLiveDate) {
        const d = new Date(data.systemGoLiveDate)
        setGoLiveDate(d.toISOString().slice(0, 10))
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to load company info')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!company) return
    setSaving(true)
    try {
      const res = await fetch('/api/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemGoLiveDate: goLiveDate || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save')
      }
      const updated = await res.json()
      setCompany(updated)
      toast.success('System go-live date saved successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-emerald" />
      </div>
    )
  }

  if (!canEdit) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-3 text-muted-foreground">
            <AlertTriangle className="w-5 h-5" />
            <p>Only owners and admins can modify system settings.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          System Go-Live Date
        </CardTitle>
        <CardDescription>
          The first month your company started using this system for production. The monthly rollover will NEVER carry forward unpaid rent for months before this date — historical debt for pre-go-live months must be entered manually via HISTORICAL_DEBT payments.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="goLiveDate">Go-Live Date (first day of the first production month)</Label>
          <Input
            id="goLiveDate"
            type="date"
            value={goLiveDate}
            onChange={(e) => setGoLiveDate(e.target.value)}
            placeholder="YYYY-MM-DD"
          />
          <p className="text-xs text-muted-foreground">
            Example: If your system went live in June 2026, enter <code className="bg-muted px-1 py-0.5 rounded">2026-06-01</code>. The rollover will then only process months from June 2026 onward.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving} className="bg-emerald hover:bg-emerald/90 text-white">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            {saving ? 'Saving...' : 'Save Go-Live Date'}
          </Button>
          {company?.systemGoLiveDate && (
            <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Currently set: {new Date(company.systemGoLiveDate).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}
            </Badge>
          )}
          {!company?.systemGoLiveDate && (
            <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Not set — rollover will process ALL months (no restriction)
            </Badge>
          )}
        </div>

        <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200">
          <p className="text-sm text-blue-900">
            <strong>How this affects the monthly rollover:</strong>
          </p>
          <ul className="text-sm text-blue-800 mt-2 space-y-1 list-disc list-inside">
            <li>If the rollover targets <strong>July 2026</strong>, it will check if <strong>June 2026</strong> rent was paid (June is the previous month).</li>
            <li>If June 2026 is on or after your go-live date → unpaid June rent carries forward to openingBalance.</li>
            <li>If June 2026 is before your go-live date → rollover is SKIPPED for that company (historical debt must be entered manually).</li>
            <li>You can change this date later if needed (e.g., if you backfill May records).</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
