'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAppStore, isOwnerOrAdmin } from '@/lib/store'
import { formatAED } from '@/lib/utils'
import { t, getNameByLang, type Language } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TrendingUp, TrendingDown, Wallet, Receipt, Building2, Loader2, Calendar, DollarSign, AlertCircle } from 'lucide-react'

interface PropertyPnLResult {
  property: { id: string; name: string; type: string; totalUnits: number }
  tenantCount: number
  income: {
    expectedRent: number
    collectedRent: number
    outstandingRent: number
    collectionRate: number
    monthlyRentSum: number
  }
  expenses: {
    ownerChequesPaid: number
    pendingChequesDue: number
    totalPendingCheques: number
    utilityBillsOutstanding: number
    otherExpenses: number
    totalExpenses: number
  }
  profit: {
    expectedProfit: number
    actualProfit: number
    variance: number
  }
  chequeCounts: {
    paidInPeriod: number
    dueInPeriod: number
    totalPending: number
  }
}

interface PnLResponse {
  period: { label: string; start: string; end: string; type: string }
  filter: { propertyId: string | null }
  properties: PropertyPnLResult[]
  portfolioTotals: PropertyPnLResult | null
  asOfDate: string
}

interface PropertyData {
  id: string
  name: string
  nameAr: string | null
  nameBn: string | null
  nameUr: string | null
  type: string
}

type PeriodType = 'this_month' | 'this_quarter' | 'this_year' | 'last_year' | 'all_time'

export default function PropertyPnL() {
  const { language, authUser } = useAppStore()
  const lang = language as Language
  const isFinancial = authUser ? isOwnerOrAdmin(authUser.role) || authUser.role === 'accountant' : false

  const [data, setData] = useState<PnLResponse | null>(null)
  const [properties, setProperties] = useState<PropertyData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [period, setPeriod] = useState<PeriodType>('this_year')
  const [propertyFilter, setPropertyFilter] = useState<string>('all')

  const fetchProperties = useCallback(async () => {
    try {
      const res = await fetch('/api/properties?limit=200')
      if (!res.ok) return
      const json = await res.json()
      setProperties(Array.isArray(json.data) ? json.data : [])
    } catch (e) { /* silent */ }
  }, [])

  const fetchPnL = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('period', period)
      if (propertyFilter !== 'all') params.set('propertyId', propertyFilter)

      const res = await fetch(`/api/reports/property-pnl?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch P&L')
      const json = await res.json()
      // API returns the PnL response object directly: { period, properties, portfolioTotals, ... }
      setData(json)
    } catch (e: any) {
      setError(e.message || 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [period, propertyFilter])

  useEffect(() => { fetchProperties() }, [fetchProperties])
  useEffect(() => { fetchPnL() }, [fetchPnL])

  // ─── Helpers ─────────────────────────────────────────────────────────
  const formatPct = (rate: number): string => `${rate.toFixed(1)}%`

  const getProfitColor = (amount: number): string => {
    if (amount > 0) return 'text-emerald-600'
    if (amount < 0) return 'text-red-600'
    return 'text-muted-foreground'
  }

  const getCollectionRateColor = (rate: number): string => {
    if (rate >= 80) return 'text-emerald-600'
    if (rate >= 50) return 'text-amber-600'
    return 'text-red-600'
  }

  // ─── Render single property card ─────────────────────────────────────
  // Defensive: if p or p.property is missing, render nothing instead of crashing.
  // This prevents client-side exceptions when the API response shape changes.
  const renderPropertyCard = (p: PropertyPnLResult | null | undefined, isPortfolio = false) => {
    if (!p || !p.property || !p.income || !p.expenses || !p.profit || !p.chequeCounts) {
      return null
    }
    return (
      <Card key={p.property.id || 'unknown'} className={isPortfolio ? 'border-terracotta border-2' : ''}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4 text-terracotta" />
            {isPortfolio ? (t('portfolioTotal', lang) || 'Portfolio Total') : p.property.name}
            {!isPortfolio && (
              <Badge variant="secondary" className="text-xs ml-auto">{p.property.type}</Badge>
            )}
          </CardTitle>
          {!isPortfolio && (
            <p className="text-xs text-muted-foreground">
              {p.tenantCount} {t('tenants', lang).toLowerCase()} · {p.property.totalUnits} {t('units', lang).toLowerCase()}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Income Section */}
          <div className="space-y-2">
            <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <TrendingUp className="w-3 h-3" />
              {t('income', lang) || 'Income'}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('expectedRent', lang) || 'Expected Rent'}</span>
                <span className="font-medium">{formatAED(p.income.expectedRent)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('collectedRent', lang) || 'Collected Rent'}</span>
                <span className="font-medium text-emerald-600">{formatAED(p.income.collectedRent)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('outstandingRent', lang) || 'Outstanding Rent'}</span>
                <span className="font-medium text-amber-600">{formatAED(p.income.outstandingRent)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('collectionRate', lang) || 'Collection Rate'}</span>
                <span className={`font-bold ${getCollectionRateColor(p.income.collectionRate)}`}>{formatPct(p.income.collectionRate)}</span>
              </div>
            </div>
          </div>

          {/* Expenses Section */}
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <TrendingDown className="w-3 h-3" />
              {t('expenses', lang) || 'Expenses'}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('ownerChequesPaid', lang) || 'Owner Cheques Paid'}</span>
                <span className="font-medium text-red-600">-{formatAED(p.expenses.ownerChequesPaid)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('utilityBills', lang) || 'Utility Bills'}</span>
                <span className="font-medium text-red-600">-{formatAED(p.expenses.utilityBillsOutstanding)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('otherExpenses', lang) || 'Other Expenses'}</span>
                <span className="font-medium text-red-600">-{formatAED(p.expenses.otherExpenses)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-semibold">{t('totalExpenses', lang) || 'Total Expenses'}</span>
                <span className="font-bold text-red-700">-{formatAED(p.expenses.totalExpenses)}</span>
              </div>
            </div>
          </div>

          {/* Cheques Summary */}
          {(p.chequeCounts.paidInPeriod > 0 || p.chequeCounts.dueInPeriod > 0 || p.chequeCounts.totalPending > 0) && (
            <div className="space-y-1 pt-2 border-t">
              <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <Wallet className="w-3 h-3" />
                {t('cheques', lang)}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="flex flex-col">
                  <span className="text-muted-foreground">{t('paidInPeriod', lang) || 'Paid (period)'}</span>
                  <span className="font-medium text-emerald-600">{p.chequeCounts.paidInPeriod}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-muted-foreground">{t('dueInPeriod', lang) || 'Due (period)'}</span>
                  <span className="font-medium text-amber-600">{p.chequeCounts.dueInPeriod}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-muted-foreground">{t('totalPending', lang) || 'Total Pending'}</span>
                  <span className="font-medium">{p.chequeCounts.totalPending}</span>
                </div>
              </div>
              {p.expenses.totalPendingCheques > 0 && (
                <div className="flex justify-between text-xs pt-1">
                  <span className="text-muted-foreground">{t('pendingChequesTotal', lang) || 'Pending Cheques Total'}</span>
                  <span className="font-medium text-amber-700">{formatAED(p.expenses.totalPendingCheques)}</span>
                </div>
              )}
            </div>
          )}

          {/* Profit Section */}
          <div className="space-y-2 pt-2 border-t bg-muted/30 -mx-3 -mb-3 px-3 py-2 rounded-b-lg">
            <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <DollarSign className="w-3 h-3" />
              {t('profitAnalysis', lang) || 'Profit Analysis'}
            </div>
            <div className="grid grid-cols-1 gap-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('expectedProfit', lang) || 'Expected Profit'}</span>
                <span className={`font-bold ${getProfitColor(p.profit.expectedProfit)}`}>{formatAED(p.profit.expectedProfit)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('actualProfit', lang) || 'Actual Profit'}</span>
                <span className={`font-bold ${getProfitColor(p.profit.actualProfit)}`}>{formatAED(p.profit.actualProfit)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('variance', lang) || 'Variance'}</span>
                <span className={`font-bold ${getProfitColor(p.profit.variance)}`}>
                  {p.profit.variance >= 0 ? '+' : ''}{formatAED(p.profit.variance)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ─── Access control ──────────────────────────────────────────────────
  if (!isFinancial) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <AlertCircle className="w-5 h-5 mr-2" />
        {t('accessDeniedFinancial', lang) || 'Access denied — financial users only'}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-terracotta" />
          {t('propertyPnL', lang) || 'Property P&L'}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('pnlSubtitle', lang) || 'Profit & Loss analysis per property — income vs expenses vs profit'}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">×</button>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <Label className="text-sm">{t('period', lang) || 'Period'}:</Label>
              <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="this_month">{t('thisMonth', lang) || 'This Month'}</SelectItem>
                  <SelectItem value="this_quarter">{t('thisQuarter', lang) || 'This Quarter'}</SelectItem>
                  <SelectItem value="this_year">{t('thisYear', lang) || 'This Year'}</SelectItem>
                  <SelectItem value="last_year">{t('lastYear', lang) || 'Last Year'}</SelectItem>
                  <SelectItem value="all_time">{t('allTime', lang) || 'All Time'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <Label className="text-sm">{t('property', lang)}:</Label>
              <Select value={propertyFilter} onValueChange={setPropertyFilter}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('allProperties', lang) || 'All Properties (Portfolio)'}</SelectItem>
                  {properties.map(p => (
                    <SelectItem key={p.id} value={p.id}>{getNameByLang(p, lang)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-2">{t('loadingPnL', lang) || 'Loading P&L data...'}</p>
        </div>
      ) : data ? (
        <>
          {/* Period badge */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{data.period.label}</Badge>
            <span>·</span>
            <span>{data.properties.length} {t('properties', lang).toLowerCase()}</span>
            <span>·</span>
            <span>{t('asOf', lang) || 'As of'} {new Date(data.asOfDate).toLocaleDateString()}</span>
          </div>

          {/* Portfolio Total (only when viewing all properties) */}
          {propertyFilter === 'all' && data.portfolioTotals && (
            <div className="mb-2">
              {renderPropertyCard(data.portfolioTotals, true)}
            </div>
          )}

          {/* Per-property cards (skip when single property selected — portfolio already shows it) */}
          {propertyFilter === 'all' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.properties.map(p => renderPropertyCard(p))}
            </div>
          )}

          {/* Single property view: show the property card directly */}
          {propertyFilter !== 'all' && data.properties.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {renderPropertyCard(data.properties[0])}
            </div>
          )}

          {/* Properties comparison table */}
          {propertyFilter === 'all' && data.properties.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('propertiesComparison', lang) || 'Properties Comparison'}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('property', lang)}</TableHead>
                        <TableHead className="text-right">{t('expectedRent', lang) || 'Expected Rent'}</TableHead>
                        <TableHead className="text-right">{t('collected', lang) || 'Collected'}</TableHead>
                        <TableHead className="text-right">{t('rate', lang) || 'Rate'}</TableHead>
                        <TableHead className="text-right">{t('cheques', lang)}</TableHead>
                        <TableHead className="text-right">{t('expenses', lang)}</TableHead>
                        <TableHead className="text-right">{t('actualProfit', lang) || 'Actual Profit'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.properties.map(p => (
                        <TableRow key={p.property.id}>
                          <TableCell className="text-sm font-medium">{p.property.name}</TableCell>
                          <TableCell className="text-right text-sm">{formatAED(p.income.expectedRent)}</TableCell>
                          <TableCell className="text-right text-sm text-emerald-600">{formatAED(p.income.collectedRent)}</TableCell>
                          <TableCell className={`text-right text-sm font-medium ${getCollectionRateColor(p.income.collectionRate)}`}>{formatPct(p.income.collectionRate)}</TableCell>
                          <TableCell className="text-right text-sm">
                            <span className="text-red-600">-{formatAED(p.expenses.ownerChequesPaid)}</span>
                          </TableCell>
                          <TableCell className="text-right text-sm text-red-600">{formatAED(p.expenses.totalExpenses)}</TableCell>
                          <TableCell className={`text-right text-sm font-bold ${getProfitColor(p.profit.actualProfit)}`}>{formatAED(p.profit.actualProfit)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  )
}
