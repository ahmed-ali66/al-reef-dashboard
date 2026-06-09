'use client'

import { useEffect, useState, useCallback } from 'react'
import type { RecurringBillData, BillPaymentData, PropertyData } from '@/lib/types'
import { useAppStore, isOwnerOrAdmin } from '@/lib/store'
import { formatAED, formatDate } from '@/lib/utils'
import { t, getServiceTypeLabel, getFrequencyLabel, getNameByLang, type Language } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Zap, Plus, Pencil, Trash2, CreditCard, FastForward, Loader2, ShieldAlert, Search, AlertTriangle } from 'lucide-react'

const SERVICE_TYPES = [
  'electricity', 'water', 'etisalat', 'du', 'internet',
  'municipality', 'service_charge', 'waste',
  'maintenance_contract', 'security_contract', 'cleaning_contract', 'custom',
] as const

const BILLING_FREQUENCIES = ['monthly', 'quarterly', 'semi_annual', 'annual'] as const
const PAYMENT_METHODS = ['cash', 'bank_transfer', 'cheque', 'online'] as const

type TabType = 'all' | 'upcoming' | 'overdue'

const emptyBillForm = {
  propertyId: '',
  providerName: '',
  serviceType: 'electricity',
  accountNumber: '',
  contractNumber: '',
  currentOutstanding: 0,
  nextDueDate: new Date().toISOString().split('T')[0],
  billingFrequency: 'monthly',
  autoRenew: true,
  gracePeriodDays: 0,
  buildingName: '',
  ownerName: '',
  propertyManager: '',
  notes: '',
}

const emptyPaymentForm = {
  amount: 0,
  paymentDate: new Date().toISOString().split('T')[0],
  paymentMethod: 'bank_transfer',
  reference: '',
  notes: '',
}

export default function RecurringBills() {
  const { language, authUser } = useAppStore()
  const lang = language as Language

  const [bills, setBills] = useState<RecurringBillData[]>([])
  const [properties, setProperties] = useState<PropertyData[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [serviceFilter, setServiceFilter] = useState('all')

  // Dialogs
  const [billDialogOpen, setBillDialogOpen] = useState(false)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringBillData | null>(null)
  const [payingBill, setPayingBill] = useState<RecurringBillData | null>(null)
  const [historyBill, setHistoryBill] = useState<RecurringBillData | null>(null)
  const [payments, setPayments] = useState<BillPaymentData[]>([])

  // Forms
  const [billForm, setBillForm] = useState({ ...emptyBillForm })
  const [paymentForm, setPaymentForm] = useState({ ...emptyPaymentForm })
  const [saving, setSaving] = useState(false)

  // Access control
  const canAccess = !!authUser
  const canModify = authUser && isOwnerOrAdmin(authUser.role)
  const isFinancial = authUser && isOwnerOrAdmin(authUser.role)

  // Fetch bills
  const fetchBills = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('limit', '1000')

      if (activeTab === 'upcoming') {
        params.set('upcoming', 'true')
      } else if (activeTab === 'overdue') {
        params.set('overdue', 'true')
      }
      if (serviceFilter !== 'all') {
        params.set('serviceType', serviceFilter)
      }

      const [billsRes, summaryRes, propsRes] = await Promise.all([
        fetch(`/api/recurring-bills?${params.toString()}`),
        fetch('/api/recurring-bills/summary'),
        fetch('/api/properties?limit=1000'),
      ])

      if (billsRes.ok) {
        const data = await billsRes.json()
        const billList = data.data?.data || data.data || data || []
        setBills(Array.isArray(billList) ? billList : [])
      }
      if (summaryRes.ok) {
        const data = await summaryRes.json()
        setSummary(data.data || data || null)
      }
      if (propsRes.ok) {
        const data = await propsRes.json()
        const propList = data.data?.data || data.data || data || []
        setProperties(Array.isArray(propList) ? propList : [])
      }
    } catch (e) {
      console.error('Failed to fetch bills:', e)
    } finally {
      setLoading(false)
    }
  }, [activeTab, serviceFilter])

  useEffect(() => { fetchBills() }, [fetchBills])

  // Filtered bills (client-side search)
  const filtered = bills.filter(bill => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      bill.providerName?.toLowerCase().includes(q) ||
      bill.buildingName?.toLowerCase().includes(q) ||
      bill.ownerName?.toLowerCase().includes(q) ||
      bill.propertyManager?.toLowerCase().includes(q) ||
      bill.accountNumber?.toLowerCase().includes(q) ||
      bill.serviceType?.toLowerCase().includes(q) ||
      (bill.property && getNameByLang(bill.property, lang).toLowerCase().includes(q))
    )
  })

  // Handlers
  const openNew = () => {
    setEditing(null)
    setBillForm({ ...emptyBillForm })
    setBillDialogOpen(true)
  }

  const openEdit = (bill: RecurringBillData) => {
    setEditing(bill)
    setBillForm({
      propertyId: bill.propertyId,
      providerName: bill.providerName,
      serviceType: bill.serviceType,
      accountNumber: bill.accountNumber || '',
      contractNumber: bill.contractNumber || '',
      currentOutstanding: bill.currentOutstanding,
      nextDueDate: new Date(bill.nextDueDate).toISOString().split('T')[0],
      billingFrequency: bill.billingFrequency,
      autoRenew: bill.autoRenew,
      gracePeriodDays: bill.gracePeriodDays,
      buildingName: bill.buildingName || '',
      ownerName: bill.ownerName || '',
      propertyManager: bill.propertyManager || '',
      notes: bill.notes || '',
    })
    setBillDialogOpen(true)
  }

  const openPayment = (bill: RecurringBillData) => {
    setPayingBill(bill)
    setPaymentForm({ ...emptyPaymentForm, amount: bill.totalAmountDue || bill.currentOutstanding })
    setPaymentDialogOpen(true)
  }

  const openHistory = async (bill: RecurringBillData) => {
    setHistoryBill(bill)
    setHistoryDialogOpen(true)
    try {
      const res = await fetch(`/api/recurring-bills/${bill.id}/payments?limit=50`)
      if (res.ok) {
        const data = await res.json()
        setPayments(Array.isArray(data.data?.data || data.data || data) ? (data.data?.data || data.data || data) : [])
      }
    } catch (e) {
      console.error('Failed to fetch payments:', e)
    }
  }

  const handleSaveBill = async () => {
    setSaving(true)
    try {
      const body = {
        ...billForm,
        currentOutstanding: Number(billForm.currentOutstanding),
        gracePeriodDays: Number(billForm.gracePeriodDays),
        accountNumber: billForm.accountNumber || null,
        contractNumber: billForm.contractNumber || null,
        buildingName: billForm.buildingName || null,
        ownerName: billForm.ownerName || null,
        propertyManager: billForm.propertyManager || null,
        notes: billForm.notes || null,
      }

      if (editing) {
        const res = await fetch(`/api/recurring-bills/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json()
          alert(err.error || 'Failed to update bill')
          setSaving(false)
          return
        }
      } else {
        const res = await fetch('/api/recurring-bills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json()
          alert(err.error || 'Failed to create bill')
          setSaving(false)
          return
        }
      }
      setBillDialogOpen(false)
      fetchBills()
    } catch (error) {
      console.error('Failed to save bill:', error)
      alert('Failed to save bill. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleRecordPayment = async () => {
    if (!payingBill) return
    setSaving(true)
    try {
      const res = await fetch(`/api/recurring-bills/${payingBill.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(paymentForm.amount),
          paymentDate: paymentForm.paymentDate,
          paymentMethod: paymentForm.paymentMethod,
          reference: paymentForm.reference || null,
          notes: paymentForm.notes || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error || 'Failed to record payment')
        setSaving(false)
        return
      }
      setPaymentDialogOpen(false)
      fetchBills()
    } catch (error) {
      console.error('Failed to record payment:', error)
      alert('Failed to record payment. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleAdvanceCycle = async (bill: RecurringBillData) => {
    if (!confirm(t('advanceCycle', lang) + '?')) return
    try {
      const res = await fetch('/api/recurring-bills/cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billId: bill.id }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error || 'Failed to advance cycle')
        return
      }
      fetchBills()
    } catch (error) {
      console.error('Failed to advance cycle:', error)
      alert('Failed to advance cycle. Please try again.')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('deleteExpense', lang))) return
    try {
      const res = await fetch(`/api/recurring-bills/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        alert('Failed to delete bill')
        return
      }
      fetchBills()
    } catch (error) {
      console.error('Failed to delete bill:', error)
      alert('Failed to delete bill. Please try again.')
    }
  }

  // Helpers
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">{t('active', lang)}</Badge>
      case 'paused': return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">{t('pending', lang)}</Badge>
      case 'cancelled': return <Badge className="bg-gray-100 text-gray-800 border-gray-200 text-xs">{t('terminated', lang)}</Badge>
      default: return <Badge variant="secondary" className="text-xs">{status}</Badge>
    }
  }

  const getOverdueDays = (dueDate: string): number => {
    const now = new Date()
    const due = new Date(dueDate)
    const diff = now.getTime() - due.getTime()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }

  const isOverdue = (bill: RecurringBillData) => {
    return bill.status === 'active' && new Date(bill.nextDueDate) < new Date()
  }

  const isUpcoming = (bill: RecurringBillData) => {
    if (bill.status !== 'active') return false
    const now = new Date()
    const due = new Date(bill.nextDueDate)
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    return due >= now && due <= thirtyDays
  }

  const displayAmount = (amount: number) => {
    if (!isFinancial) return '***'
    return formatAED(amount)
  }

  // Summary stats
  const totalBills = summary?.totalBills ?? bills.filter(b => b.status === 'active').length
  const totalOutstanding = summary?.totalOutstanding ?? bills.reduce((s, b) => s + b.currentOutstanding, 0)
  const totalDueThisMonth = summary?.totalDueThisMonth ?? bills.reduce((s, b) => s + (isUpcoming(b) ? b.totalAmountDue : 0), 0)
  const totalPaidThisMonth = summary?.totalPaidThisMonth ?? 0
  const overdueCount = summary?.overdueBills?.length ?? bills.filter(b => isOverdue(b)).length

  if (loading && bills.length === 0) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-emerald" /></div>
  }

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <ShieldAlert className="w-12 h-12 text-terracotta" />
        <h2 className="text-xl font-bold">{t('accessDenied', lang)}</h2>
        <p className="text-muted-foreground text-sm text-center max-w-md">{t('financialDataProtected', lang)}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-emerald" />
            {t('recurringBillsAndUtilities', lang)}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {totalBills} {t('recurringBills', lang).toLowerCase()}
          </p>
        </div>
        <Button onClick={openNew} className="bg-emerald hover:bg-emerald/90 text-white">
          <Plus className="w-4 h-4 mr-2" />
          {t('addRecurringBill', lang)}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card className="card-hover">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t('recurringBills', lang)}</p>
            <p className="text-2xl font-bold mt-1">{totalBills}</p>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t('totalOutstanding', lang)}</p>
            <p className="text-lg font-bold mt-1 text-terracotta">{displayAmount(totalOutstanding)}</p>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t('totalDue', lang)}</p>
            <p className="text-lg font-bold mt-1 text-amber-600">{displayAmount(totalDueThisMonth)}</p>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t('totalPaid', lang)}</p>
            <p className="text-lg font-bold mt-1 text-emerald">{displayAmount(totalPaidThisMonth)}</p>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t('overdueBills', lang)}</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-2xl font-bold text-red-600">{overdueCount}</p>
              {overdueCount > 0 && <AlertTriangle className="w-5 h-5 text-red-500" />}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Service Type Breakdown */}
      {summary?.serviceTypeBreakdown?.length > 0 && isFinancial && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {summary.serviceTypeBreakdown
            .sort((a: any, b: any) => (b.totalAmountDue || 0) - (a.totalAmountDue || 0))
            .map((item: any) => (
              <Card key={item.serviceType} className="card-hover">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">
                    {getServiceTypeLabel(item.serviceType, lang)}
                  </p>
                  <p className="text-lg font-bold mt-1">{formatAED(item.totalAmountDue || 0)}</p>
                  <p className="text-xs text-muted-foreground">{item.count} {t('recurringBills', lang).toLowerCase()}</p>
                </CardContent>
              </Card>
            ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={activeTab === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('all')}
          className={activeTab === 'all' ? 'bg-emerald hover:bg-emerald/90 text-white' : ''}
        >
          {t('all', lang)}
        </Button>
        <Button
          variant={activeTab === 'upcoming' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('upcoming')}
          className={activeTab === 'upcoming' ? 'bg-emerald hover:bg-emerald/90 text-white' : ''}
        >
          {t('upcomingBills', lang)}
        </Button>
        <Button
          variant={activeTab === 'overdue' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('overdue')}
          className={activeTab === 'overdue' ? 'bg-red-500 hover:bg-red-600 text-white' : ''}
        >
          {t('overdueBills', lang)}
          {overdueCount > 0 && <Badge className="ml-2 bg-white text-red-600 text-xs">{overdueCount}</Badge>}
        </Button>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('searchTenants', lang)}
            className="pl-9"
          />
        </div>
        <Select value={serviceFilter} onValueChange={v => setServiceFilter(v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('serviceType', lang)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('all', lang)}</SelectItem>
            {SERVICE_TYPES.map(st => (
              <SelectItem key={st} value={st}>{getServiceTypeLabel(st, lang)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bills Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('providerName', lang)}</TableHead>
                  <TableHead>{t('building', lang)}</TableHead>
                  <TableHead>{t('totalDue', lang)}</TableHead>
                  <TableHead>{t('currentOutstanding', lang)}</TableHead>
                  <TableHead>{t('nextDueDate', lang)}</TableHead>
                  <TableHead>{t('status', lang)}</TableHead>
                  <TableHead className="text-right">{t('title', lang) === t('title', lang) ? t('category', lang) : ''}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(bill => {
                  const overdue = isOverdue(bill)
                  const overdueDays = overdue ? getOverdueDays(bill.nextDueDate) : 0
                  return (
                    <TableRow key={bill.id} className={overdue ? 'bg-red-50/50' : ''}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{bill.providerName}</p>
                          <Badge variant="secondary" className="text-xs mt-1">
                            {getServiceTypeLabel(bill.serviceType, lang)}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {bill.property ? getNameByLang(bill.property, lang) : bill.buildingName || '—'}
                      </TableCell>
                      <TableCell className="font-semibold text-sm text-terracotta">
                        {displayAmount(bill.totalAmountDue)}
                      </TableCell>
                      <TableCell className="font-semibold text-sm">
                        <span className={bill.currentOutstanding > 0 ? 'text-red-600' : 'text-emerald'}>
                          {displayAmount(bill.currentOutstanding)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{formatDate(bill.nextDueDate)}</p>
                          {overdue && (
                            <Badge className="bg-red-100 text-red-800 border-red-200 text-xs mt-1">
                              {overdueDays} {t('daysOverdue', lang)}
                            </Badge>
                          )}
                          {isUpcoming(bill) && !overdue && (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs mt-1">
                              {t('dueSoon', lang)}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {getStatusBadge(bill.status)}
                          <span className="text-xs text-muted-foreground">
                            {getFrequencyLabel(bill.billingFrequency, lang)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openHistory(bill)}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                            title={t('paymentHistory', lang)}
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openPayment(bill)}
                            className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600"
                            title={t('recordPayment', lang)}
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                          </button>
                          {canModify && (
                            <>
                              <button
                                onClick={() => openEdit(bill)}
                                className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              {overdue && (
                                <button
                                  onClick={() => handleAdvanceCycle(bill)}
                                  className="p-1.5 rounded hover:bg-amber-50 text-amber-600"
                                  title={t('advanceCycle', lang)}
                                >
                                  <FastForward className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => handleDelete(bill.id)}
                                className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          {filtered.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              {t('noData', lang)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Add/Edit Bill Dialog ─── */}
      <Dialog open={billDialogOpen} onOpenChange={setBillDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('editRecurringBill', lang) : t('addRecurringBill', lang)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Property & Provider */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t('selectProperty', lang)} *</Label>
                <Select value={billForm.propertyId} onValueChange={v => setBillForm({ ...billForm, propertyId: v })}>
                  <SelectTrigger><SelectValue placeholder={t('selectProperty', lang)} /></SelectTrigger>
                  <SelectContent>
                    {properties.map(p => (
                      <SelectItem key={p.id} value={p.id}>{getNameByLang(p, lang)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('providerName', lang)} *</Label>
                <Input value={billForm.providerName} onChange={e => setBillForm({ ...billForm, providerName: e.target.value })} />
              </div>
            </div>

            {/* Service Type & Billing Frequency */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t('serviceType', lang)} *</Label>
                <Select value={billForm.serviceType} onValueChange={v => setBillForm({ ...billForm, serviceType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPES.map(st => (
                      <SelectItem key={st} value={st}>{getServiceTypeLabel(st, lang)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('billingFrequency', lang)} *</Label>
                <Select value={billForm.billingFrequency} onValueChange={v => setBillForm({ ...billForm, billingFrequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BILLING_FREQUENCIES.map(f => (
                      <SelectItem key={f} value={f}>{getFrequencyLabel(f, lang)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Account Numbers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t('accountNumber', lang)}</Label>
                <Input value={billForm.accountNumber} onChange={e => setBillForm({ ...billForm, accountNumber: e.target.value })} />
              </div>
              <div>
                <Label>{t('contractNumber', lang)}</Label>
                <Input value={billForm.contractNumber} onChange={e => setBillForm({ ...billForm, contractNumber: e.target.value })} />
              </div>
            </div>

            {/* Amount & Due Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t('currentOutstanding', lang)} (AED)</Label>
                <Input type="number" value={billForm.currentOutstanding} onChange={e => setBillForm({ ...billForm, currentOutstanding: Number(e.target.value) })} />
              </div>
              <div>
                <Label>{t('nextDueDate', lang)} *</Label>
                <Input type="date" value={billForm.nextDueDate} onChange={e => setBillForm({ ...billForm, nextDueDate: e.target.value })} />
              </div>
            </div>

            {/* Auto Renew & Grace Period */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-2 pt-6">
                <Checkbox
                  id="autoRenew"
                  checked={billForm.autoRenew}
                  onCheckedChange={(checked) => setBillForm({ ...billForm, autoRenew: !!checked })}
                />
                <Label htmlFor="autoRenew" className="cursor-pointer">{t('autoRenew', lang)}</Label>
              </div>
              <div>
                <Label>{t('gracePeriod', lang)}</Label>
                <Input type="number" value={billForm.gracePeriodDays} onChange={e => setBillForm({ ...billForm, gracePeriodDays: Number(e.target.value) })} />
              </div>
            </div>

            {/* Building / Owner / Manager */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label>{t('buildingName', lang)}</Label>
                <Input value={billForm.buildingName} onChange={e => setBillForm({ ...billForm, buildingName: e.target.value })} />
              </div>
              <div>
                <Label>{t('ownerName', lang)}</Label>
                <Input value={billForm.ownerName} onChange={e => setBillForm({ ...billForm, ownerName: e.target.value })} />
              </div>
              <div>
                <Label>{t('propertyManager', lang)}</Label>
                <Input value={billForm.propertyManager} onChange={e => setBillForm({ ...billForm, propertyManager: e.target.value })} />
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label>{t('notes', lang)}</Label>
              <Textarea value={billForm.notes} onChange={e => setBillForm({ ...billForm, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBillDialogOpen(false)}>{t('cancel', lang)}</Button>
            <Button
              onClick={handleSaveBill}
              className="bg-emerald hover:bg-emerald/90 text-white"
              disabled={!billForm.propertyId || !billForm.providerName || saving}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('save', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Record Payment Dialog ─── */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('recordPayment', lang)}</DialogTitle>
          </DialogHeader>
          {payingBill && (
            <div className="space-y-4">
              {/* Bill info summary */}
              <Card>
                <CardContent className="p-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('providerName', lang)}</span>
                    <span className="font-medium">{payingBill.providerName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('serviceType', lang)}</span>
                    <Badge variant="secondary" className="text-xs">{getServiceTypeLabel(payingBill.serviceType, lang)}</Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('currentOutstanding', lang)}</span>
                    <span className="font-medium text-red-600">{displayAmount(payingBill.currentOutstanding)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('totalAmountDue', lang)}</span>
                    <span className="font-bold text-terracotta">{displayAmount(payingBill.totalAmountDue)}</span>
                  </div>
                </CardContent>
              </Card>

              <div>
                <Label>{t('paymentAmount', lang)} (AED) *</Label>
                <Input
                  type="number"
                  value={paymentForm.amount}
                  onChange={e => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>{t('paymentDate', lang)} *</Label>
                <Input
                  type="date"
                  value={paymentForm.paymentDate}
                  onChange={e => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                />
              </div>
              <div>
                <Label>{t('paymentMethod', lang)}</Label>
                <Select value={paymentForm.paymentMethod} onValueChange={v => setPaymentForm({ ...paymentForm, paymentMethod: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => (
                      <SelectItem key={m} value={m}>
                        {m === 'cash' ? t('cash', lang) :
                         m === 'bank_transfer' ? t('bankTransfer', lang) :
                         m === 'cheque' ? t('cheque', lang) : 'Online'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('reference', lang)}</Label>
                <Input value={paymentForm.reference} onChange={e => setPaymentForm({ ...paymentForm, reference: e.target.value })} />
              </div>
              <div>
                <Label>{t('notes', lang)}</Label>
                <Textarea value={paymentForm.notes} onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>{t('cancel', lang)}</Button>
            <Button
              onClick={handleRecordPayment}
              className="bg-emerald hover:bg-emerald/90 text-white"
              disabled={paymentForm.amount <= 0 || saving}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('confirmPayment', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Payment History Dialog ─── */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t('paymentHistory', lang)} — {historyBill?.providerName}
            </DialogTitle>
          </DialogHeader>
          {historyBill && (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('serviceType', lang)}</span>
                    <Badge variant="secondary" className="text-xs">{getServiceTypeLabel(historyBill.serviceType, lang)}</Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('currentOutstanding', lang)}</span>
                    <span className="font-medium text-red-600">{displayAmount(historyBill.currentOutstanding)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('totalAmountDue', lang)}</span>
                    <span className="font-bold text-terracotta">{displayAmount(historyBill.totalAmountDue)}</span>
                  </div>
                  {historyBill.lastPaymentDate && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t('lastPaymentDate', lang)}</span>
                      <span className="font-medium">{formatDate(historyBill.lastPaymentDate)}</span>
                    </div>
                  )}
                  {historyBill.lastPaymentAmount !== null && historyBill.lastPaymentAmount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t('lastPaymentAmount', lang)}</span>
                      <span className="font-medium text-emerald">{displayAmount(historyBill.lastPaymentAmount)}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Payments list */}
              {payments.length === 0 ? (
                <p className="text-center py-4 text-muted-foreground text-sm">{t('noPayments', lang)}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('paymentDate', lang)}</TableHead>
                        <TableHead>{t('amount', lang)}</TableHead>
                        <TableHead>{t('outstandingBefore', lang)}</TableHead>
                        <TableHead>{t('outstandingAfter', lang)}</TableHead>
                        <TableHead>{t('paymentMethod', lang)}</TableHead>
                        <TableHead>{t('reference', lang)}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map(p => (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm">{formatDate(p.paymentDate)}</TableCell>
                          <TableCell className="font-semibold text-sm text-emerald">
                            {isFinancial ? formatAED(p.amount) : '***'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {isFinancial ? formatAED(p.outstandingBefore) : '***'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {isFinancial ? formatAED(p.outstandingAfter) : '***'}
                          </TableCell>
                          <TableCell className="text-sm">{p.paymentMethod || '—'}</TableCell>
                          <TableCell className="text-sm">{p.reference || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
