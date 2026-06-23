'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAppStore, isOwnerOrAdmin } from '@/lib/store'
import { formatAED, formatDate } from '@/lib/utils'
import { t, getNameByLang, type Language } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Wallet, Plus, Pencil, Trash2, CheckCircle2, Loader2, Search, Calendar, TrendingUp, AlertCircle, Clock } from 'lucide-react'

interface ChequeData {
  id: string
  companyId: string
  propertyId: string
  payeeName: string
  payeeMobile: string | null
  amount: number
  dueDate: string
  chequeNumber: string | null
  bankName: string | null
  status: 'pending' | 'paid' | 'bounced' | 'cancelled'
  paidDate: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  property?: { id: string; name: string; nameAr: string | null; nameBn: string | null; nameUr: string | null; type: string }
}

interface PropertyData {
  id: string
  name: string
  nameAr: string | null
  nameBn: string | null
  nameUr: string | null
  type: string
}

interface SummaryData {
  totalPending: { amount: number; count: number }
  upcoming30: { amount: number; count: number }
  overdue: { amount: number; count: number }
  paidThisYear: { amount: number; count: number }
  byProperty: Array<{ propertyId: string; propertyName: string; totalPending: number; chequeCount: number }>
  asOfDate: string
}

type TabType = 'upcoming' | 'paid' | 'all'

const emptyForm = {
  propertyId: '',
  payeeName: '',
  payeeMobile: '',
  amount: 0,
  dueDate: new Date().toISOString().split('T')[0],
  chequeNumber: '',
  bankName: '',
  notes: '',
  status: 'pending' as 'pending' | 'paid',
  paidDate: '',
}

export default function Cheques() {
  const { language, authUser } = useAppStore()
  const lang = language as Language
  const canModify = authUser ? isOwnerOrAdmin(authUser.role) : false

  const [cheques, setCheques] = useState<ChequeData[]>([])
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [properties, setProperties] = useState<PropertyData[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<TabType>('upcoming')
  const [searchQuery, setSearchQuery] = useState('')
  const [propertyFilter, setPropertyFilter] = useState<string>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })

  // ─── Fetch data ──────────────────────────────────────────────────────
  const fetchCheques = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('limit', '1000')  // fetch all cheques — safeInt(null) returns 0 without this
      if (activeTab === 'paid') params.set('status', 'paid')
      if (propertyFilter !== 'all') params.set('propertyId', propertyFilter)
      if (searchQuery) params.set('search', searchQuery)

      const res = await fetch(`/api/cheques?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch cheques')
      const json = await res.json()
      // API returns { data: [...cheques], pagination: {...} } — json.data is the array
      setCheques(Array.isArray(json.data) ? json.data : [])
    } catch (e: any) {
      setError(e.message || 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [activeTab, propertyFilter, searchQuery])

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/cheques/summary')
      if (!res.ok) return
      const json = await res.json()
      // API returns { totalPending, upcoming30, ... } directly (not wrapped in data)
      setSummary(json)
    } catch (e) {
      // silent — summary is non-critical
    }
  }, [])

  const fetchProperties = useCallback(async () => {
    try {
      const res = await fetch('/api/properties?limit=200')
      if (!res.ok) return
      const json = await res.json()
      // API returns { data: [...properties], pagination: {...} }
      setProperties(Array.isArray(json.data) ? json.data : [])
    } catch (e) {
      // silent
    }
  }, [])

  useEffect(() => { fetchProperties() }, [fetchProperties])
  useEffect(() => { fetchCheques() }, [fetchCheques])
  useEffect(() => { fetchSummary() }, [fetchSummary])

  // ─── Filter cheques client-side based on active tab ──────────────────
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const filteredCheques = cheques.filter(c => {
    if (activeTab === 'upcoming') return c.status === 'pending'
    if (activeTab === 'paid') return c.status === 'paid'
    return true  // 'all' shows everything
  })

  // Sort: upcoming → by dueDate asc; paid → by paidDate desc; all → by dueDate desc
  const sortedFiltered = [...filteredCheques].sort((a, b) => {
    if (activeTab === 'paid') {
      return new Date(b.paidDate || b.dueDate).getTime() - new Date(a.paidDate || a.dueDate).getTime()
    }
    if (activeTab === 'upcoming') {
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    }
    return new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()
  })

  // ─── Helpers ─────────────────────────────────────────────────────────
  const getDaysUntilDue = (dueDate: string): number => {
    const due = new Date(dueDate)
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
    return Math.ceil((dueDay.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24))
  }

  const formatDaysLabel = (dueDate: string): { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' } => {
    const days = getDaysUntilDue(dueDate)
    if (days < 0) return { label: `${Math.abs(days)} days overdue`, variant: 'destructive' }
    if (days === 0) return { label: 'Due today', variant: 'destructive' }
    if (days <= 7) return { label: `${days} days`, variant: 'secondary' }
    return { label: `${days} days`, variant: 'outline' }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid': return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">{t('paid', lang)}</Badge>
      case 'pending': return <Badge className="bg-amber-100 text-amber-800 border-amber-200">{t('pending', lang)}</Badge>
      case 'bounced': return <Badge className="bg-red-100 text-red-800 border-red-200">{t('bounced', lang) || 'Bounced'}</Badge>
      case 'cancelled': return <Badge variant="secondary">{t('cancelled', lang) || 'Cancelled'}</Badge>
      default: return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getPropertyName = (cheque: ChequeData) => {
    if (cheque.property) return getNameByLang(cheque.property, lang)
    return '—'
  }

  // ─── Form handlers ───────────────────────────────────────────────────
  const openAdd = () => {
    setForm({ ...emptyForm, propertyId: properties[0]?.id || '' })
    setEditingId(null)
    setDialogOpen(true)
  }

  const openEdit = (cheque: ChequeData) => {
    setForm({
      propertyId: cheque.propertyId,
      payeeName: cheque.payeeName,
      payeeMobile: cheque.payeeMobile || '',
      amount: Number(cheque.amount),
      dueDate: new Date(cheque.dueDate).toISOString().split('T')[0],
      chequeNumber: cheque.chequeNumber || '',
      bankName: cheque.bankName || '',
      notes: cheque.notes || '',
      status: cheque.status === 'paid' ? 'paid' : 'pending',
      paidDate: cheque.paidDate ? new Date(cheque.paidDate).toISOString().split('T')[0] : '',
    })
    setEditingId(cheque.id)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.propertyId) { setError('Property is required'); return }
    if (!form.payeeName.trim()) { setError('Payee name is required'); return }
    if (form.amount <= 0) { setError('Amount must be greater than 0'); return }

    setSaving(true)
    setError(null)
    try {
      const payload: any = {
        propertyId: form.propertyId,
        payeeName: form.payeeName.trim(),
        payeeMobile: form.payeeMobile.trim() || null,
        amount: form.amount,
        dueDate: form.dueDate,
        chequeNumber: form.chequeNumber.trim() || null,
        bankName: form.bankName.trim() || null,
        notes: form.notes.trim() || null,
        status: form.status,
      }
      if (form.status === 'paid' && form.paidDate) {
        payload.paidDate = form.paidDate
      }

      const url = editingId ? `/api/cheques/${editingId}` : '/api/cheques'
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || `HTTP ${res.status}`)
      }
      setDialogOpen(false)
      await fetchCheques()
      await fetchSummary()
    } catch (e: any) {
      setError(e.message || 'Failed to save cheque')
    } finally {
      setSaving(false)
    }
  }

  const handleMarkPaid = async (cheque: ChequeData) => {
    if (!confirm(`Mark cheque for ${cheque.payeeName} (AED ${formatAED(cheque.amount)}) as paid?`)) return
    setSaving(true)
    try {
      const res = await fetch(`/api/cheques/${cheque.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paid' }),
      })
      if (!res.ok) throw new Error('Failed to mark as paid')
      await fetchCheques()
      await fetchSummary()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this cheque? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/cheques/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      await fetchCheques()
      await fetchSummary()
    } catch (e: any) {
      setError(e.message)
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="w-6 h-6 text-terracotta" />
            {t('cheques', lang)}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{t('chequesSubtitle', lang) || 'Track outgoing cheques to property owners'}</p>
        </div>
        <div className="flex gap-2">
          {canModify && (
            <Button onClick={openAdd} className="bg-terracotta hover:bg-terracotta/90">
              <Plus className="w-4 h-4 mr-2" />
              {t('addCheque', lang) || 'Add Cheque'}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">×</button>
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t('totalPending', lang) || 'Total Pending'}</span>
                <Clock className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-xl font-bold mt-1">{formatAED(summary.totalPending.amount)}</p>
              <p className="text-xs text-muted-foreground">{summary.totalPending.count} {t('cheques', lang).toLowerCase()}</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t('upcoming30', lang) || 'Upcoming (30 days)'}</span>
                <Calendar className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-xl font-bold mt-1">{formatAED(summary.upcoming30.amount)}</p>
              <p className="text-xs text-muted-foreground">{summary.upcoming30.count} {t('cheques', lang).toLowerCase()}</p>
            </CardContent>
          </Card>

          <Card className={`border-l-4 ${summary.overdue.count > 0 ? 'border-l-red-500' : 'border-l-gray-300'}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t('overdue', lang) || 'Overdue'}</span>
                <AlertCircle className={`w-4 h-4 ${summary.overdue.count > 0 ? 'text-red-500' : 'text-gray-400'}`} />
              </div>
              <p className={`text-xl font-bold mt-1 ${summary.overdue.count > 0 ? 'text-red-600' : ''}`}>{formatAED(summary.overdue.amount)}</p>
              <p className="text-xs text-muted-foreground">{summary.overdue.count} {t('cheques', lang).toLowerCase()}</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t('paidThisYear', lang) || 'Paid This Year'}</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              <p className="text-xl font-bold mt-1 text-emerald-700">{formatAED(summary.paidThisYear.amount)}</p>
              <p className="text-xs text-muted-foreground">{summary.paidThisYear.count} {t('cheques', lang).toLowerCase()}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters + Tabs */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-1">
              <Button
                variant={activeTab === 'upcoming' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('upcoming')}
                className={activeTab === 'upcoming' ? 'bg-amber-500 hover:bg-amber-600' : ''}
              >
                {t('upcoming', lang) || 'Upcoming'}
              </Button>
              <Button
                variant={activeTab === 'paid' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('paid')}
                className={activeTab === 'paid' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}
              >
                {t('paid', lang)}
              </Button>
              <Button
                variant={activeTab === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('all')}
              >
                {t('all', lang) || 'All'}
              </Button>
            </div>

            <div className="flex gap-2 items-center">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t('search', lang) || 'Search payee, cheque #...'}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 w-56"
                />
              </div>
              <Select value={propertyFilter} onValueChange={setPropertyFilter}>
                <SelectTrigger className="w-48"><SelectValue placeholder={t('allProperties', lang) || 'All Properties'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('allProperties', lang) || 'All Properties'}</SelectItem>
                  {properties.map(p => (
                    <SelectItem key={p.id} value={p.id}>{getNameByLang(p, lang)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cheques Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('property', lang)}</TableHead>
                  <TableHead>{t('payee', lang) || 'Payee'}</TableHead>
                  <TableHead className="text-right">{t('amount', lang)}</TableHead>
                  <TableHead>{t('dueDate', lang) || 'Due Date'}</TableHead>
                  <TableHead>{t('status', lang)}</TableHead>
                  {activeTab !== 'paid' && <TableHead>{t('daysUntilDue', lang) || 'Days Until Due'}</TableHead>}
                  {activeTab === 'paid' && <TableHead>{t('paidDate', lang) || 'Paid Date'}</TableHead>}
                  {canModify && <TableHead className="text-right">{t('actions', lang) || 'Actions'}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={canModify ? 7 : 6} className="text-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : sortedFiltered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canModify ? 7 : 6} className="text-center py-8 text-muted-foreground">
                      {t('noCheques', lang) || 'No cheques found'}
                    </TableCell>
                  </TableRow>
                ) : sortedFiltered.map(cheque => {
                  const days = formatDaysLabel(cheque.dueDate)
                  return (
                    <TableRow key={cheque.id} className={cheque.status === 'pending' && getDaysUntilDue(cheque.dueDate) < 0 ? 'bg-red-50/50' : ''}>
                      <TableCell className="text-sm font-medium">{getPropertyName(cheque)}</TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{cheque.payeeName}</p>
                          {cheque.payeeMobile && <p className="text-xs text-muted-foreground">{cheque.payeeMobile}</p>}
                          {cheque.chequeNumber && <p className="text-xs text-muted-foreground font-mono">#{cheque.chequeNumber}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-sm">{formatAED(cheque.amount)}</TableCell>
                      <TableCell className="text-sm">{formatDate(cheque.dueDate)}</TableCell>
                      <TableCell>{getStatusBadge(cheque.status)}</TableCell>
                      {activeTab !== 'paid' && (
                        <TableCell>
                          {cheque.status === 'pending' ? (
                            <Badge variant={days.variant}>{days.label}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                      {activeTab === 'paid' && (
                        <TableCell className="text-sm">{cheque.paidDate ? formatDate(cheque.paidDate) : '—'}</TableCell>
                      )}
                      {canModify && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {cheque.status === 'pending' && (
                              <button
                                onClick={() => handleMarkPaid(cheque)}
                                className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600"
                                title={t('markAsPaid', lang) || 'Mark as Paid'}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => openEdit(cheque)}
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                              title={t('edit', lang) || 'Edit'}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(cheque.id)}
                              className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"
                              title={t('delete', lang) || 'Delete'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? (t('editCheque', lang) || 'Edit Cheque') : (t('addCheque', lang) || 'Add Cheque')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t('property', lang)} *</Label>
                <Select value={form.propertyId} onValueChange={v => setForm({ ...form, propertyId: v })}>
                  <SelectTrigger><SelectValue placeholder={t('selectProperty', lang)} /></SelectTrigger>
                  <SelectContent>
                    {properties.map(p => (
                      <SelectItem key={p.id} value={p.id}>{getNameByLang(p, lang)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('payeeName', lang) || 'Payee Name'} *</Label>
                <Input value={form.payeeName} onChange={e => setForm({ ...form, payeeName: e.target.value })} placeholder="e.g. Ali Majdi Ghareeb Nasser" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t('payeeMobile', lang) || 'Payee Mobile'}</Label>
                <Input value={form.payeeMobile} onChange={e => setForm({ ...form, payeeMobile: e.target.value })} placeholder="+971..." />
              </div>
              <div>
                <Label>{t('amount', lang)} (AED) *</Label>
                <Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t('dueDate', lang) || 'Due Date'} *</Label>
                <Input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} />
              </div>
              <div>
                <Label>{t('status', lang)}</Label>
                <Select value={form.status} onValueChange={(v: any) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">{t('pending', lang)}</SelectItem>
                    <SelectItem value="paid">{t('paid', lang)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.status === 'paid' && (
              <div>
                <Label>{t('paidDate', lang) || 'Paid Date'}</Label>
                <Input type="date" value={form.paidDate} onChange={e => setForm({ ...form, paidDate: e.target.value })} />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t('chequeNumber', lang) || 'Cheque Number'}</Label>
                <Input value={form.chequeNumber} onChange={e => setForm({ ...form, chequeNumber: e.target.value })} placeholder="optional" />
              </div>
              <div>
                <Label>{t('bankName', lang) || 'Bank Name'}</Label>
                <Input value={form.bankName} onChange={e => setForm({ ...form, bankName: e.target.value })} placeholder="optional" />
              </div>
            </div>

            <div>
              <Label>{t('notes', lang)}</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('cancel', lang)}</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-terracotta hover:bg-terracotta/90">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingId ? (t('save', lang) || 'Save') : (t('create', lang) || 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
