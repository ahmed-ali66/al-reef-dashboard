'use client'

import { useAppStore, isOwnerOrAdmin, isAdminOnly } from '@/lib/store'
import type { PageType } from '@/lib/store'
import { t, languageNames, rtlLanguages } from '@/lib/i18n'
import type { Language } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { getNameByLang } from '@/lib/i18n'
import { useDataStore } from '@/lib/data-store'
import { signOut } from 'next-auth/react'
import SyncStatus from '@/components/sync-status'
import {
  LayoutDashboard,
  Building2,
  Users,
  Banknote,
  Wrench,
  Receipt,
  Zap,
  BarChart3,
  FileText,
  Moon,
  Languages,
  ChevronLeft,
  Menu,
  LogOut,
  Shield,
  ShieldCheck,
  User,
  Settings,
  CalendarCheck,
  Wallet,
  TrendingUp,
  KeyRound,
} from 'lucide-react'

const navItems: { page: PageType; icon: React.ElementType; key: string; financialOnly?: boolean; adminOnly?: boolean }[] = [
  { page: 'dashboard', icon: LayoutDashboard, key: 'dashboard' },
  { page: 'properties', icon: Building2, key: 'properties' },
  { page: 'tenants', icon: Users, key: 'tenants' },
  { page: 'reservations', icon: CalendarCheck, key: 'reservations' },
  { page: 'rent', icon: Banknote, key: 'rentCollection' },
  { page: 'maintenance', icon: Wrench, key: 'maintenance' },
  { page: 'expenses', icon: Receipt, key: 'expenses' },
  { page: 'recurring-bills' as PageType, icon: Zap, key: 'recurringBills' },
  { page: 'cheques' as PageType, icon: Wallet, key: 'cheques' },
  { page: 'daily-report', icon: FileText, key: 'dailyReport', financialOnly: true },
  { page: 'reports', icon: BarChart3, key: 'reports', financialOnly: true },
  { page: 'property-pnl' as PageType, icon: TrendingUp, key: 'propertyPnL', financialOnly: true },
  { page: 'contracts', icon: FileText, key: 'contracts' },
  { page: 'settings', icon: Settings, key: 'settings', adminOnly: true },
  { page: 'system', icon: ShieldCheck, key: 'systemManagement', adminOnly: true },
  { page: 'audit-logs' as PageType, icon: Shield, key: 'auditLogs', adminOnly: true },
  { page: 'license-management' as PageType, icon: KeyRound, key: 'licenseManagement', adminOnly: true },
]

export default function Sidebar() {
  const { currentPage, setCurrentPage, language, setLanguage, sidebarOpen, toggleSidebar, authUser, logout } = useAppStore()
  const { clearData } = useDataStore()
  const pendingResetCount = useDataStore(s => s.resetRequests.filter(r => r.status === 'pending').length)
  const isFinancialUser = authUser ? isOwnerOrAdmin(authUser.role) : false
  const isSystemAdmin = authUser ? isAdminOnly(authUser.role) : false

  const visibleNavItems = navItems.filter(item => {
    if (item.adminOnly) return isSystemAdmin
    if (item.financialOnly) return isFinancialUser
    return true
  })

  const getRoleIcon = (role: string) => {
    if (role === 'admin') return <Shield className="w-3 h-3" />
    if (role === 'owner') return <ShieldCheck className="w-3 h-3" />
    if (role === 'accountant') return <Banknote className="w-3 h-3" />
    return <User className="w-3 h-3" />
  }

  const getRoleLabel = (role: string) => {
    if (role === 'owner') return t('ownerRole', language)
    if (role === 'admin') return t('adminRole', language)
    if (role === 'accountant') return t('accountantRole', language)
    return t('staffRole', language)
  }

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full islamic-pattern transition-all duration-300 flex flex-col',
          sidebarOpen ? 'w-64' : 'w-0 lg:w-16',
          !sidebarOpen && 'overflow-hidden lg:overflow-visible'
        )}
      >
        {/* Logo area */}
        <div className="flex items-center gap-3 p-4 border-b border-white/10 shrink-0">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gold/20 shrink-0">
            <Moon className="w-5 h-5 text-gold" />
          </div>
          {sidebarOpen && (
            <div className="min-w-0 animate-fade-in-up">
              <h1 className="text-white font-bold text-sm leading-tight truncate">
                {language === 'ar' ? 'الريف المدينة' : language === 'bn' ? 'আল রিফ আল মাদিনা' : language === 'ur' ? 'الریف المدینہ' : 'Al Reef Al Madeena'}
              </h1>
              <p className="text-white/50 text-xs truncate">
                {t('properties', language)}
              </p>
            </div>
          )}
          <button
            onClick={toggleSidebar}
            className="ml-auto text-white/60 hover:text-white shrink-0 hidden lg:block"
          >
            <ChevronLeft className={cn('w-4 h-4 transition-transform', !sidebarOpen && 'rotate-180')} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto custom-scrollbar">
          {visibleNavItems.map((item) => (
            <button
              key={item.page}
              onClick={() => {
                setCurrentPage(item.page)
                if (window.innerWidth < 1024) toggleSidebar()
              }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                currentPage === item.page
                  ? 'bg-gold/20 text-gold shadow-sm'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              )}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {sidebarOpen && (
                <span className="truncate flex-1">{t(item.key as any, language)}</span>
              )}
              {item.page === 'settings' && pendingResetCount > 0 && isSystemAdmin && (
                <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none animate-notify-pulse">
                  {pendingResetCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-white/10 p-3 space-y-2 shrink-0">
          {/* Sync status (only shows in desktop app) */}
          {sidebarOpen && (
            <div className="flex justify-center">
              <SyncStatus />
            </div>
          )}
          {/* Language selector */}
          <div className="relative">
            <button
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-white/10 hover:text-white transition-all"
              onClick={() => {
                // Cycle through languages
                const langs: Language[] = ['en', 'ar', 'bn', 'ur']
                const next = langs[(langs.indexOf(language) + 1) % langs.length]
                setLanguage(next)
              }}
            >
              <Languages className="w-5 h-5 shrink-0" />
              {sidebarOpen && (
                <span className="flex items-center gap-1.5">
                  {languageNames[language].native}
                  <span className="text-white/40 text-xs">({language.toUpperCase()})</span>
                </span>
              )}
            </button>
            {/* Language dots */}
            {sidebarOpen && (
              <div className="flex justify-center gap-1 mt-1 px-3">
                {(['en', 'ar', 'bn', 'ur'] as Language[]).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setLanguage(lang)}
                    className={cn(
                      'px-1.5 py-0.5 rounded text-[10px] font-medium transition-all',
                      language === lang
                        ? 'bg-gold/30 text-gold'
                        : 'text-white/30 hover:text-white/60'
                    )}
                  >
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* User info + Logout */}
          {sidebarOpen && authUser && (
            <div className="px-3 py-2 animate-fade-in-up">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center shrink-0">
                  {getRoleIcon(authUser.role)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-white/90 text-sm font-medium truncate">
                    {getNameByLang(authUser, language)}
                  </p>
                  <p className="text-white/40 text-xs flex items-center gap-1">
                    {getRoleLabel(authUser.role)}
                  </p>
                </div>
                <button
                  onClick={() => {
                    clearData() // Clear stale data from Zustand store
                    signOut({ callbackUrl: '/' }) // Properly clear NextAuth session
                  }}
                  className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all shrink-0"
                  title={t('logout', language)}
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile menu button */}
      {!sidebarOpen && (
        <button
          onClick={toggleSidebar}
          className="fixed top-4 left-4 z-40 lg:hidden bg-deep-teal text-white p-2 rounded-lg shadow-lg"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}
    </>
  )
}
