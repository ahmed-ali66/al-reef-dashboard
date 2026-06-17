'use client'

import { useEffect, useState, useCallback } from 'react'
import type { TenantData, PropertyData, PaymentData, RentAdjustmentData, TenantGroupData } from '@/lib/types'
import { useAppStore, isOwnerOrAdmin } from '@/lib/store'
import { useDataStore } from '@/lib/data-store'
import { formatAED, getPaymentStatusColor, cn2, isFinanciallyActive } from '@/lib/utils'
import { calculateFinancials, calculateEffectivePaymentsReceived } from '@/lib/financial-utils'
import { t, getMonthName, getNameByLang } from '@/lib/i18n'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Building2, ArrowLeft, Search, Banknote, Loader2, X, ChevronDown, ChevronUp, Users, Link2, Pencil, Trash2 } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default function PropertyCollection() {
  const { language, authUser, selectedPropertyId, setCurrentPage, setSelectedPropertyId } = useAppStore()
  const [tenants, setTenants] = useState<TenantData[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [filter, setFilter] = useState<'all' | 'paid' | 'partial' | 'unpaid' | 'overdue' | 'adjustments'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Payment dialog state
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payingTenant, setPayingTenant] = useState<TenantData | null>(null)
  const [payForm, setPayForm] = useState({ amount: 0, method: 'cash', reference: '', notes: '', paymentDate: new Date().toISOString().split('T')[0] })
  const [payAllocationType, setPayAllocationType] = useState<string>('CURRENT_RENT')
  const [payLoading, setPayLoading] = useState(false)

  // Group payment state
  const [groupPayDialogOpen, setGroupPayDialogOpen] = useState(false)
  const [payingGroup, setPayingGroup] = useState<TenantGroupData | null>(null)
  const [groupPayForm, setGroupPayForm] = useState({ amount: 0, method: 'cash', reference: '', notes: '', paymentDate: new Date().toISOString().split('T')[0] })
  const [groupPayAllocationType, setGroupPayAllocationType] = useState<string>('CURRENT_RENT')
  const [groupPayLoading, setGroupPayLoading] = useState(false)
  const [groupPayError, setGroupPayError] = useState('')
  const [showGroupAllocation, setShowGroupAllocation] = useState(false)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)

  // Expanded tenant payment history
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null)

  // Payment edit/delete state (mirrors rent-collection.tsx)
  const [editPaymentDialog, setEditPaymentDialog] = useState(false)
  const [deletePaymentDialog, setDeletePaymentDialog] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<PaymentData | null>(null)
  const [editForm, setEditForm] = useState({ amount: 0, date: '', method: 'cash', reference: '', notes: '', isLate: false })
  const [deleteReason, setDeleteReason] = useState('')
  const [paymentActionLoading, setPaymentActionLoading] = useState(false)
  const [paymentError, setPaymentError] = useState('')

  const canSeeRevenue = isOwnerOrAdmin(authUser?.role || '')

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

  // Get the selected property
  const property = useDataStore.getState().properties.find(p => p.id === selectedPropertyId)

  // Filter tenants for this property only
  const propertyTenants = tenants.filter(t => t.propertyId === selectedPropertyId)
  const activeTenants = propertyTenants.filter(t => isFinanciallyActive(t.status))

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
    const payments = (tenant.payments || []).filter(p => p.month === selectedMonth && p.year === selectedYear && p.allocationType !== 'HISTORICAL_DEBT')
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
    const tenantAdjustments = getTenantAdjustments(tenant)
    const totalAdjustments = tenantAdjustments.reduce((sum, a) => sum + a.amount, 0)
    const creditApplied = Math.min(tenant.creditBalance || 0, Math.max(0, tenant.rentAmount - totalPaid - totalAdjustments))
    const totalCredits = totalPaid + totalAdjustments + creditApplied
    if (totalCredits >= tenant.rentAmount) return 'paid'
    if (totalCredits > 0) return 'partial'

    const now = new Date()
    const isSelectedCurrentMonth = selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear()
    if (isSelectedCurrentMonth) {
      const dayOfMonth = now.getDate()
      if (dayOfMonth <= 2) return 'due-soon'
      if (dayOfMonth <= 4) return 'unpaid'
      return 'overdue'
    }
    if (selectedYear < now.getFullYear() || (selectedYear === now.getFullYear() && selectedMonth < now.getMonth() + 1)) {
      return 'overdue'
    }
    return 'due-soon'
  }

  // Get financial details for a tenant
  const getTenantFinancials = (tenant: TenantData) => {
    const payments = (tenant.payments || []).filter(p => p.month === selectedMonth && p.year === selectedYear && p.allocationType !== 'HISTORICAL_DEBT')
    const tenantAdjustments = getTenantAdjustments(tenant)
    const totalAdjustments = tenantAdjustments.reduce((sum, a) => sum + a.amount, 0)
    // Use effective payments to avoid double-counting ADVANCE_PAYMENT excess
    // that is already mirrored into tenant.creditBalance when recorded.
    const paymentsReceived = calculateEffectivePaymentsReceived(
      payments,
      tenant.rentAmount,
      Number(tenant.municipalityFee) || 0,
      totalAdjustments,
    )
    return calculateFinancials({
      rentAmount: tenant.rentAmount,
      municipalityFee: tenant.municipalityFee ?? undefined,
      adjustments: totalAdjustments,
      openingBalance: tenant.openingBalance,
      creditBalance: tenant.creditBalance,
      paymentsReceived,
    })
  }

  // Filter pipeline
  const statusFiltered = activeTenants.filter(t => {
    const status = getTenantPaymentStatus(t)
    if (filter === 'all') return true
    if (filter === 'paid') return status === 'paid'
    if (filter === 'partial') return status === 'partial'
    if (filter === 'unpaid') return status === 'overdue' || status === 'unpaid' || status === 'due-soon'
    if (filter === 'overdue') return status === 'overdue'
    if (filter === 'adjustments') return getTenantAdjustments(t).length > 0
    return true
  })

  const searchFiltered = statusFiltered.filter(t => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.trim().toLowerCase()
    const tenantName = getNameByLang(t, language).toLowerCase()
    const unitNum = (t.unitNumber || '').toLowerCase()
    return tenantName.includes(q) || unitNum.includes(q)
  })

  const filteredTenants = searchFiltered

  // Property summary metrics
  const totalRent = activeTenants.reduce((s, t) => s + t.rentAmount, 0)
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()
  const collectedAmount = activeTenants.reduce((s, tenant) => {
    const adj = getTenantAdjustments(tenant).reduce((sum, a) => sum + a.amount, 0)
    const monthPayments = (tenant.payments || []).filter(p => p.month === currentMonth && p.year === currentYear && p.allocationType !== 'HISTORICAL_DEBT')
    // Effective payments exclude ADVANCE_PAYMENT excess (already in creditBalance)
    const effectivePaid = calculateEffectivePaymentsReceived(monthPayments, tenant.rentAmount, Number(tenant.municipalityFee) || 0, adj)
    // Cap at current charges for the current-month collection progress bar
    const currentCharges = tenant.rentAmount + (Number(tenant.municipalityFee) || 0) - adj
    return s + Math.min(effectivePaid, Math.max(0, currentCharges))
  }, 0)
  const outstandingAmount = Math.max(0, totalRent - collectedAmount)
  const occupancy = property && property.totalUnits > 0 ? Math.round((activeTenants.length / property.totalUnits) * 100) : 0

  // Tenant group logic (same as rent-collection)
  const tenantGroups = useDataStore.getState().tenantGroups
  const groupedTenantIds = new Set<string>()
  const displayGroups: { group: TenantGroupData; tenants: TenantData[] }[] = []

  tenantGroups.forEach(group => {
    const groupTenants = filteredTenants.filter(t => t.groupId === group.id)
    if (groupTenants.length > 0) {
      displayGroups.push({ group, tenants: groupTenants })
      groupTenants.forEach(t => groupedTenantIds.add(t.id))
    }
  })

  const ungroupedTenants = filteredTenants.filter(t => !groupedTenantIds.has(t.id))

  // Get group balance
  const getGroupBalance = (groupTenants: TenantData[]) => {
    let totalOpeningBalance = 0
    let totalCurrentCharges = 0
    let totalAdjustments = 0
    let totalCreditBalance = 0
    let totalPaymentsReceived = 0
    let totalRentAmount = 0

    for (const tenant of groupTenants) {
      const fin = getTenantFinancials(tenant)
      totalOpeningBalance += fin.openingBalance
      totalCurrentCharges += fin.currentCharges
      totalAdjustments += fin.adjustments
      totalCreditBalance += fin.creditBalance
      totalPaymentsReceived += fin.paymentsReceived
      totalRentAmount += tenant.rentAmount
    }

    const totalDue = totalOpeningBalance + totalCurrentCharges - totalCreditBalance
    const remaining = totalDue - totalPaymentsReceived

    return {
      totalOpeningBalance,
      totalCurrentCharges,
      totalAdjustments,
      totalCreditBalance,
      totalPaymentsReceived,
      totalRentAmount,
      totalDue,
      remaining,
    }
  }

  const getGroupPaymentStatus = (groupTenants: TenantData[]): 'paid' | 'partial' | 'overdue' | 'unpaid' | 'due-soon' => {
    const statuses = groupTenants.map(t => getTenantPaymentStatus(t))
    if (statuses.every(s => s === 'paid')) return 'paid'
    if (statuses.some(s => s === 'paid' || s === 'partial')) return 'partial'
    const now = new Date()
    const isSelectedCurrentMonth = selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear()
    if (isSelectedCurrentMonth) {
      const dayOfMonth = now.getDate()
      if (dayOfMonth <= 2) return 'due-soon'
      if (dayOfMonth <= 4) return 'unpaid'
      return 'overdue'
    }
    if (selectedYear < now.getFullYear() || (selectedYear === now.getFullYear() && selectedMonth < now.getMonth() + 1)) {
      return 'overdue'
    }
    return 'due-soon'
  }

  // Payment handlers
  const openPayDialog = (tenant: TenantData) => {
    const fin = getTenantFinancials(tenant)
    setPayingTenant(tenant)
    setPayForm({
      amount: Math.max(0, fin.remainingBalance),
      method: 'cash',
      reference: '',
      notes: '',
      paymentDate: new Date().toISOString().split('T')[0],
    })
    setPayAllocationType('CURRENT_RENT')
    setPayDialogOpen(true)
  }

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

  const openGroupPayDialog = (group: TenantGroupData, groupTenants: TenantData[]) => {
    setPayingGroup(group)
    const balance = getGroupBalance(groupTenants)
    setGroupPayForm({
      amount: Math.max(0, balance.remaining),
      method: 'cash',
      reference: '',
      notes: '',
      paymentDate: new Date().toISOString().split('T')[0],
    })
    setGroupPayAllocationType('CURRENT_RENT')
    setGroupPayError('')
    setShowGroupAllocation(false)
    setGroupPayDialogOpen(true)
  }

  const handleGroupPay = async () => {
    if (!payingGroup || groupPayLoading) return
    setGroupPayLoading(true)
    setGroupPayError('')
    try {
      await useDataStore.getState().recordGroupPayment(payingGroup.id, {
        amount: groupPayForm.amount,
        month: selectedMonth,
        year: selectedYear,
        method: groupPayForm.method,
        reference: groupPayForm.reference || undefined,
        notes: groupPayForm.notes || undefined,
        paymentDate: groupPayForm.paymentDate,
        allocationType: groupPayAllocationType,
      })
      setGroupPayDialogOpen(false)
      fetchData()
    } catch (error: any) {
      setGroupPayError(error?.message || 'Failed to record group payment')
    } finally {
      setGroupPayLoading(false)
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

  const goBack = () => {
    setSelectedPropertyId(null)
    setCurrentPage('properties')
  }

  // Navigate to tenant page
  const viewTenantDetail = (tenant: TenantData) => {
    setCurrentPage('tenants')
  }

  // Navigate to rent collection with filters
  const viewPaymentHistory = () => {
    setCurrentPage('rent')
  }

  const getStatusBadge = (status: string) => {
    const colors = getPaymentStatusColor(status)
    const labels: Record<string, string> = {
      paid: t('paid', language),
      partial: t('partiallyPaid', language),
      unpaid: t('unpaid', language),
      overdue: t('overdue', language),
      'due-soon': t('dueSoon', language),
    }
    return (
      <Badge className={cn2('text-xs font-medium', colors)}>
        {labels[status] || status}
      </Badge>
    )
  }

  if (loading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-emerald" /></div>
  }

  if (!property) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <Building2 className="w-12 h-12 text-gray-300" />
        <p className="text-muted-foreground">{t('propertyName', language)}</p>
        <Button variant="outline" onClick={goBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('backToProperties', language)}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={goBack} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" />
            {t('backToProperties', language)}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prevMonth}>
            &larr;
          </Button>
          <span className="text-sm font-medium min-w-[140px] text-center">
            {getMonthName(selectedMonth, language)} {selectedYear}
          </span>
          <Button variant="outline" size="sm" onClick={nextMonth} disabled={selectedMonth >= new Date().getMonth() + 1 && selectedYear >= new Date().getFullYear()}>
            &rarr;
          </Button>
        </div>
      </div>

      {/* Property Title */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-lg bg-emerald/10 flex items-center justify-center">
          <Building2 className="w-6 h-6 text-emerald" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{getNameByLang(property, language)}</h1>
          <p className="text-muted-foreground text-sm">{t('propertyCollectionOverview', language)}</p>
        </div>
      </div>

      {/* Summary Metrics */}
      {canSeeRevenue && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">{t('units', language)}</p>
              <p className="font-bold text-lg">{property.totalUnits}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">{t('tenantsCount', language)}</p>
              <p className="font-bold text-lg">{activeTenants.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">{t('occupancy', language)}</p>
              <p className="font-bold text-lg">{occupancy}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">{t('monthlyRevenue', language)}</p>
              <p className="font-bold text-lg text-emerald">{formatAED(totalRent)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">{t('collected', language)}</p>
              <p className="font-bold text-lg text-emerald-600">{formatAED(collectedAmount)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">{t('outstanding', language)}</p>
              <p className={`font-bold text-lg ${outstandingAmount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatAED(outstandingAmount)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Collection progress bar */}
      {canSeeRevenue && totalRent > 0 && (
        <div className="bg-white rounded-lg border p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">{t('collectionProgress', language) || 'Collection Progress'}</span>
            <span className="text-sm font-semibold text-emerald">{totalRent > 0 ? Math.round((collectedAmount / totalRent) * 100) : 0}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-emerald h-2.5 rounded-full transition-all"
              style={{ width: `${totalRent > 0 ? Math.round((collectedAmount / totalRent) * 100) : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex gap-2 flex-wrap items-center">
        {(['all', 'paid', 'partial', 'unpaid', 'overdue', 'adjustments'] as const).map(f => (
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
            {f === 'adjustments' && t('adjustmentsTab', language)}
          </Button>
        ))}
        <div className="flex items-center gap-2 bg-white rounded-lg border px-2 py-1 ml-auto">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('searchTenantOrUnit', language) || 'Search Tenant / Unit'}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="border-0 outline-none text-sm w-36 lg:w-52 bg-transparent"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-gray-600">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Tenant List */}
      {filter === 'adjustments' ? (
        <AdjustmentsView
          tenants={filteredTenants}
          language={language}
          getTenantAdjustments={getTenantAdjustments}
          getNameByLang={getNameByLang}
          t={t}
        />
      ) : (
        <div className="space-y-3">
          {/* Linked-unit groups */}
          {displayGroups.map(({ group, tenants: groupTenants }) => {
            const groupStatus = getGroupPaymentStatus(groupTenants)
            const balance = getGroupBalance(groupTenants)
            const isExpanded = expandedGroup === group.id

            return (
              <Card key={group.id} className="border-l-4 border-l-blue-400">
                <CardContent className="p-4">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                        <Users className="w-4 h-4 text-blue-500" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <Link2 className="w-3.5 h-3.5 text-blue-400" />
                          <span className="font-semibold text-sm">{group.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {groupTenants.length} {t('units', language)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                          <span>{t('unitNumber', language)}: {groupTenants.map(t => t.unitNumber).join(', ')}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {canSeeRevenue && (
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">{t('remainingBalance', language)}</p>
                          <p className={`font-semibold text-sm ${balance.remaining > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {formatAED(Math.abs(balance.remaining))}
                            {balance.remaining < 0 && <span className="text-xs ml-1">({t('credit', language)})</span>}
                          </p>
                        </div>
                      )}
                      {getStatusBadge(groupStatus)}
                      <Button
                        size="sm"
                        className="bg-emerald hover:bg-emerald/90 text-white h-8"
                        onClick={(e) => { e.stopPropagation(); openGroupPayDialog(group, groupTenants) }}
                      >
                        <Banknote className="w-3.5 h-3.5 mr-1" />
                        {t('recordPayment', language)}
                      </Button>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">{t('unitNumber', language)}</TableHead>
                            <TableHead className="text-xs">{t('tenantName', language)}</TableHead>
                            <TableHead className="text-xs text-right">{t('rentAmount', language)}</TableHead>
                            <TableHead className="text-xs text-right">{t('creditBalanceLabel', language)}</TableHead>
                            <TableHead className="text-xs text-right">{t('remainingBalance', language)}</TableHead>
                            <TableHead className="text-xs text-center">{t('status', language)}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {groupTenants.map(tenant => {
                            const fin = getTenantFinancials(tenant)
                            return (
                              <TableRow key={tenant.id}>
                                <TableCell className="text-xs font-medium">{tenant.unitNumber}</TableCell>
                                <TableCell className="text-xs">{getNameByLang(tenant, language)}</TableCell>
                                <TableCell className="text-xs text-right">{formatAED(tenant.rentAmount)}</TableCell>
                                <TableCell className="text-xs text-right">{fin.creditBalance > 0 ? formatAED(fin.creditBalance) : '-'}</TableCell>
                                <TableCell className="text-xs text-right font-medium">
                                  <span className={fin.remainingBalance > 0 ? 'text-red-600' : fin.remainingBalance < 0 ? 'text-emerald-600' : ''}>
                                    {formatAED(Math.abs(fin.remainingBalance))}
                                    {fin.remainingBalance < 0 && <span className="text-xs ml-0.5">({t('credit', language)})</span>}
                                  </span>
                                </TableCell>
                                <TableCell className="text-center">{getStatusBadge(getTenantPaymentStatus(tenant))}</TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}

          {/* Individual tenants */}
          {ungroupedTenants.map(tenant => {
            const fin = getTenantFinancials(tenant)
            const status = getTenantPaymentStatus(tenant)
            const isExpanded = expandedTenant === tenant.id
            const tenantPayments = (tenant.payments || []).filter(p => p.month === selectedMonth && p.year === selectedYear)
            const tenantAdjustments = getTenantAdjustments(tenant)

            return (
              <Card key={tenant.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedTenant(isExpanded ? null : tenant.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-sm font-bold">
                        {tenant.unitNumber || '?'}
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{getNameByLang(tenant, language)}</p>
                        <p className="text-xs text-muted-foreground">
                          {t('unitNumber', language)}: {tenant.unitNumber}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {canSeeRevenue && (
                        <div className="hidden sm:flex items-center gap-6">
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">{t('rentAmount', language)}</p>
                            <p className="font-semibold text-sm">{formatAED(tenant.rentAmount)}</p>
                          </div>
                          {fin.creditBalance > 0 && (
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">{t('creditBalanceLabel', language)}</p>
                              <p className="font-semibold text-sm text-emerald-600">{formatAED(fin.creditBalance)}</p>
                            </div>
                          )}
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">{t('remainingBalance', language)}</p>
                            <p className={`font-semibold text-sm ${fin.remainingBalance > 0 ? 'text-red-600' : fin.remainingBalance < 0 ? 'text-emerald-600' : 'text-emerald-600'}`}>
                              {formatAED(Math.abs(fin.remainingBalance))}
                              {fin.remainingBalance < 0 && <span className="text-xs ml-0.5">({t('credit', language)})</span>}
                            </p>
                          </div>
                        </div>
                      )}
                      {getStatusBadge(status)}
                      <Button
                        size="sm"
                        className="bg-emerald hover:bg-emerald/90 text-white h-8"
                        onClick={(e) => { e.stopPropagation(); openPayDialog(tenant) }}
                      >
                        <Banknote className="w-3.5 h-3.5 mr-1" />
                        {t('recordPayment', language)}
                      </Button>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>

                  {/* Mobile financials */}
                  {canSeeRevenue && (
                    <div className="sm:hidden mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">{t('rentAmount', language)}: </span>
                        <span className="font-medium">{formatAED(tenant.rentAmount)}</span>
                      </div>
                      {fin.creditBalance > 0 && (
                        <div>
                          <span className="text-muted-foreground">{t('creditBalanceLabel', language)}: </span>
                          <span className="font-medium text-emerald-600">{formatAED(fin.creditBalance)}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">{t('remainingBalance', language)}: </span>
                        <span className={`font-medium ${fin.remainingBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatAED(Math.abs(fin.remainingBalance))}</span>
                      </div>
                    </div>
                  )}

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t space-y-3">
                      {/* Payment History */}
                      {tenantPayments.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1.5">{t('viewPaymentHistory', language)}</p>
                          <div className="space-y-1">
                            {tenantPayments.map(p => (
                              <div key={p.id} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1.5">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <span className="font-medium">{formatAED(p.amount)}</span>
                                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                                    {(p.method || 'cash').replace('_', ' ')}
                                  </Badge>
                                  {p.allocationType && p.allocationType !== 'CURRENT_RENT' && (
                                    <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                      {p.allocationType.replace('_', ' ')}
                                    </Badge>
                                  )}
                                  {p.isLate && (
                                    <Badge variant="outline" className="text-[10px] px-1 py-0 border-red-300 text-red-600">
                                      {language === 'ar' ? 'متأخر' : language === 'bn' ? 'বিলম্বিত' : language === 'ur' ? 'دیر' : 'Late'}
                                    </Badge>
                                  )}
                                  <span className="text-muted-foreground text-[10px]">
                                    {p.date ? new Date(p.date).toLocaleDateString(language === 'ar' ? 'ar-AE' : 'en-AE', { day: 'numeric', month: 'short' }) : (language === 'ar' ? 'بدون تاريخ' : language === 'bn' ? 'তারিখ নেই' : language === 'ur' ? 'تاریخ نہیں' : 'No date')}
                                  </span>
                                  {p.reference && (
                                    <span className="text-muted-foreground text-[10px] truncate">Ref: {p.reference}</span>
                                  )}
                                </div>
                                {canSeeRevenue && (
                                  <div className="flex items-center gap-0.5 shrink-0 ml-1.5">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); openEditPaymentDialog(p) }}
                                      className="p-0.5 hover:bg-white rounded transition-colors"
                                      title={language === 'ar' ? 'تعديل الدفعة' : language === 'bn' ? 'পেমেন্ট সম্পাদনা' : language === 'ur' ? 'ادائیگی میں ترمیم' : 'Edit payment'}
                                    >
                                      <Pencil className="w-3 h-3 text-blue-600" />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); openDeletePaymentDialog(p) }}
                                      className="p-0.5 hover:bg-white rounded transition-colors"
                                      title={language === 'ar' ? 'حذف الدفعة' : language === 'bn' ? 'পেমেন্ট মুছুন' : language === 'ur' ? 'ادائیگی حذف کریں' : 'Delete payment'}
                                    >
                                      <Trash2 className="w-3 h-3 text-red-600" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Adjustments */}
                      {tenantAdjustments.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1.5">{t('viewAdjustments', language)}</p>
                          <div className="space-y-1">
                            {tenantAdjustments.map(a => (
                              <div key={a.id} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1.5">
                                <span className="font-medium">-{formatAED(a.amount)}</span>
                                <span className="text-muted-foreground">{a.reason}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Quick Actions */}
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => viewTenantDetail(tenant)}>
                          {t('viewTenant', language)}
                        </Button>
                        <Button variant="outline" size="sm" className="text-xs h-7" onClick={viewPaymentHistory}>
                          {t('viewPaymentHistory', language)}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}

          {filteredTenants.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p>{t('noTenantsMatchFilter', language)}</p>
            </div>
          )}
        </div>
      )}

      {/* Single Tenant Payment Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('recordPayment', language)}</DialogTitle>
          </DialogHeader>
          {payingTenant && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="font-medium text-sm">{getNameByLang(payingTenant, language)}</p>
                <p className="text-xs text-muted-foreground">{t('unitNumber', language)}: {payingTenant.unitNumber}</p>
                {canSeeRevenue && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('remainingBalance', language)}: {formatAED(Math.max(0, getTenantFinancials(payingTenant).remainingBalance))}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs">{t('amount', language)}</Label>
                <Input
                  type="number"
                  value={payForm.amount}
                  onChange={e => setPayForm({ ...payForm, amount: Number(e.target.value) })}
                  min={0}
                />
              </div>
              <div>
                <Label className="text-xs">{t('paymentMethod', language)}</Label>
                <Select value={payForm.method} onValueChange={v => setPayForm({ ...payForm, method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">{t('cash', language)}</SelectItem>
                    <SelectItem value="bank_transfer">{t('bankTransfer', language)}</SelectItem>
                    <SelectItem value="cheque">{t('cheque', language)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{t('paymentDate', language)}</Label>
                <Input
                  type="date"
                  value={payForm.paymentDate}
                  onChange={e => setPayForm({ ...payForm, paymentDate: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">{t('allocationType', language)}</Label>
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
                <Label className="text-xs">{t('reference', language)}</Label>
                <Input
                  value={payForm.reference}
                  onChange={e => setPayForm({ ...payForm, reference: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              <div>
                <Label className="text-xs">{t('notes', language)}</Label>
                <Input
                  value={payForm.notes}
                  onChange={e => setPayForm({ ...payForm, notes: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>{t('cancel', language)}</Button>
            <Button onClick={handlePay} className="bg-emerald hover:bg-emerald/90 text-white" disabled={payLoading || payForm.amount <= 0}>
              {payLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('recordPayment', language)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group Payment Dialog */}
      <Dialog open={groupPayDialogOpen} onOpenChange={setGroupPayDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('recordGroupPayment', language)}</DialogTitle>
          </DialogHeader>
          {payingGroup && (
            <div className="space-y-4">
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="font-medium text-sm flex items-center gap-2">
                  <Link2 className="w-3.5 h-3.5 text-blue-500" />
                  {payingGroup.name}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('remainingBalance', language)}: {formatAED(Math.max(0, getGroupBalance(activeTenants.filter(t => t.groupId === payingGroup.id)).remaining))}
                </p>
              </div>
              <div>
                <Label className="text-xs">{t('amount', language)}</Label>
                <Input
                  type="number"
                  value={groupPayForm.amount}
                  onChange={e => setGroupPayForm({ ...groupPayForm, amount: Number(e.target.value) })}
                  min={0}
                />
              </div>
              <div>
                <Label className="text-xs">{t('paymentMethod', language)}</Label>
                <Select value={groupPayForm.method} onValueChange={v => setGroupPayForm({ ...groupPayForm, method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">{t('cash', language)}</SelectItem>
                    <SelectItem value="bank_transfer">{t('bankTransfer', language)}</SelectItem>
                    <SelectItem value="cheque">{t('cheque', language)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{t('paymentDate', language)}</Label>
                <Input
                  type="date"
                  value={groupPayForm.paymentDate}
                  onChange={e => setGroupPayForm({ ...groupPayForm, paymentDate: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">{t('allocationType', language)}</Label>
                <Select value={groupPayAllocationType} onValueChange={setGroupPayAllocationType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CURRENT_RENT">{t('currentRent', language)}</SelectItem>
                    <SelectItem value="ADVANCE_PAYMENT">{t('advancePayment', language)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{t('reference', language)}</Label>
                <Input value={groupPayForm.reference} onChange={e => setGroupPayForm({ ...groupPayForm, reference: e.target.value })} placeholder="Optional" />
              </div>
              <div>
                <Label className="text-xs">{t('notes', language)}</Label>
                <Input value={groupPayForm.notes} onChange={e => setGroupPayForm({ ...groupPayForm, notes: e.target.value })} placeholder="Optional" />
              </div>
              {groupPayError && <p className="text-sm text-red-600">{groupPayError}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupPayDialogOpen(false)}>{t('cancel', language)}</Button>
            <Button onClick={handleGroupPay} className="bg-emerald hover:bg-emerald/90 text-white" disabled={groupPayLoading || groupPayForm.amount <= 0}>
              {groupPayLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('recordPayment', language)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Adjustments sub-view component
function AdjustmentsView({
  tenants,
  language,
  getTenantAdjustments,
  getNameByLang,
  t,
}: {
  tenants: TenantData[]
  language: string
  getTenantAdjustments: (t: TenantData) => RentAdjustmentData[]
  getNameByLang: (t: any, lang: string) => string
  t: (key: string, lang: string) => string
}) {
  const tenantsWithAdjustments = tenants.filter(t => getTenantAdjustments(t).length > 0)

  if (tenantsWithAdjustments.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>{t('noAdjustmentsFound', language) || 'No adjustments found'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {tenantsWithAdjustments.map(tenant => {
        const adjustments = getTenantAdjustments(tenant)
        return (
          <Card key={tenant.id}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-semibold text-sm">{getNameByLang(tenant, language)}</span>
                <Badge variant="outline" className="text-xs">{t('unitNumber', language)}: {tenant.unitNumber}</Badge>
              </div>
              <div className="space-y-1">
                {adjustments.map(a => (
                  <div key={a.id} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-red-600">-{formatAED(a.amount)}</span>
                      <span className="text-muted-foreground">{a.reason}</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px] px-1 py-0">{a.adjustmentType.replace('_', ' ')}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
