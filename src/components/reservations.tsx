'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
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
  ArrowRightLeft, Calendar, DollarSign, FileText
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
        <Button onClick={openNew} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <Plus className="w-4 h-4 mr-2" />
          {t('addReservation', language)}
        </Button>
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
                {filtered.map(r => {
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
