'use client'

import { useEffect, useState } from 'react'
import { SessionProvider, useSession, signOut } from 'next-auth/react'
import { useAppStore, isOwnerOrAdmin, isAdminOnly } from '@/lib/store'
import { useDataStore } from '@/lib/data-store'
import { t, rtlLanguages } from '@/lib/i18n'
import Login from '@/components/login'
import Sidebar from '@/components/sidebar'
import Dashboard from '@/components/dashboard'
import Properties from '@/components/properties'
import Tenants from '@/components/tenants'
import RentCollection from '@/components/rent-collection'
import Maintenance from '@/components/maintenance'
import Expenses from '@/components/expenses'
import RecurringBills from '@/components/recurring-bills'
import DailyExpensesReport from '@/components/daily-expenses-report'
import Reports from '@/components/reports'
import Contracts from '@/components/contracts'
import Reservations from '@/components/reservations'
import UserManagement from '@/components/user-management'
import SystemManagement from '@/components/system-management'
import SettingsPage from '@/components/settings-page'
import { Loader2 } from 'lucide-react'

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

  const renderPage = () => {
    const pageContent = (() => {
      switch (currentPage) {
      case 'dashboard': return <Dashboard />
      case 'properties': return <Properties />
      case 'tenants': return <Tenants />
      case 'reservations': return <Reservations />
      case 'rent': return <RentCollection />
      case 'maintenance': return <Maintenance />
      case 'expenses': return <Expenses />
      case 'recurring-bills': return <RecurringBills />
      case 'daily-report': return isFinancialUser ? <DailyExpensesReport /> : <AccessDenied />
      case 'reports': return isFinancialUser ? <Reports /> : <AccessDenied />
      case 'contracts': return <Contracts />
      case 'settings': return isSystemAdmin ? <SettingsPage /> : <AccessDenied type="admin" />
      case 'system': return isSystemAdmin ? <SystemManagement /> : <AccessDenied type="admin" />
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
      <AppContent />
    </SessionProvider>
  )
}
