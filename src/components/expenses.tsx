'use client'

import { useEffect, useState, useCallback } from 'react'
import type { ExpenseData, PropertyData } from '@/lib/types'
import { useAppStore, isOwnerOrAdmin } from '@/lib/store'
import { useDataStore } from '@/lib/data-store'
import { formatAED, formatDate, getCategoryIcon, cn2 } from '@/lib/utils'
import { t, getExpenseCategoryLabel, getMonthName, getNameByLang, type Language } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Receipt, Plus, Pencil, Trash2, TrendingDown, Loader2, ShieldAlert, ChevronLeft, ChevronRight, Calendar, CalendarDays } from 'lucide-react'

const EXPENSE_CATEGORIES = ['maintenance', 'utility', 'insurance', 'manpower', 'municipality', 'leasing', 'security', 'other'] as const

// Quick-pick preset descriptions for common recurring expenses.
// Clicking a preset pre-fills the description + category (and optionally the
// default amount) so users don't have to type these every time. The list can
// be extended freely — each entry is { label, category, defaultAmount? }.
const QUICK_DESCRIPTIONS: Array<{ label: string; category: string; defaultAmount?: number }> = [
  { label: 'Sienna Car Petrol', category: 'other', defaultAmount: 100 },
  { label: 'Mirage Car Petrol', category: 'other', defaultAmount: 100 },
]

type ViewMode = 'daily' | 'monthly'

export default function Expenses() {
  const { language, authUser } = useAppStore()
  const lang = language as Language
  const [expenses, setExpenses] = useState<ExpenseData[]>([])
  const [properties, setProperties] = useState<PropertyData[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ExpenseData | null>(null)
  const [form, setForm] = useState({
    category: 'maintenance', description: '', amount: 0,
    date: new Date().toISOString().split('T')[0],
    vendor: '', invoiceNumber: '', recurring: false, building: '',
  })

  // ─── Date Navigation State ───
  const now = new Date()
  const [viewMode, setViewMode] = useState<ViewMode>('daily')
  const [selectedDate, setSelectedDate] = useState(() => {
    // Default to today in UAE timezone
    const today = new Date()
    return today.toISOString().split('T')[0]
  })
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [totalCount, setTotalCount] = useState(0)

  // Access control: Owner/Admin have full access; Staff can view and create
  const canAccess = !!authUser
  const canModify = authUser && isOwnerOrAdmin(authUser.role)

  // ─── Server-side data fetching with date filters ───
  const fetchExpenses = useCallback(async () => {
    setLoading(true)
    try {
      const store = useDataStore.getState()
      // Sort properties A-Z by display name for the property dropdown
      const lang = language
      setProperties(
        store.getPropertiesWithTenants().sort((a, b) =>
          (getNameByLang(a, lang) || '').localeCompare(getNameByLang(b, lang) || '')
        )
      )

      // Build query params for server-side date filtering
      const params = new URLSearchParams()
      params.set('limit', '1000')

      if (viewMode === 'daily') {
        params.set('date', selectedDate)
      } else {
        params.set('month', String(selectedMonth))
        params.set('year', String(selectedYear))
      }

      if (categoryFilter !== 'all') {
        params.set('category', categoryFilter)
      }

      const res = await fetch(`/api/expenses?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        const expenseList = data.data || data || []
        setExpenses(Array.isArray(expenseList) ? expenseList : [])
        setTotalCount(data.pagination?.total || expenseList.length || 0)
      } else {
        // Fallback to local store if API fails
        setExpenses(store.expenses)
      }
    } catch (e) {
      console.error(e)
      // Fallback to local store
      try {
        const store = useDataStore.getState()
        setExpenses(store.expenses)
      } catch {}
    } finally {
      setLoading(false)
    }
  }, [viewMode, selectedDate, selectedMonth, selectedYear, categoryFilter])

  useEffect(() => { fetchExpenses() }, [fetchExpenses])

  // ─── Navigation handlers ───
  const goToPreviousDay = () => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() - 1)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  const goToNextDay = () => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + 1)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  const goToToday = () => {
    const today = new Date()
    setSelectedDate(today.toISOString().split('T')[0])
    setSelectedMonth(today.getMonth() + 1)
    setSelectedYear(today.getFullYear())
  }

  const goToPreviousMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12)
      setSelectedYear(y => y - 1)
    } else {
      setSelectedMonth(m => m - 1)
    }
  }

  const goToNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1)
      setSelectedYear(y => y + 1)
    } else {
      setSelectedMonth(m => m + 1)
    }
  }

  const openNew = () => {
    setEditing(null)
    setForm({
      category: 'maintenance', description: '', amount: 0,
      date: new Date().toISOString().split('T')[0],
      vendor: '', invoiceNumber: '', recurring: false, building: '',
    })
    setDialogOpen(true)
  }

  const openEdit = (e: ExpenseData) => {
    setEditing(e)
    setForm({
      category: e.category, description: e.description, amount: e.amount,
      date: new Date(e.date).toISOString().split('T')[0],
      vendor: e.vendor || '', invoiceNumber: e.invoiceNumber || '',
      recurring: e.recurring || false, building: e.building || '',
    })
    setDialogOpen(true)
  }

  const [savingExpense, setSavingExpense] = useState(false)

  const handleSave = async () => {
    if (savingExpense) return
    setSavingExpense(true)
    const store = useDataStore.getState()
    const body = {
      ...form,
      amount: Number(form.amount),
      vendor: form.vendor || null,
      invoiceNumber: form.invoiceNumber || null,
      recurring: form.recurring,
      building: form.building || null,
    }
    try {
      if (editing) {
        await store.updateExpense(editing.id, body)
      } else {
        await store.addExpense(body)
      }
      setDialogOpen(false)
      fetchExpenses()
    } catch (error) {
      console.error('Failed to save expense:', error)
      alert('Failed to save expense. Please try again.')
    } finally {
      setSavingExpense(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('deleteExpense', lang))) return
    try {
      await useDataStore.getState().deleteExpense(id)
      fetchExpenses()
    } catch (error) {
      console.error('Failed to delete expense:', error)
      alert('Failed to delete expense. Please try again.')
    }
  }

  // ─── Computed values ───
  const filtered = categoryFilter === 'all'
    ? expenses
    : expenses.filter(e => e.category === categoryFilter)

  const totalAmount = filtered.reduce((s, e) => s + e.amount, 0)

  const categoryTotals: Record<string, number> = {}
  for (const e of filtered) {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount
  }

  // Check if selected date is today
  const isToday = selectedDate === new Date().toISOString().split('T')[0]

  // Format the current context label
  const contextLabel = viewMode === 'daily'
    ? (isToday ? t('today', lang) : formatDate(selectedDate))
    : `${getMonthName(selectedMonth, lang)} ${selectedYear}`

  if (loading && expenses.length === 0) {
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

  // Staff users can create expenses but not edit/delete
  const showEditDelete = canModify

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('expenses', lang)}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {totalCount} {t('expensesCount', lang)}
          </p>
        </div>
        <Button onClick={openNew} className="bg-emerald hover:bg-emerald/90 text-white">
          <Plus className="w-4 h-4 mr-2" />
          {t('addExpense', lang)}
        </Button>
      </div>

      {/* ─── Date Navigation & View Toggle ─── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === 'daily' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('daily')}
                className={viewMode === 'daily' ? 'bg-emerald hover:bg-emerald/90 text-white' : ''}
              >
                <Calendar className="w-4 h-4 mr-1.5" />
                {t('dailyView', lang)}
              </Button>
              <Button
                variant={viewMode === 'monthly' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('monthly')}
                className={viewMode === 'monthly' ? 'bg-emerald hover:bg-emerald/90 text-white' : ''}
              >
                <CalendarDays className="w-4 h-4 mr-1.5" />
                {t('monthlyView', lang)}
              </Button>
            </div>

            {/* Date Navigation */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                {viewMode === 'daily' ? (
                  <>
                    <Button variant="ghost" size="icon" onClick={goToPreviousDay} title={t('previousDay', lang)}>
                      <ChevronLeft className="w-5 h-5" />
                    </Button>
                    <div className="flex items-center gap-2 min-w-[200px] justify-center">
                      <span className="text-lg font-bold">
                        {contextLabel}
                      </span>
                      {!isToday && (
                        <Button variant="outline" size="sm" onClick={goToToday} className="text-xs h-7 px-2 border-emerald text-emerald hover:bg-emerald/10">
                          {t('today', lang)}
                        </Button>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={goToNextDay} title={t('nextDay', lang)} disabled={isToday}>
                      <ChevronRight className="w-5 h-5" />
                    </Button>
                    <Input
                      type="date"
                      value={selectedDate}
                      onChange={e => setSelectedDate(e.target.value)}
                      className="w-[150px] text-sm"
                    />
                  </>
                ) : (
                  <>
                    <Button variant="ghost" size="icon" onClick={goToPreviousMonth}>
                      <ChevronLeft className="w-5 h-5" />
                    </Button>
                    <div className="flex items-center gap-2 min-w-[200px] justify-center">
                      <span className="text-lg font-bold">
                        {getMonthName(selectedMonth, lang)} {selectedYear}
                      </span>
                      {!(selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear()) && (
                        <Button variant="outline" size="sm" onClick={goToToday} className="text-xs h-7 px-2 border-emerald text-emerald hover:bg-emerald/10">
                          {t('today', lang)}
                        </Button>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={goToNextMonth} disabled={selectedMonth >= now.getMonth() + 1 && selectedYear >= now.getFullYear()}>
                      <ChevronRight className="w-5 h-5" />
                    </Button>
                    <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
                      <SelectTrigger className="w-[110px] text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[2024, 2025, 2026, 2027].map(y => (
                          <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>

              {/* Summary amount for current context */}
              <div className="text-right">
                <p className="text-xs text-muted-foreground">
                  {viewMode === 'daily' ? t('dayTotal', lang) : t('monthTotal', lang)}
                </p>
                <p className="text-2xl font-bold text-terracotta">{formatAED(totalAmount)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Category Breakdown Cards ─── */}
      {Object.keys(categoryTotals).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Object.entries(categoryTotals)
            .sort(([, a], [, b]) => b - a)
            .map(([cat, total]) => (
              <Card key={cat} className="card-hover">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">
                    {getCategoryIcon(cat)} {getExpenseCategoryLabel(cat, lang)}
                  </p>
                  <p className="text-lg font-bold mt-1">{formatAED(total)}</p>
                </CardContent>
              </Card>
            ))}
        </div>
      )}

      {/* ─── Category Filter ─── */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={categoryFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setCategoryFilter('all')}
          className={categoryFilter === 'all' ? 'bg-emerald hover:bg-emerald/90 text-white' : ''}
        >
          {t('all', lang)}
        </Button>
        {EXPENSE_CATEGORIES.map(c => (
          <Button
            key={c}
            variant={categoryFilter === c ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCategoryFilter(c)}
            className={categoryFilter === c ? 'bg-emerald hover:bg-emerald/90 text-white' : ''}
          >
            {getCategoryIcon(c)} {getExpenseCategoryLabel(c, lang)}
          </Button>
        ))}
      </div>

      {/* ─── Expense Table ─── */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('category', lang)}</TableHead>
                  <TableHead>{t('description', lang)}</TableHead>
                  <TableHead>{t('amount', lang)}</TableHead>
                  {viewMode === 'monthly' && <TableHead>{t('date', lang)}</TableHead>}
                  <TableHead>{t('vendor', lang)}</TableHead>
                  <TableHead>{t('invoiceNumber', lang)}</TableHead>
                  <TableHead>{t('recurring', lang)}</TableHead>
                  <TableHead className="text-right">{t('actions', lang)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(expense => (
                  <TableRow key={expense.id}>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {getCategoryIcon(expense.category)} {getExpenseCategoryLabel(expense.category, lang)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{expense.description}</TableCell>
                    <TableCell className="font-semibold text-sm text-terracotta">{formatAED(expense.amount)}</TableCell>
                    {viewMode === 'monthly' && (
                      <TableCell className="text-sm text-muted-foreground">{formatDate(expense.date)}</TableCell>
                    )}
                    <TableCell className="text-sm">{expense.vendor || '—'}</TableCell>
                    <TableCell className="text-sm">{expense.invoiceNumber || '—'}</TableCell>
                    <TableCell className="text-sm">
                      {expense.recurring ? (
                        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">{t('recurring', lang)}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t('oneTime', lang)}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {showEditDelete && (
                          <>
                            <button onClick={() => openEdit(expense)} className="p-1.5 rounded hover:bg-muted text-muted-foreground">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDelete(expense.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {filtered.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              {viewMode === 'daily' ? t('noExpensesDay', lang) : t('noExpensesMonth2', lang)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Add/Edit Dialog ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('editExpense', lang) : t('addExpense', lang)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('category', lang)}</Label>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{getCategoryIcon(cat)} {getExpenseCategoryLabel(cat, lang)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('description', lang)}</Label>
              <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              {/* Quick-pick preset descriptions for common recurring expenses */}
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="text-xs text-muted-foreground self-center">Quick:</span>
                {QUICK_DESCRIPTIONS.map(preset => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setForm({
                      ...form,
                      description: preset.label,
                      category: preset.category,
                      amount: preset.defaultAmount ?? form.amount,
                    })}
                    className={cn2(
                      'inline-flex items-center px-2.5 py-1 text-xs rounded-full border transition-colors',
                      form.description === preset.label
                        ? 'bg-emerald text-white border-emerald'
                        : 'bg-background text-muted-foreground border-input hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('amount', lang)}</Label>
                <Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} />
              </div>
              <div>
                <Label>{t('date', lang)}</Label>
                <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('vendor', lang)}</Label>
                <Input value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} placeholder={t('vendor', lang)} />
              </div>
              <div>
                <Label>{t('invoiceNumber', lang)}</Label>
                <Input value={form.invoiceNumber} onChange={e => setForm({ ...form, invoiceNumber: e.target.value })} placeholder={t('invoiceNumber', lang)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2 pt-6">
                <Checkbox
                  id="recurring"
                  checked={form.recurring}
                  onCheckedChange={(checked) => setForm({ ...form, recurring: !!checked })}
                />
                <Label htmlFor="recurring" className="cursor-pointer">{t('recurring', lang)}</Label>
              </div>
              <div>
                <Label>{t('building', lang)}</Label>
                <Select value={form.building} onValueChange={v => setForm({ ...form, building: v })}>
                  <SelectTrigger><SelectValue placeholder={t('select', lang)} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('none', lang)}</SelectItem>
                    {properties.map(p => (
                      <SelectItem key={p.id} value={getNameByLang(p, lang)}>{getNameByLang(p, lang)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('cancel', lang)}</Button>
            <Button onClick={handleSave} className="bg-emerald hover:bg-emerald/90 text-white" disabled={!form.description || form.amount <= 0 || savingExpense}>
              {savingExpense ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {savingExpense ? t('savingExpense', lang) : t('save', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
