'use client'

import { useEffect, useState, useCallback, useMemo, Fragment } from 'react'
import type { ReservationData, PropertyData } from '@/lib/types'
import { t, getNameByLang, type Language } from '@/lib/i18n'
import { cn2, formatAED, formatDate } from '@/lib/utils'
import { useAppStore, isOwnerOrAdmin } from '@/lib/store'
import { useDataStore } from '@/lib/data-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import {
  CalendarCheck, Plus, Pencil, Trash2, Search,
  Loader2, Phone, Mail, Lock, AlertTriangle,
  Building, Clock, UserCheck, XCircle, CheckCircle2,
  ArrowRightLeft, Calendar, DollarSign, FileText,
  Users, Link2, Unlink, ChevronDown, ChevronUp
} from 'lucide-react'

// ─── Form State ────────────────────────────────────────────────────────────────

interface ReservationFormState {
  prospectName: string
  prospectNameAr: string
  prospectNameBn: string
  prospectNameUr: string
  prospectPhone: string
  prospectWhatsapp: string
  prospectEmail: string
  propertyId: string
  unitNumber: string
  depositAmount: string
  depositPaymentMethod: string
  depositReference: string
  depositPaymentDate: string
  emiratesId: string
  expectedMoveInDate: string
  expiryDate: string
  notes: string
}

const emptyForm: ReservationFormState = {
  prospectName: '', prospectNameAr: '', prospectNameBn: '', prospectNameUr: '',
  prospectPhone: '', prospectWhatsapp: '', prospectEmail: '',
  propertyId: '', unitNumber: '',
  depositAmount: '0', depositPaymentMethod: '', depositReference: '',
  depositPaymentDate: new Date().toISOString().split('T')[0], emiratesId: '',
  expectedMoveInDate: '', expiryDate: '', notes: '',
}

// ─── Convert-to-Tenant Form State ──────────────────────────────────────────────

interface ConvertFormState {
  depositAppliedTo: string
  rentAmount: string
  paymentMethod: string
  leaseStart: string
  leaseEnd: string
  contractDuration: string
}

const emptyConvertForm: ConvertFormState = {
  depositAppliedTo: 'security_deposit',
  rentAmount: '0',
  paymentMethod: '',
  leaseStart: '',
  leaseEnd: '',
  contractDuration: '12',
}

// ─── Group Reservations Form State ─────────────────────────────────────────────

interface GroupReservationFormState {
  // Group info
  groupName: string
  groupNameAr: string
  groupNameBn: string
  groupNameUr: string
  propertyId: string
  // Prospect info (shared across all units in the group)
  prospectName: string
  prospectNameAr: string
  prospectNameBn: string
  prospectNameUr: string
  prospectPhone: string
  prospectWhatsapp: string
  prospectEmail: string
  emiratesId: string
  // Units (comma-separated input)
  unitNumbers: string  // "11, 15, 31, 33"
  // Deposit (one total, split equally)
  totalDeposit: string
  depositPaymentMethod: string
  depositReference: string
  depositPaymentDate: string
  // Per-unit rent (so each reservation becomes a properly-priced unit)
  perUnitRent: string
  // Dates
  expectedMoveInDate: string
  expiryDate: string
  notes: string
}

const emptyGroupForm: GroupReservationFormState = {
  groupName: '', groupNameAr: '', groupNameBn: '', groupNameUr: '',
  propertyId: '',
  prospectName: '', prospectNameAr: '', prospectNameBn: '', prospectNameUr: '',
  prospectPhone: '', prospectWhatsapp: '', prospectEmail: '', emiratesId: '',
  unitNumbers: '',
  totalDeposit: '0', depositPaymentMethod: '', depositReference: '',
  depositPaymentDate: new Date().toISOString().split('T')[0],
  perUnitRent: '0',
  expectedMoveInDate: '', expiryDate: '', notes: '',
}

// ─── Status Badge Helpers ──────────────────────────────────────────────────────

const reservationStatusOptions = ['pending', 'confirmed', 'converted', 'cancelled', 'expired']
const depositStatusOptions = ['unpaid', 'partial', 'paid', 'refunded']
const paymentMethods = ['cash', 'bank_transfer', 'cheque']

function getReservationStatusLabel(status: string, lang: Language): string {
  switch (status) {
    case 'pending': return t('pending', lang)
    case 'confirmed': return t('confirmed', lang)
    case 'converted': return t('converted', lang)
    case 'cancelled': return t('cancelled', lang)
    case 'expired': return t('expired', lang)
    default: return status
  }
}

function getReservationStatusColor(status: string): string {
  switch (status) {
    case 'pending': return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'confirmed': return 'bg-sky-100 text-sky-800 border-sky-200'
    case 'converted': return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    case 'cancelled': return 'bg-red-100 text-red-800 border-red-200'
    case 'expired': return 'bg-gray-100 text-gray-600 border-gray-200'
    default: return 'bg-gray-100 text-gray-600 border-gray-200'
  }
}

function getDepositStatusLabel(status: string, lang: Language): string {
  switch (status) {
    case 'unpaid': return t('unpaid', lang)
    case 'partial': return t('partial', lang)
    case 'paid': return t('paid', lang)
    case 'refunded': return t('refunded', lang)
    default: return status
  }
}

function getDepositStatusColor(status: string): string {
  switch (status) {
    case 'unpaid': return 'bg-red-100 text-red-800 border-red-200'
    case 'partial': return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'paid': return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    case 'refunded': return 'bg-gray-100 text-gray-600 border-gray-200'
    default: return 'bg-gray-100 text-gray-600 border-gray-200'
  }
}

function getPaymentMethodLabel(method: string, lang: Language): string {
  switch (method) {
    case 'cash': return t('cash', lang)
    case 'bank_transfer': return t('bankTransfer', lang)
    case 'cheque': return t('cheque', lang)
    default: return method
  }
}

// ─── Prospect Name Helper ──────────────────────────────────────────────────────

function getProspectNameByLang(r: ReservationData, lang: Language): string {
  if (lang === 'ar' && r.prospectNameAr) return r.prospectNameAr
  if (lang === 'bn' && r.prospectNameBn) return r.prospectNameBn
  if (lang === 'ur' && r.prospectNameUr) return r.prospectNameUr
  return r.prospectName
}

// ─── Expiry Warning ────────────────────────────────────────────────────────────

function getDaysUntilExpiry(expiryDate: string | null): number | null {
  if (!expiryDate) return null
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const expiry = new Date(expiryDate)
  expiry.setHours(0, 0, 0, 0)
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function Reservations() {
  const { language, authUser } = useAppStore()
  const [reservations, setReservations] = useState<ReservationData[]>([])
  const [properties, setProperties] = useState<PropertyData[]>([])
  const [tenantGroups, setTenantGroups] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Add/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ReservationData | null>(null)
  const [form, setForm] = useState<ReservationFormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  // Convert dialog
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)
  const [convertTarget, setConvertTarget] = useState<ReservationData | null>(null)
  const [convertForm, setConvertForm] = useState<ConvertFormState>(emptyConvertForm)
  const [converting, setConverting] = useState(false)

  // Group dialog
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [groupForm, setGroupForm] = useState<GroupReservationFormState>(emptyGroupForm)
  const [groupSaving, setGroupSaving] = useState(false)

  // Expanded group rows (which group is currently expanded in the table)
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set())

  // Manage groups dialog (list of all groups + dissolve)
  const [manageGroupsOpen, setManageGroupsOpen] = useState(false)

  // RBAC
  const role = authUser?.role || ''
  const canCreate = true
  const canModify = isOwnerOrAdmin(role)
  const canSeeFinancials = isOwnerOrAdmin(role)

  // ─── Data Fetching ───────────────────────────────────────────────────────────

  const fetchReservations = useCallback(() => {
    try {
      const store = useDataStore.getState()
      const allReservations = store.reservations
      // Enrich with property data
      const enriched = allReservations.map(r => ({
        ...r,
        property: store.properties.find(p => p.id === r.propertyId) || undefined,
      }))
      setReservations(enriched)
      setProperties(store.properties.filter(p => !p.archived).sort((a, b) => (a.name || '').localeCompare(b.name || '')))
      setTenantGroups(store.tenantGroups || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchReservations() }, [fetchReservations])

  // ─── Double-booking Detection ────────────────────────────────────────────────

  const confirmedUnitMap = useMemo(() => {
    const map = new Map<string, string>() // key: "propertyId:unitNumber" -> reservationId
    reservations.forEach(r => {
      if (r.status === 'confirmed' && r.unitNumber) {
        const key = `${r.propertyId}:${r.unitNumber.toLowerCase()}`
        if (!map.has(key)) {
          map.set(key, r.id)
        }
      }
    })
    return map
  }, [reservations])

  function isUnitReserved(propertyId: string, unitNumber: string | null, excludeId?: string): boolean {
    if (!unitNumber) return false
    const key = `${propertyId}:${unitNumber.toLowerCase()}`
    const resId = confirmedUnitMap.get(key)
    return resId !== undefined && resId !== excludeId
  }

  // ─── Filtered Data ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return reservations.filter(r => {
      const name = getProspectNameByLang(r, language).toLowerCase()
      const matchesSearch =
        name.includes(search.toLowerCase()) ||
        (r.prospectNameAr && r.prospectNameAr.includes(search)) ||
        (r.prospectNameBn && r.prospectNameBn.includes(search)) ||
        (r.prospectNameUr && r.prospectNameUr.includes(search)) ||
        r.prospectPhone.includes(search) ||
        (r.unitNumber && r.unitNumber.toLowerCase().includes(search.toLowerCase()))
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [reservations, search, statusFilter, language])

  const activeCount = reservations.filter(r => r.status === 'pending' || r.status === 'confirmed').length

  // ─── Grouped vs Standalone Reservations ─────────────────────────────────────
  // Group reservations by groupId — grouped ones render as a single expandable row;
  // standalone ones (no groupId) render as individual rows.
  const { groupedReservations, standaloneReservations } = useMemo(() => {
    const grouped = new Map<string, ReservationData[]>()
    const standalone: ReservationData[] = []
    for (const r of filtered) {
      if (r.groupId) {
        if (!grouped.has(r.groupId)) grouped.set(r.groupId, [])
        grouped.get(r.groupId)!.push(r)
      } else {
        standalone.push(r)
      }
    }
    return {
      groupedReservations: Array.from(grouped.entries()).map(([gid, items]) => ({
        groupId: gid,
        group: tenantGroups.find(g => g.id === gid) || items[0]?.group,
        reservations: items.sort((a, b) => (a.unitNumber || '').localeCompare(b.unitNumber || '')),
      })),
      standaloneReservations: standalone,
    }
  }, [filtered, tenantGroups])

  // ─── Group Dialog Handlers ──────────────────────────────────────────────────

  const openGroupDialog = () => {
    setGroupForm({ ...emptyGroupForm, propertyId: properties[0]?.id || '' })
    setGroupDialogOpen(true)
  }

  const updateGroupForm = (field: keyof GroupReservationFormState, value: string) => {
    setGroupForm(prev => ({ ...prev, [field]: value }))
  }

  // Parse the unit numbers input — supports comma, space, newline separated
  const parseUnitNumbers = (input: string): string[] => {
    return input
      .split(/[,\n\s]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0)
  }

  const handleCreateGroup = async () => {
    const units = parseUnitNumbers(groupForm.unitNumbers)
    if (!groupForm.groupName) return alert('Group name is required')
    if (!groupForm.propertyId) return alert('Property is required')
    if (!groupForm.prospectName || !groupForm.prospectPhone) return alert('Prospect name and phone are required')
    if (units.length < 2) return alert(t('selectAtLeastTwoUnits', language))

    setGroupSaving(true)
    try {
      const totalDeposit = Number(groupForm.totalDeposit) || 0
      const perUnitDeposit = units.length > 0 ? Number((totalDeposit / units.length).toFixed(2)) : 0
      const rentPerUnit = Number(groupForm.perUnitRent) || 0

      const store = useDataStore.getState()

      // 1. Create the tenant group
      const group = await store.addTenantGroup({
        propertyId: groupForm.propertyId,
        name: groupForm.groupName,
        nameAr: groupForm.groupNameAr || undefined,
        nameBn: groupForm.groupNameBn || undefined,
        nameUr: groupForm.groupNameUr || undefined,
        billingMode: 'consolidated',
        notes: groupForm.notes || undefined,
      })

      // 2. Create N reservations linked to the group (one per unit)
      for (const unit of units) {
        await store.addReservation({
          propertyId: groupForm.propertyId,
          groupId: group.id,
          unitNumber: unit,
          prospectName: groupForm.prospectName,
          prospectNameAr: groupForm.prospectNameAr || undefined,
          prospectNameBn: groupForm.prospectNameBn || undefined,
          prospectNameUr: groupForm.prospectNameUr || undefined,
          prospectPhone: groupForm.prospectPhone,
          prospectWhatsapp: groupForm.prospectWhatsapp || undefined,
          prospectEmail: groupForm.prospectEmail || undefined,
          emiratesId: groupForm.emiratesId || undefined,
          depositAmount: perUnitDeposit,
          depositPaymentMethod: groupForm.depositPaymentMethod || undefined,
          depositReference: groupForm.depositReference || undefined,
          depositPaymentDate: groupForm.depositPaymentDate || null,
          depositStatus: perUnitDeposit > 0 ? 'paid' : 'unpaid',
          expectedMoveInDate: groupForm.expectedMoveInDate || undefined,
          expiryDate: groupForm.expiryDate || undefined,
          reservationDate: new Date().toISOString(),
          status: 'pending',
          notes: `Created as part of group: ${groupForm.groupName}. Rent per unit: ${rentPerUnit}`,
          // Stash rent per unit as a custom field (the convert dialog will pre-fill from this)
          // Note: this is stored in notes since Reservation has no rent field; the convert
          // dialog will read it from notes when converting.
        } as any)
      }

      setGroupDialogOpen(false)
      fetchReservations()
    } catch (error: any) {
      alert(error.message || 'Failed to create group')
    } finally {
      setGroupSaving(false)
    }
  }

  const handleDissolveGroup = async (groupId: string) => {
    if (!confirm(t('confirmDissolveGroup', language))) return
    try {
      await useDataStore.getState().deleteTenantGroup(groupId)
      fetchReservations()
    } catch (error: any) {
      alert(error.message || 'Failed to dissolve group')
    }
  }

  const toggleGroupExpanded = (groupId: string) => {
    setExpandedGroupIds(prev => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  // ─── Dialog Handlers ────────────────────────────────────────────────────────

  const openNew = () => {
    setEditing(null)
    setForm({ ...emptyForm, propertyId: properties[0]?.id || '' })
    setDialogOpen(true)
  }

  const openEdit = (r: ReservationData) => {
    setEditing(r)
    setForm({
      prospectName: r.prospectName,
      prospectNameAr: r.prospectNameAr || '',
      prospectNameBn: r.prospectNameBn || '',
      prospectNameUr: r.prospectNameUr || '',
      prospectPhone: r.prospectPhone,
      prospectWhatsapp: r.prospectWhatsapp || '',
      prospectEmail: r.prospectEmail || '',
      propertyId: r.propertyId,
      unitNumber: r.unitNumber || '',
      depositAmount: String(r.depositAmount),
      depositPaymentMethod: r.depositPaymentMethod || '',
      depositReference: r.depositReference || '',
      depositPaymentDate: r.depositPaymentDate ? new Date(r.depositPaymentDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      emiratesId: (r as any).emiratesId || '',
      expectedMoveInDate: r.expectedMoveInDate ? new Date(r.expectedMoveInDate).toISOString().split('T')[0] : '',
      expiryDate: r.expiryDate ? new Date(r.expiryDate).toISOString().split('T')[0] : '',
      notes: r.notes || '',
    })
    setDialogOpen(true)
  }

  const openConvert = (r: ReservationData) => {
    setConvertTarget(r)
    setConvertForm({
      depositAppliedTo: 'security_deposit',
      rentAmount: '0',
      paymentMethod: r.depositPaymentMethod || '',
      leaseStart: r.expectedMoveInDate ? new Date(r.expectedMoveInDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      leaseEnd: '',
      contractDuration: '12',
    })
    setConvertDialogOpen(true)
  }

  // ─── Save (Add/Edit) ────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.prospectName || !form.prospectPhone || !form.propertyId) return
    setSaving(true)
    try {
      const store = useDataStore.getState()
      const body: any = {
        ...form,
        depositAmount: Number(form.depositAmount) || 0,
        depositPaymentDate: form.depositPaymentDate || null,
        emiratesId: form.emiratesId || null,
        reservationDate: new Date().toISOString(),
        status: editing ? undefined : 'pending',
        depositStatus: editing ? undefined : (Number(form.depositAmount) > 0 ? 'paid' : 'unpaid'),
      }
      if (editing) {
        await store.updateReservation(editing.id, body)
      } else {
        await store.addReservation(body)
      }
      setDialogOpen(false)
      fetchReservations()
    } catch (error: any) {
      alert(error.message || 'Failed to save reservation')
    } finally {
      setSaving(false)
    }
  }

  // ─── Confirm Reservation ────────────────────────────────────────────────────

  const handleConfirm = async (id: string) => {
    try {
      await useDataStore.getState().updateReservation(id, {
        status: 'confirmed',
        depositStatus: 'paid',
      })
      fetchReservations()
    } catch (error: any) {
      alert(error.message || 'Failed to confirm reservation')
    }
  }

  // ─── Cancel Reservation ─────────────────────────────────────────────────────

  const handleCancel = async (id: string) => {
    try {
      await useDataStore.getState().cancelReservation(id)
      fetchReservations()
    } catch (error: any) {
      alert(error.message || 'Failed to cancel reservation')
    }
  }

  // ─── Delete Reservation ─────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    if (!confirm(t('deleteReservation', language))) return
    try {
      await useDataStore.getState().deleteReservation(id)
      fetchReservations()
    } catch (error: any) {
      alert(error.message || 'Failed to delete reservation')
    }
  }

  // ─── Convert to Tenant ──────────────────────────────────────────────────────

  const handleConvert = async () => {
    if (!convertTarget) return
    setConverting(true)
    try {
      await useDataStore.getState().convertReservation(convertTarget.id, {
        depositAppliedTo: convertForm.depositAppliedTo,
        rentAmount: Number(convertForm.rentAmount) || 0,
        paymentMethod: convertForm.paymentMethod || undefined,
        leaseStart: convertForm.leaseStart || undefined,
        leaseEnd: convertForm.leaseEnd || undefined,
        contractDuration: convertForm.contractDuration ? Number(convertForm.contractDuration) : undefined,
      })
      setConvertDialogOpen(false)
      fetchReservations()
    } catch (error: any) {
      alert(error.message || 'Failed to convert reservation')
    } finally {
      setConverting(false)
    }
  }

  // ─── Update Form Helper ─────────────────────────────────────────────────────

  const updateForm = (field: keyof ReservationFormState, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const updateConvertForm = (field: keyof ConvertFormState, value: string) => {
    setConvertForm(prev => {
      const next = { ...prev, [field]: value }
      // Auto-calculate lease end from start + duration
      if ((field === 'leaseStart' || field === 'contractDuration') && next.leaseStart && next.contractDuration) {
        const start = new Date(next.leaseStart)
        const duration = Number(next.contractDuration) || 12
        start.setMonth(start.getMonth() + duration)
        next.leaseEnd = start.toISOString().split('T')[0]
      }
      return next
    })
  }

  // ─── Loading State ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('reservations', language)}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {activeCount} {t('reservationsCount', language)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canModify && (
            <Button onClick={openGroupDialog} variant="outline" className="border-indigo-300 text-indigo-700 hover:bg-indigo-50">
              <Users className="w-4 h-4 mr-2" />
              {t('groupReservations', language)}
            </Button>
          )}
          <Button onClick={openNew} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="w-4 h-4 mr-2" />
            {t('addReservation', language)}
          </Button>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('searchReservations', language)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allStatus', language)}</SelectItem>
            {reservationStatusOptions.map(s => (
              <SelectItem key={s} value={s}>{getReservationStatusLabel(s, language)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Reservations Table ── */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('prospectName', language)}</TableHead>
                  <TableHead>{t('emiratesIdNumber', language)}</TableHead>
                  <TableHead>{t('propertyUnit', language)}</TableHead>
                  <TableHead>{t('reservationDate', language)}</TableHead>
                  <TableHead>{t('expectedMoveInDate', language)}</TableHead>
                  <TableHead>{t('depositAmount', language)}</TableHead>
                  <TableHead>{t('depositStatus', language)}</TableHead>
                  <TableHead>{t('status', language)}</TableHead>
                  <TableHead className="text-right">{t('actions', language)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Grouped reservations — render as one expandable row per group */}
                {groupedReservations.map(({ groupId, group, reservations: groupReservations }) => {
                  const groupName = group?.name || group?.nameAr || `Group ${groupId.slice(-6)}`
                  const propertyName = groupReservations[0]?.property ? getNameByLang(groupReservations[0].property!, language) : '—'
                  const totalDeposit = groupReservations.reduce((sum, r) => sum + (Number(r.depositAmount) || 0), 0)
                  const unitList = groupReservations.map(r => r.unitNumber).filter(Boolean).join(', ')
                  const isExpanded = expandedGroupIds.has(groupId)
                  // Aggregate status: if all are confirmed → confirmed; if any pending → pending; etc.
                  const statuses = new Set(groupReservations.map(r => r.status))
                  const aggregateStatus = statuses.size === 1
                    ? groupReservations[0].status
                    : (statuses.has('pending') ? 'pending' : statuses.has('confirmed') ? 'confirmed' : 'mixed')
                  const allConfirmed = groupReservations.every(r => r.status === 'confirmed')
                  const firstPhone = groupReservations[0]?.prospectPhone || ''
                  const firstEmiratesId = (groupReservations[0] as any)?.emiratesId || ''
                  const firstReservationDate = groupReservations[0]?.reservationDate || ''
                  const firstExpectedMoveIn = groupReservations[0]?.expectedMoveInDate || null
                  const daysToExpiry = getDaysUntilExpiry(groupReservations[0]?.expiryDate || null)
                  const showExpiryWarning = daysToExpiry !== null && daysToExpiry >= 0 && daysToExpiry <= 7
                  return (
                    <Fragment key={`group-${groupId}`}>
                      <TableRow className="hover:bg-muted/30 bg-indigo-50/40 border-l-4 border-l-indigo-500">
                        {/* Prospect Name (group) */}
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="w-9 h-9">
                              <AvatarFallback className="bg-indigo-100 text-indigo-700 text-xs font-semibold">
                                <Users className="w-4 h-4" />
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-sm flex items-center gap-1.5">
                                {groupName}
                                <Badge variant="outline" className="text-[9px] px-1 py-0 border-indigo-300 text-indigo-700">
                                  {groupReservations.length} {language === 'ar' ? 'وحدات' : language === 'bn' ? 'ইউনিট' : language === 'ur' ? 'یونٹس' : 'units'}
                                </Badge>
                              </p>
                              <p className="text-xs text-muted-foreground">{firstPhone}</p>
                              {firstEmiratesId && <p className="text-xs text-muted-foreground">{firstEmiratesId}</p>}
                            </div>
                          </div>
                        </TableCell>
                        {/* Emirates ID */}
                        <TableCell className="text-sm">{firstEmiratesId || '—'}</TableCell>
                        {/* Property + units */}
                        <TableCell>
                          <div>
                            <p className="text-sm">{propertyName}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Units: {unitList}</p>
                          </div>
                        </TableCell>
                        {/* Reservation Date */}
                        <TableCell className="text-sm">
                          <div>
                            <p>{firstReservationDate ? formatDate(firstReservationDate) : '—'}</p>
                          </div>
                        </TableCell>
                        {/* Expected Move-in */}
                        <TableCell className="text-sm">
                          {firstExpectedMoveIn ? formatDate(firstExpectedMoveIn) : '—'}
                        </TableCell>
                        {/* Deposit (total) */}
                        <TableCell>
                          {canSeeFinancials ? (
                            <div>
                              <span className="font-semibold text-sm">{formatAED(totalDeposit)}</span>
                              <p className="text-[10px] text-muted-foreground">
                                {t('perUnitDeposit', language)}: {formatAED(totalDeposit / groupReservations.length)}
                              </p>
                            </div>
                          ) : (
                            <Lock className="w-4 h-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        {/* Deposit status (first reservation's) */}
                        <TableCell>
                          <Badge className={cn2('text-xs', getDepositStatusColor(groupReservations[0]?.depositStatus || 'unpaid'))}>
                            {getDepositStatusLabel(groupReservations[0]?.depositStatus || 'unpaid', language)}
                          </Badge>
                        </TableCell>
                        {/* Reservation Status */}
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge className={cn2('text-xs', aggregateStatus !== 'mixed' ? getReservationStatusColor(aggregateStatus) : 'bg-gray-100 text-gray-700 border-gray-200')}>
                              {aggregateStatus !== 'mixed' ? getReservationStatusLabel(aggregateStatus, language) : (language === 'ar' ? 'مختلط' : language === 'bn' ? 'মিশ্র' : language === 'ur' ? 'مخلوط' : 'Mixed')}
                            </Badge>
                            {showExpiryWarning && (
                              <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 px-1 py-0 w-fit">
                                <AlertTriangle className="w-3 h-3 mr-0.5" />
                                {t('expiryWarning', language)} ({daysToExpiry}d)
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        {/* Actions */}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => toggleGroupExpanded(groupId)}
                              className="p-1.5 rounded hover:bg-muted text-indigo-600"
                              title={isExpanded ? 'Collapse' : 'Expand'}
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                            {allConfirmed && canModify && (
                              <button
                                onClick={() => openConvert(groupReservations[0])}
                                className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600"
                                title={t('convertToTenant', language)}
                              >
                                <ArrowRightLeft className="w-4 h-4" />
                              </button>
                            )}
                            {canModify && (
                              <button
                                onClick={() => handleDissolveGroup(groupId)}
                                className="p-1.5 rounded hover:bg-red-50 text-red-500"
                                title={t('dissolveGroup', language)}
                              >
                                <Unlink className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {/* Expanded individual unit rows under the group */}
                      {isExpanded && groupReservations.map(r => {
                        const displayName = getProspectNameByLang(r, language)
                        return (
                          <TableRow key={r.id} className="hover:bg-muted/20 bg-indigo-50/20 border-l-4 border-l-indigo-300">
                            <TableCell>
                              <div className="flex items-center gap-2 pl-8">
                                <Avatar className="w-7 h-7">
                                  <AvatarFallback className="bg-indigo-100 text-indigo-700 text-[10px] font-semibold">
                                    {displayName.charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="text-xs font-medium">{displayName}</p>
                                  <p className="text-[10px] text-muted-foreground">Unit {r.unitNumber}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs">—</TableCell>
                            <TableCell className="text-xs"><span className="text-muted-foreground">Unit:</span> {r.unitNumber || '—'}</TableCell>
                            <TableCell className="text-xs">{formatDate(r.reservationDate)}</TableCell>
                            <TableCell className="text-xs">{r.expectedMoveInDate ? formatDate(r.expectedMoveInDate) : '—'}</TableCell>
                            <TableCell className="text-xs font-medium">
                              {canSeeFinancials ? formatAED(r.depositAmount) : <Lock className="w-3 h-3 text-muted-foreground" />}
                            </TableCell>
                            <TableCell>
                              <Badge className={cn2('text-[10px]', getDepositStatusColor(r.depositStatus))}>
                                {getDepositStatusLabel(r.depositStatus, language)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={cn2('text-[10px]', getReservationStatusColor(r.status))}>
                                {getReservationStatusLabel(r.status, language)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {r.status === 'pending' && canModify && (
                                  <button onClick={() => handleConfirm(r.id)} className="p-1 rounded hover:bg-sky-50 text-sky-600" title={t('confirmReservation', language)}>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {r.status === 'confirmed' && canModify && (
                                  <button onClick={() => openConvert(r)} className="p-1 rounded hover:bg-emerald-50 text-emerald-600" title={t('convertToTenant', language)}>
                                    <ArrowRightLeft className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {r.status === 'confirmed' && canModify && (
                                  <button onClick={() => handleCancel(r.id)} className="p-1 rounded hover:bg-red-50 text-red-500" title={t('cancelReservation', language)}>
                                    <XCircle className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {canModify && (
                                  <button onClick={() => openEdit(r)} className="p-1 rounded hover:bg-muted text-muted-foreground">
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                )}
                                {canModify && (
                                  <button onClick={() => handleDelete(r.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </Fragment>
                  )
                })}

                {/* Standalone reservations (no group) */}
                {standaloneReservations.map(r => {
                  const displayName = getProspectNameByLang(r, language)
                  const propertyName = r.property ? getNameByLang(r.property, language) : '—'
                  const daysToExpiry = getDaysUntilExpiry(r.expiryDate)
                  const showExpiryWarning = daysToExpiry !== null && daysToExpiry >= 0 && daysToExpiry <= 7 && (r.status === 'pending' || r.status === 'confirmed')
                  const unitIsReserved = isUnitReserved(r.propertyId, r.unitNumber, r.id)

                  return (
                    <TableRow key={r.id} className="hover:bg-muted/30">
                      {/* Prospect Name */}
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="w-9 h-9">
                            <AvatarFallback className={cn2(
                              'text-xs font-semibold',
                              r.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                              r.status === 'confirmed' ? 'bg-sky-100 text-sky-700' :
                              r.status === 'converted' ? 'bg-emerald-100 text-emerald-700' :
                              'bg-gray-100 text-gray-600'
                            )}>
                              {displayName.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-sm">{displayName}</p>
                            <p className="text-xs text-muted-foreground">{r.prospectPhone}</p>
                            {(r as any).emiratesId && <p className="text-xs text-muted-foreground">{(r as any).emiratesId}</p>}
                          </div>
                        </div>
                      </TableCell>

                      {/* Emirates ID */}
                      <TableCell className="text-sm">
                        {(r as any).emiratesId || '—'}
                      </TableCell>

                      {/* Property / Unit */}
                      <TableCell>
                        <div>
                          <p className="text-sm">{propertyName}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {r.unitNumber && (
                              <span className="text-xs text-muted-foreground">{r.unitNumber}</span>
                            )}
                            {unitIsReserved && (
                              <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 px-1 py-0">
                                {t('unitReserved', language)}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Reservation / Payment Date */}
                      <TableCell className="text-sm">
                        <div>
                          <p>{formatDate(r.reservationDate)}</p>
                          {(r as any).depositPaymentDate && (
                            <p className="text-xs text-emerald-600">{formatDate((r as any).depositPaymentDate)}</p>
                          )}
                        </div>
                      </TableCell>

                      {/* Expected Move-in */}
                      <TableCell className="text-sm">
                        {r.expectedMoveInDate ? formatDate(r.expectedMoveInDate) : '—'}
                      </TableCell>

                      {/* Deposit Amount */}
                      <TableCell>
                        {canSeeFinancials ? (
                          <span className="font-semibold text-sm">{formatAED(r.depositAmount)}</span>
                        ) : (
                          <Lock className="w-4 h-4 text-muted-foreground" />
                        )}
                      </TableCell>

                      {/* Deposit Status */}
                      <TableCell>
                        <Badge className={cn2('text-xs', getDepositStatusColor(r.depositStatus))}>
                          {getDepositStatusLabel(r.depositStatus, language)}
                        </Badge>
                      </TableCell>

                      {/* Reservation Status + Expiry Warning */}
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge className={cn2('text-xs', getReservationStatusColor(r.status))}>
                            {getReservationStatusLabel(r.status, language)}
                          </Badge>
                          {showExpiryWarning && (
                            <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 px-1 py-0 w-fit">
                              <AlertTriangle className="w-3 h-3 mr-0.5" />
                              {t('expiryWarning', language)} ({daysToExpiry}d)
                            </Badge>
                          )}
                        </div>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {r.status === 'pending' && canModify && (
                            <button
                              onClick={() => handleConfirm(r.id)}
                              className="p-1.5 rounded hover:bg-sky-50 text-sky-600"
                              title={t('confirmReservation', language)}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
                          {r.status === 'confirmed' && canModify && (
                            <button
                              onClick={() => openConvert(r)}
                              className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600"
                              title={t('convertToTenant', language)}
                            >
                              <ArrowRightLeft className="w-4 h-4" />
                            </button>
                          )}
                          {(r.status === 'confirmed') && canModify && (
                            <button
                              onClick={() => handleCancel(r.id)}
                              className="p-1.5 rounded hover:bg-red-50 text-red-500"
                              title={t('cancelReservation', language)}
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}
                          {canModify && (
                            <button
                              onClick={() => openEdit(r)}
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canModify && (
                            <button
                              onClick={() => handleDelete(r.id)}
                              className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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
              {t('noReservationsFound', language)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── ADD / EDIT RESERVATION DIALOG ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('editReservation', language) : t('addReservation', language)}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[70vh] pr-2">
            <div className="space-y-6 pb-4">
              {/* Prospect Name - 4 Languages */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  {t('prospectName', language)}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('nameEnglish', language)} *</Label>
                    <Input value={form.prospectName} onChange={e => updateForm('prospectName', e.target.value)} placeholder="John Doe" />
                  </div>
                  <div>
                    <Label>{t('nameArabic', language)}</Label>
                    <Input value={form.prospectNameAr} onChange={e => updateForm('prospectNameAr', e.target.value)} dir="rtl" placeholder="جون دو" />
                  </div>
                  <div>
                    <Label>{t('nameBengali', language)}</Label>
                    <Input value={form.prospectNameBn} onChange={e => updateForm('prospectNameBn', e.target.value)} placeholder="জন ডো" />
                  </div>
                  <div>
                    <Label>{t('nameUrdu', language)}</Label>
                    <Input value={form.prospectNameUr} onChange={e => updateForm('prospectNameUr', e.target.value)} dir="rtl" placeholder="جون ڈو" />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Contact Information */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-emerald-600" />
                  {t('contactInfo', language)}
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>{t('phone', language)} *</Label>
                    <Input value={form.prospectPhone} onChange={e => updateForm('prospectPhone', e.target.value)} placeholder="+971501234567" />
                  </div>
                  <div>
                    <Label>{t('whatsapp', language)}</Label>
                    <Input value={form.prospectWhatsapp} onChange={e => updateForm('prospectWhatsapp', e.target.value)} placeholder="+971501234567" />
                  </div>
                  <div>
                    <Label>{t('email', language)}</Label>
                    <Input value={form.prospectEmail} onChange={e => updateForm('prospectEmail', e.target.value)} type="email" placeholder="prospect@email.com" />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Property & Unit */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Building className="w-4 h-4 text-emerald-600" />
                  {t('leaseInfo', language)}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('propertyName', language)} *</Label>
                    <Select value={form.propertyId} onValueChange={v => updateForm('propertyId', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('selectProperty', language)} />
                      </SelectTrigger>
                      <SelectContent>
                        {properties.map(p => (
                          <SelectItem key={p.id} value={p.id}>{getNameByLang(p, language)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t('unitNumber', language)}</Label>
                    <Input value={form.unitNumber} onChange={e => updateForm('unitNumber', e.target.value)} placeholder="Apt 201" />
                    {isUnitReserved(form.propertyId, form.unitNumber, editing?.id) && (
                      <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {t('unitReserved', language)}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Deposit Information */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  {t('financialInfo', language)}
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>{t('depositAmount', language)}</Label>
                    <Input type="number" value={form.depositAmount} onChange={e => updateForm('depositAmount', e.target.value)} placeholder="0" />
                  </div>
                  <div>
                    <Label>{t('depositPaymentMethod', language)}</Label>
                    <Select value={form.depositPaymentMethod} onValueChange={v => updateForm('depositPaymentMethod', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('paymentMethod', language)} />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentMethods.map(m => (
                          <SelectItem key={m} value={m}>{getPaymentMethodLabel(m, language)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t('depositReference', language)}</Label>
                    <Input value={form.depositReference} onChange={e => updateForm('depositReference', e.target.value)} placeholder={t('reference', language)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <Label>{t('reservationPaymentDate', language)}</Label>
                    <Input type="date" value={form.depositPaymentDate} onChange={e => updateForm('depositPaymentDate', e.target.value)} />
                  </div>
                  <div>
                    <Label>{t('emiratesIdNumber', language)}</Label>
                    <Input value={form.emiratesId} onChange={e => updateForm('emiratesId', e.target.value)} placeholder="784-XXXX-XXXXXXX-X" />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Dates */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  {t('date', language)}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('expectedMoveInDate', language)}</Label>
                    <Input type="date" value={form.expectedMoveInDate} onChange={e => updateForm('expectedMoveInDate', e.target.value)} />
                  </div>
                  <div>
                    <Label>{t('expiryDate', language)}</Label>
                    <Input type="date" value={form.expiryDate} onChange={e => updateForm('expiryDate', e.target.value)} />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Notes */}
              <div>
                <Label>{t('notes', language)}</Label>
                <Textarea value={form.notes} onChange={e => updateForm('notes', e.target.value)} placeholder={t('notes', language)} rows={3} />
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('cancel', language)}</Button>
            <Button
              onClick={handleSave}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!form.prospectName || !form.prospectPhone || !form.propertyId || saving}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('save', language)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── GROUP RESERVATIONS DIALOG ── */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              {t('groupReservations', language)}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {language === 'ar' ? 'إنشاء حساب مجموعة يربط عدة وحدات تحت عميل واحد' :
               language === 'bn' ? 'একাধিক ইউনিটকে একটি ক্লায়েন্টের অধীনে গ্রুপ অ্যাকাউন্ট তৈরি করুন' :
               language === 'ur' ? 'ایک کسٹمر کے تحت متعدد یونٹس کو جوڑنے کے لیے گروپ اکاؤنٹ بنائیں' :
               'Create a group account linking multiple units under one client'}
            </p>
          </DialogHeader>

          <ScrollArea className="max-h-[70vh] pr-2">
            <div className="space-y-5 pb-4">
              {/* Group Account Name */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600" />
                  {t('groupAccountName', language)} *
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('nameEnglish', language)} *</Label>
                    <Input
                      value={groupForm.groupName}
                      onChange={e => updateGroupForm('groupName', e.target.value)}
                      placeholder={t('groupAccountNamePlaceholder', language)}
                    />
                  </div>
                  <div>
                    <Label>{t('nameArabic', language)}</Label>
                    <Input value={groupForm.groupNameAr} onChange={e => updateGroupForm('groupNameAr', e.target.value)} dir="rtl" />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Property + Units */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Building className="w-4 h-4 text-indigo-600" />
                  {t('leaseInfo', language)}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('propertyName', language)} *</Label>
                    <Select value={groupForm.propertyId} onValueChange={v => updateGroupForm('propertyId', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('selectProperty', language)} />
                      </SelectTrigger>
                      <SelectContent>
                        {properties.map(p => (
                          <SelectItem key={p.id} value={p.id}>{getNameByLang(p, language)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t('unitNumbers', language)} *</Label>
                    <Input
                      value={groupForm.unitNumbers}
                      onChange={e => updateGroupForm('unitNumbers', e.target.value)}
                      placeholder="11, 15, 31, 33"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {parseUnitNumbers(groupForm.unitNumbers).length} {language === 'ar' ? 'وحدات' : language === 'bn' ? 'ইউনিট' : language === 'ur' ? 'یونٹس' : 'units selected'}
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Prospect (shared across all units) */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-indigo-600" />
                  {t('prospectName', language)} ({language === 'ar' ? 'مشترك لكل الوحدات' : language === 'bn' ? 'সব ইউনিটের জন্য শেয়ার্ড' : language === 'ur' ? 'تمام یونٹس کے لیے مشترکہ' : 'shared across all units'})
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('nameEnglish', language)} *</Label>
                    <Input value={groupForm.prospectName} onChange={e => updateGroupForm('prospectName', e.target.value)} placeholder="John Doe" />
                  </div>
                  <div>
                    <Label>{t('nameArabic', language)}</Label>
                    <Input value={groupForm.prospectNameAr} onChange={e => updateGroupForm('prospectNameAr', e.target.value)} dir="rtl" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-3">
                  <div>
                    <Label>{t('phone', language)} *</Label>
                    <Input value={groupForm.prospectPhone} onChange={e => updateGroupForm('prospectPhone', e.target.value)} placeholder="+971501234567" />
                  </div>
                  <div>
                    <Label>{t('whatsapp', language)}</Label>
                    <Input value={groupForm.prospectWhatsapp} onChange={e => updateGroupForm('prospectWhatsapp', e.target.value)} placeholder="+971501234567" />
                  </div>
                  <div>
                    <Label>{t('emiratesIdNumber', language)}</Label>
                    <Input value={groupForm.emiratesId} onChange={e => updateGroupForm('emiratesId', e.target.value)} placeholder="784-XXXX-XXXXXXX-X" />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Financial — Total Deposit + Per-unit Rent */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-indigo-600" />
                  {t('financialInfo', language)}
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>{t('totalDeposit', language)}</Label>
                    <Input type="number" value={groupForm.totalDeposit} onChange={e => updateGroupForm('totalDeposit', e.target.value)} placeholder="0" />
                    {parseUnitNumbers(groupForm.unitNumbers).length > 0 && Number(groupForm.totalDeposit) > 0 && (
                      <p className="text-xs text-indigo-600 mt-1">
                        {t('perUnitDeposit', language)}: {formatAED(Number(groupForm.totalDeposit) / parseUnitNumbers(groupForm.unitNumbers).length)}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>{t('perUnitRent', language)}</Label>
                    <Input type="number" value={groupForm.perUnitRent} onChange={e => updateGroupForm('perUnitRent', e.target.value)} placeholder="0" />
                    <p className="text-xs text-muted-foreground mt-1">
                      {language === 'ar' ? 'يُستخدم عند تحويل الحجز إلى مستأجر' :
                       language === 'bn' ? 'রিজার্ভেশন থেকে ভাড়াটিয়ায় রূপান্তরের সময় ব্যবহৃত' :
                       language === 'ur' ? 'ریزرویشن سے کرایہ دار میں تبدیل کرتے وقت استعمال ہوتا ہے' :
                       'Used when converting reservation to tenant'}
                    </p>
                  </div>
                  <div>
                    <Label>{t('depositPaymentMethod', language)}</Label>
                    <Select value={groupForm.depositPaymentMethod} onValueChange={v => updateGroupForm('depositPaymentMethod', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('paymentMethod', language)} />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentMethods.map(m => (
                          <SelectItem key={m} value={m}>{getPaymentMethodLabel(m, language)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <Label>{t('depositReference', language)}</Label>
                    <Input value={groupForm.depositReference} onChange={e => updateGroupForm('depositReference', e.target.value)} />
                  </div>
                  <div>
                    <Label>{t('reservationPaymentDate', language)}</Label>
                    <Input type="date" value={groupForm.depositPaymentDate} onChange={e => updateGroupForm('depositPaymentDate', e.target.value)} />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Dates */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  {t('date', language)}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('expectedMoveInDate', language)}</Label>
                    <Input type="date" value={groupForm.expectedMoveInDate} onChange={e => updateGroupForm('expectedMoveInDate', e.target.value)} />
                  </div>
                  <div>
                    <Label>{t('expiryDate', language)}</Label>
                    <Input type="date" value={groupForm.expiryDate} onChange={e => updateGroupForm('expiryDate', e.target.value)} />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Notes */}
              <div>
                <Label>{t('notes', language)}</Label>
                <Textarea value={groupForm.notes} onChange={e => updateGroupForm('notes', e.target.value)} rows={2} />
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>{t('cancel', language)}</Button>
            <Button
              onClick={handleCreateGroup}
              disabled={!groupForm.groupName || !groupForm.propertyId || !groupForm.prospectName || !groupForm.prospectPhone || parseUnitNumbers(groupForm.unitNumbers).length < 2 || groupSaving}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {groupSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Users className="w-4 h-4 mr-2" />}
              {t('createNewGroup', language)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CONVERT TO TENANT DIALOG ── */}
      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-emerald-600" />
              {t('convertToTenant', language)}
            </DialogTitle>
          </DialogHeader>

          {convertTarget && (
            <ScrollArea className="max-h-[70vh] pr-1">
              <div className="space-y-5 pb-4">
                {/* Reservation Summary */}
                <Card className="bg-muted/30">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs font-semibold">
                          {getProspectNameByLang(convertTarget, language).charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{getProspectNameByLang(convertTarget, language)}</p>
                        <p className="text-xs text-muted-foreground">{convertTarget.prospectPhone}</p>
                      </div>
                    </div>
                    <Separator />
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">{t('property', language)}: </span>
                        <span className="font-medium">
                          {convertTarget.property ? getNameByLang(convertTarget.property, language) : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('unitNumber', language)}: </span>
                        <span className="font-medium">{convertTarget.unitNumber || '—'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('depositAmount', language)}: </span>
                        <span className="font-medium">
                          {canSeeFinancials ? formatAED(convertTarget.depositAmount) : '•••'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('reservationDate', language)}: </span>
                        <span className="font-medium">{formatDate(convertTarget.reservationDate)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Separator />

                {/* Deposit Application */}
                <div>
                  <Label className="mb-2 block">{t('depositAppliedTo', language)}</Label>
                  <Select value={convertForm.depositAppliedTo} onValueChange={v => updateConvertForm('depositAppliedTo', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="security_deposit">{t('securityDeposit', language)}</SelectItem>
                      <SelectItem value="first_rent">{t('firstRent', language)}</SelectItem>
                      <SelectItem value="advance_rent">{t('advanceRent', language)}</SelectItem>
                      <SelectItem value="other">{t('other', language)}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Rent & Payment */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('monthlyRent', language)}</Label>
                    <Input type="number" value={convertForm.rentAmount} onChange={e => updateConvertForm('rentAmount', e.target.value)} placeholder="0" />
                  </div>
                  <div>
                    <Label>{t('paymentMethod', language)}</Label>
                    <Select value={convertForm.paymentMethod} onValueChange={v => updateConvertForm('paymentMethod', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('paymentMethod', language)} />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentMethods.map(m => (
                          <SelectItem key={m} value={m}>{getPaymentMethodLabel(m, language)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Lease Dates */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('leaseStart', language)}</Label>
                    <Input type="date" value={convertForm.leaseStart} onChange={e => updateConvertForm('leaseStart', e.target.value)} />
                  </div>
                  <div>
                    <Label>{t('leaseEnd', language)}</Label>
                    <Input type="date" value={convertForm.leaseEnd} onChange={e => updateConvertForm('leaseEnd', e.target.value)} />
                  </div>
                </div>

                {/* Contract Duration */}
                <div>
                  <Label>{t('contractDuration', language)}</Label>
                  <Input type="number" value={convertForm.contractDuration} onChange={e => updateConvertForm('contractDuration', e.target.value)} placeholder="12" />
                </div>
              </div>
            </ScrollArea>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertDialogOpen(false)}>{t('cancel', language)}</Button>
            <Button
              onClick={handleConvert}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!convertForm.rentAmount || converting}
            >
              {converting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <ArrowRightLeft className="w-4 h-4 mr-2" />
              {t('convertToTenant', language)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
