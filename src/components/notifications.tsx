'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { t, rtlLanguages } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  Bell,
  BellRing,
  Check,
  CheckCheck,
  CheckCircle2,
  CreditCard,
  AlertTriangle,
  FileText,
  Wrench,
  Info,
  X,
  Calendar,
  Receipt,
  RefreshCw,
  ChevronRight,
  Settings,
  Volume2,
  VolumeX,
  BellOff,
} from 'lucide-react'
import { usePushNotifications } from '@/lib/use-push-notifications'
import { toast } from 'sonner'

interface NotificationItem {
  id: string
  type: string
  title: string
  message: string
  data: string | null
  read: boolean
  createdAt: string
}

// Track the last-seen notification ID so we only alert on NEW notifications
// (not all notifications on every poll)
let lastSeenNotificationId: string | null = null
let isFirstLoad = true

export default function Notifications() {
  const { language, authUser } = useAppStore()
  const isRtl = rtlLanguages.includes(language)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showPrefs, setShowPrefs] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const {
    permission,
    isSupported,
    requestPermission,
    showNotification,
    preferences,
    updatePreferences,
  } = usePushNotifications()

  const fetchNotifications = useCallback(async (silent = false) => {
    if (!authUser) return
    try {
      if (!silent) setLoading(true)
      const res = await fetch('/api/notifications?limit=30')
      if (res.ok) {
        const data = await res.json()
        const newNotifications = data.notifications || []
        const newUnreadCount = data.unreadCount || 0

        // ─── Detect NEW notifications (only on subsequent loads, not first) ───
        if (!isFirstLoad && newNotifications.length > 0) {
          const newestId = newNotifications[0].id
          if (lastSeenNotificationId && newestId !== lastSeenNotificationId) {
            // Find notifications that arrived since last poll
            const newOnes: NotificationItem[] = []
            for (const n of newNotifications) {
              if (n.id === lastSeenNotificationId) break
              if (!n.read) newOnes.push(n)
            }

            // Show browser notification + sound + toast for each new one (max 3 to avoid spam)
            for (const n of newOnes.slice(0, 3)) {
              // Browser push notification (with sound)
              showNotification({
                title: n.title,
                body: n.message,
                tag: n.type,
                onClick: () => {
                  setIsOpen(true)
                  fetchNotifications()
                },
              })

              // In-app toast popup
              if (preferences.toastEnabled) {
                const icon = getNotificationIcon(n.type)
                toast(n.title, {
                  description: n.message,
                  duration: 6000,
                  icon: icon,
                  action: {
                    label: 'View',
                    onClick: () => {
                      setIsOpen(true)
                      if (!n.read) markAsRead(n.id)
                    },
                  },
                })
              }
            }
          }
          lastSeenNotificationId = newestId
        } else {
          // First load — just set the last-seen ID without alerting
          if (newNotifications.length > 0) {
            lastSeenNotificationId = newNotifications[0].id
          }
          isFirstLoad = false
        }

        setNotifications(newNotifications)
        setUnreadCount(newUnreadCount)
      }
    } catch (e) {
      console.error('Failed to fetch notifications:', e)
    } finally {
      setLoading(false)
    }
  }, [authUser, showNotification, preferences.toastEnabled])

  useEffect(() => {
    if (authUser) {
      fetchNotifications()
      // Poll every 15 seconds (more frequent than before for timely alerts)
      const interval = setInterval(() => fetchNotifications(true), 15000)
      return () => clearInterval(interval)
    }
  }, [authUser, fetchNotifications])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setShowPrefs(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ─── Request push permission on first user interaction (if supported) ───
  useEffect(() => {
    if (!isSupported || permission !== 'default') return

    const handleFirstClick = () => {
      requestPermission()
      document.removeEventListener('click', handleFirstClick)
    }
    document.addEventListener('click', handleFirstClick, { once: true })
    return () => document.removeEventListener('click', handleFirstClick)
  }, [isSupported, permission, requestPermission])

  const markAsRead = async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: 'PATCH' })
      if (res.ok) {
        setNotifications(prev =>
          prev.map(n => (n.id === id ? { ...n, read: true } : n))
        )
        setUnreadCount(prev => Math.max(0, prev - 1))
      }
    } catch (e) {
      console.error('Failed to mark as read:', e)
    }
  }

  const markAllAsRead = async () => {
    try {
      const res = await fetch('/api/notifications/mark-all-read', { method: 'POST' })
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })))
        setUnreadCount(0)
      }
    } catch (e) {
      console.error('Failed to mark all as read:', e)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => {
          setIsOpen(!isOpen)
          setShowPrefs(false)
          if (!isOpen) fetchNotifications()
        }}
        className="relative p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all"
        title={language === 'ar' ? 'الإشعارات' : language === 'bn' ? 'বিজ্ঞপ্তি' : language === 'ur' ? 'اطلاعات' : 'Notifications'}
      >
        {unreadCount > 0 ? (
          <BellRing className="w-5 h-5" />
        ) : (
          <Bell className="w-5 h-5" />
        )}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center leading-none animate-notify-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className={cn(
          'absolute top-full mt-2 w-96 bg-white rounded-xl shadow-xl border border-border z-50 overflow-hidden',
          isRtl ? 'right-0' : 'left-0'
        )}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              {language === 'ar' ? 'الإشعارات' : language === 'bn' ? 'বিজ্ঞপ্তি' : language === 'ur' ? 'اطلاعات' : 'Notifications'}
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-[10px] bg-red-100 text-red-700">{unreadCount} new</Badge>
              )}
            </h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-deep-teal hover:text-deep-teal/80 font-medium flex items-center gap-1 px-2 py-1 hover:bg-deep-teal/10 rounded transition-all"
                >
                  <CheckCheck className="w-3 h-3" />
                  {language === 'ar' ? 'قراءة الكل' : language === 'bn' ? 'সব পড়ুন' : language === 'ur' ? 'سب پڑھیں' : 'Mark all read'}
                </button>
              )}
              <button
                onClick={() => setShowPrefs(!showPrefs)}
                className="p-1 hover:bg-muted rounded transition-colors"
                title="Notification preferences"
              >
                <Settings className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-muted rounded transition-colors"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Preferences panel (toggle) */}
          {showPrefs && (
            <PreferencesPanel
              language={language}
              permission={permission}
              isSupported={isSupported}
              requestPermission={requestPermission}
              preferences={preferences}
              updatePreferences={updatePreferences}
            />
          )}

          {/* Permission banner (if not granted) */}
          {!showPrefs && isSupported && permission !== 'granted' && (
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
              <div className="flex items-start gap-2">
                <BellOff className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-amber-900">
                    {language === 'en' ? 'Enable desktop notifications' : 'تفعيل إشعارات سطح المكتب'}
                  </p>
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    {language === 'en'
                      ? 'Get push notifications for cheques, bills, and reports even when this tab is in the background.'
                      : 'احصل على إشعارات للشيكات والفواتير والتقارير حتى عندما تكون هذه الصفحة في الخلفية.'}
                  </p>
                  <Button
                    size="sm"
                    className="mt-2 h-7 text-xs bg-amber-600 hover:bg-amber-700"
                    onClick={requestPermission}
                  >
                    {language === 'en' ? 'Enable' : 'تفعيل'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Notifications list */}
          <ScrollArea className="max-h-96">
            {loading ? (
              <div className="p-6 text-center">
                <div className="w-6 h-6 border-2 border-deep-teal border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-6 text-center">
                <Bell className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {language === 'ar' ? 'لا توجد إشعارات' : language === 'bn' ? 'কোনো বিজ্ঞপ্তি নেই' : language === 'ur' ? 'کوئی اطلاعات نہیں' : 'No notifications'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={cn(
                      'px-4 py-3 transition-colors cursor-pointer hover:bg-muted/50',
                      !notification.read && 'bg-deep-teal/5',
                    )}
                    onClick={() => {
                      if (!notification.read) markAsRead(notification.id)
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0 border', getNotificationBg(notification.type))}>
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn('text-sm truncate', !notification.read && 'font-semibold')}>
                            {notification.title}
                          </p>
                          {!notification.read && (
                            <span className="w-2 h-2 rounded-full bg-deep-teal shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="text-[10px] text-muted-foreground/70 mt-1">
                          {formatTimeAgo(notification.createdAt, language)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          <div className="px-4 py-2 border-t bg-muted/30 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {language === 'en' ? 'Polling every 15s' : 'تحديث كل 15 ثانية'}
            </span>
            <button
              onClick={() => fetchNotifications()}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              {language === 'en' ? 'Refresh' : 'تحديث'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Notification type icons and colors
// ═══════════════════════════════════════════════════════════════════════════

function getNotificationIcon(type: string) {
  switch (type) {
    case 'payment_receipt':
      return <CreditCard className="w-4 h-4 text-emerald-600" />
    case 'overdue_notice':
      return <AlertTriangle className="w-4 h-4 text-red-500" />
    case 'lease_renewal':
      return <FileText className="w-4 h-4 text-amber-600" />
    case 'maintenance_update':
      return <Wrench className="w-4 h-4 text-blue-500" />
    case 'backup_success':
      return <CheckCircle2 className="w-4 h-4 text-emerald-600" />
    case 'backup_failed':
      return <AlertTriangle className="w-4 h-4 text-red-500" />
    case 'daily_report':
      return <FileText className="w-4 h-4 text-blue-500" />
    case 'cheque_reminder_7d':
    case 'cheque_reminder_3d':
    case 'cheque_reminder_1d':
    case 'cheque_overdue':
      return <Receipt className="w-4 h-4 text-orange-500" />
    case 'recurring_bill_reminder':
    case 'bill_overdue':
      return <Calendar className="w-4 h-4 text-purple-500" />
    case 'monthly_rollover':
      return <RefreshCw className="w-4 h-4 text-indigo-500" />
    case 'system':
    default:
      return <Info className="w-4 h-4 text-muted-foreground" />
  }
}

function getNotificationBg(type: string) {
  switch (type) {
    case 'payment_receipt': return 'bg-emerald-50 border-emerald-200'
    case 'overdue_notice': return 'bg-red-50 border-red-200'
    case 'lease_renewal': return 'bg-amber-50 border-amber-200'
    case 'maintenance_update': return 'bg-blue-50 border-blue-200'
    case 'backup_success': return 'bg-emerald-50 border-emerald-200'
    case 'backup_failed': return 'bg-red-50 border-red-200'
    case 'daily_report': return 'bg-blue-50 border-blue-200'
    case 'cheque_reminder_7d':
    case 'cheque_reminder_3d':
    case 'cheque_reminder_1d':
    case 'cheque_overdue':
      return 'bg-orange-50 border-orange-200'
    case 'recurring_bill_reminder':
    case 'bill_overdue':
      return 'bg-purple-50 border-purple-200'
    case 'monthly_rollover':
      return 'bg-indigo-50 border-indigo-200'
    default: return 'bg-gray-50 border-gray-200'
  }
}

function formatTimeAgo(dateStr: string, language: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return language === 'ar' ? 'الآن' : language === 'bn' ? 'এইমাত্র' : language === 'ur' ? 'ابھی' : 'Just now'
  if (minutes < 60) return language === 'ar' ? `منذ ${minutes} دقيقة` : language === 'bn' ? `${minutes} মিনিট আগে` : language === 'ur' ? `${minutes} منٹ پہلے` : `${minutes}m ago`
  if (hours < 24) return language === 'ar' ? `منذ ${hours} ساعة` : language === 'bn' ? `${hours} ঘন্টা আগে` : language === 'ur' ? `${hours} گھنٹے پہلے` : `${hours}h ago`
  return language === 'ar' ? `منذ ${days} يوم` : language === 'bn' ? `${days} দিন আগে` : language === 'ur' ? `${days} دن پہلے` : `${days}d ago`
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

// ═══════════════════════════════════════════════════════════════════════════
// Preferences Panel (shown when user clicks the gear icon)
// ═══════════════════════════════════════════════════════════════════════════

function PreferencesPanel({
  language,
  permission,
  isSupported,
  requestPermission,
  preferences,
  updatePreferences,
}: {
  language: string
  permission: NotificationPermission
  isSupported: boolean
  requestPermission: () => Promise<boolean>
  preferences: any
  updatePreferences: (updates: any) => Promise<boolean>
}) {
  const [loading, setLoading] = useState(false)

  const togglePref = async (key: string, value: boolean) => {
    setLoading(true)
    await updatePreferences({ [key]: value })
    setLoading(false)
  }

  return (
    <div className="px-4 py-3 bg-muted/20 border-b">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        {language === 'en' ? 'Notification Preferences' : 'تفضيلات الإشعارات'}
      </p>

      {/* Browser push permission status */}
      {isSupported && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium">
              {language === 'en' ? 'Desktop notifications' : 'إشعارات سطح المكتب'}
            </span>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px]',
                permission === 'granted' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' :
                permission === 'denied' ? 'bg-red-50 text-red-700 border-red-300' :
                'bg-amber-50 text-amber-700 border-amber-300'
              )}
            >
              {permission === 'granted' ? (language === 'en' ? 'Enabled' : 'مفعّل') :
               permission === 'denied' ? (language === 'en' ? 'Blocked' : 'محظور') :
               (language === 'en' ? 'Not set' : 'غير محدد')}
            </Badge>
          </div>
          {permission !== 'granted' && permission !== 'denied' && (
            <Button
              size="sm"
              className="mt-1 h-7 text-xs w-full"
              onClick={requestPermission}
            >
              {language === 'en' ? 'Enable desktop notifications' : 'تفعيل إشعارات سطح المكتب'}
            </Button>
          )}
          {permission === 'denied' && (
            <p className="text-[10px] text-muted-foreground mt-1">
              {language === 'en'
                ? 'Blocked in browser settings. Click the lock icon in your browser address bar to allow.'
                : 'محظور في إعدادات المتصفح. انقر أيقونة القفل في شريط العنوان للسماح.'}
            </p>
          )}
        </div>
      )}

      {/* Push toggle */}
      <PreferenceToggle
        label={language === 'en' ? 'Push notifications' : 'إشعارات منبثقة'}
        description={language === 'en' ? 'Show on desktop when browser is open' : 'إظهار على سطح المكتب'}
        enabled={preferences.pushEnabled}
        onToggle={(v) => togglePref('pushEnabled', v)}
        disabled={loading || permission !== 'granted'}
        icon={preferences.pushEnabled ? <BellRing className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
      />

      {/* Sound toggle */}
      <PreferenceToggle
        label={language === 'en' ? 'Sound alert' : 'تنبيه صوتي'}
        description={language === 'en' ? 'Play chime when new notification arrives' : 'تشغيل صوت عند وصول إشعار'}
        enabled={preferences.soundEnabled}
        onToggle={(v) => togglePref('soundEnabled', v)}
        disabled={loading}
        icon={preferences.soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
      />

      {/* Toast toggle */}
      <PreferenceToggle
        label={language === 'en' ? 'In-app popups' : 'نوافذ منبثقة داخل التطبيق'}
        description={language === 'en' ? 'Show toast popups while using the app' : 'إظهار نوافذ منبثقة أثناء استخدام التطبيق'}
        enabled={preferences.toastEnabled}
        onToggle={(v) => togglePref('toastEnabled', v)}
        disabled={loading}
        icon={<Info className="w-3.5 h-3.5" />}
      />
    </div>
  )
}

function PreferenceToggle({
  label,
  description,
  enabled,
  onToggle,
  disabled,
  icon,
}: {
  label: string
  description: string
  enabled: boolean
  onToggle: (value: boolean) => void
  disabled?: boolean
  icon: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <div>
          <p className="text-xs font-medium">{label}</p>
          <p className="text-[10px] text-muted-foreground">{description}</p>
        </div>
      </div>
      <button
        onClick={() => !disabled && onToggle(!enabled)}
        disabled={disabled}
        className={cn(
          'relative w-9 h-5 rounded-full transition-colors',
          enabled ? 'bg-emerald-500' : 'bg-gray-300',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
            enabled ? 'translate-x-4' : 'translate-x-0.5'
          )}
        />
      </button>
    </div>
  )
}
