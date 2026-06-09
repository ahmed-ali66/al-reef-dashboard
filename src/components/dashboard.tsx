'use client'

import { useEffect, useState, useCallback } from 'react'
import type { DashboardData } from '@/lib/types'
import { useAppStore, isOwnerOrAdmin } from '@/lib/store'
import { useDataStore } from '@/lib/data-store'
import { formatAED, getPaymentStatusColor, cn2, isFinanciallyActive } from '@/lib/utils'
import { t, getMonthName, getNameByLang, getWhatsAppLink, type Language, type WhatsAppLanguage } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Banknote,
  AlertTriangle,
  Users,
  Home,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  MessageCircle,
  ChevronRight,
  Loader2,
  Lock,
  CalendarCheck,
  Zap,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

export default function Dashboard() {
  const { language, authUser } = useAppStore()
  const lang = language as Language
  const canSeeFinancials = isOwnerOrAdmin(authUser?.role ?? '')

  const [data, setData] = useState<DashboardData | null>(null)
  const [utilityBillsSummary, setUtilityBillsSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // WhatsApp language selection dialog
  const [whatsappLangDialogOpen, setWhatsappLangDialogOpen] = useState(false)
  const [whatsappTargetTenant, setWhatsappTargetTenant] = useState<any>(null)

  const fetchData = useCallback(async () => {
    try {
      // Use server-side endpoint as single source of truth — handles role-based masking correctly
      const dashboardData = await useDataStore.getState().fetchDashboardData()
      if (dashboardData) {
        setData(dashboardData)
      }
    } catch (e) {
      console.error('Dashboard fetch error:', e)
    } finally {
      setLoading(false)
    }

    // Fetch utility bills summary separately
    try {
      const res = await fetch('/api/recurring-bills/summary')
      if (res.ok) {
        const billsData = await res.json()
        if (billsData && billsData.totalBills > 0) {
          setUtilityBillsSummary(billsData)
        }
      }
    } catch (e) {
      // Non-critical — dashboard works without utility bills data
      console.error('Utility bills summary fetch error:', e)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-emerald" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <p className="text-lg text-muted-foreground">
          {t('noData', lang)}
        </p>
        <Button
          onClick={() => {
            useDataStore.getState().seedData()
            fetchData()
          }}
          className="bg-emerald hover:bg-emerald/90"
        >
          {t('loadSampleData', lang)}
        </Button>
      </div>
    )
  }

  const s = data.stats
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()

  return (
    <div className="space-y-6 stagger-children">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {t('dashboard', lang)}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {getMonthName(currentMonth, lang)} {currentYear}
        </p>
      </div>

      {/* Overdue Alert Banner */}
      {s.overdueCount > 0 && (
        <div className="overdue-pulse bg-red-600 text-white rounded-xl p-4 flex items-center gap-3 shadow-lg">
          <AlertTriangle className="w-6 h-6 shrink-0" />
          <div className="flex-1">
            <p className="font-bold text-lg">
              {s.overdueCount} {t('overdueAlert', lang)}
            </p>
            {canSeeFinancials && (
              <p className="text-red-100 text-sm">
                {formatAED(s.overdueAmount)} {t('uncollected', lang)}
              </p>
            )}
          </div>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              useAppStore.getState().setCurrentPage('rent')
            }}
            className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {t('viewDetails', lang)}
          </a>
        </div>
      )}

      {/* Stats Row */}
      <div className={cn2('grid gap-4 stagger-children', utilityBillsSummary ? 'grid-cols-2 lg:grid-cols-6' : 'grid-cols-2 lg:grid-cols-5')}>
        <Card className="property-card-hover border-l-4 border-l-emerald">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Banknote className="w-5 h-5 text-emerald" />
              <Badge variant="secondary" className="text-xs">
                {t('cashCollected', lang)}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('cashCollected', lang)}
            </p>
            {canSeeFinancials ? (
              <>
                <p className="text-xl font-bold text-emerald mt-1">
                  {formatAED(s.collectedRevenue)}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <TrendingUp className="w-3 h-3 text-emerald" />
                  <span className="text-xs text-muted-foreground">
                    {t('ofExpected', lang)} {formatAED(s.expectedRevenue)} {t('expected', lang)}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-1.5 mt-1">
                <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {t('financialDataProtected', lang)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {canSeeFinancials && s.totalAdjustments > 0 && (
          <Card className="property-card-hover border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Banknote className="w-5 h-5 text-amber-500" />
                <Badge variant="secondary" className="text-xs">
                  {t('adjustments', lang)}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('adjustmentsTotal', lang)}
              </p>
              <p className="text-xl font-bold text-amber-600 mt-1">
                -{formatAED(s.totalAdjustments)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('totalEffectiveCollection', lang)}: {formatAED(s.collectedRevenue - s.totalAdjustments)}
              </p>
            </CardContent>
          </Card>
        )}

        <Card className={cn2('property-card-hover', s.overdueCount > 0 && 'border-l-4 border-l-red-500')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <AlertTriangle className={cn2('w-5 h-5', s.overdueCount > 0 ? 'text-red-500' : 'text-gray-400')} />
              {s.overdueCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-red-500 overdue-pulse" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('overdue', lang)}
            </p>
            <p className={cn2('text-xl font-bold mt-1', s.overdueCount > 0 ? 'text-red-600' : 'text-gray-600')}>
              {s.overdueCount}
            </p>
            {canSeeFinancials && s.overdueCount > 0 && (
              <p className="text-xs text-red-500 mt-1">
                {formatAED(s.overdueAmount)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="property-card-hover border-l-4 border-l-gold">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Users className="w-5 h-5 text-gold" />
              <Badge variant="secondary" className="text-xs">
                {t('active', lang)}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('activeTenants', lang)}
            </p>
            <p className="text-xl font-bold text-foreground mt-1">
              {s.activeTenants}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {s.totalTenants} {t('total', lang)}
            </p>
          </CardContent>
        </Card>

        <Card className="property-card-hover border-l-4 border-l-deep-teal">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Home className="w-5 h-5 text-deep-teal" />
              <Badge variant="secondary" className="text-xs">
                {s.occupancyRate}%
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('occupancyRate', lang)}
            </p>
            <p className="text-xl font-bold text-foreground mt-1">
              {s.occupiedUnits}/{s.totalUnits}
            </p>
            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
              <div
                className="bg-deep-teal h-1.5 rounded-full transition-all"
                style={{ width: `${s.occupancyRate}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {utilityBillsSummary && (
          <Card className={cn2('property-card-hover', utilityBillsSummary.overdueBills?.length > 0 ? 'border-l-4 border-l-orange-500' : 'border-l-4 border-l-orange-400')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Zap className={cn2('w-5 h-5', utilityBillsSummary.overdueBills?.length > 0 ? 'text-orange-500' : 'text-orange-400')} />
                {utilityBillsSummary.overdueBills?.length > 0 && (
                  <span className="w-2 h-2 rounded-full bg-orange-500 overdue-pulse" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('recurringBills', lang)}
              </p>
              {canSeeFinancials ? (
                <p className="text-xl font-bold text-foreground mt-1">
                  {formatAED(utilityBillsSummary.totalOutstanding)}
                </p>
              ) : (
                <p className="text-xl font-bold text-foreground mt-1">
                  {utilityBillsSummary.totalBills}
                </p>
              )}
              {utilityBillsSummary.overdueBills?.length > 0 && (
                <p className="text-xs text-orange-500 mt-1">
                  {utilityBillsSummary.overdueBills.length} {t('overdueBills', lang)}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Reservation Summary */}
      {data.reservationStats && (data.reservationStats.pendingCount > 0 || data.reservationStats.confirmedCount > 0) && (
        <Card className="border-l-4 border-l-sky-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CalendarCheck className="w-5 h-5 text-sky-500" />
                <h3 className="font-semibold">{t('reservations', lang)}</h3>
              </div>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  useAppStore.getState().setCurrentPage('reservations')
                }}
                className="text-xs text-sky-600 hover:text-sky-800 font-medium"
              >
                {t('viewDetails', lang)} →
              </a>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-amber-600">{data.reservationStats.pendingCount}</p>
                <p className="text-xs text-amber-700">{t('pending', lang)}</p>
              </div>
              <div className="bg-sky-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-sky-600">{data.reservationStats.confirmedCount}</p>
                <p className="text-xs text-sky-700">{t('confirmed', lang)}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-emerald-600">{data.reservationStats.convertedCount}</p>
                <p className="text-xs text-emerald-700">{t('converted', lang)}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-purple-600">{data.reservationStats.upcomingMoveIns}</p>
                <p className="text-xs text-purple-700">{t('upcomingMoveIns', lang)}</p>
              </div>
            </div>
            {canSeeFinancials && data.reservationStats.totalDepositsCollected > 0 && (
              <div className="mt-3 pt-3 border-t flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t('depositCollected', lang)}</span>
                <span className="font-semibold text-sm text-sky-600">{formatAED(data.reservationStats.totalDepositsCollected)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Payment Status Board */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            {t('paymentStatusBoard', lang)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {data.activeTenantsList.map((tenant: any) => {
              // Server-computed payment status — single source of truth, consistent across all roles
              const status: 'paid' | 'overdue' | 'unpaid' | 'partial' | 'inactive' | 'due-soon' =
                tenant.paymentStatus || 'overdue'

              return (
                <div
                  key={tenant.id}
                  className={cn2(
                    'rounded-lg p-3 text-center card-hover cursor-pointer',
                    getPaymentStatusColor(status)
                  )}
                >
                  <p className="font-semibold text-sm truncate">
                    {getNameByLang(tenant, lang)}
                  </p>
                  <p className="text-xs opacity-80 mt-0.5">
                    {tenant.unitNumber || '—'}
                  </p>
                  <p className="text-xs font-bold mt-1">
                    {status === 'paid' && t('paid', lang)}
                    {status === 'overdue' && t('overdue', lang)}
                    {status === 'unpaid' && t('unpaid', lang)}
                    {status === 'partial' && t('partial', lang)}
                    {status === 'inactive' && t('inactive', lang)}
                    {status === 'due-soon' && t('dueSoon', lang)}
                  </p>
                  {tenant.status === 'notice' && (
                    <span className="inline-block mt-1 text-[10px] bg-amber-200/40 rounded px-1.5 py-0.5">
                      {t('noticePeriod', lang)}
                    </span>
                  )}
                  {(status === 'overdue' || status === 'unpaid') && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setWhatsappTargetTenant(tenant)
                        setWhatsappLangDialogOpen(true)
                      }}
                      className="inline-flex items-center gap-1 mt-1 text-xs bg-white/20 rounded px-1.5 py-0.5 hover:bg-white/30"
                    >
                      <MessageCircle className="w-3 h-3" />
                      {t('remind', lang)}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* WhatsApp Language Selection Dialog */}
      <Dialog open={whatsappLangDialogOpen} onOpenChange={setWhatsappLangDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-600" />
              {t('selectReminderLanguage', lang)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">{t('reminderLanguageDesc', lang)}</p>
            <div className="space-y-2">
              <Button
                className="w-full justify-start bg-green-600 hover:bg-green-700 text-white"
                onClick={() => {
                  if (whatsappTargetTenant) {
                    window.open(getWhatsAppLink(whatsappTargetTenant.whatsapp || whatsappTargetTenant.phone, getNameByLang(whatsappTargetTenant, lang), whatsappTargetTenant.rentAmount, currentMonth, currentYear, 'ar' as WhatsAppLanguage), '_blank')
                  }
                  setWhatsappLangDialogOpen(false)
                }}
              >
                {t('sendArabic', lang)}
              </Button>
              <Button
                className="w-full justify-start bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => {
                  if (whatsappTargetTenant) {
                    window.open(getWhatsAppLink(whatsappTargetTenant.whatsapp || whatsappTargetTenant.phone, getNameByLang(whatsappTargetTenant, lang), whatsappTargetTenant.rentAmount, currentMonth, currentYear, 'en' as WhatsAppLanguage), '_blank')
                  }
                  setWhatsappLangDialogOpen(false)
                }}
              >
                {t('sendEnglish', lang)}
              </Button>
              <Button
                className="w-full justify-start bg-teal-600 hover:bg-teal-700 text-white"
                onClick={() => {
                  if (whatsappTargetTenant) {
                    window.open(getWhatsAppLink(whatsappTargetTenant.whatsapp || whatsappTargetTenant.phone, getNameByLang(whatsappTargetTenant, lang), whatsappTargetTenant.rentAmount, currentMonth, currentYear, 'ur' as WhatsAppLanguage), '_blank')
                  }
                  setWhatsappLangDialogOpen(false)
                }}
              >
                {t('sendUrdu', lang)}
              </Button>
              <Button
                className="w-full justify-start bg-orange-500 hover:bg-orange-600 text-white"
                onClick={() => {
                  if (whatsappTargetTenant) {
                    window.open(getWhatsAppLink(whatsappTargetTenant.whatsapp || whatsappTargetTenant.phone, getNameByLang(whatsappTargetTenant, lang), whatsappTargetTenant.rentAmount, currentMonth, currentYear, 'hi' as WhatsAppLanguage), '_blank')
                  }
                  setWhatsappLangDialogOpen(false)
                }}
              >
                {t('sendHindi', lang)}
              </Button>
              <Button
                className="w-full justify-start bg-purple-600 hover:bg-purple-700 text-white"
                onClick={() => {
                  if (whatsappTargetTenant) {
                    window.open(getWhatsAppLink(whatsappTargetTenant.whatsapp || whatsappTargetTenant.phone, getNameByLang(whatsappTargetTenant, lang), whatsappTargetTenant.rentAmount, currentMonth, currentYear, 'bn' as WhatsAppLanguage), '_blank')
                  }
                  setWhatsappLangDialogOpen(false)
                }}
              >
                {t('sendBengali', lang)}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Revenue Chart + Recent Activity */}
      <div className="grid lg:grid-cols-5 gap-6">
        {/* Revenue Chart */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {t('revenueTrend', lang)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {canSeeFinancials ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d5" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(value: number) => formatAED(value)}
                      contentStyle={{
                        backgroundColor: '#FFF8E7',
                        border: '1px solid #e5e0d5',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="expected" name={t('expected', lang)} fill="#0A5C4E" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="collected" name={t('collected', lang)} fill="#C5A028" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center gap-2">
                <Lock className="w-10 h-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground text-center">
                  {t('financialDataProtected', lang)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {t('recentPayments', lang)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
              {data.recentPayments.map((payment: any) => (
                <div key={payment.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                  <div className="w-8 h-8 rounded-full bg-emerald/10 flex items-center justify-center shrink-0">
                    <ArrowUpRight className="w-4 h-4 text-emerald" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {payment.tenant ? getNameByLang(payment.tenant, lang) : '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {payment.method || '—'} • {payment.reference || '—'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {canSeeFinancials ? (
                      <p className="text-sm font-semibold text-emerald">
                        {formatAED(payment.amount)}
                      </p>
                    ) : (
                      <p className="text-sm font-semibold text-emerald">
                        ✓
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {getMonthName(payment.month, lang)} {payment.year}
                    </p>
                  </div>
                </div>
              ))}
              {data.recentPayments.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t('noRecentPayments', lang)}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
