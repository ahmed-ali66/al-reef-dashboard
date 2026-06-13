'use client'

import { useEffect, useState, useCallback } from 'react'
import type { TenantData, PropertyData, PaymentData, RentAdjustmentData } from '@/lib/types'
import { useAppStore, isOwnerOrAdmin } from '@/lib/store'
import { useDataStore } from '@/lib/data-store'
import { formatAED, getPaymentStatusColor, cn2, isFinanciallyActive } from '@/lib/utils'
import { t, getMonthName, getNameByLang, getWhatsAppLink, type WhatsAppLanguage } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Banknote, MessageCircle, Check, AlertTriangle, Clock, Loader2, ChevronLeft, ChevronRight, FileText, Search, Pencil, Trash2, ChevronDown, ChevronUp, X, Plus, MinusCircle } from 'lucide-react'
import BillInvoice from '@/components/bill-invoice'

export default function RentCollection() {
  const { language, authUser } = useAppStore()
  const [tenants, setTenants] = useState<TenantData[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [filter, setFilter] = useState<'all' | 'paid' | 'partial' | 'unpaid' | 'overdue'>('all')
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payingTenant, setPayingTenant] = useState<TenantData | null>(null)
  const [payForm, setPayForm] = useState({ amount: 0, method: 'cash', reference: '', notes: '', paymentDate: new Date().toISOString().split('T')[0] })
  const [payAllocationType, setPayAllocationType] = useState<string>('CURRENT_RENT')

  // Bill invoice dialog
  const [billDialogOpen, setBillDialogOpen] = useState(false)
  const [billTenant, setBillTenant] = useState<TenantData | null>(null)

  // WhatsApp language selection dialog
  const [whatsappLangDialogOpen, setWhatsappLangDialogOpen] = useState(false)
  const [whatsappTargetTenant, setWhatsappTargetTenant] = useState<TenantData | null>(null)
  const [whatsappRemindAll, setWhatsappRemindAll] = useState(false)

  // Payment edit/delete state
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null)
  const [editPaymentDialog, setEditPaymentDialog] = useState(false)
  const [deletePaymentDialog, setDeletePaymentDialog] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<PaymentData | null>(null)
  const [editForm, setEditForm] = useState({ amount: 0, date: '', method: 'cash', reference: '', notes: '', isLate: false })
  const [deleteReason, setDeleteReason] = useState('')
  const [paymentError, setPaymentError] = useState('')
  const [paymentActionLoading, setPaymentActionLoading] = useState(false)

  // Tenant name / property search
  const [tenantSearch, setTenantSearch] = useState('')

  // Unit number filter
  const [unitFilter, setUnitFilter] = useState<string>('all')

  // Invoice search
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [invoiceSearchResults, setInvoiceSearchResults] = useState<any[] | null>(null)
  const [invoiceSearching, setInvoiceSearching] = useState(false)
  const [invoiceSearchOpen, setInvoiceSearchOpen] = useState(false)

  // Adjustment dialog state
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false)
  const [adjustmentTenant, setAdjustmentTenant] = useState<TenantData | null>(null)
  const [adjustmentForm, setAdjustmentForm] = useState({
    amount: 0,
    adjustmentType: 'maintenance_delay',
    reason: '',
    notes: '',
    effectiveMonth: new Date().getMonth() + 1,
    effectiveYear: new Date().getFullYear(),
    durationMonths: 1,
  })
  const [cancelAdjustmentDialogOpen, setCancelAdjustmentDialogOpen] = useState(false)
  const [cancelAdjustmentTarget, setCancelAdjustmentTarget] = useState<RentAdjustmentData | null>(null)
  const [cancelAdjustmentReason, setCancelAdjustmentReason] = useState('')
  const [editAdjustmentDialogOpen, setEditAdjustmentDialogOpen] = useState(false)
  const [editAdjustmentTarget, setEditAdjustmentTarget] = useState<RentAdjustmentData | null>(null)
  const [editAdjustmentForm, setEditAdjustmentForm] = useState({
    amount: 0,
    adjustmentType: 'maintenance_delay',
    reason: '',
    notes: '',
    effectiveMonth: new Date().getMonth() + 1,
    effectiveYear: new Date().getFullYear(),
    durationMonths: 1,
  })
  const [adjustmentLoading, setAdjustmentLoading] = useState(false)
  const [adjustmentError, setAdjustmentError] = useState('')

  const searchInvoice = async () => {
    if (!invoiceSearch.trim() || invoiceSearch.trim().length < 2) return
    setInvoiceSearching(true)
    try {
      const res = await fetch(`/api/invoices/search?q=${encodeURIComponent(invoiceSearch.trim())}`)
      if (!res.ok) {
        // Handle auth errors and server errors
        setInvoiceSearchResults([])
        setInvoiceSearchOpen(true)
        return
      }
      const data = await res.json()
      // API returns { results: [...], total: N } directly via successResponse()
      setInvoiceSearchResults(data.results || [])
      setInvoiceSearchOpen(true)
    } catch (e) {
      console.error('Invoice search failed:', e)
      setInvoiceSearchResults([])
      setInvoiceSearchOpen(true)
    } finally {
      setInvoiceSearching(false)
    }
  }

  const canSeeRevenue = isOwnerOrAdmin(authUser?.role || '')

  const fetchData = useCallback(() => {
    try {
      const tenants = useDataStore.getState().getTenantsWithRelations()
      setTenants(tenants)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const activeTenants = tenants.filter(t => isFinanciallyActive(t.status))

  // Helper: check if adjustment is active in a given month
  const isAdjustmentActiveInMonth = (a: RentAdjustmentData, month: number, year: number): boolean => {
    if (a.status !== 'approved') return false
    const startDate = new Date(a.effectiveYear, a.effectiveMonth - 1, 1)
    const checkDate = new Date(year, month - 1, 1)
    const endDate = new Date(
      a.effectiveYear + Math.floor((a.effectiveMonth - 1 + a.durationMonths) / 12),
      ((a.effectiveMonth - 1 + a.durationMonths) % 12),
      0
    )
    return checkDate >= startDate && checkDate <= endDate
  }

  const getTenantAdjustments = (tenant: TenantData): RentAdjustmentData[] => {
    return (tenant.adjustments || []).filter(a => isAdjustmentActiveInMonth(a, selectedMonth, selectedYear))
  }

  const getTenantPaymentStatus = (tenant: TenantData): 'paid' | 'partial' | 'overdue' | 'unpaid' | 'due-soon' => {
    const payments = (tenant.payments || []).filter(p => p.month === selectedMonth && p.year === selectedYear)
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
    const tenantAdjustments = getTenantAdjustments(tenant)
    const totalAdjustments = tenantAdjustments.reduce((sum, a) => sum + a.amount, 0)
    const creditApplied = Math.min(tenant.creditBalance || 0, Math.max(0, tenant.rentAmount - totalPaid - totalAdjustments))
    const totalCredits = totalPaid + totalAdjustments + creditApplied
    if (totalCredits >= tenant.rentAmount) return 'paid'
    if (totalCredits > 0) return 'partial'

    // Calendar-based status for unpaid tenants
    const now = new Date()
    const isSelectedCurrentMonth = selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear()

    if (isSelectedCurrentMonth) {
      const dayOfMonth = now.getDate()
      if (dayOfMonth <= 2) return 'due-soon'
      if (dayOfMonth <= 4) return 'unpaid'
      return 'overdue'
    }

    // Past months - all unpaid are overdue
    if (selectedYear < now.getFullYear() || (selectedYear === now.getFullYear() && selectedMonth < now.getMonth() + 1)) {
      return 'overdue'
    }

    // Future months - due soon
    return 'due-soon'
  }

  // Step 1: Status filter
  const statusFiltered = activeTenants.filter(t => {
    const status = getTenantPaymentStatus(t)
    if (filter === 'all') return true
    if (filter === 'paid') return status === 'paid'
    if (filter === 'partial') return status === 'partial'
    if (filter === 'unpaid') return status === 'overdue' || status === 'unpaid' || status === 'due-soon'
    if (filter === 'overdue') return status === 'overdue'
    return true
  })

  // Step 2: Search filter (tenant name + property name)
  const searchFiltered = statusFiltered.filter(t => {
    if (!tenantSearch.trim()) return true
    const searchLower = tenantSearch.trim().toLowerCase()
    const tenantName = getNameByLang(t, language).toLowerCase()
    const propertyName = t.property ? getNameByLang(t.property, language).toLowerCase() : ''
    return tenantName.includes(searchLower) || propertyName.includes(searchLower)
  })

  // Derive unique unit numbers from search-filtered tenants (context-aware)
  const uniqueUnitNumbers = Array.from(
    new Set(searchFiltered.map(t => t.unitNumber).filter(Boolean) as string[])
  ).sort((a, b) => {
    const numA = Number(a)
    const numB = Number(b)
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB
    return a.localeCompare(b)
  })

  // Reset unit filter if the selected unit is no longer available in the dropdown
  if (unitFilter !== 'all' && !uniqueUnitNumbers.includes(unitFilter)) {
    setUnitFilter('all')
  }

  // Step 3: Unit number filter (applied on top of search-filtered results)
  const filteredTenants = searchFiltered.filter(t => {
    if (unitFilter === 'all') return true
    return t.unitNumber === unitFilter
  })

  const stats = {
    total: activeTenants.length,
    paid: activeTenants.filter(t => getTenantPaymentStatus(t) === 'paid').length,
    partial: activeTenants.filter(t => getTenantPaymentStatus(t) === 'partial').length,
    unpaid: activeTenants.filter(t => getTenantPaymentStatus(t) === 'unpaid').length,
    overdue: activeTenants.filter(t => getTenantPaymentStatus(t) === 'overdue').length,
    expectedRevenue: activeTenants.reduce((s, t) => s + t.rentAmount, 0),
    collectedRevenue: activeTenants.reduce((s, t) => {
      const paid = (t.payments || []).filter(p => p.month === selectedMonth && p.year === selectedYear).reduce((sum, p) => sum + p.amount, 0)
      const creditApplied = Math.min(t.creditBalance || 0, Math.max(0, t.rentAmount - paid))
      return s + paid + creditApplied
    }, 0),
    adjustmentsTotal: activeTenants.reduce((s, t) => {
      const adj = getTenantAdjustments(t).reduce((sum, a) => sum + a.amount, 0)
      return s + adj
    }, 0),
  }

  const openPayDialog = (tenant: TenantData) => {
    setPayingTenant(tenant)
    const paid = (tenant.payments || []).filter(p => p.month === selectedMonth && p.year === selectedYear).reduce((sum, p) => sum + p.amount, 0)
    const adjustments = getTenantAdjustments(tenant).reduce((sum, a) => sum + a.amount, 0)
    setPayForm({ amount: Math.max(0, tenant.rentAmount - paid - adjustments), method: 'cash', reference: '', notes: '', paymentDate: new Date().toISOString().split('T')[0] })
    setPayAllocationType('CURRENT_RENT')
    setPayDialogOpen(true)
  }

  const openAdjustmentDialog = (tenant: TenantData) => {
    setAdjustmentTenant(tenant)
    setAdjustmentForm({
      amount: 0,
      adjustmentType: 'maintenance_delay',
      reason: '',
      notes: '',
      effectiveMonth: selectedMonth,
      effectiveYear: selectedYear,
      durationMonths: 1,
    })
    setAdjustmentError('')
    setAdjustmentDialogOpen(true)
  }

  const handleCreateAdjustment = async () => {
    if (!adjustmentTenant) return
    setAdjustmentLoading(true)
    setAdjustmentError('')
    try {
      await useDataStore.getState().addAdjustment({
        tenantId: adjustmentTenant.id,
        propertyId: adjustmentTenant.propertyId,
        amount: adjustmentForm.amount,
        adjustmentType: adjustmentForm.adjustmentType,
        reason: adjustmentForm.reason,
        notes: adjustmentForm.notes || null,
        effectiveMonth: adjustmentForm.effectiveMonth,
        effectiveYear: adjustmentForm.effectiveYear,
        durationMonths: adjustmentForm.durationMonths,
        status: 'approved',
        createdBy: authUser?.id || '',
      })
      setAdjustmentDialogOpen(false)
      fetchData()
    } catch (error: any) {
      setAdjustmentError(error?.message || 'Failed to create adjustment')
    } finally {
      setAdjustmentLoading(false)
    }
  }

  const openEditAdjustmentDialog = (adjustment: RentAdjustmentData) => {
    setEditAdjustmentTarget(adjustment)
    setEditAdjustmentForm({
      amount: adjustment.amount,
      adjustmentType: adjustment.adjustmentType,
      reason: adjustment.reason,
      notes: adjustment.notes || '',
      effectiveMonth: adjustment.effectiveMonth,
      effectiveYear: adjustment.effectiveYear,
      durationMonths: adjustment.durationMonths,
    })
    setAdjustmentError('')
    setEditAdjustmentDialogOpen(true)
  }

  const handleEditAdjustment = async () => {
    if (!editAdjustmentTarget) return
    setAdjustmentLoading(true)
    setAdjustmentError('')
    try {
      await useDataStore.getState().updateAdjustment(editAdjustmentTarget.id, {
        amount: editAdjustmentForm.amount,
        adjustmentType: editAdjustmentForm.adjustmentType,
        reason: editAdjustmentForm.reason,
        notes: editAdjustmentForm.notes || null,
        effectiveMonth: editAdjustmentForm.effectiveMonth,
        effectiveYear: editAdjustmentForm.effectiveYear,
        durationMonths: editAdjustmentForm.durationMonths,
      })
      setEditAdjustmentDialogOpen(false)
      setEditAdjustmentTarget(null)
      fetchData()
    } catch (error: any) {
      setAdjustmentError(error?.message || 'Failed to update adjustment')
    } finally {
      setAdjustmentLoading(false)
    }
  }

  const handleCancelAdjustment = async () => {
    if (!cancelAdjustmentTarget) return
    setAdjustmentLoading(true)
    setAdjustmentError('')
    try {
      await useDataStore.getState().cancelAdjustment(cancelAdjustmentTarget.id, cancelAdjustmentReason || undefined)
      setCancelAdjustmentDialogOpen(false)
      setCancelAdjustmentTarget(null)
      setCancelAdjustmentReason('')
      fetchData()
    } catch (error: any) {
      setAdjustmentError(error?.message || 'Failed to cancel adjustment')
    } finally {
      setAdjustmentLoading(false)
    }
  }

  const openEditPaymentDialog = (payment: PaymentData) => {
    setSelectedPayment(payment)
    const paymentDate = payment.date ? new Date(payment.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
    setEditForm({
      amount: payment.amount,
      date: paymentDate,
      method: payment.method || 'cash',
      reference: payment.reference || '',
      notes: payment.notes || '',
      isLate: payment.isLate,
    })
    setPaymentError('')
    setEditPaymentDialog(true)
  }

  const openDeletePaymentDialog = (payment: PaymentData) => {
    setSelectedPayment(payment)
    setDeleteReason('')
    setPaymentError('')
    setDeletePaymentDialog(true)
  }

  const handleEditPayment = async () => {
    if (!selectedPayment) return
    setPaymentActionLoading(true)
    setPaymentError('')
    try {
      const paymentDateObj = new Date(editForm.date)
      const isLate = editForm.isLate || paymentDateObj.getDate() > 5
      const daysLate = isLate ? Math.max(0, paymentDateObj.getDate() - 5) : 0

      await useDataStore.getState().updatePayment(selectedPayment.id, {
        amount: editForm.amount,
        date: paymentDateObj.toISOString(),
        method: editForm.method,
        reference: editForm.reference || null,
        notes: editForm.notes || null,
        isLate,
        daysLate,
      })
      setEditPaymentDialog(false)
      setSelectedPayment(null)
      fetchData()
    } catch (error: any) {
      setPaymentError(error?.message || 'Failed to update payment')
    } finally {
      setPaymentActionLoading(false)
    }
  }

  const handleDeletePayment = async () => {
    if (!selectedPayment) return
    setPaymentActionLoading(true)
    setPaymentError('')
    try {
      await useDataStore.getState().deletePayment(selectedPayment.id, deleteReason || undefined)
      setDeletePaymentDialog(false)
      setSelectedPayment(null)
      setDeleteReason('')
      fetchData()
    } catch (error: any) {
      setPaymentError(error?.message || 'Failed to delete payment')
    } finally {
      setPaymentActionLoading(false)
    }
  }

  const [payLoading, setPayLoading] = useState(false)

  const handlePay = async () => {
    if (!payingTenant || payLoading) return
    setPayLoading(true)
    const paymentDateObj = new Date(payForm.paymentDate)
    const isLate = paymentDateObj.getDate() > 5
    const daysLate = isLate ? paymentDateObj.getDate() - 5 : 0

    try {
      await useDataStore.getState().addPayment({
        tenantId: payingTenant.id,
        amount: payForm.amount,
        date: paymentDateObj.toISOString(),
        month: selectedMonth,
        year: selectedYear,
        method: payForm.method,
        reference: payForm.reference || null,
        receiptNumber: null,
        notes: payForm.notes || null,
        isLate,
        daysLate,
        allocationType: payAllocationType,
      })
      setPayDialogOpen(false)
      fetchData()
    } catch (error) {
      console.error('Failed to record payment:', error)
      alert('Failed to record payment. Please try again.')
    } finally {
      setPayLoading(false)
    }
  }

  const prevMonth = () => {
    if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(y => y - 1) }
    else setSelectedMonth(m => m - 1)
  }

  const nextMonth = () => {
    const now = new Date()
    if (selectedMonth >= now.getMonth() + 1 && selectedYear >= now.getFullYear()) return
    if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(y => y + 1) }
    else setSelectedMonth(m => m + 1)
  }

  // WhatsApp language selection
  const openWhatsAppLangDialog = (tenant: TenantData) => {
    setWhatsappTargetTenant(tenant)
    setWhatsappRemindAll(false)
    setWhatsappLangDialogOpen(true)
  }

  const openRemindAllDialog = () => {
    setWhatsappTargetTenant(null)
    setWhatsappRemindAll(true)
    setWhatsappLangDialogOpen(true)
  }

  const sendAllRemindersWithLang = (lang: WhatsAppLanguage) => {
    const unpaid = activeTenants.filter(t => {
      const status = getTenantPaymentStatus(t)
      return status === 'overdue' || status === 'unpaid' || status === 'partial'
    })
    for (const tenant of unpaid) {
      const phone = tenant.whatsapp || tenant.phone
      window.open(getWhatsAppLink(phone, getNameByLang(tenant, language), tenant.rentAmount, selectedMonth, selectedYear, lang), '_blank')
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-emerald" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('rentCollection', language)}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-white rounded-lg border px-2 py-1">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={t('searchInvoice', language) || 'Search Invoice #'}
              value={invoiceSearch}
              onChange={e => setInvoiceSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchInvoice()}
              className="border-0 outline-none text-sm w-32 lg:w-48 bg-transparent"
            />
            <Button size="sm" onClick={searchInvoice} disabled={invoiceSearching} className="h-7 px-2 bg-emerald hover:bg-emerald/90 text-white">
              {invoiceSearching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
            </Button>
          </div>
          <Button onClick={openRemindAllDialog} variant="outline" className="border-emerald text-emerald hover:bg-emerald/10">
            <MessageCircle className="w-4 h-4 mr-2" />
            {t('remindAllUnpaid', language)}
          </Button>
        </div>
      </div>

      {/* Month Selector */}
      <div className="flex items-center justify-center gap-4">
        <Button variant="ghost" size="icon" onClick={prevMonth}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="text-center">
          <h2 className="text-xl font-bold">
            {getMonthName(selectedMonth, language)} {selectedYear}
          </h2>
          {canSeeRevenue && (
            <p className="text-sm text-muted-foreground">
              {stats.collectedRevenue.toLocaleString()} / {stats.expectedRevenue.toLocaleString()} AED {t('collected', language)}
            </p>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={nextMonth} disabled={selectedMonth >= new Date().getMonth() + 1 && selectedYear >= new Date().getFullYear()}>
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="card-hover">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">{t('activeTenants', language)}</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="card-hover border-l-4 border-l-emerald">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">{t('paid', language)}</p>
            <p className="text-2xl font-bold text-emerald">{stats.paid}</p>
          </CardContent>
        </Card>
        <Card className="card-hover border-l-4 border-l-amber-500">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">{t('partial', language)}</p>
            <p className="text-2xl font-bold text-amber-600">{stats.partial}</p>
          </CardContent>
        </Card>
        <Card className="card-hover border-l-4 border-l-orange-500">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">{t('unpaid', language)}</p>
            <p className="text-2xl font-bold text-orange-600">{stats.unpaid}</p>
          </CardContent>
        </Card>
        <Card className="card-hover border-l-4 border-l-red-500">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">{t('overdue', language)}</p>
            <p className="text-2xl font-bold text-red-600 overdue-pulse">{stats.overdue}</p>
          </CardContent>
        </Card>
      </div>

      {/* Collection progress */}
      {canSeeRevenue && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{t('collectionProgress', language)}</span>
              <span className="text-sm font-bold text-emerald">
                {stats.expectedRevenue > 0 ? Math.round((stats.collectedRevenue / stats.expectedRevenue) * 100) : 0}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-emerald h-3 rounded-full transition-all"
                style={{ width: `${stats.expectedRevenue > 0 ? (stats.collectedRevenue / stats.expectedRevenue) * 100 : 0}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter & Search */}
      <div className="flex gap-2 flex-wrap items-center">
        {(['all', 'paid', 'partial', 'unpaid', 'overdue'] as const).map(f => (
          <Button
            key={f}
            variant={filter === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f)}
            className={filter === f ? 'bg-emerald hover:bg-emerald/90 text-white' : ''}
          >
            {f === 'all' && t('all', language)}
            {f === 'paid' && t('paid', language)}
            {f === 'partial' && t('partiallyPaid', language)}
            {f === 'unpaid' && t('unpaid', language)}
            {f === 'overdue' && t('overdue', language)}
          </Button>
        ))}
        <Select value={unitFilter} onValueChange={v => setUnitFilter(v)}>
          <SelectTrigger className="w-[140px] h-9 text-sm">
            <SelectValue placeholder={t('allUnits', language) || 'All Units'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allUnits', language) || 'All Units'}</SelectItem>
            {uniqueUnitNumbers.map(unit => (
              <SelectItem key={unit} value={unit}>{unit}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 bg-white rounded-lg border px-2 py-1 ml-auto">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('searchTenant', language) || 'Search Tenant / Property'}
            value={tenantSearch}
            onChange={e => setTenantSearch(e.target.value)}
            className="border-0 outline-none text-sm w-36 lg:w-52 bg-transparent"
          />
          {tenantSearch && (
            <button onClick={() => setTenantSearch('')} className="text-gray-400 hover:text-gray-600">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Tenant Payment Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
        {filteredTenants.map(tenant => {
          const status = getTenantPaymentStatus(tenant)
          const paid = (tenant.payments || []).filter(p => p.month === selectedMonth && p.year === selectedYear).reduce((sum, p) => sum + p.amount, 0)
          const tenantAdjustments = getTenantAdjustments(tenant)
          const totalAdjustments = tenantAdjustments.reduce((sum, a) => sum + a.amount, 0)
          // Calculate true remaining balance including opening balance and credit balance
          const openingBalance = Number(tenant.openingBalance) || 0
          const creditBalance = Number(tenant.creditBalance) || 0
          const currentCharges = tenant.rentAmount + totalAdjustments
          const totalDue = openingBalance + currentCharges - creditBalance
          const remaining = totalDue - paid
          const tenantPayments = (tenant.payments || []).filter(p => p.month === selectedMonth && p.year === selectedYear)
          const isExpanded = expandedTenant === tenant.id

          return (
            <Card key={tenant.id} className={cn2('card-hover', (status === 'overdue' || status === 'unpaid') && 'ring-1 ring-red-300')}>
              <CardContent className="p-4">
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm truncate">
                        {getNameByLang(tenant, language)}
                      </h3>
                      <p className="text-xs text-muted-foreground truncate">
                        {tenant.property ? getNameByLang(tenant.property, language) : ''} - {tenant.unitNumber || '—'}
                      </p>
                    </div>
                    <Badge className={cn2('text-xs shrink-0', getPaymentStatusColor(status))}>
                      {status === 'paid' && t('paid', language)}
                      {status === 'partial' && t('partial', language)}
                      {status === 'overdue' && t('overdue', language)}
                      {status === 'unpaid' && t('unpaid', language)}
                      {status === 'due-soon' && t('dueSoon', language)}
                    </Badge>
                  </div>
                  {/* Secondary badges row */}
                  {(tenant.legalCase || tenant.status === 'notice' || (tenant.openingBalance || 0) > 0) && (
                    <div className="flex flex-wrap gap-1.5">
                      {tenant.legalCase && (
                        <Badge className="text-[10px] bg-red-100 text-red-700 border border-red-200 hover:bg-red-100 px-1.5 py-0 shrink-0">
                          <AlertTriangle className="w-3 h-3 mr-0.5" />
                          LEGAL
                        </Badge>
                      )}
                      {tenant.status === 'notice' && (
                        <Badge className="text-[10px] bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-100 px-1.5 py-0 shrink-0">
                          {t('noticePeriod', language)}
                        </Badge>
                      )}
                      {(tenant.openingBalance || 0) > 0 && (
                        <Badge className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-100 px-1.5 py-0 shrink-0">
                          {t('outstanding', language)}: {formatAED(tenant.openingBalance)}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>

                {canSeeRevenue && (
                  <div className="flex items-center justify-between mt-3">
                    <div>
                      <p className="text-xs text-muted-foreground">{t('currentCharges', language)}</p>
                      <p className="font-bold text-sm">{formatAED(currentCharges)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{t('remainingBalance', language)}</p>
                      <p className={cn2('font-bold text-sm', remaining > 0 ? 'text-red-600' : remaining === 0 ? 'text-emerald-600' : 'text-blue-600')}>
                        {formatAED(Math.max(0, remaining))}
                      </p>
                    </div>
                  </div>
                )}

                {/* Financial breakdown */}
                {canSeeRevenue && (openingBalance > 0 || creditBalance > 0 || paid > 0 || totalAdjustments > 0) && (
                  <div className="mt-2 bg-muted/30 rounded-lg p-2 text-xs space-y-1">
                    {openingBalance > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('openingBalance', language)}</span>
                        <span className="font-medium text-amber-700">+{formatAED(openingBalance)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('currentCharges', language)}</span>
                      <span className="font-medium">+{formatAED(currentCharges)}</span>
                    </div>
                    {totalAdjustments > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('approvedAdjustments', language)}</span>
                        <span className="font-medium text-amber-600">-{formatAED(totalAdjustments)}</span>
                      </div>
                    )}
                    {creditBalance > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('creditBalance', language)}</span>
                        <span className="font-medium text-blue-600">-{formatAED(creditBalance)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-1">
                      <span className="text-muted-foreground font-medium">{t('totalDue', language)}</span>
                      <span className="font-semibold">{formatAED(Math.max(0, totalDue))}</span>
                    </div>
                    {paid > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('paymentsReceived', language)}</span>
                        <span className="font-medium text-emerald-600">-{formatAED(paid)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-1">
                      <span className="text-muted-foreground font-medium">{t('remainingBalance', language)}</span>
                      <span className={cn2('font-bold', remaining <= 0 ? 'text-emerald-600' : 'text-red-600')}>{formatAED(Math.max(0, remaining))}</span>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 mt-3">
                  {status !== 'paid' && (
                    <Button
                      size="sm"
                      onClick={() => openPayDialog(tenant)}
                      className="flex-1 bg-emerald hover:bg-emerald/90 text-white h-8 text-xs"
                    >
                      <Check className="w-3 h-3 mr-1" />
                      {t('markPaid', language)}
                    </Button>
                  )}
                  {canSeeRevenue && (
                    <button
                      onClick={() => openAdjustmentDialog(tenant)}
                      className="flex items-center justify-center gap-1 px-3 py-1 rounded-md text-xs border border-amber-300 text-amber-700 hover:bg-amber-50"
                      title={t('createAdjustment', language)}
                    >
                      <MinusCircle className="w-3 h-3" />
                    </button>
                  )}
                  {status !== 'paid' && (
                    <button
                      onClick={() => openWhatsAppLangDialog(tenant)}
                      className="flex items-center justify-center gap-1 px-3 py-1 rounded-md text-xs border border-green-300 text-green-700 hover:bg-green-50"
                      title={t('sendWhatsAppReminder', language)}
                    >
                      <MessageCircle className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={() => { setBillTenant(tenant); setBillDialogOpen(true) }}
                    className="flex items-center justify-center gap-1 px-3 py-1 rounded-md text-xs border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    title={t('viewBill', language)}
                  >
                    <FileText className="w-3 h-3" />
                  </button>
                </div>

                {/* Payment History Toggle */}
                {(tenantPayments.length > 0 || tenantAdjustments.length > 0) && (
                  <div className="mt-3 border-t pt-2">
                    <button
                      onClick={() => setExpandedTenant(isExpanded ? null : tenant.id)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
                    >
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {tenantPayments.length + tenantAdjustments.length} {tenantPayments.length + tenantAdjustments.length === 1 ? (language === 'ar' ? 'عنصر' : language === 'bn' ? 'আইটেম' : language === 'ur' ? 'آئٹم' : 'item') : (language === 'ar' ? 'عناصر' : language === 'bn' ? 'আইটেমসমূহ' : language === 'ur' ? 'آئٹمز' : 'items')}
                      {canSeeRevenue && (
                        <span className="ml-auto font-medium text-emerald-600">
                          {formatAED(paid)}
                          {totalAdjustments > 0 && <span className="text-amber-600 ml-1">(-{formatAED(totalAdjustments)})</span>}
                        </span>
                      )}
                    </button>

                    {isExpanded && (
                      <div className="mt-2 space-y-2">
                        {/* Adjustments displayed first with amber styling */}
                        {tenantAdjustments.filter(a => a.status === 'approved').map(adjustment => (
                          <div key={adjustment.id} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {canSeeRevenue && <span className="font-semibold text-amber-700">-{formatAED(adjustment.amount)}</span>}
                                <Badge variant="outline" className="text-[10px] px-1 py-0 border-amber-300 text-amber-700">
                                  {t(adjustment.adjustmentType as any, language) || adjustment.adjustmentType}
                                </Badge>
                              </div>
                              <p className="text-amber-600 mt-0.5 truncate text-[11px]">{adjustment.reason}</p>
                              {adjustment.durationMonths > 1 && (
                                <p className="text-amber-500 mt-0.5 text-[10px]">
                                  {getMonthName(adjustment.effectiveMonth, language)} {adjustment.effectiveYear} — {adjustment.durationMonths} {t('months', language)}
                                </p>
                              )}
                            </div>
                            {canSeeRevenue && (
                              <div className="flex items-center gap-1 ml-2">
                                <button
                                  onClick={(e) => { e.stopPropagation(); openEditAdjustmentDialog(adjustment) }}
                                  className="p-1 hover:bg-white rounded transition-colors"
                                  title={t('editAdjustment', language)}
                                >
                                  <Pencil className="w-3 h-3 text-blue-600" />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setCancelAdjustmentTarget(adjustment); setCancelAdjustmentReason(''); setCancelAdjustmentDialogOpen(true) }}
                                  className="p-1 hover:bg-white rounded transition-colors"
                                  title={t('cancelAdjustment', language)}
                                >
                                  <X className="w-3 h-3 text-red-500" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                        {tenantPayments.map(payment => (
                          <div key={payment.id} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2 text-xs">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {canSeeRevenue && <span className="font-semibold">{formatAED(payment.amount)}</span>}
                                <span className="text-muted-foreground">
                                  {payment.date ? new Date(payment.date).toLocaleDateString(language === 'ar' ? 'ar-AE' : 'en-AE', { day: 'numeric', month: 'short' }) : ''}
                                </span>
                                {payment.method && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                                    {payment.method}
                                  </Badge>
                                )}
                                {payment.isLate && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0 border-red-300 text-red-600">
                                    {language === 'ar' ? 'متأخر' : language === 'bn' ? 'বিলম্বিত' : language === 'ur' ? 'دیر' : 'Late'}
                                  </Badge>
                                )}
                                {payment.allocationType && payment.allocationType !== 'CURRENT_RENT' && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0 border-blue-300 text-blue-600">
                                    {payment.allocationType === 'HISTORICAL_DEBT' && t('historicalDebt', language)}
                                    {payment.allocationType === 'ADVANCE_PAYMENT' && t('advancePayment', language)}
                                  </Badge>
                                )}
                              </div>
                              {payment.reference && (
                                <p className="text-muted-foreground mt-0.5 truncate">
                                  Ref: {payment.reference}
                                </p>
                              )}
                            </div>
                            {canSeeRevenue && (
                              <div className="flex items-center gap-1 shrink-0 ml-2">
                                <button
                                  onClick={(e) => { e.stopPropagation(); openEditPaymentDialog(payment) }}
                                  className="p-1 hover:bg-white rounded transition-colors"
                                  title={language === 'ar' ? 'تعديل الدفعة' : language === 'bn' ? 'পেমেন্ট সম্পাদনা' : language === 'ur' ? 'ادائیگی میں ترمیم' : 'Edit payment'}
                                >
                                  <Pencil className="w-3 h-3 text-blue-600" />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); openDeletePaymentDialog(payment) }}
                                  className="p-1 hover:bg-white rounded transition-colors"
                                  title={language === 'ar' ? 'حذف الدفعة' : language === 'bn' ? 'পেমেন্ট মুছুন' : language === 'ur' ? 'ادائیگی حذف کریں' : 'Delete payment'}
                                >
                                  <Trash2 className="w-3 h-3 text-red-600" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {filteredTenants.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          {t('noTenantsMatchFilter', language)}
        </div>
      )}

      {/* Pay Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('recordPayment', language)} - {payingTenant && getNameByLang(payingTenant, language)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('amount', language)}</Label>
              <Input type="number" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: Number(e.target.value) })} />
            </div>
            <div>
              <Label>{t('paymentDate', language)}</Label>
              <Input type="date" value={payForm.paymentDate} onChange={e => setPayForm({ ...payForm, paymentDate: e.target.value })} />
            </div>
            <div>
              <Label>{t('paymentMethod', language)}</Label>
              <Select value={payForm.method} onValueChange={v => setPayForm({ ...payForm, method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t('cash', language)}</SelectItem>
                  <SelectItem value="transfer">{t('bankTransfer', language)}</SelectItem>
                  <SelectItem value="cheque">{t('cheque', language)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('allocationType', language)}</Label>
              <Select value={payAllocationType} onValueChange={setPayAllocationType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CURRENT_RENT">{t('currentRent', language)}</SelectItem>
                  <SelectItem value="HISTORICAL_DEBT">{t('historicalDebt', language)}</SelectItem>
                  <SelectItem value="ADVANCE_PAYMENT">{t('advancePayment', language)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('reference', language)}</Label>
              <Input value={payForm.reference} onChange={e => setPayForm({ ...payForm, reference: e.target.value })} />
            </div>
            <div>
              <Label>{t('notes', language)}</Label>
              <Input value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>{t('cancel', language)}</Button>
            <Button onClick={handlePay} className="bg-emerald hover:bg-emerald/90 text-white" disabled={payForm.amount <= 0 || payLoading}>
              {payLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              {payLoading ? t('processingPayment', language) : t('confirmPayment', language)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bill Invoice Dialog */}
      <Dialog open={billDialogOpen} onOpenChange={setBillDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('viewBill', language)}</DialogTitle>
          </DialogHeader>
          {billTenant && (
            <BillInvoice
              tenant={billTenant}
              property={billTenant.property || undefined}
              month={selectedMonth}
              year={selectedYear}
              paymentStatus={getTenantPaymentStatus(billTenant)}
              paidAmount={(billTenant.payments || []).filter(p => p.month === selectedMonth && p.year === selectedYear).reduce((sum, p) => sum + p.amount, 0)}
              language={language}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* WhatsApp Language Selection Dialog */}
      <Dialog open={whatsappLangDialogOpen} onOpenChange={setWhatsappLangDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-600" />
              {t('selectReminderLanguage', language)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">{t('reminderLanguageDesc', language)}</p>
            <div className="space-y-2">
              <Button
                className="w-full justify-start bg-green-600 hover:bg-green-700 text-white"
                onClick={() => {
                  if (whatsappRemindAll) {
                    sendAllRemindersWithLang('ar')
                  } else if (whatsappTargetTenant) {
                    window.open(getWhatsAppLink(whatsappTargetTenant.whatsapp || whatsappTargetTenant.phone, getNameByLang(whatsappTargetTenant, language), whatsappTargetTenant.rentAmount, selectedMonth, selectedYear, 'ar'), '_blank')
                  }
                  setWhatsappLangDialogOpen(false)
                }}
              >
                {t('sendArabic', language)}
              </Button>
              <Button
                className="w-full justify-start bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => {
                  if (whatsappRemindAll) {
                    sendAllRemindersWithLang('en')
                  } else if (whatsappTargetTenant) {
                    window.open(getWhatsAppLink(whatsappTargetTenant.whatsapp || whatsappTargetTenant.phone, getNameByLang(whatsappTargetTenant, language), whatsappTargetTenant.rentAmount, selectedMonth, selectedYear, 'en'), '_blank')
                  }
                  setWhatsappLangDialogOpen(false)
                }}
              >
                {t('sendEnglish', language)}
              </Button>
              <Button
                className="w-full justify-start bg-teal-600 hover:bg-teal-700 text-white"
                onClick={() => {
                  if (whatsappRemindAll) {
                    sendAllRemindersWithLang('ur')
                  } else if (whatsappTargetTenant) {
                    window.open(getWhatsAppLink(whatsappTargetTenant.whatsapp || whatsappTargetTenant.phone, getNameByLang(whatsappTargetTenant, language), whatsappTargetTenant.rentAmount, selectedMonth, selectedYear, 'ur'), '_blank')
                  }
                  setWhatsappLangDialogOpen(false)
                }}
              >
                {t('sendUrdu', language)}
              </Button>
              <Button
                className="w-full justify-start bg-orange-500 hover:bg-orange-600 text-white"
                onClick={() => {
                  if (whatsappRemindAll) {
                    sendAllRemindersWithLang('hi')
                  } else if (whatsappTargetTenant) {
                    window.open(getWhatsAppLink(whatsappTargetTenant.whatsapp || whatsappTargetTenant.phone, getNameByLang(whatsappTargetTenant, language), whatsappTargetTenant.rentAmount, selectedMonth, selectedYear, 'hi'), '_blank')
                  }
                  setWhatsappLangDialogOpen(false)
                }}
              >
                {t('sendHindi', language)}
              </Button>
              <Button
                className="w-full justify-start bg-purple-600 hover:bg-purple-700 text-white"
                onClick={() => {
                  if (whatsappRemindAll) {
                    sendAllRemindersWithLang('bn')
                  } else if (whatsappTargetTenant) {
                    window.open(getWhatsAppLink(whatsappTargetTenant.whatsapp || whatsappTargetTenant.phone, getNameByLang(whatsappTargetTenant, language), whatsappTargetTenant.rentAmount, selectedMonth, selectedYear, 'bn'), '_blank')
                  }
                  setWhatsappLangDialogOpen(false)
                }}
              >
                {t('sendBengali', language)}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Invoice Search Results Dialog */}
      <Dialog open={invoiceSearchOpen} onOpenChange={setInvoiceSearchOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="w-5 h-5 text-emerald-600" />
              {t('searchInvoice', language) || 'Invoice Search'} — {invoiceSearch}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {invoiceSearchResults && invoiceSearchResults.length === 0 && (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <Search className="w-6 h-6 text-gray-400" />
                </div>
                <p className="text-muted-foreground font-medium">
                  {t('noInvoiceFound', language) || `No invoice found for "${invoiceSearch}"`}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('tryDifferentSearch', language) || 'Try searching with a different invoice number (e.g. INV-202606-101)'}
                </p>
              </div>
            )}
            {invoiceSearchResults && invoiceSearchResults.map((result: any, idx: number) => (
              <div key={idx} className="border rounded-lg p-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant={result.type === 'tenant_invoice' ? 'default' : 'secondary'} className={result.type === 'tenant_invoice' ? 'bg-emerald text-white' : ''}>
                        {result.type === 'tenant_invoice' ? t('invoice', language) || 'Invoice' : t('expenses', language) || 'Expense'}
                      </Badge>
                      <span className="font-mono font-bold text-sm">{result.invoiceNumber}</span>
                    </div>
                    <p className="text-sm text-gray-700 mt-1">{result.description}</p>
                  </div>
                  <div className="text-right">
                    {canSeeRevenue && <p className="font-bold text-sm">{formatAED(result.amount)}</p>}
                    <Badge className={cn2('text-xs', getPaymentStatusColor(result.paymentStatus))}>
                      {result.paymentStatus === 'paid' && (t('paid', language) || 'Paid')}
                      {result.paymentStatus === 'partial' && (t('partial', language) || 'Partial')}
                      {result.paymentStatus === 'overdue' && (t('overdue', language) || 'Overdue')}
                      {result.paymentStatus === 'unpaid' && (t('unpaid', language) || 'Unpaid')}
                      {result.paymentStatus === 'due-soon' && (t('dueSoon', language) || 'Due Soon')}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {result.tenantName && <span>{result.tenantName}</span>}
                  {result.propertyName && <span>{result.propertyName}</span>}
                  {result.unitNumber && <span>{t('unitNumber', language)}: {result.unitNumber}</span>}
                  {result.vendor && <span>{t('vendor', language)}: {result.vendor}</span>}
                  {result.building && <span>{result.building}</span>}
                </div>
                {result.paidAmount !== undefined && canSeeRevenue && (
                  <div className="flex gap-4 mt-2 text-xs">
                    <span className="text-emerald-600">{t('paid', language)}: {formatAED(result.paidAmount)}</span>
                    {result.remaining > 0 && <span className="text-red-600">{t('remaining', language)}: {formatAED(result.remaining)}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Payment Dialog */}
      <Dialog open={editPaymentDialog} onOpenChange={setEditPaymentDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-blue-600" />
              {language === 'ar' ? 'تعديل الدفعة' : language === 'bn' ? 'পেমেন্ট সম্পাদনা' : language === 'ur' ? 'ادائیگی میں ترمیم' : 'Edit Payment'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>{t('amount', language)}</Label>
              <Input type="number" value={editForm.amount} onChange={e => setEditForm({ ...editForm, amount: Number(e.target.value) })} />
            </div>
            <div>
              <Label>{t('paymentDate', language)}</Label>
              <Input type="date" value={editForm.date} onChange={e => setEditForm({ ...editForm, date: e.target.value })} />
            </div>
            <div>
              <Label>{t('paymentMethod', language)}</Label>
              <Select value={editForm.method} onValueChange={v => setEditForm({ ...editForm, method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t('cash', language)}</SelectItem>
                  <SelectItem value="transfer">{t('bankTransfer', language)}</SelectItem>
                  <SelectItem value="cheque">{t('cheque', language)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('reference', language)}</Label>
              <Input value={editForm.reference} onChange={e => setEditForm({ ...editForm, reference: e.target.value })} />
            </div>
            <div>
              <Label>{t('notes', language)}</Label>
              <Input value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} />
            </div>
            {selectedPayment?.allocationType && (
              <div className="flex items-center gap-2">
                <Label>{t('allocationType', language)}</Label>
                <Badge variant="outline" className="text-xs px-2 py-0.5 border-emerald-300 text-emerald-700">
                  {selectedPayment.allocationType === 'CURRENT_RENT' && t('currentRent', language)}
                  {selectedPayment.allocationType === 'HISTORICAL_DEBT' && t('historicalDebt', language)}
                  {selectedPayment.allocationType === 'ADVANCE_PAYMENT' && t('advancePayment', language)}
                </Badge>
              </div>
            )}
          </div>
          {paymentError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{paymentError}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditPaymentDialog(false); setPaymentError('') }}>{t('cancel', language)}</Button>
            <Button onClick={handleEditPayment} disabled={editForm.amount <= 0 || paymentActionLoading} className="bg-blue-600 hover:bg-blue-700 text-white">
              {paymentActionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Pencil className="w-4 h-4 mr-2" />}
              {t('save', language)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Payment Dialog */}
      <Dialog open={deletePaymentDialog} onOpenChange={setDeletePaymentDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              {language === 'ar' ? 'حذف الدفعة' : language === 'bn' ? 'পেমেন্ট মুছুন' : language === 'ur' ? 'ادائیگی حذف کریں' : 'Delete Payment'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-red-800 font-medium">
                    {language === 'ar' ? 'هل أنت متأكد من حذف هذه الدفعة؟' : language === 'bn' ? 'আপনি কি এই পেমেন্টটি মুছে ফেলতে চান?' : language === 'ur' ? 'کیا آپ یہ ادائیگی حذف کرنا چاہتے ہیں؟' : 'Are you sure you want to delete this payment?'}
                  </p>
                  {selectedPayment && canSeeRevenue && (
                    <p className="text-sm text-red-600 mt-1">
                      {formatAED(selectedPayment.amount)} — {selectedPayment.date ? new Date(selectedPayment.date).toLocaleDateString() : ''}
                    </p>
                  )}
                  <p className="text-xs text-red-500 mt-1">
                    {language === 'ar' ? 'سيتم تحديث حالة الدفع والإيرادات تلقائياً' : language === 'bn' ? 'পেমেন্ট স্ট্যাটাস এবং রেভিনিউ স্বয়ংক্রিয়ভাবে আপডেট হবে' : language === 'ur' ? 'ادائیگی کی حیثیت اور آمدنی خودکار طور پر اپ ڈیٹ ہوگی' : 'Payment status and revenue will be automatically recalculated.'}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <Label>
                {language === 'ar' ? 'سبب الحذف (اختياري)' : language === 'bn' ? 'মুছে ফেলার কারণ (ঐচ্ছিক)' : language === 'ur' ? 'حذف کرنے کی وجہ (اختیاری)' : 'Reason for deletion (optional)'}
              </Label>
              <Input
                value={deleteReason}
                onChange={e => setDeleteReason(e.target.value)}
                placeholder={language === 'ar' ? 'أدخل سبب الحذف...' : language === 'bn' ? 'মুছে ফেলার কারণ লিখুন...' : language === 'ur' ? 'حذف کرنے کی وجہ درج کریں...' : 'Enter reason for deletion...'}
                className="mt-1"
              />
            </div>
          </div>
          {paymentError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{paymentError}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeletePaymentDialog(false); setPaymentError('') }}>{t('cancel', language)}</Button>
            <Button onClick={handleDeletePayment} disabled={paymentActionLoading} variant="destructive">
              {paymentActionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              {language === 'ar' ? 'حذف الدفعة' : language === 'bn' ? 'পেমেন্ট মুছুন' : language === 'ur' ? 'ادائیگی حذف کریں' : 'Delete Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Adjustment Dialog */}
      <Dialog open={adjustmentDialogOpen} onOpenChange={setAdjustmentDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MinusCircle className="w-5 h-5 text-amber-600" />
              {t('createAdjustment', language)} - {adjustmentTenant && getNameByLang(adjustmentTenant, language)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>{t('adjustmentAmount', language)}</Label>
              <Input type="number" value={adjustmentForm.amount} onChange={e => setAdjustmentForm({ ...adjustmentForm, amount: Number(e.target.value) })} />
            </div>
            <div>
              <Label>{t('adjustmentType', language)}</Label>
              <Select value={adjustmentForm.adjustmentType} onValueChange={v => setAdjustmentForm({ ...adjustmentForm, adjustmentType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="maintenance_delay">{t('maintenance_delay', language)}</SelectItem>
                  <SelectItem value="flood_damage">{t('flood_damage', language)}</SelectItem>
                  <SelectItem value="utility_failure">{t('utility_failure', language)}</SelectItem>
                  <SelectItem value="goodwill">{t('goodwill', language)}</SelectItem>
                  <SelectItem value="contract_amendment">{t('contract_amendment', language)}</SelectItem>
                  <SelectItem value="owner_discount">{t('owner_discount', language)}</SelectItem>
                  <SelectItem value="other">{t('other', language)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('adjustmentReason', language)}</Label>
              <Input value={adjustmentForm.reason} onChange={e => setAdjustmentForm({ ...adjustmentForm, reason: e.target.value })} placeholder={language === 'ar' ? 'أدخل السبب...' : language === 'bn' ? 'কারণ লিখুন...' : language === 'ur' ? 'وجہ درج کریں...' : 'Enter reason...'} />
            </div>
            <div>
              <Label>{t('notes', language)}</Label>
              <Input value={adjustmentForm.notes} onChange={e => setAdjustmentForm({ ...adjustmentForm, notes: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('effectiveMonth', language)}</Label>
                <Select value={String(adjustmentForm.effectiveMonth)} onValueChange={v => setAdjustmentForm({ ...adjustmentForm, effectiveMonth: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <SelectItem key={m} value={String(m)}>{getMonthName(m, language)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('effectiveYear', language)}</Label>
                <Select value={String(adjustmentForm.effectiveYear)} onValueChange={v => setAdjustmentForm({ ...adjustmentForm, effectiveYear: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2024">2024</SelectItem>
                    <SelectItem value="2025">2025</SelectItem>
                    <SelectItem value="2026">2026</SelectItem>
                    <SelectItem value="2027">2027</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>{t('durationMonths', language)}</Label>
              <Input type="number" min={1} max={12} value={adjustmentForm.durationMonths} onChange={e => setAdjustmentForm({ ...adjustmentForm, durationMonths: Number(e.target.value) || 1 })} />
            </div>
          </div>
          {adjustmentError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{adjustmentError}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustmentDialogOpen(false)}>{t('cancel', language)}</Button>
            <Button onClick={handleCreateAdjustment} disabled={adjustmentForm.amount <= 0 || !adjustmentForm.reason || adjustmentLoading} className="bg-amber-600 hover:bg-amber-700 text-white">
              {adjustmentLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MinusCircle className="w-4 h-4 mr-2" />}
              {t('createAdjustment', language)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Adjustment Dialog */}
      <Dialog open={cancelAdjustmentDialogOpen} onOpenChange={setCancelAdjustmentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <MinusCircle className="w-5 h-5" />
              {t('cancelAdjustment', language)}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-amber-800 font-medium">
                    {language === 'ar' ? 'هل أنت متأكد من إلغاء هذا التعديل؟' : language === 'bn' ? 'আপনি কি এই সমন্বয়টি বাতিল করতে চান?' : language === 'ur' ? 'کیا آپ یہ ایڈجسٹمنٹ منسوخ کرنا چاہتے ہیں؟' : 'Are you sure you want to cancel this adjustment?'}
                  </p>
                  {cancelAdjustmentTarget && canSeeRevenue && (
                    <p className="text-sm text-amber-600 mt-1">
                      {formatAED(cancelAdjustmentTarget.amount)} — {t(cancelAdjustmentTarget.adjustmentType as any, language) || cancelAdjustmentTarget.adjustmentType}
                    </p>
                  )}
                  <p className="text-xs text-amber-500 mt-1">
                    {language === 'ar' ? 'سيتم تحديث حالة الدفع تلقائياً' : language === 'bn' ? 'পেমেন্ট স্ট্যাটাস স্বয়ংক্রিয়ভাবে আপডেট হবে' : language === 'ur' ? 'ادائیگی کی حیثیت خودکار طور پر اپ ڈیٹ ہوگی' : 'Payment status will be automatically recalculated.'}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <Label>{t('cancellationReason', language)}</Label>
              <Input
                value={cancelAdjustmentReason}
                onChange={e => setCancelAdjustmentReason(e.target.value)}
                placeholder={language === 'ar' ? 'أدخل سبب الإلغاء...' : language === 'bn' ? 'বাতিলের কারণ লিখুন...' : language === 'ur' ? 'منسوخ کرنے کی وجہ درج کریں...' : 'Enter cancellation reason...'}
                className="mt-1"
              />
            </div>
          </div>
          {adjustmentError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{adjustmentError}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCancelAdjustmentDialogOpen(false); setAdjustmentError('') }}>{t('cancel', language)}</Button>
            <Button onClick={handleCancelAdjustment} disabled={adjustmentLoading} variant="destructive">
              {adjustmentLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <X className="w-4 h-4 mr-2" />}
              {t('cancelAdjustment', language)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Adjustment Dialog */}
      <Dialog open={editAdjustmentDialogOpen} onOpenChange={setEditAdjustmentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <Pencil className="w-5 h-5" />
              {t('editAdjustment', language)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>{t('adjustmentAmount', language)}</Label>
              <Input type="number" min={1} value={editAdjustmentForm.amount} onChange={e => setEditAdjustmentForm({ ...editAdjustmentForm, amount: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label>{t('adjustmentType', language)}</Label>
              <Select value={editAdjustmentForm.adjustmentType} onValueChange={v => setEditAdjustmentForm({ ...editAdjustmentForm, adjustmentType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="maintenance_delay">{t('maintenance_delay', language)}</SelectItem>
                  <SelectItem value="flood_damage">{t('flood_damage', language)}</SelectItem>
                  <SelectItem value="utility_failure">{t('utility_failure', language)}</SelectItem>
                  <SelectItem value="goodwill">{t('goodwill', language)}</SelectItem>
                  <SelectItem value="contract_amendment">{t('contract_amendment', language)}</SelectItem>
                  <SelectItem value="owner_discount">{t('owner_discount', language)}</SelectItem>
                  <SelectItem value="other">{t('other', language)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('adjustmentReason', language)}</Label>
              <Input value={editAdjustmentForm.reason} onChange={e => setEditAdjustmentForm({ ...editAdjustmentForm, reason: e.target.value })} />
            </div>
            <div>
              <Label>{t('notes', language)}</Label>
              <Input value={editAdjustmentForm.notes} onChange={e => setEditAdjustmentForm({ ...editAdjustmentForm, notes: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('effectiveMonth', language)}</Label>
                <Input type="number" min={1} max={12} value={editAdjustmentForm.effectiveMonth} onChange={e => setEditAdjustmentForm({ ...editAdjustmentForm, effectiveMonth: Number(e.target.value) || 1 })} />
              </div>
              <div>
                <Label>{t('effectiveYear', language)}</Label>
                <Input type="number" min={2020} max={2030} value={editAdjustmentForm.effectiveYear} onChange={e => setEditAdjustmentForm({ ...editAdjustmentForm, effectiveYear: Number(e.target.value) || 2026 })} />
              </div>
            </div>
            <div>
              <Label>{t('durationMonths', language)}</Label>
              <Input type="number" min={1} max={12} value={editAdjustmentForm.durationMonths} onChange={e => setEditAdjustmentForm({ ...editAdjustmentForm, durationMonths: Number(e.target.value) || 1 })} />
            </div>
          </div>
          {adjustmentError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{adjustmentError}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditAdjustmentDialogOpen(false); setAdjustmentError('') }}>{t('cancel', language)}</Button>
            <Button onClick={handleEditAdjustment} disabled={editAdjustmentForm.amount <= 0 || !editAdjustmentForm.reason || adjustmentLoading} className="bg-amber-600 hover:bg-amber-700 text-white">
              {adjustmentLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Pencil className="w-4 h-4 mr-2" />}
              {t('save', language)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
