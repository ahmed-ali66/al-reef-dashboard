'use client'

import { useEffect, useState, useRef } from 'react'
import { SessionProvider, useSession, signOut } from 'next-auth/react'
import { useAppStore, isOwnerOrAdmin, isAdminOnly } from '@/lib/store'
import { useDataStore } from '@/lib/data-store'
import { t, rtlLanguages } from '@/lib/i18n'
import Login from '@/components/login'
import Sidebar from '@/components/sidebar'
import Dashboard from '@/components/dashboard'
import Properties from '@/components/properties'
import PropertyCollection from '@/components/property-collection'
import Tenants from '@/components/tenants'
import RentCollection from '@/components/rent-collection'
import Maintenance from '@/components/maintenance'
import Expenses from '@/components/expenses'
import RecurringBills from '@/components/recurring-bills'
import DailyExpensesReport from '@/components/daily-expenses-report'
import Reports from '@/components/reports'
import Cheques from '@/components/cheques'
import PropertyPnL from '@/components/property-pnl'
import Contracts from '@/components/contracts'
import Reservations from '@/components/reservations'
import UserManagement from '@/components/user-management'
import SystemManagement from '@/components/system-management'
import SettingsPage from '@/components/settings-page'
import AuditLogs from '@/components/audit-logs'
import LicenseManagement from '@/components/license-management'
import { Loader2 } from 'lucide-react'
import LicenseGate from '@/components/license-gate'

function AppContent() {
  const { data: session, status } = useSession()
  const { isAuthenticated, authUser, currentPage, sidebarOpen, language, setSidebarOpen, login, logout } = useAppStore()
  const { fetchAllData, isInitialized } = useDataStore()
  const [isMobile, setIsMobile] = useState(false)

  // Sync NextAuth session with Zustand store
  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      const sessionUser = session.user as any
      login({
        id: sessionUser.id,
        email: sessionUser.email || '',
        name: sessionUser.name || '',
        nameAr: sessionUser.nameAr,
        nameBn: sessionUser.nameBn,
        nameUr: sessionUser.nameUr,
        role: sessionUser.role,
        companyId: sessionUser.companyId,
        mustChangePassword: sessionUser.mustChangePassword,
      })
    } else if (status === 'unauthenticated') {
      logout()
    }
  }, [status, session, login, logout])

  // ── Desktop sync: tell the Tauri sync agent which company to sync ──
  // This runs after login and passes the companyId to the Rust sync agent
  // so it knows which company's data to pull/push.
  useEffect(() => {
    if (!isAuthenticated || !authUser?.companyId) return
    // Check if running inside Tauri (desktop app)
    if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
      import('@tauri-apps/api/core')
        .then(({ invoke }) => invoke('set_company_id', { companyId: authUser.companyId }))
        .catch(() => { /* silent — not in desktop mode */ })
    }
  }, [isAuthenticated, authUser?.companyId])

  // Fetch data when authenticated
  useEffect(() => {
    if (isAuthenticated && !isInitialized) {
      fetchAllData()
    }
  }, [isAuthenticated, isInitialized, fetchAllData])

  // Set direction based on language
  useEffect(() => {
    document.documentElement.dir = rtlLanguages.includes(language) ? 'rtl' : 'ltr'
    document.documentElement.lang = language
  }, [language])

  // Handle responsive sidebar
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 1024
      setIsMobile(mobile)
      if (mobile) {
        setSidebarOpen(false)
      } else {
        setSidebarOpen(true)
      }
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [setSidebarOpen])

  // Show loading while session is being checked
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-deep-teal mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // Show login page if not authenticated
  if (!isAuthenticated || !authUser) {
    return <Login />
  }

  // Show loading while data is being fetched
  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-deep-teal mx-auto mb-4" />
          <p className="text-muted-foreground">Loading data...</p>
        </div>
      </div>
    )
  }

  const isFinancialUser = isOwnerOrAdmin(authUser.role)
  const isSystemAdmin = isAdminOnly(authUser.role)

  // ─── Page transition loading bar ───
  // Shows a thin animated bar at the top when changing pages
  const [pageTransitioning, setPageTransitioning] = useState(false)
  const prevPageRef = useRef(currentPage)
  useEffect(() => {
    if (prevPageRef.current !== currentPage) {
      setPageTransitioning(true)
      const timer = setTimeout(() => setPageTransitioning(false), 600)
      prevPageRef.current = currentPage
      return () => clearTimeout(timer)
    }
  }, [currentPage])

  const renderPage = () => {
    const pageContent = (() => {
      switch (currentPage) {
      case 'dashboard': return <Dashboard />
      case 'properties': return <Properties />
      case 'property-collection': return isOwnerOrAdmin(authUser?.role || '') ? <PropertyCollection /> : <AccessDenied />
      case 'tenants': return <Tenants />
      case 'reservations': return <Reservations />
      case 'rent': return <RentCollection />
      case 'maintenance': return <Maintenance />
      case 'expenses': return <Expenses />
      case 'recurring-bills': return <RecurringBills />
      case 'cheques': return <Cheques />
      case 'daily-report': return isFinancialUser ? <DailyExpensesReport /> : <AccessDenied />
      case 'reports': return isFinancialUser ? <Reports /> : <AccessDenied />
      case 'property-pnl': return isFinancialUser ? <PropertyPnL /> : <AccessDenied />
      case 'contracts': return <Contracts />
      case 'settings': return isSystemAdmin ? <SettingsPage /> : <AccessDenied type="admin" />
      case 'system': return isSystemAdmin ? <SystemManagement /> : <AccessDenied type="admin" />
      case 'audit-logs': return isOwnerOrAdmin(authUser?.role || '') ? <AuditLogs /> : <AccessDenied type="admin" />
      case 'license-management': return isSystemAdmin ? <LicenseManagement /> : <AccessDenied type="admin" />
      default: return <Dashboard />
    }
    })()

    return (
      <div key={currentPage} className="animate-page-slide">
        {pageContent}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream">
      {/* Page transition loading bar */}
      {pageTransitioning && (
        <div className="fixed top-0 left-0 right-0 z-[9999] h-1 bg-emerald/20">
          <div className="h-full bg-emerald animate-loading-bar" style={{ width: '100%' }} />
        </div>
      )}
      <Sidebar />
      <main
        className="transition-all duration-300 min-h-screen"
        style={{
          marginLeft: !isMobile && sidebarOpen ? '256px' : isMobile ? '0' : '0',
        }}
      >
        <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto">
          {renderPage()}
        </div>
      </main>
    </div>
  )
}

function AccessDenied({ type = 'financial' }: { type?: 'financial' | 'admin' }) {
  const { language } = useAppStore()

  return (
    <div className="flex flex-col items-center justify-center h-96 gap-4">
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
        <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-foreground">{t('accessDenied', language)}</h2>
      <p className="text-muted-foreground text-sm text-center max-w-md">
        {type === 'admin'
          ? t('adminDataProtected', language)
          : t('financialDataProtected', language)
        }
      </p>
    </div>
  )
}

export default function Home() {
  return (
    <SessionProvider refetchInterval={5 * 60} refetchOnWindowFocus={true}>
      <LicenseGate>
        <AppContent />
      </LicenseGate>
    </SessionProvider>
  )
}
