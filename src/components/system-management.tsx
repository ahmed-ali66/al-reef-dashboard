'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore, isOwnerOrAdmin } from '@/lib/store'
import { t } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Shield,
  ShieldCheck,
  Download,
  Upload,
  Clock,
  Database,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  HardDrive,
  Users,
  Building2,
  Banknote,
  Wrench,
  FileText,
  Server,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Trash2,
} from 'lucide-react'

type TabType = 'protection' | 'history' | 'integrity' | 'health'

interface BackupRecord {
  id: string
  companyId: string
  type: string
  size: number
  recordCount: number
  status: string
  error: string | null
  storageUrl: string | null
  dataHash: string | null
  triggeredBy: string | null
  createdAt: string
}

interface IntegrityData {
  recordCounts: {
    properties: number
    tenants: number
    payments: number
    expenses: number
    maintenance: number
    users: number
  }
  financials: {
    totalRent: number
    totalPayments: number
    totalExpenses: number
    totalOutstanding: number
  }
  orphans: {
    tenantsWithoutValidProperty: number
    paymentsWithoutValidTenant: number
    hasOrphans: boolean
  }
  softDeleted: {
    properties: number
    tenants: number
    expenses: number
    maintenance: number
    total: number
  }
  lastBackup: {
    createdAt: string
    status: string
    type: string
    dataHash: string | null
  } | null
  dbLatencyMs: number
  checkDurationMs: number
  overallStatus: string
}

interface SystemStats {
  recordCounts: Record<string, number>
  activeUsers: number
  recentLogins: number
  backup: {
    lastBackup: {
      createdAt: string
      status: string
      type: string
      size: number
      recordCount: number
      dataHash: string | null
      storageUrl: string | null
    } | null
    successfulBackups: number
    failedBackups: number
  }
  health: {
    database: string
    dbLatencyMs: number
  }
  uptimeSeconds: number
  checkDurationMs: number
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

function formatAED(value: number): string {
  return 'AED ' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function SystemManagement() {
  const { authUser, language } = useAppStore()
  const [activeTab, setActiveTab] = useState<TabType>('protection')
  const [loading, setLoading] = useState(false)
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Data Protection state
  const [lastBackupRecord, setLastBackupRecord] = useState<BackupRecord | null>(null)
  const [creatingBackup, setCreatingBackup] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Backup History state
  const [backupRecords, setBackupRecords] = useState<BackupRecord[]>([])
  const [historyPagination, setHistoryPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 })
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Integrity state
  const [integrityData, setIntegrityData] = useState<IntegrityData | null>(null)

  // System Health state
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null)

  const isAuthorized = authUser && isOwnerOrAdmin(authUser.role)

  // Fetch last backup record for Data Protection tab
  const fetchLastBackup = useCallback(async () => {
    try {
      const res = await fetch('/api/backup/history?limit=1')
      if (res.ok) {
        const data = await res.json()
        // API returns: successResponse(paginatedResponse(...)) → { data: [...records], pagination: {...} }
        const records = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : [])
        if (records.length > 0) {
          setLastBackupRecord(records[0])
        }
      }
    } catch (err) {
      console.error('Failed to fetch last backup:', err)
    }
  }, [])

  // Fetch backup history
  const fetchHistory = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (typeFilter !== 'all') params.set('type', typeFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)

      const res = await fetch(`/api/backup/history?${params}`)
      if (res.ok) {
        const data = await res.json()
        // API returns: successResponse(paginatedResponse(...)) → { data: [...records], pagination: {...} }
        const records = Array.isArray(data.data) ? data.data : []
        setBackupRecords(records)
        if (data.pagination) {
          setHistoryPagination(data.pagination)
        }
      }
    } catch (err) {
      console.error('Failed to fetch backup history:', err)
    } finally {
      setLoading(false)
    }
  }, [typeFilter, statusFilter])

  // Fetch integrity data
  const fetchIntegrity = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/backup/integrity')
      if (res.ok) {
        const data = await res.json()
        setIntegrityData(data.data || data)
      }
    } catch (err) {
      console.error('Failed to fetch integrity data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch system stats
  const fetchSystemStats = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/system/stats')
      if (res.ok) {
        const data = await res.json()
        setSystemStats(data.data || data)
      }
    } catch (err) {
      console.error('Failed to fetch system stats:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Create backup
  const handleCreateBackup = async () => {
    setCreatingBackup(true)
    setStatusMessage(null)
    try {
      const res = await fetch('/api/backup')
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `al-reef-backup-${new Date().toISOString().split('T')[0]}.json`
        a.click()
        URL.revokeObjectURL(url)
        setStatusMessage({ type: 'success', text: t('backupCreated', language) })
        fetchLastBackup()
      } else {
        setStatusMessage({ type: 'error', text: t('backupFailed', language) })
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: t('backupFailed', language) })
    } finally {
      setCreatingBackup(false)
    }
  }

  // Restore backup
  const handleRestore = async (file: File) => {
    setRestoreDialogOpen(false)
    setRestoring(true)
    setStatusMessage(null)
    try {
      const text = await file.text()
      const backupData = JSON.parse(text)

      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backupData),
      })

      if (res.ok) {
        setStatusMessage({ type: 'success', text: t('restoreSuccess', language) })
        fetchLastBackup()
      } else {
        const data = await res.json()
        setStatusMessage({ type: 'error', text: data.error || t('restoreFailed', language) })
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: t('restoreFailed', language) })
    } finally {
      setRestoring(false)
    }
  }

  // Tab data loading
  useEffect(() => {
    if (activeTab === 'protection') {
      fetchLastBackup()
    } else if (activeTab === 'history') {
      fetchHistory(1)
    } else if (activeTab === 'integrity') {
      fetchIntegrity()
    } else if (activeTab === 'health') {
      fetchSystemStats()
    }
  }, [activeTab, fetchLastBackup, fetchHistory, fetchIntegrity, fetchSystemStats])

  // Auto-refresh system health every 60 seconds
  useEffect(() => {
    if (activeTab !== 'health') return
    const interval = setInterval(() => {
      fetchSystemStats()
    }, 60000)
    return () => clearInterval(interval)
  }, [activeTab, fetchSystemStats])

  const tabs: { key: TabType; label: string }[] = [
    { key: 'protection', label: t('dataProtection', language) },
    { key: 'history', label: t('backupHistory', language) },
    { key: 'integrity', label: t('dataIntegrity', language) },
    { key: 'health', label: t('systemHealth', language) },
  ]

  // Access denied check — after all hooks
  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <Shield className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground">{t('accessDenied', language)}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-deep-teal" />
          {t('systemManagement', language)}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t('dataProtection', language)} & {t('systemHealth', language)}
        </p>
      </div>

      {/* Status Message */}
      {statusMessage && (
        <div className={`border rounded-xl p-4 flex items-center gap-3 ${
          statusMessage.type === 'success' 
            ? 'bg-green-50 border-green-200 text-green-800' 
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {statusMessage.type === 'success' 
            ? <CheckCircle2 className="w-5 h-5 shrink-0" /> 
            : <XCircle className="w-5 h-5 shrink-0" />
          }
          <span className="text-sm font-medium">{statusMessage.text}</span>
          <button 
            onClick={() => setStatusMessage(null)} 
            className="ml-auto text-current opacity-50 hover:opacity-100"
          >
            ×
          </button>
        </div>
      )}

      {/* Loading Overlay */}
      {(creatingBackup || restoring) && (
        <div className="border rounded-xl bg-blue-50 p-4 flex items-center gap-3 text-blue-800">
          <Loader2 className="w-5 h-5 animate-spin shrink-0" />
          <span className="text-sm font-medium">
            {creatingBackup ? t('creatingBackup', language) : t('restoring', language)}
          </span>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
              activeTab === tab.key
                ? 'border-deep-teal text-deep-teal'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'protection' && (
        <div className="space-y-6">
          {/* Action Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded-xl bg-white p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-deep-teal/10 flex items-center justify-center">
                  <Download className="w-5 h-5 text-deep-teal" />
                </div>
                <div>
                  <h3 className="font-semibold">{t('createBackup', language)}</h3>
                  <p className="text-xs text-muted-foreground">Export all data as JSON</p>
                </div>
              </div>
              <Button
                onClick={handleCreateBackup}
                disabled={creatingBackup || restoring}
                className="w-full bg-deep-teal hover:bg-deep-teal/90"
              >
                {creatingBackup ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('creatingBackup', language)}</>
                ) : (
                  <><Download className="w-4 h-4 mr-2" />{t('createBackup', language)}</>
                )}
              </Button>
            </div>

            <div className="border rounded-xl bg-white p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Upload className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold">{t('restoreBackup', language)}</h3>
                  <p className="text-xs text-muted-foreground">Upload a backup file</p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    setRestoreDialogOpen(true)
                    // Store file for later use
                    ;(window as any).__restoreFile = file
                  }
                }}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={creatingBackup || restoring}
                className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
              >
                <Upload className="w-4 h-4 mr-2" />
                {t('selectBackupFile', language)}
              </Button>
            </div>
          </div>

          {/* Last Backup Status */}
          <div className="border rounded-xl bg-white p-6">
            <h3 className="font-semibold flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-deep-teal" />
              {t('lastBackup', language)}
            </h3>
            {lastBackupRecord ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="text-sm font-medium">
                    {new Date(lastBackupRecord.createdAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('status', language)}</p>
                  <Badge variant="secondary" className={
                    lastBackupRecord.status === 'completed'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }>
                    {lastBackupRecord.status === 'completed' ? t('completed', language) : t('failed', language)}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('backupSize', language)}</p>
                  <p className="text-sm font-medium">{formatBytes(lastBackupRecord.size)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('recordCount', language)}</p>
                  <p className="text-sm font-medium">{lastBackupRecord.recordCount}</p>
                </div>
                {lastBackupRecord.dataHash && (
                  <div className="col-span-2 md:col-span-4">
                    <p className="text-xs text-muted-foreground">SHA-256 Hash</p>
                    <code className="text-xs bg-muted px-2 py-1 rounded break-all">
                      {lastBackupRecord.dataHash}
                    </code>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('noBackups', language)}</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all', language)}</SelectItem>
                <SelectItem value="auto">{t('auto', language)}</SelectItem>
                <SelectItem value="manual">{t('manual', language)}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all', language)}</SelectItem>
                <SelectItem value="completed">{t('completed', language)}</SelectItem>
                <SelectItem value="failed">{t('failed', language)}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => fetchHistory(1)} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Records Table */}
          <div className="border rounded-xl bg-white">
            {backupRecords.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <HardDrive className="w-12 h-12 mb-4" />
                <p className="text-lg font-medium">{t('noBackups', language)}</p>
              </div>
            ) : (
              <ScrollArea className="max-h-96">
                <div className="divide-y">
                  {backupRecords.map((record) => (
                    <div
                      key={record.id}
                      className={`flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors ${
                        record.status === 'failed' ? 'bg-red-50/50' : ''
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                        record.status === 'completed' ? 'bg-green-100' : 'bg-red-100'
                      }`}>
                        {record.status === 'completed' 
                          ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                          : <XCircle className="w-5 h-5 text-red-600" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className={
                            record.type === 'auto' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                          }>
                            {record.type === 'auto' ? t('auto', language) : t('manual', language)}
                          </Badge>
                          <Badge variant="secondary" className={
                            record.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }>
                            {record.status === 'completed' ? t('completed', language) : t('failed', language)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatBytes(record.size)} · {record.recordCount} {t('recordCount', language).toLowerCase()}
                          </span>
                        </div>
                        {record.error && (
                          <p className="text-xs text-red-600 mt-1 truncate">{record.error}</p>
                        )}
                        {record.dataHash && (
                          <p className="text-xs text-muted-foreground mt-1 font-mono">
                            {record.dataHash.substring(0, 16)}...
                          </p>
                        )}
                        {record.storageUrl && (
                          <a
                            href={`/api/backup/download?recordId=${record.id}`}
                            className="text-xs text-blue-600 hover:underline mt-1 block"
                            download
                          >
                            Download backup file
                          </a>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                        {new Date(record.createdAt).toLocaleDateString()} {new Date(record.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Pagination */}
          {historyPagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {((historyPagination.page - 1) * historyPagination.limit) + 1} - {Math.min(historyPagination.page * historyPagination.limit, historyPagination.total)} of {historyPagination.total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchHistory(historyPagination.page - 1)}
                  disabled={historyPagination.page <= 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="flex items-center px-3 text-sm">
                  Page {historyPagination.page} of {historyPagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchHistory(historyPagination.page + 1)}
                  disabled={historyPagination.page >= historyPagination.totalPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'integrity' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <Button
              onClick={fetchIntegrity}
              disabled={loading}
              className="bg-deep-teal hover:bg-deep-teal/90"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {t('runIntegrityCheck', language)}
            </Button>
          </div>

          {integrityData ? (
            <>
              {/* Overall Status */}
              <div className={`border rounded-xl p-4 flex items-center gap-3 ${
                integrityData.overallStatus === 'healthy' 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-amber-50 border-amber-200'
              }`}>
                {integrityData.overallStatus === 'healthy' 
                  ? <CheckCircle2 className="w-6 h-6 text-green-600" />
                  : <AlertTriangle className="w-6 h-6 text-amber-600" />
                }
                <div>
                  <p className="font-semibold">
                    {integrityData.overallStatus === 'healthy' 
                      ? t('integrityPassed', language) 
                      : t('orphanRecords', language)
                    }
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Check completed in {integrityData.checkDurationMs}ms · DB latency {integrityData.dbLatencyMs}ms
                  </p>
                </div>
              </div>

              {/* Record Counts */}
              <div className="border rounded-xl bg-white p-6">
                <h3 className="font-semibold mb-4">{t('recordCount', language)}</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {[
                    { icon: Building2, label: t('properties', language), value: integrityData.recordCounts.properties, color: 'text-blue-600 bg-blue-100' },
                    { icon: Users, label: t('tenants', language), value: integrityData.recordCounts.tenants, color: 'text-purple-600 bg-purple-100' },
                    { icon: Banknote, label: t('payments', language) || 'Payments', value: integrityData.recordCounts.payments, color: 'text-green-600 bg-green-100' },
                    { icon: FileText, label: t('expenses', language), value: integrityData.recordCounts.expenses, color: 'text-orange-600 bg-orange-100' },
                    { icon: Wrench, label: t('maintenance', language), value: integrityData.recordCounts.maintenance, color: 'text-amber-600 bg-amber-100' },
                    { icon: Users, label: t('usersCount', language), value: integrityData.recordCounts.users, color: 'text-teal-600 bg-teal-100' },
                  ].map((item) => (
                    <div key={item.label} className="text-center p-3 rounded-lg bg-muted/30">
                      <div className={`w-10 h-10 rounded-full ${item.color} flex items-center justify-center mx-auto mb-2`}>
                        <item.icon className="w-5 h-5" />
                      </div>
                      <p className="text-2xl font-bold">{item.value}</p>
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Totals */}
              <div className="border rounded-xl bg-white p-6">
                <h3 className="font-semibold mb-4">Financial Overview</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 rounded-lg bg-green-50">
                    <p className="text-xs text-muted-foreground">{t('totalRent', language)}</p>
                    <p className="text-lg font-bold text-green-700">{formatAED(integrityData.financials.totalRent)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-50">
                    <p className="text-xs text-muted-foreground">{t('totalPayments2', language)}</p>
                    <p className="text-lg font-bold text-blue-700">{formatAED(integrityData.financials.totalPayments)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-orange-50">
                    <p className="text-xs text-muted-foreground">{t('totalExpenses2', language)}</p>
                    <p className="text-lg font-bold text-orange-700">{formatAED(integrityData.financials.totalExpenses)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-red-50">
                    <p className="text-xs text-muted-foreground">{t('totalOutstanding', language)}</p>
                    <p className="text-lg font-bold text-red-700">{formatAED(integrityData.financials.totalOutstanding)}</p>
                  </div>
                </div>
              </div>

              {/* Orphan Records */}
              {integrityData.orphans.hasOrphans && (
                <div className="border rounded-xl bg-amber-50 border-amber-200 p-6">
                  <h3 className="font-semibold flex items-center gap-2 mb-4 text-amber-800">
                    <AlertTriangle className="w-5 h-5" />
                    {t('orphanRecords', language)}
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-amber-700">Tenants without valid property</p>
                      <p className="text-lg font-bold text-amber-800">{integrityData.orphans.tenantsWithoutValidProperty}</p>
                    </div>
                    <div>
                      <p className="text-sm text-amber-700">Payments without valid tenant</p>
                      <p className="text-lg font-bold text-amber-800">{integrityData.orphans.paymentsWithoutValidTenant}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Soft-Deleted Records */}
              <div className="border rounded-xl bg-white p-6">
                <h3 className="font-semibold flex items-center gap-2 mb-4">
                  <Trash2 className="w-5 h-5 text-muted-foreground" />
                  {t('softDeletedRecords', language)}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 rounded-lg bg-muted/30 text-center">
                    <p className="text-2xl font-bold">{integrityData.softDeleted.properties}</p>
                    <p className="text-xs text-muted-foreground">{t('properties', language)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 text-center">
                    <p className="text-2xl font-bold">{integrityData.softDeleted.tenants}</p>
                    <p className="text-xs text-muted-foreground">{t('tenants', language)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 text-center">
                    <p className="text-2xl font-bold">{integrityData.softDeleted.expenses}</p>
                    <p className="text-xs text-muted-foreground">{t('expenses', language)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 text-center">
                    <p className="text-2xl font-bold">{integrityData.softDeleted.maintenance}</p>
                    <p className="text-xs text-muted-foreground">{t('maintenance', language)}</p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Database className="w-12 h-12 mb-4" />
              <p className="text-lg font-medium">{t('runIntegrityCheck', language)}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'health' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <Button
              onClick={fetchSystemStats}
              disabled={loading}
              variant="outline"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {systemStats ? (
            <>
              {/* Database Status */}
              <div className={`border rounded-xl p-4 flex items-center gap-3 ${
                systemStats.health.database === 'healthy' 
                  ? 'bg-green-50 border-green-200' 
                  : systemStats.health.database === 'degraded' 
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-red-50 border-red-200'
              }`}>
                <Server className={`w-6 h-6 ${
                  systemStats.health.database === 'healthy' 
                    ? 'text-green-600' 
                    : systemStats.health.database === 'degraded' 
                      ? 'text-amber-600'
                      : 'text-red-600'
                }`} />
                <div>
                  <p className="font-semibold">{t('databaseStatus', language)}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className={
                      systemStats.health.database === 'healthy' 
                        ? 'bg-green-100 text-green-800'
                        : systemStats.health.database === 'degraded'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-800'
                    }>
                      {systemStats.health.database === 'healthy' 
                        ? t('healthy', language)
                        : systemStats.health.database === 'degraded'
                          ? t('degraded', language)
                          : t('unhealthy', language)
                      }
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Latency: {systemStats.health.dbLatencyMs}ms
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="border rounded-xl bg-white p-6 text-center">
                  <Users className="w-8 h-8 text-deep-teal mx-auto mb-2" />
                  <p className="text-2xl font-bold">{systemStats.activeUsers}</p>
                  <p className="text-xs text-muted-foreground">{t('activeUsers', language)}</p>
                </div>
                <div className="border rounded-xl bg-white p-6 text-center">
                  <Activity className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold">{systemStats.recentLogins}</p>
                  <p className="text-xs text-muted-foreground">{t('recentLogins', language)}</p>
                </div>
                <div className="border rounded-xl bg-white p-6 text-center">
                  <Clock className="w-8 h-8 text-amber-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold">{formatUptime(systemStats.uptimeSeconds)}</p>
                  <p className="text-xs text-muted-foreground">{t('uptime', language)}</p>
                </div>
                <div className="border rounded-xl bg-white p-6 text-center">
                  <Database className="w-8 h-8 text-green-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold">
                    {Object.values(systemStats.recordCounts).reduce((a: number, b: number) => a + b, 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Records</p>
                </div>
              </div>

              {/* Backup Status */}
              <div className="border rounded-xl bg-white p-6">
                <h3 className="font-semibold mb-4">{t('lastBackup', language)}</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 rounded-lg bg-green-50 text-center">
                    <p className="text-2xl font-bold text-green-700">{systemStats.backup.successfulBackups}</p>
                    <p className="text-xs text-muted-foreground">{t('completed', language)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-red-50 text-center">
                    <p className="text-2xl font-bold text-red-700">{systemStats.backup.failedBackups}</p>
                    <p className="text-xs text-muted-foreground">{t('failed', language)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 text-center">
                    <p className="text-sm font-medium">
                      {systemStats.backup.lastBackup 
                        ? new Date(systemStats.backup.lastBackup.createdAt).toLocaleString()
                        : t('noBackups', language)
                      }
                    </p>
                    <p className="text-xs text-muted-foreground">{t('lastBackup', language)}</p>
                  </div>
                </div>
              </div>

              {/* Record Counts by Entity */}
              <div className="border rounded-xl bg-white p-6">
                <h3 className="font-semibold mb-4">{t('recordCount', language)}</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { label: t('properties', language), value: systemStats.recordCounts.properties },
                    { label: t('tenants', language), value: systemStats.recordCounts.tenants },
                    { label: 'Payments', value: systemStats.recordCounts.payments },
                    { label: t('expenses', language), value: systemStats.recordCounts.expenses },
                    { label: t('maintenance', language), value: systemStats.recordCounts.maintenance },
                  ].map((item) => (
                    <div key={item.label} className="p-3 rounded-lg bg-muted/30 text-center">
                      <p className="text-lg font-bold">{item.value}</p>
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Server className="w-12 h-12 mb-4" />
              <p className="text-lg font-medium">Loading system stats...</p>
              <Loader2 className="w-6 h-6 animate-spin mt-2" />
            </div>
          )}
        </div>
      )}

      {/* Restore Warning Dialog */}
      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-5 h-5" />
              {t('restoreBackup', language)}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-2">
              {t('restoreWarning', language)}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end mt-4">
            <Button
              variant="outline"
              onClick={() => setRestoreDialogOpen(false)}
            >
              {t('cancel', language)}
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                const file = (window as any).__restoreFile
                if (file) {
                  handleRestore(file)
                  delete (window as any).__restoreFile
                }
              }}
            >
              {t('restoreBackup', language)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
