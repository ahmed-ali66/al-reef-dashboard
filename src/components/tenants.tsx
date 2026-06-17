'use client'

import { useEffect, useState, useCallback } from 'react'
import type { TenantData, PropertyData } from '@/lib/types'
import { t, getNameByLang, getWhatsAppLink, getTenantScoreLabel, getTenantScoreColor, type Language, type WhatsAppLanguage } from '@/lib/i18n'
import { cn2, formatAED, formatDate, getStatusColor, isFinanciallyActive } from '@/lib/utils'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Users, Plus, Pencil, Trash2, Search, MessageCircle,
  ChevronDown, ChevronUp, Loader2, Phone, Mail,
  MapPin, CreditCard, Shield, AlertTriangle, Clock,
  Building, Ruler, FileText, Star, ExternalLink, LogOut
} from 'lucide-react'

interface TenantFormState {
  name: string
  nameAr: string
  nameBn: string
  nameUr: string
  phone: string
  whatsapp: string
  email: string
  emiratesId: string
  nationality: string
  employer: string
  emergencyContact: string
  propertyId: string
  unitNumber: string
  unitType: string
  floor: string
  sizeSqft: string
  rentAmount: string
  municipalityFee: string
  securityDeposit: string
  paymentMethod: string
  leaseStart: string
  leaseEnd: string
  contractDuration: string
  status: string
  notes: string
  tenantScore: string
  latePaymentCount: string
  openingBalance: string
  creditBalance: string
  legalCase: string
  legalCaseNumber: string
  legalCaseNotes: string
}

const emptyForm: TenantFormState = {
  name: '', nameAr: '', nameBn: '', nameUr: '',
  phone: '', whatsapp: '', email: '', emiratesId: '',
  nationality: '', employer: '', emergencyContact: '',
  propertyId: '', unitNumber: '', unitType: '', floor: '',
  sizeSqft: '', rentAmount: '0', municipalityFee: '',
  securityDeposit: '', paymentMethod: '', leaseStart: '',
  leaseEnd: '', contractDuration: '', status: 'active', notes: '',
  tenantScore: '100', latePaymentCount: '0',
  openingBalance: '0', creditBalance: '0', legalCase: 'false', legalCaseNumber: '', legalCaseNotes: '',
}

const unitTypes = ['studio', '1bedroom', '2bedroom', '3bedroom', 'shop', 'office']
const paymentMethods = ['cash', 'bank_transfer', 'cheque']
const statusOptions = ['active', 'inactive', 'evicted', 'notice', 'moved_out']

function getUnitTypeLabel(type: string, lang: Language): string {
  switch (type) {
    case 'studio': return t('studio', lang)
    case '1bedroom': return t('oneBedroom', lang)
    case '2bedroom': return t('twoBedroom', lang)
    case '3bedroom': return t('threeBedroom', lang)
    case 'shop': return t('shop', lang)
    case 'office': return t('office', lang)
    default: return type
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

function getStatusLabel(status: string, lang: Language): string {
  switch (status) {
    case 'active': return t('active', lang)
    case 'inactive': return t('inactive2', lang)
    case 'evicted': return t('evicted', lang)
    case 'notice': return t('notice', lang)
    case 'moved_out': return t('movedOut', lang)
    default: return status
  }
}

export default function Tenants() {
  const { language, authUser } = useAppStore()
  const [tenants, setTenants] = useState<TenantData[]>([])
  const [properties, setProperties] = useState<PropertyData[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchScope, setSearchScope] = useState<'tenant' | 'property'>('tenant')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null)

  // Form dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TenantData | null>(null)
  const [form, setForm] = useState<TenantFormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  // Profile dialog
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileTenant, setProfileTenant] = useState<TenantData | null>(null)

  // WhatsApp language selection dialog
  const [whatsappLangDialogOpen, setWhatsappLangDialogOpen] = useState(false)
  const [whatsappTargetTenant, setWhatsappTargetTenant] = useState<TenantData | null>(null)
  const [whatsappRemindAll, setWhatsappRemindAll] = useState(false)

  // Score audit trail dialog
  const [auditDialogOpen, setAuditDialogOpen] = useState(false)
  const [auditTenantId, setAuditTenantId] = useState<string | null>(null)
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [loadingAudit, setLoadingAudit] = useState(false)

  // Score override dialog
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false)
  const [overrideScore, setOverrideScore] = useState('0')
  const [overrideReason, setOverrideReason] = useState('')
  const [overrideSaving, setOverrideSaving] = useState(false)

  // Group dialog (link existing tenants into a new group)
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [groupForm, setGroupForm] = useState({
    groupName: '',
    groupNameAr: '',
    propertyId: '',
    selectedTenantIds: [] as string[],
    notes: '',
  })
  const [groupSaving, setGroupSaving] = useState(false)

  const isPrivileged = authUser ? isOwnerOrAdmin(authUser.role) : true
  // Staff can create tenants but not edit/delete (isPrivileged = owner/admin only for edit/delete)
  const canCreate = true // All authenticated users can create tenants

  const [tenantGroups, setTenantGroups] = useState<any[]>([])
  const fetchData = useCallback(() => {
    try {
      const store = useDataStore.getState()
      setTenants(store.getTenantsWithRelations())
      setProperties(store.getPropertiesWithTenants())
      setTenantGroups(store.tenantGroups || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const openNew = () => {
    setEditing(null)
    setForm({ ...emptyForm, propertyId: properties[0]?.id || '' })
    setDialogOpen(true)
  }

  // ─── Group Management ─────────────────────────────────────────────────────
  const openGroupDialog = () => {
    setGroupForm({ groupName: '', groupNameAr: '', propertyId: properties[0]?.id || '', selectedTenantIds: [], notes: '' })
    setGroupDialogOpen(true)
  }

  const handleCreateTenantGroup = async () => {
    if (!groupForm.groupName) return alert('Group name is required')
    if (!groupForm.propertyId) return alert('Property is required')
    if (groupForm.selectedTenantIds.length < 2) return alert(t('selectAtLeastTwoUnits', language))
    setGroupSaving(true)
    try {
      await useDataStore.getState().addTenantGroup({
        propertyId: groupForm.propertyId,
        name: groupForm.groupName,
        nameAr: groupForm.groupNameAr || undefined,
        billingMode: 'consolidated',
        notes: groupForm.notes || undefined,
        tenantIds: groupForm.selectedTenantIds,
      })
      setGroupDialogOpen(false)
      fetchData()
    } catch (error: any) {
      alert(error.message || 'Failed to create group')
    } finally {
      setGroupSaving(false)
    }
  }

  const handleDissolveTenantGroup = async (groupId: string) => {
    if (!confirm(t('confirmDissolveGroup', language))) return
    try {
      await useDataStore.getState().deleteTenantGroup(groupId)
      fetchData()
    } catch (error: any) {
      alert(error.message || 'Failed to dissolve group')
    }
  }

  const handleRemoveTenantFromGroup = async (tenantId: string, groupId: string) => {
    try {
      await useDataStore.getState().updateTenantGroup(groupId, {
        tenantIds: [tenantId],
        action: 'remove',
      } as any)
      fetchData()
    } catch (error: any) {
      alert(error.message || 'Failed to remove tenant from group')
    }
  }

  const openEdit = (tenant: TenantData) => {
    setEditing(tenant)
    setForm({
      name: tenant.name,
      nameAr: tenant.nameAr || '',
      nameBn: tenant.nameBn || '',
      nameUr: tenant.nameUr || '',
      phone: tenant.phone,
      whatsapp: tenant.whatsapp || '',
      email: tenant.email || '',
      emiratesId: tenant.emiratesId || '',
      nationality: tenant.nationality || '',
      employer: tenant.employer || '',
      emergencyContact: tenant.emergencyContact || '',
      propertyId: tenant.propertyId,
      unitNumber: tenant.unitNumber || '',
      unitType: tenant.unitType || '',
      floor: tenant.floor != null ? String(tenant.floor) : '',
      sizeSqft: tenant.sizeSqft != null ? String(tenant.sizeSqft) : '',
      rentAmount: String(tenant.rentAmount),
      municipalityFee: tenant.municipalityFee != null ? String(tenant.municipalityFee) : '',
      securityDeposit: tenant.securityDeposit != null ? String(tenant.securityDeposit) : '',
      paymentMethod: tenant.paymentMethod || '',
      leaseStart: tenant.leaseStart ? new Date(tenant.leaseStart).toISOString().split('T')[0] : '',
      leaseEnd: tenant.leaseEnd ? new Date(tenant.leaseEnd).toISOString().split('T')[0] : '',
      contractDuration: tenant.contractDuration != null ? String(tenant.contractDuration) : '',
      status: tenant.status,
      notes: tenant.notes || '',
      tenantScore: String(tenant.tenantScore),
      latePaymentCount: String(tenant.latePaymentCount),
      openingBalance: String(tenant.openingBalance || 0),
      creditBalance: String(tenant.creditBalance || 0),
      legalCase: String(tenant.legalCase || false),
      legalCaseNumber: tenant.legalCaseNumber || '',
      legalCaseNotes: tenant.legalCaseNotes || '',
    })
    setDialogOpen(true)
  }

  const openProfile = (tenant: TenantData) => {
    setProfileTenant(tenant)
    setProfileOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const store = useDataStore.getState()
      const rentAmount = Number(form.rentAmount) || 0
      const muniFee = form.municipalityFee ? Number(form.municipalityFee) : 0
      const body: any = {
        ...form,
        rentAmount,
        municipalityFee: muniFee,
        securityDeposit: form.securityDeposit ? Number(form.securityDeposit) : null,
        floor: form.floor ? Number(form.floor) : null,
        sizeSqft: form.sizeSqft ? Number(form.sizeSqft) : null,
        contractDuration: form.contractDuration ? Number(form.contractDuration) : null,
        tenantScore: form.tenantScore !== '' && !isNaN(Number(form.tenantScore)) ? Number(form.tenantScore) : 100,
        latePaymentCount: Number(form.latePaymentCount) || 0,
        // Sync systemScore with tenantScore when editing directly
        systemScore: form.tenantScore !== '' && !isNaN(Number(form.tenantScore)) ? Number(form.tenantScore) : 100,
        openingBalance: Number(form.openingBalance) || 0,
        creditBalance: Number(form.creditBalance) || 0,
        legalCase: form.legalCase === 'true',
        legalCaseNumber: form.legalCaseNumber || null,
        legalCaseNotes: form.legalCaseNotes || null,
      }
      if (editing) {
        await store.updateTenant(editing.id, body)
      } else {
        await store.addTenant(body)
      }
      setDialogOpen(false)
      fetchData()
    } catch (error: any) {
      alert(error.message || 'Failed to save tenant')
    } finally {
      setSaving(false)
    }
  }

  const handleMoveOut = async (id: string) => {
    if (!confirm(t('moveOutConfirm', language))) return
    try {
      await useDataStore.getState().deleteTenant(id) // DELETE endpoint now performs Move Out
      fetchData()
    } catch (error: any) {
      alert(error.message || 'Failed to move out tenant')
    }
  }

  // Score Audit Trail: Fetch and display
  const handleOpenAudit = async (tenantId: string) => {
    setAuditTenantId(tenantId)
    setAuditDialogOpen(true)
    setLoadingAudit(true)
    try {
      const response = await fetch(`/api/tenants/${tenantId}/score-audit`)
      if (!response.ok) throw new Error('Failed to fetch audit trail')
      const data = await response.json()
      setAuditLogs(data.data || [])
    } catch (error) {
      setAuditLogs([])
    } finally {
      setLoadingAudit(false)
    }
  }

  // Score Override: Apply manual score override via dedicated API
  const handleOverrideScore = async () => {
    if (!profileTenant) return
    const score = Number(overrideScore)
    if (isNaN(score) || score < 0 || score > 100) {
      alert('Score must be between 0 and 100')
      return
    }
    if (!overrideReason.trim()) {
      alert(t('overrideReasonPlaceholder', language))
      return
    }
    setOverrideSaving(true)
    try {
      const response = await fetch(`/api/tenants/${profileTenant.id}/score-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, reason: overrideReason.trim() }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Failed to override score' }))
        throw new Error(data.error || 'Failed to override score')
      }
      setOverrideDialogOpen(false)
      // Refresh tenant data
      await useDataStore.getState().refreshAllData()
      fetchData()
      // Update the profileTenant with fresh data
      const store = useDataStore.getState()
      const updatedTenants = store.getTenantsWithRelations()
      const updated = updatedTenants.find((t: TenantData) => t.id === profileTenant.id)
      if (updated) setProfileTenant(updated)
    } catch (error: any) {
      alert(error.message || 'Failed to override score')
    } finally {
      setOverrideSaving(false)
    }
  }

  // Score Reset: Remove manual override and revert to system score
  const handleResetScore = async (tenantId: string) => {
    try {
      const response = await fetch(`/api/tenants/${tenantId}/score-override`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Failed to reset score' }))
        throw new Error(data.error || 'Failed to reset score')
      }
      // Refresh tenant data
      await useDataStore.getState().refreshAllData()
      fetchData()
      // Update the profileTenant with fresh data
      const store = useDataStore.getState()
      const updatedTenants = store.getTenantsWithRelations()
      const updated = updatedTenants.find((t: TenantData) => t.id === tenantId)
      if (updated) setProfileTenant(updated)
    } catch (error: any) {
      alert(error.message || 'Failed to reset score')
    }
  }

  const updateForm = (field: keyof TenantFormState, value: string) => {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      // Municipality fee defaults to 0 — staff enters manually only when applicable
      return next
    })
  }

  // Compute available units for the selected property in the add form
  const selectedProperty = properties.find(p => p.id === form.propertyId)
  const activeTenantsInProperty = selectedProperty
    ? (selectedProperty.tenants || []).filter(t => isFinanciallyActive(t.status)).length
    : 0
  const vacantCount = selectedProperty ? selectedProperty.totalUnits - activeTenantsInProperty : 0
  const occupiedUnitNumbers = selectedProperty
    ? (selectedProperty.tenants || []).filter(t => isFinanciallyActive(t.status) && t.unitNumber).map(t => t.unitNumber!)
    : []
  const isPropertyFull = selectedProperty ? activeTenantsInProperty >= selectedProperty.totalUnits : false
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()

  const activeCount = tenants.filter(t => isFinanciallyActive(t.status)).length

  const filtered = tenants.filter(t => {
    const name = getNameByLang(t, language).toLowerCase()
    const searchLower = search.toLowerCase()

    let matchesSearch: boolean
    if (searchScope === 'property') {
      // Search by property/building name
      const propName = t.property ? getNameByLang(t.property, language).toLowerCase() : ''
      matchesSearch = !!(
        propName.includes(searchLower) ||
        (t.property?.nameAr && t.property.nameAr.includes(search)) ||
        (t.property?.nameBn && t.property.nameBn.includes(search)) ||
        (t.property?.nameUr && t.property.nameUr.includes(search))
      )
    } else {
      // Default: search by tenant name (preserves existing behavior)
      matchesSearch = !!(
        name.includes(searchLower) ||
        (t.nameAr && t.nameAr.includes(search)) ||
        (t.nameBn && t.nameBn.includes(search)) ||
        (t.nameUr && t.nameUr.includes(search)) ||
        t.unitNumber?.toLowerCase().includes(searchLower) ||
        t.phone.includes(search) ||
        (t.emiratesId && t.emiratesId.includes(search))
      )
    }

    const matchesStatus = statusFilter === 'all' || t.status === statusFilter
    return matchesSearch && matchesStatus
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('tenants', language)}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {activeCount} {t('activeTenants', language).toLowerCase()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isPrivileged && (
            <Button onClick={openGroupDialog} variant="outline" className="border-indigo-300 text-indigo-700 hover:bg-indigo-50">
              <Users className="w-4 h-4 mr-2" />
              {t('manageGroups', language)}
            </Button>
          )}
          <Button onClick={openNew} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="w-4 h-4 mr-2" />
            {t('addTenant', language)}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={searchScope === 'property' ? t('searchByProperty', language) : t('searchTenants', language)}
            className="pl-9"
          />
        </div>
        <Select value={searchScope} onValueChange={(v) => { setSearchScope(v as 'tenant' | 'property'); setSearch('') }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tenant">{t('tenantName', language)}</SelectItem>
            <SelectItem value="property">{t('propertyName', language)}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allStatus', language)}</SelectItem>
            <SelectItem value="active">{t('active', language)}</SelectItem>
            <SelectItem value="inactive">{t('inactive2', language)}</SelectItem>
            <SelectItem value="evicted">{t('evicted', language)}</SelectItem>
            <SelectItem value="notice">{t('notice', language)}</SelectItem>
            <SelectItem value="moved_out">{t('movedOut', language)}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tenants Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('tenantName', language)}</TableHead>
                  <TableHead>{t('propertyUnit', language)}</TableHead>
                  <TableHead>{t('rent', language)}</TableHead>
                  <TableHead>{t('tenantScore', language)}</TableHead>
                  <TableHead>{t('status', language)}</TableHead>
                  <TableHead>{t('lastPayment', language)}</TableHead>
                  <TableHead className="text-right">{t('actions', language)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((tenant) => {
                  const payments = tenant.payments || []
                  const lastPayment = payments.length > 0 ? payments[0] : null
                  const currentMonthPaid = payments.some(p => p.month === currentMonth && p.year === currentYear)
                  const isExpanded = expandedTenant === tenant.id
                  const displayName = getNameByLang(tenant, language)

                  return (
                    <>
                      <TableRow
                        key={tenant.id}
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() => openProfile(tenant)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="w-9 h-9">
                              <AvatarFallback className={cn2(
                                'text-xs font-semibold',
                                tenant.tenantScore >= 80 ? 'bg-emerald-100 text-emerald-700' :
                                tenant.tenantScore >= 60 ? 'bg-blue-100 text-blue-700' :
                                tenant.tenantScore >= 40 ? 'bg-amber-100 text-amber-700' :
                                'bg-red-100 text-red-700'
                              )}>
                                {displayName.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="font-medium text-sm truncate">{displayName}</p>
                                {tenant.legalCase && (
                                  <Badge className="text-[10px] bg-red-100 text-red-700 border border-red-200 hover:bg-red-100 px-1.5 py-0 shrink-0">
                                    <AlertTriangle className="w-3 h-3 mr-0.5" />
                                    LEGAL
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">{tenant.phone}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{getNameByLang(tenant.property || { name: '—' }, language)}</p>
                          <p className="text-xs text-muted-foreground">
                            {tenant.unitNumber || '—'}
                            {tenant.unitType ? ` · ${getUnitTypeLabel(tenant.unitType, language)}` : ''}
                          </p>
                        </TableCell>
                        <TableCell className="font-semibold text-sm">{formatAED(tenant.rentAmount)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge className={cn2('text-xs font-bold px-2 py-0.5', getTenantScoreColor(tenant.tenantScore))}>
                              {tenant.tenantScore}
                            </Badge>
                            {tenant.latePaymentCount > 0 && (
                              <Badge variant="outline" className="text-xs border-red-300 text-red-600 px-1.5 py-0.5">
                                <AlertTriangle className="w-3 h-3 mr-0.5" />
                                {tenant.latePaymentCount}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn2('text-xs', getStatusColor(tenant.status))}>
                            {getStatusLabel(tenant.status, language)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {lastPayment ? (
                            <div>
                              <p className="text-sm">{formatAED(lastPayment.amount)}</p>
                              <p className="text-xs text-muted-foreground">
                                {lastPayment.isLate && (
                                  <span className="text-red-500 mr-1">⚠</span>
                                )}
                                {formatDate(lastPayment.date)}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">{t('noPayments', language)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                            {isFinanciallyActive(tenant.status) && !currentMonthPaid && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setWhatsappTargetTenant(tenant); setWhatsappRemindAll(false); setWhatsappLangDialogOpen(true) }}
                                className="p-1.5 rounded hover:bg-green-50 text-green-600"
                                title={t('sendWhatsAppReminder', language)}
                              >
                                <MessageCircle className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); openEdit(tenant) }}
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                              style={{ display: isPrivileged ? undefined : 'none' }}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {isPrivileged && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleMoveOut(tenant.id) }}
                                className="p-1.5 rounded hover:bg-amber-50 text-muted-foreground hover:text-amber-600"
                                title={t('moveOutTenant', language)}
                              >
                                <LogOut className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); setExpandedTenant(isExpanded ? null : tenant.id) }}
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* Expanded payment history */}
                      {isExpanded && (
                        <TableRow key={`${tenant.id}-expanded`}>
                          <TableCell colSpan={7} className="bg-muted/20 p-4">
                            <h4 className="font-semibold text-sm mb-3">{t('paymentHistory', language)}</h4>
                            {payments.length === 0 ? (
                              <p className="text-xs text-muted-foreground">{t('noPayments', language)}</p>
                            ) : (
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                                {payments.slice(0, 24).map(p => (
                                  <div key={p.id} className={cn2(
                                    'rounded-lg p-2 border text-sm',
                                    p.isLate ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'
                                  )}>
                                    <div className="flex justify-between items-center">
                                      <span className="font-medium">{formatAED(p.amount)}</span>
                                      {p.isLate && (
                                        <Badge variant="outline" className="text-[10px] border-red-300 text-red-600 px-1 py-0">
                                          {t('late', language)}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="flex justify-between items-center mt-1">
                                      <span className="text-xs text-muted-foreground">{formatDate(p.date)}</span>
                                      {p.method && (
                                        <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                          {getPaymentMethodLabel(p.method, language)}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          {filtered.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              {t('noTenantsFound', language)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===================== TENANT PROFILE DIALOG ===================== */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {profileTenant && (
                <>
                  <Avatar className="w-10 h-10">
                    <AvatarFallback className={cn2(
                      'text-sm font-semibold',
                      profileTenant.tenantScore >= 80 ? 'bg-emerald-100 text-emerald-700' :
                      profileTenant.tenantScore >= 60 ? 'bg-blue-100 text-blue-700' :
                      profileTenant.tenantScore >= 40 ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    )}>
                      {getNameByLang(profileTenant, language).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p>{t('tenantProfile', language)}</p>
                      {profileTenant.legalCase && (
                        <Badge className="text-[10px] bg-red-100 text-red-700 border border-red-200 hover:bg-red-100 px-1.5 py-0">
                          <AlertTriangle className="w-3 h-3 mr-0.5" />
                          {t('legalCase', language)}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-normal text-muted-foreground truncate">
                      {getNameByLang(profileTenant, language)}
                    </p>
                  </div>
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {profileTenant && (
            <ScrollArea className="max-h-[70vh] pr-1">
              <div className="space-y-5 pb-4">
                {/* Legal Case Alert Banner */}
                {profileTenant.legalCase && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">{t('legalCase', language)}</p>
                      {profileTenant.legalCaseNumber && (
                        <p className="text-xs text-red-700">{t('legalCaseNumber', language)}: {profileTenant.legalCaseNumber}</p>
                      )}
                      {profileTenant.legalCaseNotes && (
                        <p className="text-xs text-red-600 mt-0.5">{profileTenant.legalCaseNotes}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Score & Late Payments */}
                <div className="space-y-3">
                  <div className="flex gap-3 flex-wrap">
                    {/* Tenant Score */}
                    <div className={cn2(
                      'flex items-center gap-2 rounded-lg px-4 py-2',
                      profileTenant.tenantScore >= 80 ? 'bg-emerald-50 border border-emerald-200' :
                      profileTenant.tenantScore >= 60 ? 'bg-blue-50 border border-blue-200' :
                      profileTenant.tenantScore >= 40 ? 'bg-amber-50 border border-amber-200' :
                      'bg-red-50 border border-red-200'
                    )}>
                      <Star className={cn2(
                        'w-5 h-5',
                        profileTenant.tenantScore >= 80 ? 'text-emerald-600' :
                        profileTenant.tenantScore >= 60 ? 'text-blue-600' :
                        profileTenant.tenantScore >= 40 ? 'text-amber-600' :
                        'text-red-600'
                      )} />
                      <div>
                        <p className="text-xs text-muted-foreground">{t('tenantScore', language)}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xl font-bold">{profileTenant.tenantScore}</span>
                          <Badge className={cn2('text-xs', getTenantScoreColor(profileTenant.tenantScore))}>
                            {getTenantScoreLabel(profileTenant.tenantScore, language)}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {/* Late Payments */}
                    <div className={cn2(
                      'flex items-center gap-2 rounded-lg px-4 py-2',
                      profileTenant.latePaymentCount > 0
                        ? 'bg-red-50 border border-red-200'
                        : 'bg-emerald-50 border border-emerald-200'
                    )}>
                      <Clock className={cn2(
                        'w-5 h-5',
                        profileTenant.latePaymentCount > 0 ? 'text-red-600' : 'text-emerald-600'
                      )} />
                      <div>
                        <p className="text-xs text-muted-foreground">{t('latePayments', language)}</p>
                        <span className={cn2(
                          'text-xl font-bold',
                          profileTenant.latePaymentCount > 0 ? 'text-red-600' : 'text-emerald-600'
                        )}>
                          {profileTenant.latePaymentCount}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  {isPrivileged && (
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 h-7"
                        onClick={() => { openEdit(profileTenant); setProfileOpen(false) }}
                      >
                        <Pencil className="w-3 h-3 mr-1" />
                        {t('editTenant', language)}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs border-blue-300 text-blue-700 hover:bg-blue-50 h-7"
                        onClick={() => { handleOpenAudit(profileTenant.id) }}
                      >
                        <FileText className="w-3 h-3 mr-1" />
                        {t('viewAuditTrail', language)}
                      </Button>
                      {profileTenant.manualScoreOverride !== null && profileTenant.manualScoreOverride !== undefined ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs border-gray-300 text-gray-700 hover:bg-gray-50 h-7"
                          onClick={() => { handleResetScore(profileTenant.id) }}
                        >
                          <Star className="w-3 h-3 mr-1" />
                          {t('resetToSystemScore', language)}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs border-purple-300 text-purple-700 hover:bg-purple-50 h-7"
                          onClick={() => {
                            setOverrideScore(String(profileTenant.tenantScore))
                            setOverrideReason('')
                            setOverrideDialogOpen(true)
                          }}
                        >
                          <Star className="w-3 h-3 mr-1" />
                          {t('overrideScore', language)}
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Personal Information */}
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-600" />
                    {t('personalInfo', language)}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <ProfileField label={t('tenantName', language)} value={getNameByLang(profileTenant, language)} />
                    {profileTenant.emiratesId && (
                      <ProfileField label={t('emiratesId', language)} value={profileTenant.emiratesId} icon={<Shield className="w-3.5 h-3.5" />} />
                    )}
                    {profileTenant.nationality && (
                      <ProfileField label={t('nationality', language)} value={profileTenant.nationality} />
                    )}
                    {profileTenant.employer && (
                      <ProfileField label={t('employer2', language)} value={profileTenant.employer} />
                    )}
                  </div>
                </div>

                <Separator />

                {/* Contact Information */}
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Phone className="w-4 h-4 text-emerald-600" />
                    {t('contactInfo', language)}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <ProfileField label={t('phone', language)} value={profileTenant.phone} icon={<Phone className="w-3.5 h-3.5" />} />
                    {profileTenant.whatsapp && (
                      <ProfileField
                        label={t('whatsapp', language)}
                        value={profileTenant.whatsapp}
                        icon={<MessageCircle className="w-3.5 h-3.5 text-green-500" />}
                      />
                    )}
                    {profileTenant.email && (
                      <ProfileField label={t('email', language)} value={profileTenant.email} icon={<Mail className="w-3.5 h-3.5" />} />
                    )}
                    {profileTenant.emergencyContact && (
                      <ProfileField label={t('emergencyContact', language)} value={profileTenant.emergencyContact} icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-500" />} />
                    )}
                  </div>
                </div>

                <Separator />

                {/* Lease & Property Information */}
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Building className="w-4 h-4 text-emerald-600" />
                    {t('leaseInfo', language)}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <ProfileField
                      label={t('building', language)}
                      value={profileTenant.property ? getNameByLang(profileTenant.property, language) : '—'}
                      icon={<MapPin className="w-3.5 h-3.5" />}
                    />
                    <ProfileField label={t('unitNumber', language)} value={profileTenant.unitNumber || '—'} />
                    {profileTenant.unitType && (
                      <ProfileField label={t('unitType', language)} value={getUnitTypeLabel(profileTenant.unitType, language)} />
                    )}
                    {profileTenant.floor != null && (
                      <ProfileField label={t('floor2', language)} value={String(profileTenant.floor)} />
                    )}
                    {profileTenant.sizeSqft != null && (
                      <ProfileField label={t('sizeSqft', language)} value={`${profileTenant.sizeSqft} sqft`} icon={<Ruler className="w-3.5 h-3.5" />} />
                    )}
                    {profileTenant.leaseStart && (
                      <ProfileField label={t('leaseStart', language)} value={formatDate(profileTenant.leaseStart)} icon={<Clock className="w-3.5 h-3.5" />} />
                    )}
                    {profileTenant.leaseEnd && (
                      <ProfileField label={t('leaseEnd', language)} value={formatDate(profileTenant.leaseEnd)} />
                    )}
                    {profileTenant.contractDuration != null && (
                      <ProfileField label={t('contractDuration', language)} value={`${profileTenant.contractDuration} ${t('months', language)}`} icon={<FileText className="w-3.5 h-3.5" />} />
                    )}
                  </div>
                </div>

                <Separator />

                {/* Financial Information */}
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-emerald-600" />
                    {t('financialInfo', language)}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <ProfileField label={t('monthlyRent', language)} value={formatAED(profileTenant.rentAmount)} />
                    {profileTenant.municipalityFee != null && (
                      <ProfileField label={t('municipalityFee', language)} value={formatAED(profileTenant.municipalityFee)} />
                    )}
                    {isPrivileged && profileTenant.securityDeposit != null && (
                      <ProfileField label={t('securityDeposit', language)} value={formatAED(profileTenant.securityDeposit)} />
                    )}
                    {profileTenant.paymentMethod && (
                      <ProfileField label={t('paymentMethod', language)} value={getPaymentMethodLabel(profileTenant.paymentMethod, language)} />
                    )}
                    {isPrivileged && (
                      <ProfileField label={t('openingBalance', language)} value={formatAED(profileTenant.openingBalance || 0)} />
                    )}
                    {isPrivileged && (
                      <ProfileField label={t('creditBalance', language)} value={formatAED(profileTenant.creditBalance || 0)} />
                    )}
                  </div>
                </div>

                {/* Legal Information */}
                {isPrivileged && (profileTenant.legalCase || profileTenant.legalCaseNumber || profileTenant.legalCaseNotes) && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                        <Shield className="w-4 h-4 text-emerald-600" />
                        {t('legalInfo', language)}
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                        <ProfileField
                          label={t('legalCase', language)}
                          value={profileTenant.legalCase ? t('yes', language) : t('no', language)}
                          icon={profileTenant.legalCase ? <AlertTriangle className="w-3.5 h-3.5 text-red-500" /> : undefined}
                        />
                        {profileTenant.legalCaseNumber && (
                          <ProfileField label={t('legalCaseNumber', language)} value={profileTenant.legalCaseNumber} />
                        )}
                        {profileTenant.legalCaseNotes && (
                          <div className="col-span-2">
                            <ProfileField label={t('legalCaseNotes', language)} value={profileTenant.legalCaseNotes} />
                          </div>
                        )}
                      </div>
                      {profileTenant.legalCase && (
                        <Badge className="mt-2 text-xs bg-red-100 text-red-700 border border-red-200 hover:bg-red-100">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          {t('legalCase', language)}
                        </Badge>
                      )}
                    </div>
                  </>
                )}

                {/* Notes */}
                {profileTenant.notes && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="text-sm font-semibold mb-1">{t('notes', language)}</h3>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{profileTenant.notes}</p>
                    </div>
                  </>
                )}

                <Separator />

                {/* Payment History */}
                <div>
                  <h3 className="text-sm font-semibold mb-2">{t('paymentHistory', language)}</h3>
                  {(profileTenant.payments || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t('noPayments', language)}</p>
                  ) : (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                      {(profileTenant.payments || []).map(p => (
                        <div key={p.id} className={cn2(
                          'flex items-center justify-between rounded-md px-3 py-2 text-sm',
                          p.isLate ? 'bg-red-50' : 'bg-muted/50'
                        )}>
                          <div className="flex items-center gap-3">
                            <span className="font-medium">{formatAED(p.amount)}</span>
                            <span className="text-xs text-muted-foreground">{formatDate(p.date)}</span>
                            {p.method && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {getPaymentMethodLabel(p.method, language)}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {p.isLate && (
                              <Badge variant="outline" className="text-[10px] border-red-300 text-red-600 px-1.5 py-0">
                                {t('late', language)} {p.daysLate > 0 ? `(${p.daysLate}d)` : ''}
                              </Badge>
                            )}
                            {!p.isLate && (
                              <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-600 px-1.5 py-0">
                                {t('onTime', language)}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* WhatsApp Reminder Button */}
                {isFinanciallyActive(profileTenant.status) && (
                  <div className="pt-2">
                      <Button variant="outline" className="w-full border-green-300 text-green-700 hover:bg-green-50" onClick={() => { setWhatsappTargetTenant(profileTenant); setWhatsappRemindAll(false); setWhatsappLangDialogOpen(true) }}>
                        <MessageCircle className="w-4 h-4 mr-2" />
                        {t('sendWhatsAppReminder', language)}
                        <ExternalLink className="w-3.5 h-3.5 ml-2" />
                      </Button>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* ===================== ADD/EDIT TENANT DIALOG ===================== */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('editTenant', language) : t('addTenant', language)}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[70vh] pr-2">
            <div className="space-y-6 pb-4">
              {/* Name Fields - 4 Languages */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-600" />
                  {t('tenantName', language)}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('nameEnglish', language)} *</Label>
                    <Input value={form.name} onChange={e => updateForm('name', e.target.value)} placeholder="John Doe" />
                  </div>
                  <div>
                    <Label>{t('nameArabic', language)}</Label>
                    <Input value={form.nameAr} onChange={e => updateForm('nameAr', e.target.value)} dir="rtl" placeholder="جون دو" />
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('phone', language)} *</Label>
                    <Input value={form.phone} onChange={e => updateForm('phone', e.target.value)} placeholder="+971501234567" />
                  </div>
                  <div>
                    <Label>{t('whatsapp', language)}</Label>
                    <Input value={form.whatsapp} onChange={e => updateForm('whatsapp', e.target.value)} placeholder="+971501234567" />
                  </div>
                  <div>
                    <Label>{t('email', language)}</Label>
                    <Input value={form.email} onChange={e => updateForm('email', e.target.value)} type="email" placeholder="tenant@email.com" />
                  </div>
                  <div>
                    <Label>{t('emergencyContact', language)}</Label>
                    <Input value={form.emergencyContact} onChange={e => updateForm('emergencyContact', e.target.value)} placeholder="+971501234567" />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Personal Details */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-600" />
                  {t('personalInfo', language)}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('emiratesId', language)}</Label>
                    <Input value={form.emiratesId} onChange={e => updateForm('emiratesId', e.target.value)} placeholder="784-1990-1234567-1" />
                  </div>
                  <div>
                    <Label>{t('nationality', language)}</Label>
                    <Input value={form.nationality} onChange={e => updateForm('nationality', e.target.value)} placeholder="UAE, Indian, Pakistani..." />
                  </div>
                  <div>
                    <Label>{t('employer2', language)}</Label>
                    <Input value={form.employer} onChange={e => updateForm('employer', e.target.value)} placeholder="Company name" />
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Property Name - full width on mobile, left column on desktop */}
                  <div className="min-w-0">
                    <Label>{t('propertyName', language)} *</Label>
                    <Select value={form.propertyId} onValueChange={v => updateForm('propertyId', v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t('selectProperty', language)} />
                      </SelectTrigger>
                      <SelectContent>
                        {properties.filter(p => !p.archived).map(p => {
                          const activeCount = (p.tenants || []).filter(t => isFinanciallyActive(t.status)).length
                          const vacant = p.totalUnits - activeCount
                          return (
                            <SelectItem key={p.id} value={p.id}>
                              <span className="truncate">{getNameByLang(p, language)}</span>
                              <span className="ml-1 shrink-0 text-muted-foreground">({vacant > 0 ? `${t('vacantUnits', language)}: ${vacant}` : t('propertyFull', language)})</span>
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                    {/* Property capacity info */}
                    {form.propertyId && (() => {
                      const selProp = properties.find(p => p.id === form.propertyId)
                      if (!selProp) return null
                      const activeCount = (selProp.tenants || []).filter(t => isFinanciallyActive(t.status)).length
                      const vacant = selProp.totalUnits - activeCount
                      const isFull = activeCount >= selProp.totalUnits
                      return (
                        <div className={`mt-2 rounded-md px-3 py-2 text-xs ${isFull ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-700'}`}>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="shrink-0">{t('occupiedUnits2', language)}: {activeCount}/{selProp.totalUnits}</span>
                            <span className="shrink-0">{isFull ? t('propertyFull', language) : `${t('vacantUnits', language)}: ${vacant}`}</span>
                          </div>
                          {isFull && !editing && (
                            <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-red-200">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              <span className="font-medium">{t('propertyFullWarning', language)}</span>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                  {/* Unit Number - right column on desktop */}
                  <div className="min-w-0">
                    <Label>{t('unitNumber', language)}</Label>
                    <Input value={form.unitNumber} onChange={e => updateForm('unitNumber', e.target.value)} placeholder="Apt 201" />
                    {/* Show occupied units for reference */}
                    {form.propertyId && (() => {
                      const selProp = properties.find(p => p.id === form.propertyId)
                      if (!selProp) return null
                      const occupied = (selProp.tenants || []).filter(t => isFinanciallyActive(t.status) && t.unitNumber).map(t => t.unitNumber!)
                      if (occupied.length === 0) return null
                      return (
                        <div className="mt-1 flex flex-wrap gap-1 items-center">
                          <span className="text-[11px] text-muted-foreground">{t('occupiedUnits2', language)}:</span>
                          {occupied.map(u => (
                            <Badge key={u} variant="secondary" className="text-[10px] px-1.5 py-0 leading-4">{u}</Badge>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                  <div className="min-w-0">
                    <Label>{t('unitType', language)}</Label>
                    <Select value={form.unitType} onValueChange={v => updateForm('unitType', v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t('unitType', language)} />
                      </SelectTrigger>
                      <SelectContent>
                        {unitTypes.map(ut => (
                          <SelectItem key={ut} value={ut}>{getUnitTypeLabel(ut, language)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0">
                    <Label>{t('floor2', language)}</Label>
                    <Input type="number" value={form.floor} onChange={e => updateForm('floor', e.target.value)} placeholder="3" />
                  </div>
                  <div className="min-w-0">
                    <Label>{t('sizeSqft', language)}</Label>
                    <Input type="number" value={form.sizeSqft} onChange={e => updateForm('sizeSqft', e.target.value)} placeholder="850" />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Financial Information */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-600" />
                  {t('financialInfo', language)}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('monthlyRent', language)} *</Label>
                    <Input
                      type="number"
                      value={form.rentAmount}
                      onChange={e => updateForm('rentAmount', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>{t('municipalityFee', language)}</Label>
                    <Input
                      type="number"
                      value={form.municipalityFee}
                      onChange={e => updateForm('municipalityFee', e.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">{t('autoCalc', language)}</p>
                  </div>
                  {isPrivileged && (
                    <div>
                      <Label>{t('securityDeposit', language)}</Label>
                      <Input
                        type="number"
                        value={form.securityDeposit}
                        onChange={e => updateForm('securityDeposit', e.target.value)}
                      />
                    </div>
                  )}
                  <div>
                    <Label>{t('paymentMethod', language)}</Label>
                    <Select value={form.paymentMethod} onValueChange={v => updateForm('paymentMethod', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('paymentMethod', language)} />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentMethods.map(pm => (
                          <SelectItem key={pm} value={pm}>{getPaymentMethodLabel(pm, language)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Legal Information - Admin Only */}
              {isPrivileged && (
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-600" />
                    {t('legalInfo', language)}
                    <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 px-1.5 py-0">
                      {t('adminOnly', language)}
                    </Badge>
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>{t('legalCase', language)}</Label>
                      <Select value={form.legalCase} onValueChange={v => updateForm('legalCase', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="false">{t('no', language)}</SelectItem>
                          <SelectItem value="true">{t('yes', language)}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {form.legalCase === 'true' && (
                      <div>
                        <Label>{t('legalCaseNumber', language)}</Label>
                        <Input
                          value={form.legalCaseNumber}
                          onChange={e => updateForm('legalCaseNumber', e.target.value)}
                          placeholder="Case #"
                        />
                      </div>
                    )}
                    {form.legalCase === 'true' && (
                      <div className="col-span-2">
                        <Label>{t('legalCaseNotes', language)}</Label>
                        <Textarea
                          value={form.legalCaseNotes}
                          onChange={e => updateForm('legalCaseNotes', e.target.value)}
                          placeholder={t('legalCaseNotes', language)}
                          rows={2}
                        />
                      </div>
                    )}
                    <div>
                      <Label>{t('openingBalance', language)}</Label>
                      <Input
                        type="number"
                        value={form.openingBalance}
                        onChange={e => updateForm('openingBalance', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>{t('creditBalance', language)}</Label>
                      <Input
                        type="number"
                        value={form.creditBalance}
                        onChange={e => updateForm('creditBalance', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              <Separator />

              {/* Lease Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="min-w-0">
                  <Label>{t('leaseStart', language)}</Label>
                  <Input type="date" value={form.leaseStart} onChange={e => updateForm('leaseStart', e.target.value)} />
                </div>
                <div className="min-w-0">
                  <Label>{t('leaseEnd', language)}</Label>
                  <Input type="date" value={form.leaseEnd} onChange={e => updateForm('leaseEnd', e.target.value)} />
                </div>
                <div className="min-w-0">
                  <Label>{t('contractDuration', language)}</Label>
                  <Input type="number" value={form.contractDuration} onChange={e => updateForm('contractDuration', e.target.value)} placeholder="12" />
                </div>
                <div className="min-w-0">
                  <Label>{t('status', language)}</Label>
                  <Select value={form.status} onValueChange={v => updateForm('status', v)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {statusOptions.map(s => (
                        <SelectItem key={s} value={s}>{getStatusLabel(s, language)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <Label>{t('notes', language)}</Label>
                <Textarea
                  value={form.notes}
                  onChange={e => updateForm('notes', e.target.value)}
                  placeholder={t('notes', language)}
                  rows={3}
                />
              </div>

              {/* Score & Late Payments - Only when editing, only for privileged users */}
              {editing && isPrivileged && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <Star className="w-4 h-4 text-emerald-600" />
                      {t('tenantScore', language)} & {t('latePayments', language)}
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>{t('tenantScore', language)} (0-100)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={form.tenantScore}
                          onChange={e => updateForm('tenantScore', e.target.value)}
                          placeholder="100"
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {form.tenantScore !== '' && !isNaN(Number(form.tenantScore)) ? getTenantScoreLabel(Number(form.tenantScore), language) : ''}
                        </p>
                      </div>
                      <div>
                        <Label>{t('latePayments', language)}</Label>
                        <Input
                          type="number"
                          min={0}
                          value={form.latePaymentCount}
                          onChange={e => updateForm('latePaymentCount', e.target.value)}
                          placeholder="0"
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {t('latePaymentCountDesc', language)}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('cancel', language)}</Button>
            <Button
              onClick={handleSave}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!form.name || !form.phone || !form.propertyId || saving || (!editing && (() => { const sp = properties.find(p => p.id === form.propertyId); return sp ? (sp.tenants || []).filter(t => isFinanciallyActive(t.status)).length >= sp.totalUnits : false })())}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('save', language)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== WHATSAPP LANGUAGE SELECTION DIALOG ===================== */}
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
                  if (whatsappTargetTenant) {
                    window.open(getWhatsAppLink(whatsappTargetTenant.whatsapp || whatsappTargetTenant.phone, getNameByLang(whatsappTargetTenant, language), whatsappTargetTenant.rentAmount, currentMonth, currentYear, 'ar'), '_blank')
                  }
                  setWhatsappLangDialogOpen(false)
                }}
              >
                {t('sendArabic', language)}
              </Button>
              <Button
                className="w-full justify-start bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => {
                  if (whatsappTargetTenant) {
                    window.open(getWhatsAppLink(whatsappTargetTenant.whatsapp || whatsappTargetTenant.phone, getNameByLang(whatsappTargetTenant, language), whatsappTargetTenant.rentAmount, currentMonth, currentYear, 'en'), '_blank')
                  }
                  setWhatsappLangDialogOpen(false)
                }}
              >
                {t('sendEnglish', language)}
              </Button>
              <Button
                className="w-full justify-start bg-teal-600 hover:bg-teal-700 text-white"
                onClick={() => {
                  if (whatsappTargetTenant) {
                    window.open(getWhatsAppLink(whatsappTargetTenant.whatsapp || whatsappTargetTenant.phone, getNameByLang(whatsappTargetTenant, language), whatsappTargetTenant.rentAmount, currentMonth, currentYear, 'ur'), '_blank')
                  }
                  setWhatsappLangDialogOpen(false)
                }}
              >
                {t('sendUrdu', language)}
              </Button>
              <Button
                className="w-full justify-start bg-orange-500 hover:bg-orange-600 text-white"
                onClick={() => {
                  if (whatsappTargetTenant) {
                    window.open(getWhatsAppLink(whatsappTargetTenant.whatsapp || whatsappTargetTenant.phone, getNameByLang(whatsappTargetTenant, language), whatsappTargetTenant.rentAmount, currentMonth, currentYear, 'hi'), '_blank')
                  }
                  setWhatsappLangDialogOpen(false)
                }}
              >
                {t('sendHindi', language)}
              </Button>
              <Button
                className="w-full justify-start bg-purple-600 hover:bg-purple-700 text-white"
                onClick={() => {
                  if (whatsappTargetTenant) {
                    window.open(getWhatsAppLink(whatsappTargetTenant.whatsapp || whatsappTargetTenant.phone, getNameByLang(whatsappTargetTenant, language), whatsappTargetTenant.rentAmount, currentMonth, currentYear, 'bn'), '_blank')
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

      {/* ===================== SCORE OVERRIDE DIALOG ===================== */}
      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="w-5 h-5 text-purple-600" />
              {t('overrideScore', language)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>{t('tenantScore', language)} (0-100)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={overrideScore}
                onChange={e => setOverrideScore(e.target.value)}
                placeholder="0"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                {overrideScore !== '' && !isNaN(Number(overrideScore))
                  ? getTenantScoreLabel(Number(overrideScore), language)
                  : ''}
              </p>
            </div>
            <div>
              <Label>{t('overrideReason', language)} *</Label>
              <Textarea
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                placeholder={t('overrideReasonPlaceholder', language)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialogOpen(false)}>{t('cancel', language)}</Button>
            <Button
              onClick={handleOverrideScore}
              className="bg-purple-600 hover:bg-purple-700 text-white"
              disabled={overrideSaving || overrideScore === '' || isNaN(Number(overrideScore)) || !overrideReason.trim()}
            >
              {overrideSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('overrideScore', language)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== SCORE AUDIT TRAIL DIALOG ===================== */}
      <Dialog open={auditDialogOpen} onOpenChange={setAuditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              {t('scoreAuditTrail', language)}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-1">
            {loadingAudit ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {t('noScoreHistory', language)}
              </div>
            ) : (
              <div className="space-y-3 pb-4">
                {auditLogs.map((log: any) => {
                  const changeTypeLabel = log.changeType === 'MANUAL_OVERRIDE'
                    ? t('manualOverrideAction', language)
                    : log.changeType === 'RESET_TO_SYSTEM'
                      ? t('resetToSystem', language)
                      : t('systemCalculated', language)
                  const changeTypeColor = log.changeType === 'MANUAL_OVERRIDE'
                    ? 'border-purple-300 text-purple-700 bg-purple-50'
                    : log.changeType === 'RESET_TO_SYSTEM'
                      ? 'border-gray-300 text-gray-700 bg-gray-50'
                      : 'border-emerald-300 text-emerald-700 bg-emerald-50'

                  return (
                    <div key={log.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className={cn2('text-[10px] px-2 py-0.5', changeTypeColor)}>
                          {changeTypeLabel}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(log.createdAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">{t('previousScore', language)}</p>
                          <Badge className={cn2('text-sm', getTenantScoreColor(log.previousScore))}>
                            {log.previousScore}
                          </Badge>
                        </div>
                        <span className="text-muted-foreground">→</span>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">{t('newScore', language)}</p>
                          <Badge className={cn2('text-sm', getTenantScoreColor(log.newScore))}>
                            {log.newScore}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium">{t('changedBy', language)}:</span> {log.changedBy}
                      </div>
                      {log.reason && (
                        <div className="text-xs bg-muted/50 rounded p-2">
                          <span className="font-medium">{t('overrideReason', language)}:</span> {log.reason}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* ── MANAGE GROUPS DIALOG ── */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              {t('manageGroups', language)}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {language === 'ar' ? 'إنشاء مجموعة تربط عدة مستأجرين تحت حساب واحد (مثل حساب RES)' :
               language === 'bn' ? 'একাধিক ভাড়াটিয়াকে একটি অ্যাকাউন্টে যুক্ত করে গ্রুপ তৈরি করুন (যেমন RES অ্যাকাউন্ট)' :
               language === 'ur' ? 'متعدد کرایہ داروں کو ایک اکاؤنٹ میں جوڑ کر گروپ بنائیں (جیسے RES اکاؤنٹ)' :
               'Create a group linking multiple tenants under one account (like the RES Account)'}
            </p>
          </DialogHeader>

          <ScrollArea className="max-h-[70vh] pr-2">
            <div className="space-y-5 pb-4">
              {/* Existing groups list */}
              {tenantGroups.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-600" />
                    {t('linkedToGroup', language)} ({tenantGroups.length})
                  </h3>
                  <div className="space-y-2">
                    {tenantGroups.map((g: any) => {
                      const memberCount = (g.tenants?.length || 0) + (g.reservations?.length || 0)
                      const prop = properties.find(p => p.id === g.propertyId)
                      return (
                        <div key={g.id} className="border rounded-lg p-3 bg-indigo-50/30">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{g.name}</span>
                                <Badge variant="outline" className="text-[10px] border-indigo-300 text-indigo-700">
                                  {memberCount} {language === 'ar' ? 'أعضاء' : language === 'bn' ? 'সদস্য' : language === 'ur' ? 'ممبران' : 'members'}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {prop ? getNameByLang(prop, language) : '—'}
                                {g.tenants && g.tenants.length > 0 && (
                                  <span className="ml-2">
                                    · {language === 'ar' ? 'الوحدات' : language === 'bn' ? 'ইউনিট' : language === 'ur' ? 'یونٹس' : 'Units'}: {g.tenants.map((t: any) => t.unitNumber).filter(Boolean).join(', ')}
                                  </span>
                                )}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-300 text-red-600 hover:bg-red-50"
                              onClick={() => handleDissolveTenantGroup(g.id)}
                            >
                              <Trash2 className="w-3 h-3 mr-1" />
                              {t('dissolveGroup', language)}
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <Separator />

              {/* Create new group */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-indigo-600" />
                  {t('createNewGroup', language)}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('groupAccountName', language)} *</Label>
                    <Input
                      value={groupForm.groupName}
                      onChange={e => setGroupForm(prev => ({ ...prev, groupName: e.target.value }))}
                      placeholder={t('groupAccountNamePlaceholder', language)}
                    />
                  </div>
                  <div>
                    <Label>{t('nameArabic', language)}</Label>
                    <Input
                      value={groupForm.groupNameAr}
                      onChange={e => setGroupForm(prev => ({ ...prev, groupNameAr: e.target.value }))}
                      dir="rtl"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <Label>{t('propertyName', language)} *</Label>
                  <Select
                    value={groupForm.propertyId}
                    onValueChange={v => setGroupForm(prev => ({ ...prev, propertyId: v, selectedTenantIds: [] }))}
                  >
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

                {/* Tenant multi-select (checkbox list) */}
                {groupForm.propertyId && (
                  <div className="mt-3">
                    <Label>{t('groupMembers', language)} * ({groupForm.selectedTenantIds.length} {language === 'ar' ? 'محدد' : language === 'bn' ? 'নির্বাচিত' : language === 'ur' ? 'منتخب' : 'selected'})</Label>
                    <div className="border rounded-md max-h-60 overflow-y-auto mt-1">
                      {tenants
                        .filter(tn => tn.propertyId === groupForm.propertyId && !tn.groupId && tn.status === 'active')
                        .map(tn => (
                          <label key={tn.id} className="flex items-center gap-3 p-2 hover:bg-muted/50 cursor-pointer border-b last:border-b-0">
                            <input
                              type="checkbox"
                              checked={groupForm.selectedTenantIds.includes(tn.id)}
                              onChange={e => {
                                setGroupForm(prev => ({
                                  ...prev,
                                  selectedTenantIds: e.target.checked
                                    ? [...prev.selectedTenantIds, tn.id]
                                    : prev.selectedTenantIds.filter(id => id !== tn.id),
                                }))
                              }}
                              className="w-4 h-4"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{getNameByLang(tn, language)}</p>
                              <p className="text-xs text-muted-foreground">
                                {t('unitNumber', language)}: {tn.unitNumber || '—'} · {formatAED(tn.rentAmount)}
                              </p>
                            </div>
                          </label>
                        ))
                      }
                      {tenants.filter(tn => tn.propertyId === groupForm.propertyId && !tn.groupId && tn.status === 'active').length === 0 && (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          {language === 'ar' ? 'لا يوجد مستأجرون متاحون' :
                           language === 'bn' ? 'কোনো উপলভ্য ভাড়াটিয়া নেই' :
                           language === 'ur' ? 'کوئی دستیاب کرایہ دار نہیں' :
                           'No available tenants (all are already grouped or inactive)'}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-3">
                  <Label>{t('notes', language)}</Label>
                  <Textarea
                    value={groupForm.notes}
                    onChange={e => setGroupForm(prev => ({ ...prev, notes: e.target.value }))}
                    rows={2}
                  />
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>{t('cancel', language)}</Button>
            <Button
              onClick={handleCreateTenantGroup}
              disabled={!groupForm.groupName || !groupForm.propertyId || groupForm.selectedTenantIds.length < 2 || groupSaving}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {groupSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Users className="w-4 h-4 mr-2" />}
              {t('createNewGroup', language)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ---------- Small helper component for profile fields ---------- */
function ProfileField({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </span>
      <span className="font-medium break-words">{value}</span>
    </div>
  )
}
