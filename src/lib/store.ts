import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Language } from '@/lib/i18n'

export type PageType = 'dashboard' | 'properties' | 'tenants' | 'rent' | 'maintenance' | 'expenses' | 'recurring-bills' | 'daily-report' | 'reports' | 'contracts' | 'reservations' | 'settings' | 'system' | 'audit-logs' | 'property-collection' | 'cheques' | 'property-pnl' | 'license-management'

// Valid page slugs for URL routing
const VALID_PAGES: PageType[] = [
  'dashboard', 'properties', 'tenants', 'rent', 'maintenance', 'expenses',
  'recurring-bills', 'daily-report', 'reports', 'contracts', 'reservations',
  'settings', 'system', 'audit-logs', 'property-collection', 'cheques',
  'property-pnl', 'license-management'
]

export function isValidPage(slug: string): boolean {
  return VALID_PAGES.includes(slug as PageType)
}

export interface AuthUser {
  id: string
  email: string
  name: string
  nameAr?: string
  nameBn?: string
  nameUr?: string
  role: 'owner' | 'admin' | 'staff' | 'accountant'
  companyId: string
  mustChangePassword?: boolean
}

interface AppState {
  // Auth
  isAuthenticated: boolean
  authUser: AuthUser | null
  login: (user: AuthUser) => void
  logout: () => void

  // Navigation
  currentPage: PageType
  setCurrentPage: (page: PageType) => void

  // Property Collection Overview
  selectedPropertyId: string | null
  setSelectedPropertyId: (id: string | null) => void

  // Language
  language: Language
  setLanguage: (lang: Language) => void

  // Sidebar
  sidebarOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Auth - will be synced with NextAuth session
      isAuthenticated: false,
      authUser: null,
      login: (user) => set({ isAuthenticated: true, authUser: user }),
      logout: () => set({ isAuthenticated: false, authUser: null, currentPage: 'dashboard', selectedPropertyId: null }),

      // Navigation — synced with URL hash for refresh persistence
      // Uses hash routing (#/rent) to avoid conflicts with Next.js App Router
      currentPage: (typeof window !== 'undefined' && (() => {
        const hash = window.location.hash.slice(2) // remove #/
        return hash && isValidPage(hash) ? hash as PageType : 'dashboard'
      })()) || 'dashboard',
      setCurrentPage: (page) => {
        set({ currentPage: page })
        // Update hash without triggering a page reload
        if (typeof window !== 'undefined') {
          const hash = `#/${page}`
          if (window.location.hash !== hash) {
            window.location.hash = hash
          }
        }
      },

      // Property Collection Overview
      selectedPropertyId: null,
      setSelectedPropertyId: (id) => set({ selectedPropertyId: id }),

      // Language
      language: 'en',
      setLanguage: (lang) => set({ language: lang }),

      // Sidebar
      sidebarOpen: true,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
    }),
    {
      name: 'al-reef-storage',
      partialize: (state) => ({
        language: state.language,
        // Don't persist auth - it comes from NextAuth session
      }),
    }
  )
)

export function isOwnerOrAdmin(role: string): boolean {
  return role === 'owner' || role === 'admin' || role === 'accountant'
}

export function isAdminOnly(role: string): boolean {
  return role === 'admin'
}
