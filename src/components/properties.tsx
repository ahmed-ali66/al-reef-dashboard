'use client'

import { useEffect, useState, useCallback } from 'react'
import type { PropertyData } from '@/lib/types'
import { useAppStore, isOwnerOrAdmin } from '@/lib/store'
import { useDataStore } from '@/lib/data-store'
import { formatAED, cn2, isFinanciallyActive } from '@/lib/utils'
import { t, getPropertyTypeLabel, getNameByLang, type Language } from '@/lib/i18n'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Building2, Plus, Pencil, Trash2, Users, Loader2, Archive, ArchiveRestore } from 'lucide-react'
import { calculateEffectivePaymentsReceived } from '@/lib/financial-utils'

export default function Properties() {
  const { language, authUser, setCurrentPage, setSelectedPropertyId } = useAppStore()
  const [properties, setProperties] = useState<PropertyData[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PropertyData | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [form, setForm] = useState({
    name: '',
    nameAr: '',
    nameBn: '',
    nameUr: '',
    type: 'apartment',
    address: '',
    totalUnits: 1,
    floors: 1,
  })

  const canSeeRevenue = isOwnerOrAdmin(authUser?.role || '')
  const canCreate = true // All authenticated users can create properties
  const canModify = isOwnerOrAdmin(authUser?.role || '') // Only owner/admin can edit/archive/delete

  const fetchProperties = useCallback(() => {
    try {
      const data = useDataStore.getState().getPropertiesWithTenants(showArchived)
      setProperties(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [showArchived])

  useEffect(() => { fetchProperties() }, [fetchProperties])

  const openNew = () => {
    setEditing(null)
    setForm({ name: '', nameAr: '', nameBn: '', nameUr: '', type: 'apartment', address: '', totalUnits: 1, floors: 1 })
    setDialogOpen(true)
  }

  const openEdit = (p: PropertyData) => {
    setEditing(p)
    setForm({
      name: p.name,
      nameAr: p.nameAr || '',
      nameBn: p.nameBn || '',
      nameUr: p.nameUr || '',
      type: p.type,
      address: p.address || '',
      totalUnits: p.totalUnits,
      floors: p.floors || 1,
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    const body = { ...form, totalUnits: Number(form.totalUnits), floors: Number(form.floors) }
    try {
      if (editing) {
        await useDataStore.getState().updateProperty(editing.id, body)
      } else {
        await useDataStore.getState().addProperty(body)
      }
      setDialogOpen(false)
      fetchProperties()
    } catch (error: any) {
      alert(error.message || 'Failed to save property')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('deleteProperty', language))) return
    try {
      await useDataStore.getState().deleteProperty(id)
      fetchProperties()
    } catch (error: any) {
      alert(error.message || 'Failed to delete property')
    }
  }

  const handleArchive = async (id: string, archived: boolean) => {
    try {
      await useDataStore.getState().archiveProperty(id, archived)
      fetchProperties()
    } catch (error: any) {
      alert(error.message || 'Failed to archive property')
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-emerald" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('properties', language)}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {properties.length} {t('propertiesManaged', language)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showArchived ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowArchived(!showArchived)}
            className={showArchived ? 'bg-gray-600 hover:bg-gray-700 text-white' : ''}
          >
            <Archive className="w-4 h-4 mr-1" />
            {t('archiveProperty', language)}
          </Button>
          <Button onClick={openNew} className="bg-emerald hover:bg-emerald/90 text-white">
            <Plus className="w-4 h-4 mr-2" />
            {t('addProperty', language)}
          </Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
        {properties.map((p) => {
          const activeTenantList = (p.tenants || []).filter(t => isFinanciallyActive(t.status))
          const activeTenants = activeTenantList.length
          const occupancy = p.totalUnits > 0 ? Math.round((activeTenants / p.totalUnits) * 100) : 0
          const totalRent = activeTenantList.reduce((s, t) => s + t.rentAmount, 0)

          // Calculate collected and outstanding for the current month
          const now = new Date()
          const currentMonth = now.getMonth() + 1
          const currentYear = now.getFullYear()
          const collectedAmount = activeTenantList.reduce((s, tenant) => {
            // CRITICAL: Avoid double-counting ADVANCE_PAYMENT excess.
            // - HISTORICAL_DEBT reduces openingBalance (excluded here).
            // - ADVANCE_PAYMENT excess is mirrored into tenant.creditBalance when recorded.
            //   Use effective payments (advance capped at current charges) so the excess
            //   is only ever counted once — via creditBalance — across months.
            const monthPayments = (tenant.payments || []).filter(p => p.month === currentMonth && p.year === currentYear && p.allocationType !== 'HISTORICAL_DEBT')
            const effectivePaid = calculateEffectivePaymentsReceived(monthPayments, tenant.rentAmount, Number(tenant.municipalityFee) || 0, 0)
            const currentCharges = tenant.rentAmount + (Number(tenant.municipalityFee) || 0)
            return s + Math.min(effectivePaid, Math.max(0, currentCharges))
          }, 0)
          const outstandingAmount = Math.max(0, totalRent - collectedAmount)

          return (
            <Card key={p.id} className={cn2('property-card-hover cursor-pointer', p.archived && 'opacity-60')} onClick={() => { setSelectedPropertyId(p.id); setCurrentPage('property-collection') }}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald/10 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-emerald" />
                    </div>
                    <div>
                      <h3 className="font-semibold">
                        {getNameByLang(p, language)}
                      </h3>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Badge variant="secondary" className="text-xs">
                          {getPropertyTypeLabel(p.type, language)}
                        </Badge>
                        {p.archived && (
                          <Badge variant="outline" className="text-xs border-gray-400 text-gray-500">
                            {t('sellProperty', language)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    {canModify && (
                      <button onClick={() => handleArchive(p.id, !p.archived)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title={p.archived ? t('archiveProperty', language) : t('archiveProperty', language)}>
                        {p.archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    {canModify && (
                      <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canModify && (
                      <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {p.address && (
                  <p className="text-xs text-muted-foreground mb-3 truncate">{p.address}</p>
                )}

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-muted/50 rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">{t('units', language)}</p>
                    <p className="font-bold text-sm">{p.totalUnits}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">{t('tenantsCount', language)}</p>
                    <p className="font-bold text-sm">{activeTenants}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">{t('occupancy', language)}</p>
                    <p className="font-bold text-sm">{occupancy}%</p>
                  </div>
                </div>

                {canSeeRevenue && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{t('monthlyRevenue', language)}</span>
                      <span className="font-semibold text-sm text-emerald">{formatAED(totalRent)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-xs text-muted-foreground">{t('collected', language)}</span>
                      <span className="font-semibold text-sm text-emerald-600">{formatAED(collectedAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-xs text-muted-foreground">{t('outstanding', language)}</span>
                      <span className={`font-semibold text-sm ${outstandingAmount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatAED(outstandingAmount)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                      <div
                        className="bg-emerald h-1.5 rounded-full transition-all"
                        style={{ width: `${totalRent > 0 ? Math.round((collectedAmount / totalRent) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('editProperty', language) : t('addProperty', language)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('propertyName', language)}</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Al Reef Al Madeena - Building 1" />
            </div>
            <div>
              <Label>{t('nameArabic', language)}</Label>
              <Input value={form.nameAr} onChange={e => setForm({ ...form, nameAr: e.target.value })} placeholder="المبنى أ" dir="rtl" />
            </div>
            <div>
              <Label>{t('nameBengali', language)}</Label>
              <Input value={form.nameBn} onChange={e => setForm({ ...form, nameBn: e.target.value })} placeholder="বিল্ডিং এ" />
            </div>
            <div>
              <Label>{t('nameUrdu', language)}</Label>
              <Input value={form.nameUr} onChange={e => setForm({ ...form, nameUr: e.target.value })} placeholder="بلڈنگ اے" dir="rtl" />
            </div>
            <div>
              <Label>{t('propertyType', language)}</Label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="apartment">{t('apartment', language)}</SelectItem>
                  <SelectItem value="villa">{t('villa', language)}</SelectItem>
                  <SelectItem value="office">{t('office', language)}</SelectItem>
                  <SelectItem value="shop">{t('shop', language)}</SelectItem>
                  <SelectItem value="studio">{t('studio', language)}</SelectItem>
                  <SelectItem value="mixed_use">{t('mixedUse', language)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('address', language)}</Label>
              <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('totalUnitsCount', language)}</Label>
                <Input type="number" value={form.totalUnits} onChange={e => setForm({ ...form, totalUnits: parseInt(e.target.value) || 1 })} />
              </div>
              <div>
                <Label>{t('floors', language)}</Label>
                <Input type="number" value={form.floors} onChange={e => setForm({ ...form, floors: parseInt(e.target.value) || 1 })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('cancel', language)}</Button>
            <Button onClick={handleSave} className="bg-emerald hover:bg-emerald/90 text-white" disabled={!form.name}>
              {t('save', language)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
