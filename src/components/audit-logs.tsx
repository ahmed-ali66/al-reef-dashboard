'use client'

import { useEffect, useState, useCallback } from 'react'
import type { AuditLogData } from '@/lib/types'
import { useAppStore, isOwnerOrAdmin } from '@/lib/store'
import { formatAED, cn2, formatDate } from '@/lib/utils'
import { t, type Language } from '@/lib/i18n'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Shield, Loader2, Search, X, ChevronLeft, ChevronRight, Filter, FileText, User, Building2, Banknote, Wrench, Receipt, Users, Zap, ArrowRight, Eye } from 'lucide-react'

const ACTION_TYPES = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'ARCHIVE', 'UNARCHIVE'] as const
const ENTITY_TYPES = ['Property', 'Tenant', 'Payment', 'RentAdjustment', 'Expense', 'Maintenance', 'User', 'RecurringBill'] as const

const actionColors: Record<string, string> = {
  CREATE: 'bg-emerald/10 text-emerald border-emerald/20',
  UPDATE: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  DELETE: 'bg-red-500/10 text-red-600 border-red-500/20',
  LOGIN: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  LOGOUT: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
  ARCHIVE: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  UNARCHIVE: 'bg-teal-500/10 text-teal-600 border-teal-500/20',
}

const entityIcons: Record<string, React.ElementType> = {
  Property: Building2,
  Tenant: Users,
  Payment: Banknote,
  RentAdjustment: Receipt,
  Expense: Receipt,
  Maintenance: Wrench,
  User: User,
  RecurringBill: Zap,
}

export default function AuditLogs() {
  const { language, authUser } = useAppStore()
  const lang = language as Language

  const [logs, setLogs] = useState<AuditLogData[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  // Filters
  const [actionFilter, setActionFilter] = useState<string>('all')
  const [entityFilter, setEntityFilter] = useState<string>('all')
  const [userFilter, setUserFilter] = useState<string>('')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  // Unique users from loaded logs (for user filter dropdown)
  const [uniqueUsers, setUniqueUsers] = useState<{ id: string; name: string; role: string }[]>([])

  // Expanded log detail
  const [expandedLog, setExpandedLog] = useState<string | null>(null)

  const fetchLogs = useCallback(async (pageNum: number = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(pageNum), limit: '25' })
      if (actionFilter !== 'all') params.set('action', actionFilter)
      if (entityFilter !== 'all') params.set('entity', entityFilter)
      if (userFilter && userFilter !== 'all') params.set('userId', userFilter)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)

      const res = await fetch(`/api/audit-logs?${params}`)
      if (!res.ok) { setLogs([]); setLoading(false); return }
      const data = await res.json()
      setLogs(data.logs || [])
      setTotalPages(data.pagination?.totalPages || 1)
      setTotal(data.pagination?.total || 0)

      // Extract unique users from logs for the filter dropdown
      const usersMap = new Map<string, { id: string; name: string; role: string }>()
      for (const log of (data.logs || [])) {
        if (log.user?.id && !usersMap.has(log.user.id)) {
          usersMap.set(log.user.id, { id: log.user.id, name: log.user.name, role: log.user.role })
        }
      }
      // Merge with existing unique users
      setUniqueUsers(prev => {
        const merged = new Map(prev.map(u => [u.id, u]))
        for (const [id, u] of usersMap) merged.set(id, u)
        return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name))
      })
    } catch (e) {
      console.error('Failed to fetch audit logs:', e)
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [actionFilter, entityFilter, userFilter, startDate, endDate])

  useEffect(() => { fetchLogs(1) }, [fetchLogs])
  useEffect(() => { setPage(1) }, [actionFilter, entityFilter, userFilter, startDate, endDate])

  const clearFilters = () => {
    setActionFilter('all')
    setEntityFilter('all')
    setUserFilter('all')
    setStartDate('')
    setEndDate('')
  }

  const hasActiveFilters = actionFilter !== 'all' || entityFilter !== 'all' || (userFilter && userFilter !== 'all') || startDate || endDate

  const formatActionLabel = (action: string): string => {
    const labels: Record<string, Record<Language, string>> = {
      CREATE: { en: 'Created', ar: 'إنشاء', bn: 'তৈরি', ur: 'بنایا' },
      UPDATE: { en: 'Updated', ar: 'تحديث', bn: 'আপডেট', ur: 'اپڈیٹ' },
      DELETE: { en: 'Deleted', ar: 'حذف', bn: 'মুছে ফেলা', ur: 'حذف' },
      LOGIN: { en: 'Login', ar: 'تسجيل دخول', bn: 'লগইন', ur: 'لاگ ان' },
      LOGOUT: { en: 'Logout', ar: 'تسجيل خروج', bn: 'লগআউট', ur: 'لاگ آؤٹ' },
      ARCHIVE: { en: 'Archived', ar: 'أرشيف', bn: 'সংরক্ষণাগার', ur: 'محفوظ' },
      UNARCHIVE: { en: 'Unarchived', ar: 'إلغاء الأرشفة', bn: 'আনআর্কাইভ', ur: 'غیر محفوظ' },
    }
    return labels[action]?.[lang] || action
  }

  const formatEntityLabel = (entity: string): string => {
    const labels: Record<string, Record<Language, string>> = {
      Property: { en: 'Property', ar: 'العقار', bn: 'সম্পত্তি', ur: 'املاک' },
      Tenant: { en: 'Tenant', ar: 'المستأجر', bn: 'ভাড়াটিয়া', ur: 'کرایہ دار' },
      Payment: { en: 'Payment', ar: 'الدفع', bn: 'পেমেন্ট', ur: 'ادائیگی' },
      RentAdjustment: { en: 'Adjustment', ar: 'التعديل', bn: 'সমন্বয়', ur: 'ترمیم' },
      Expense: { en: 'Expense', ar: 'المصروف', bn: 'ব্যয়', ur: 'اخراجات' },
      Maintenance: { en: 'Maintenance', ar: 'الصيانة', bn: 'রক্ষণাবেক্ষণ', ur: 'دیكھ بھال' },
      User: { en: 'User', ar: 'المستخدم', bn: 'ব্যবহারকারী', ur: 'صارف' },
      RecurringBill: { en: 'Recurring Bill', ar: 'فاتورة متكررة', bn: 'পুনরাবৃত্তি বিল', ur: 'بار بار آنے والا بل' },
    }
    return labels[entity]?.[lang] || entity
  }

  const formatRoleLabel = (role: string): string => {
    const labels: Record<string, Record<Language, string>> = {
      owner: { en: 'Owner', ar: 'المالك', bn: 'মালিক', ur: 'مالک' },
      admin: { en: 'Admin', ar: 'المدير', bn: 'প্রশাসক', ur: 'ناظم' },
      accountant: { en: 'Accountant', ar: 'المحاسب', bn: 'হিসাবরক্ষক', ur: 'اکاؤنٹنٹ' },
      staff: { en: 'Staff', ar: 'الموظف', bn: 'কর্মচারী', ur: 'ملازم' },
    }
    return labels[role]?.[lang] || role
  }

  const renderDetails = (log: AuditLogData) => {
    const details = log.details
    if (!details || typeof details === 'string') return null

    const detailObj = details as Record<string, any>

    // For UPDATE actions with before/after
    if (detailObj.before && detailObj.after) {
      const changedFields: { field: string; oldVal: any; newVal: any }[] = []
      const before = detailObj.before as Record<string, any>
      const after = detailObj.after as Record<string, any>

      for (const key of Object.keys(after)) {
        const oldVal = before[key]
        const newVal = after[key]
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          changedFields.push({ field: key, oldVal, newVal })
        }
      }

      if (changedFields.length === 0) return null

      return (
        <div className="mt-3 space-y-2">
          {changedFields.map(({ field, oldVal, newVal }) => (
            <div key={field} className="flex items-center gap-2 text-xs bg-gray-50 rounded px-2 py-1.5">
              <span className="font-medium text-gray-600 min-w-[100px]">{field}</span>
              <span className="text-red-500 line-through truncate max-w-[160px]" title={String(oldVal)}>
                {String(oldVal)}
              </span>
              <ArrowRight className="w-3 h-3 text-gray-400 shrink-0" />
              <span className="text-emerald font-medium truncate max-w-[160px]" title={String(newVal)}>
                {String(newVal)}
              </span>
            </div>
          ))}
        </div>
      )
    }

    // For CREATE/DELETE actions — show key fields
    const displayFields = Object.entries(detailObj).filter(
      ([key]) => !['occProtected', 'tenantId', 'propertyId', 'companyId'].includes(key)
    ).slice(0, 6)

    if (displayFields.length === 0) return null

    return (
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {displayFields.map(([key, val]) => (
          <div key={key} className="flex gap-1">
            <span className="text-gray-500 font-medium">{key}:</span>
            <span className="text-gray-700 truncate" title={String(val)}>{String(val)}</span>
          </div>
        ))}
      </div>
    )
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'owner': return 'bg-purple-500/10 text-purple-700 border-purple-500/20'
      case 'admin': return 'bg-blue-500/10 text-blue-700 border-blue-500/20'
      case 'accountant': return 'bg-emerald/10 text-emerald border-emerald/20'
      default: return 'bg-gray-500/10 text-gray-600 border-gray-500/20'
    }
  }

  if (!isOwnerOrAdmin(authUser?.role || '')) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-muted-foreground">{t('adminOnly', lang)}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('auditLogTitle', lang)}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('auditLogDesc', lang)}</p>
        </div>
        <Badge variant="outline" className="text-xs">
          {total.toLocaleString()} {lang === 'ar' ? 'سجل' : lang === 'ur' ? 'لاگز' : 'records'}
        </Badge>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-2 flex-wrap items-center">
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[140px] h-9 text-sm">
                <SelectValue placeholder={t('actionType', lang)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all', lang)} {t('actionType', lang)}</SelectItem>
                {ACTION_TYPES.map(a => (
                  <SelectItem key={a} value={a}>{formatActionLabel(a)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="w-[140px] h-9 text-sm">
                <SelectValue placeholder={t('module', lang)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all', lang)} {t('module', lang)}</SelectItem>
                {ENTITY_TYPES.map(e => (
                  <SelectItem key={e} value={e}>{formatEntityLabel(e)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {uniqueUsers.length > 0 && (
              <Select value={userFilter || 'all'} onValueChange={setUserFilter}>
                <SelectTrigger className="w-[160px] h-9 text-sm">
                  <SelectValue placeholder={t('tenantName', lang) || 'User'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('all', lang)} {t('tenantName', lang) || 'Users'}</SelectItem>
                  {uniqueUsers.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name} ({formatRoleLabel(u.role)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="flex items-center gap-1.5 bg-white rounded-lg border px-2 py-1">
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="border-0 outline-none text-sm bg-transparent w-[130px] cursor-pointer"
                title={lang === 'ar' ? 'من تاريخ' : 'From date'}
              />
              <span className="text-gray-400 text-xs">→</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="border-0 outline-none text-sm bg-transparent w-[130px] cursor-pointer"
                title={lang === 'ar' ? 'إلى تاريخ' : 'To date'}
              />
              {(startDate || endDate) && (
                <button onClick={() => { setStartDate(''); setEndDate('') }} className="text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-500 hover:text-gray-700 h-9">
                <X className="w-3.5 h-3.5 mr-1" />
                {t('clearFilter', lang)}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Log List */}
      {loading && logs.length === 0 ? (
        <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-emerald" /></div>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-muted-foreground">{t('noResults', lang)}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {logs.map(log => {
            const EntityIcon = entityIcons[log.entity] || FileText
            const isExpanded = expandedLog === log.id

            return (
              <Card key={log.id} className="card-hover">
                <CardContent className="p-4">
                  <div
                    className="flex items-start gap-3 cursor-pointer"
                    onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                  >
                    {/* Entity icon */}
                    <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <EntityIcon className="w-4 h-4 text-gray-500" />
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={cn2('text-xs border', actionColors[log.action] || 'bg-gray-500/10 text-gray-600 border-gray-500/20')}>
                          {formatActionLabel(log.action)}
                        </Badge>
                        <span className="text-sm font-medium">{formatEntityLabel(log.entity)}</span>
                        {log.entityId && (
                          <span className="text-xs text-muted-foreground truncate max-w-[120px]" title={log.entityId}>
                            #{log.entityId.slice(-6)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        {log.user && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {log.user.name}
                            <Badge className={cn2('text-[10px] px-1 py-0 border', getRoleBadgeColor(log.user.role))}>
                              {formatRoleLabel(log.user.role)}
                            </Badge>
                          </span>
                        )}
                        <span>{formatDate(log.createdAt)}</span>
                      </div>

                      {/* Quick detail preview for UPDATE */}
                      {log.action === 'UPDATE' && !isExpanded && log.details && typeof log.details === 'object' && (log.details as any).before && (log.details as any).after && (
                        <div className="mt-1 text-xs text-gray-400 truncate">
                          {Object.keys((log.details as any).after).filter(k => JSON.stringify((log.details as any).before[k]) !== JSON.stringify((log.details as any).after[k])).slice(0, 3).join(', ')} ...
                        </div>
                      )}
                    </div>

                    {/* Expand toggle */}
                    <button className="text-gray-400 hover:text-gray-600 shrink-0 mt-1">
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && renderDetails(log)}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { const p = Math.max(1, page - 1); setPage(p); fetchLogs(p) }}
            disabled={page <= 1 || loading}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); fetchLogs(p) }}
            disabled={page >= totalPages || loading}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
