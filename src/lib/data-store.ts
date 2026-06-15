import { create } from 'zustand'
import type { PropertyData, TenantData, PaymentData, ExpenseData, MaintenanceData, ReservationData, RentAdjustmentData, TenantGroupData } from '@/lib/types'
import { isFinanciallyActive } from '@/lib/utils'

// Company info
export interface CompanyInfo {
  id: string
  name: string
  nameAr: string
  nameBn: string
  nameUr: string
  phone: string
  email: string
  address: string
}

// Reset requests from forgot password
export interface ResetRequest {
  id: string
  email: string
  name: string
  message: string
  status: 'pending' | 'resolved' | 'dismissed'
  createdAt: string
  resolvedAt: string | null
  resolvedBy: string | null
}

// Users for user management
export interface LocalUser {
  id: string
  email: string
  password: string // placeholder - real passwords are in the database
  name: string
  nameAr: string
  nameBn: string
  nameUr: string
  role: 'owner' | 'admin' | 'staff' | 'accountant'
  companyId: string
  isActive: boolean
}

interface DataState {
  company: CompanyInfo
  users: LocalUser[]
  resetRequests: ResetRequest[]
  properties: PropertyData[]
  tenants: TenantData[]
  payments: PaymentData[]
  expenses: ExpenseData[]
  maintenanceItems: MaintenanceData[]
  reservations: ReservationData[]
  adjustments: RentAdjustmentData[]
  tenantGroups: TenantGroupData[]
  isSeeded: boolean
  isLoading: boolean
  isInitialized: boolean

  // Data fetching
  fetchAllData: () => Promise<void>
  refreshAllData: () => Promise<void>

  // Reservations CRUD
  addReservation: (data: any) => Promise<void>
  updateReservation: (id: string, data: any) => Promise<void>
  cancelReservation: (id: string) => Promise<void>
  convertReservation: (id: string, data: { depositAppliedTo: string; rentAmount: number; paymentMethod?: string; leaseStart?: string; leaseEnd?: string; contractDuration?: number }) => Promise<void>
  deleteReservation: (id: string) => Promise<void>

  // User Management (Admin only)
  addUser: (data: Omit<LocalUser, 'id' | 'isActive'>) => Promise<LocalUser>
  updateUser: (id: string, data: Partial<LocalUser>) => Promise<void>
  deleteUser: (id: string) => Promise<void>
  resetUserPassword: (id: string, newPassword: string) => Promise<void>
  generateRandomPassword: () => string

  // Reset Requests
  addResetRequest: (data: Omit<ResetRequest, 'id' | 'status' | 'createdAt' | 'resolvedAt' | 'resolvedBy'>) => Promise<ResetRequest>
  resolveResetRequest: (id: string, resolvedBy: string) => Promise<void>
  dismissResetRequest: (id: string, resolvedBy: string) => Promise<void>
  getPendingResetCount: () => number

  // Properties CRUD
  addProperty: (data: Omit<PropertyData, 'id' | 'companyId' | 'createdAt' | 'tenants' | 'archived'>) => Promise<void>
  updateProperty: (id: string, data: Partial<PropertyData>) => Promise<void>
  deleteProperty: (id: string) => Promise<void>
  archiveProperty: (id: string, archived: boolean) => Promise<void>

  // Tenants CRUD
  addTenant: (data: Omit<TenantData, 'id' | 'companyId' | 'createdAt' | 'payments' | 'property'>) => Promise<void>
  updateTenant: (id: string, data: Partial<TenantData>) => Promise<void>
  deleteTenant: (id: string) => Promise<void>

  // Payments CRUD
  addPayment: (data: Omit<PaymentData, 'id' | 'createdAt' | 'tenant'>) => Promise<void>
  updatePayment: (id: string, data: Partial<PaymentData> & { reason?: string }) => Promise<void>
  deletePayment: (id: string, reason?: string) => Promise<void>

  // Adjustments CRUD
  addAdjustment: (data: Omit<RentAdjustmentData, 'id' | 'companyId' | 'createdAt' | 'updatedAt' | 'tenant' | 'property'>) => Promise<void>
  updateAdjustment: (id: string, data: Partial<RentAdjustmentData>) => Promise<void>
  cancelAdjustment: (id: string, reason?: string) => Promise<void>

  // Tenant Groups CRUD
  addTenantGroup: (data: { propertyId: string; name: string; nameAr?: string; nameBn?: string; nameUr?: string; billingMode?: string; notes?: string; tenantIds?: string[] }) => Promise<TenantGroupData>
  updateTenantGroup: (id: string, data: Partial<TenantGroupData> & { tenantIds?: string[] }) => Promise<void>
  deleteTenantGroup: (id: string) => Promise<void>
  recordGroupPayment: (groupId: string, data: { amount: number; month: number; year: number; method: string; reference?: string; notes?: string; paymentDate: string; allocationType?: string; customAllocation?: { tenantId: string; amount: number }[] }) => Promise<any>

  // Expenses CRUD
  addExpense: (data: Omit<ExpenseData, 'id' | 'companyId' | 'createdAt'>) => Promise<void>
  updateExpense: (id: string, data: Partial<ExpenseData>) => Promise<void>
  deleteExpense: (id: string) => Promise<void>

  // Maintenance CRUD
  addMaintenance: (data: Omit<MaintenanceData, 'id' | 'companyId' | 'createdAt'>) => Promise<void>
  updateMaintenance: (id: string, data: Partial<MaintenanceData>) => Promise<void>
  deleteMaintenance: (id: string) => Promise<void>

  // Seed data
  seedData: () => Promise<void>
  clearData: () => void

  // Getters - computed data
  getTenantsWithRelations: () => TenantData[]
  getPropertiesWithTenants: (includeArchived?: boolean) => PropertyData[]
  getDashboardData: () => any
  getReportData: (month: number, year: number) => any

  // Server-side data fetching (preferred at scale)
  fetchDashboardData: () => Promise<any>
  fetchReportData: (month: number, year: number) => Promise<any>
}

const DEFAULT_COMPANY: CompanyInfo = {
  id: '',
  name: '',
  nameAr: '',
  nameBn: '',
  nameUr: '',
  phone: '',
  email: '',
  address: '',
}

// Helper: check if an adjustment applies to a given month/year
// For multi-month adjustments (durationMonths > 1), the adjustment applies to every month
// from effectiveMonth/effectiveYear for durationMonths months
function isAdjustmentActiveInMonth(adjustment: RentAdjustmentData, month: number, year: number): boolean {
  if (adjustment.status !== 'approved') return false

  const startDate = new Date(adjustment.effectiveYear, adjustment.effectiveMonth - 1, 1)
  const checkDate = new Date(year, month - 1, 1)
  const endDate = new Date(
    adjustment.effectiveYear + Math.floor((adjustment.effectiveMonth - 1 + adjustment.durationMonths) / 12),
    ((adjustment.effectiveMonth - 1 + adjustment.durationMonths) % 12),
    0 // last day of the end month
  )

  return checkDate >= startDate && checkDate <= endDate
}

// PHASE 2: Dedup guard for 401 handling — prevent multiple simultaneous signOut calls
let isHandling401 = false

// API helper — handles 401 by redirecting to login (with dedup guard)
async function apiCall(url: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  // PHASE 2 FIX: On 401 Unauthorized, redirect to login page with dedup guard
  if (res.status === 401) {
    if (!isHandling401 && typeof window !== 'undefined') {
      isHandling401 = true
      try {
        // Use NextAuth signOut to properly clear session
        const { signOut } = await import('next-auth/react')
        await signOut({ callbackUrl: '/' })
      } finally {
        // Reset after a delay to allow future 401s if session expires again
        setTimeout(() => { isHandling401 = false }, 5000)
      }
    }
    throw new Error('Session expired. Please log in again.')
  }

  // PHASE 2: Handle 409 Conflict (optimistic concurrency failure)
  if (res.status === 409) {
    const data = await res.json().catch(() => ({ error: 'Record was modified by another user' }))
    const error = new Error(data.error || 'Record was modified by another user. Please refresh and try again.')
    ;(error as any).isConflict = true
    ;(error as any).statusCode = 409
    throw error
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(data.error || `Request failed with status ${res.status}`)
  }
  return res.json()
}

export const useDataStore = create<DataState>()(
  (set, get) => ({
    company: DEFAULT_COMPANY,
    users: [],
    resetRequests: [],
    properties: [],
    tenants: [],
    payments: [],
    expenses: [],
    maintenanceItems: [],
    reservations: [],
    adjustments: [],
    tenantGroups: [],
    isSeeded: false,
    isLoading: false,
    isInitialized: false,

    // Fetch all data from API on app load
    fetchAllData: async () => {
      if (get().isLoading) return
      set({ isLoading: true })

      try {
        // Fetch all data in parallel
        // Staff can now view payments (amounts masked) and users (still blocked via 403 catch)
        const [companyData, propertiesData, tenantsData, paymentsData, expensesData, maintenanceData, usersData, resetData, reservationsData, adjustmentsData, tenantGroupsData] = await Promise.all([
          apiCall('/api/company').catch(() => null),
          apiCall('/api/properties?includeArchived=true&limit=1000').catch(() => ({ data: [] })),
          apiCall('/api/tenants?limit=1000').catch(() => ({ data: [] })),
          apiCall('/api/payments?limit=1000').catch(() => ({ data: [] })),
          apiCall('/api/expenses?limit=1000').catch(() => ({ data: [] })),
          apiCall('/api/maintenance?limit=1000').catch(() => ({ data: [] })),
          apiCall('/api/users?limit=1000').catch(() => ({ data: [] })),
          apiCall('/api/reset-requests').catch(() => []),
          apiCall('/api/reservations?limit=1000').catch(() => ({ data: [] })),
          apiCall('/api/adjustments?limit=1000').catch(() => ({ data: [] })),
          apiCall('/api/tenant-groups').catch(() => []),
        ])

        // Helper to extract data from paginated or plain responses
        const extractData = (resp: any): any[] => {
          if (!resp) return []
          if (Array.isArray(resp)) return resp
          if (resp.data && Array.isArray(resp.data)) return resp.data
          return []
        }

        set({
          company: companyData || DEFAULT_COMPANY,
          properties: extractData(propertiesData),
          tenants: extractData(tenantsData),
          payments: extractData(paymentsData),
          expenses: extractData(expensesData),
          maintenanceItems: extractData(maintenanceData),
          users: extractData(usersData),
          resetRequests: extractData(resetData),
          reservations: extractData(reservationsData),
          adjustments: extractData(adjustmentsData),
          tenantGroups: Array.isArray(tenantGroupsData) ? tenantGroupsData : (extractData(tenantGroupsData)),
          isSeeded: true, // If data was fetched, it's seeded
          isInitialized: true,
          isLoading: false,
        })
      } catch (error) {
        console.error('Failed to fetch data:', error)
        set({ isLoading: false, isInitialized: true })
      }
    },

    // Refresh all data after mutations — forces re-fetch to ensure consistency
    refreshAllData: async () => {
      try {
        const [propertiesData, tenantsData, paymentsData, expensesData, maintenanceData, reservationsData, adjustmentsData, tenantGroupsData] = await Promise.all([
          apiCall('/api/properties?includeArchived=true&limit=1000').catch(() => ({ data: [] })),
          apiCall('/api/tenants?limit=1000').catch(() => ({ data: [] })),
          apiCall('/api/payments?limit=1000').catch(() => ({ data: [] })),
          apiCall('/api/expenses?limit=1000').catch(() => ({ data: [] })),
          apiCall('/api/maintenance?limit=1000').catch(() => ({ data: [] })),
          apiCall('/api/reservations?limit=1000').catch(() => ({ data: [] })),
          apiCall('/api/adjustments?limit=1000').catch(() => ({ data: [] })),
          apiCall('/api/tenant-groups').catch(() => []),
        ])

        const extractData = (resp: any): any[] => {
          if (!resp) return []
          if (Array.isArray(resp)) return resp
          if (resp.data && Array.isArray(resp.data)) return resp.data
          return []
        }

        set({
          properties: extractData(propertiesData),
          tenants: extractData(tenantsData),
          payments: extractData(paymentsData),
          expenses: extractData(expensesData),
          maintenanceItems: extractData(maintenanceData),
          reservations: extractData(reservationsData),
          adjustments: extractData(adjustmentsData),
          tenantGroups: Array.isArray(tenantGroupsData) ? tenantGroupsData : (extractData(tenantGroupsData)),
        })
      } catch (error) {
        console.error('Failed to refresh data:', error)
      }
    },

    // User Management
    generateRandomPassword: () => {
      const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
      const lowercase = 'abcdefghijkmnpqrstuvwxyz'
      const digits = '23456789'
      const special = '!@#'
      // Ensure at least one of each required category (password policy: min 8 chars, 1 uppercase, 1 number)
      let password =
        uppercase.charAt(Math.floor(Math.random() * uppercase.length)) +
        digits.charAt(Math.floor(Math.random() * digits.length)) +
        special.charAt(Math.floor(Math.random() * special.length))
      const allChars = uppercase + lowercase + digits + special
      for (let i = 3; i < 12; i++) {
        password += allChars.charAt(Math.floor(Math.random() * allChars.length))
      }
      // Shuffle to avoid predictable positions
      return password.split('').sort(() => Math.random() - 0.5).join('')
    },

    addUser: async (data) => {
      const user = await apiCall('/api/users', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      set(s => ({ users: [...s.users, user] }))
      return user
    },

    updateUser: async (id, data) => {
      const updated = await apiCall(`/api/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
      set(s => ({
        users: s.users.map(u => u.id === id ? { ...u, ...updated } : u),
      }))
    },

    deleteUser: async (id) => {
      await apiCall(`/api/users/${id}`, { method: 'DELETE' })
      set(s => ({
        users: s.users.map(u => u.id === id ? { ...u, isActive: false } : u),
      }))
    },

    resetUserPassword: async (id, newPassword) => {
      await apiCall('/api/users/reset-password', {
        method: 'POST',
        body: JSON.stringify({ userId: id, newPassword }),
      })
    },

    // Reset Requests
    addResetRequest: async (data) => {
      const request = await apiCall('/api/reset-requests', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      set(s => ({ resetRequests: [...s.resetRequests, request] }))
      return request
    },

    resolveResetRequest: async (id, resolvedBy) => {
      await apiCall(`/api/reset-requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'resolved' }),
      })
      set(s => ({
        resetRequests: s.resetRequests.map(r =>
          r.id === id ? { ...r, status: 'resolved' as const, resolvedAt: new Date().toISOString(), resolvedBy } : r
        ),
      }))
    },

    dismissResetRequest: async (id, resolvedBy) => {
      await apiCall(`/api/reset-requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'dismissed' }),
      })
      set(s => ({
        resetRequests: s.resetRequests.map(r =>
          r.id === id ? { ...r, status: 'dismissed' as const, resolvedAt: new Date().toISOString(), resolvedBy } : r
        ),
      }))
    },

    getPendingResetCount: () => {
      return get().resetRequests.filter(r => r.status === 'pending').length
    },

    // Properties CRUD
    addProperty: async (data) => {
      const newProp = await apiCall('/api/properties', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      set(s => ({ properties: [...s.properties, { ...newProp, tenants: [] }] }))
      await get().refreshAllData()
    },

    updateProperty: async (id, data) => {
      const updated = await apiCall(`/api/properties/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
      set(s => ({
        properties: s.properties.map(p => p.id === id ? { ...p, ...updated } : p),
      }))
      await get().refreshAllData()
    },

    deleteProperty: async (id) => {
      await apiCall(`/api/properties/${id}`, { method: 'DELETE' })
      set(s => ({
        properties: s.properties.filter(p => p.id !== id),
        tenants: s.tenants.filter(t => t.propertyId !== id),
      }))
      await get().refreshAllData()
    },

    archiveProperty: async (id, archived) => {
      await apiCall(`/api/properties/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived }),
      })
      set(s => ({
        properties: s.properties.map(p => p.id === id ? { ...p, archived } : p),
      }))
      await get().refreshAllData()
    },

    // Tenants CRUD
    addTenant: async (data) => {
      const newTenant = await apiCall('/api/tenants', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      set(s => ({ tenants: [...s.tenants, { ...newTenant, payments: [] }] }))
      await get().refreshAllData()
    },

    updateTenant: async (id, data) => {
      const updated = await apiCall(`/api/tenants/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
      set(s => ({
        tenants: s.tenants.map(t => t.id === id ? { ...t, ...updated } : t),
      }))
      await get().refreshAllData()
    },

    deleteTenant: async (id) => {
      await apiCall(`/api/tenants/${id}`, { method: 'DELETE' })
      // Move Out: the tenant stays in the system with status 'moved_out'
      // We refresh all data to reflect the updated status and unit availability
      await get().refreshAllData()
    },

    // Payments
    addPayment: async (data) => {
      const newPayment = await apiCall('/api/payments', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      set(s => ({ payments: [...s.payments, newPayment] }))

      // Update tenant score locally if late (server already did it, but update UI)
      if (data.isLate) {
        set(s => ({
          tenants: s.tenants.map(t => t.id === data.tenantId ? {
            ...t,
            latePaymentCount: t.latePaymentCount + 1,
            // Only update tenantScore if no manual override is active
            tenantScore: (t.manualScoreOverride !== null && t.manualScoreOverride !== undefined) ? t.tenantScore : Math.max(0, t.tenantScore - 5),
            systemScore: Math.max(0, (t.systemScore ?? t.tenantScore) - 5),
          } : t),
        }))
      }
      await get().refreshAllData()
    },

    updatePayment: async (id, data) => {
      const { reason, ...paymentData } = data
      const updated = await apiCall(`/api/payments/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...paymentData, reason }),
      })
      set(s => ({
        payments: s.payments.map(p => p.id === id ? { ...p, ...updated } : p),
      }))
      await get().refreshAllData()
    },

    deletePayment: async (id, reason) => {
      const url = reason
        ? `/api/payments/${id}?reason=${encodeURIComponent(reason)}`
        : `/api/payments/${id}`
      await apiCall(url, { method: 'DELETE' })
      set(s => ({ payments: s.payments.filter(p => p.id !== id) }))
      await get().refreshAllData()
    },

    // Adjustments CRUD
    addAdjustment: async (data) => {
      const newAdjustment = await apiCall('/api/adjustments', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      set(s => ({ adjustments: [...s.adjustments, newAdjustment] }))
      await get().refreshAllData()
    },

    updateAdjustment: async (id, data) => {
      const updated = await apiCall(`/api/adjustments/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
      set(s => ({
        adjustments: s.adjustments.map(a => a.id === id ? { ...a, ...updated } : a),
      }))
      await get().refreshAllData()
    },

    cancelAdjustment: async (id, reason) => {
      const url = reason
        ? `/api/adjustments/${id}?reason=${encodeURIComponent(reason)}`
        : `/api/adjustments/${id}`
      await apiCall(url, { method: 'DELETE' })
      set(s => ({
        adjustments: s.adjustments.map(a => a.id === id ? { ...a, status: 'cancelled' } : a),
      }))
      await get().refreshAllData()
    },

    // Tenant Groups CRUD
    addTenantGroup: async (data) => {
      const newGroup = await apiCall('/api/tenant-groups', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      set(s => ({ tenantGroups: [...s.tenantGroups, newGroup] }))
      await get().refreshAllData()
      return newGroup
    },

    updateTenantGroup: async (id, data) => {
      const { tenantIds, ...groupData } = data as any
      const updated = await apiCall(`/api/tenant-groups/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
      set(s => ({
        tenantGroups: s.tenantGroups.map(g => g.id === id ? { ...g, ...updated } : g),
      }))
      await get().refreshAllData()
    },

    deleteTenantGroup: async (id) => {
      await apiCall(`/api/tenant-groups/${id}`, { method: 'DELETE' })
      set(s => ({
        tenantGroups: s.tenantGroups.filter(g => g.id !== id),
      }))
      await get().refreshAllData()
    },

    recordGroupPayment: async (groupId, data) => {
      const result = await apiCall(`/api/tenant-groups/${groupId}/pay`, {
        method: 'POST',
        body: JSON.stringify(data),
      })
      await get().refreshAllData()
      return result
    },

    // Expenses CRUD
    addExpense: async (data) => {
      const newExpense = await apiCall('/api/expenses', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      set(s => ({ expenses: [...s.expenses, newExpense] }))
      await get().refreshAllData()
    },

    updateExpense: async (id, data) => {
      const updated = await apiCall(`/api/expenses/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
      set(s => ({
        expenses: s.expenses.map(e => e.id === id ? { ...e, ...updated } : e),
      }))
      await get().refreshAllData()
    },

    deleteExpense: async (id) => {
      await apiCall(`/api/expenses/${id}`, { method: 'DELETE' })
      set(s => ({ expenses: s.expenses.filter(e => e.id !== id) }))
      await get().refreshAllData()
    },

    // Maintenance CRUD
    addMaintenance: async (data) => {
      const newItem = await apiCall('/api/maintenance', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      set(s => ({ maintenanceItems: [...s.maintenanceItems, newItem] }))
      await get().refreshAllData()
    },

    updateMaintenance: async (id, data) => {
      const updated = await apiCall(`/api/maintenance/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
      set(s => ({
        maintenanceItems: s.maintenanceItems.map(m => m.id === id ? { ...m, ...updated } : m),
      }))
      await get().refreshAllData()
    },

    deleteMaintenance: async (id) => {
      await apiCall(`/api/maintenance/${id}`, { method: 'DELETE' })
      set(s => ({ maintenanceItems: s.maintenanceItems.filter(m => m.id !== id) }))
      await get().refreshAllData()
    },

    // Reservations CRUD
    addReservation: async (data) => {
      await apiCall('/api/reservations', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      await get().refreshAllData()
    },

    updateReservation: async (id, data) => {
      await apiCall(`/api/reservations/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
      await get().refreshAllData()
    },

    cancelReservation: async (id) => {
      await apiCall(`/api/reservations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'cancel' }),
      })
      await get().refreshAllData()
    },

    convertReservation: async (id, data) => {
      await apiCall(`/api/reservations/${id}/convert`, {
        method: 'POST',
        body: JSON.stringify(data),
      })
      await get().refreshAllData()
    },

    deleteReservation: async (id) => {
      await apiCall(`/api/reservations/${id}`, { method: 'DELETE' })
      await get().refreshAllData()
    },

    // Seed
    seedData: async () => {
      await apiCall('/api/seed', { method: 'POST' })
      // Re-fetch all data after seeding
      await get().fetchAllData()
    },

    clearData: () => {
      set({
        company: DEFAULT_COMPANY,
        users: [],
        resetRequests: [],
        properties: [],
        tenants: [],
        payments: [],
        expenses: [],
        maintenanceItems: [],
        reservations: [],
        adjustments: [],
        tenantGroups: [],
        isSeeded: false,
        isLoading: false,
        isInitialized: false, // CRITICAL: Reset so next login triggers fetchAllData
      })
    },

    // Getters - computed from local state (same logic as before)
    getTenantsWithRelations: () => {
      const { tenants, payments, properties, adjustments } = get()
      return tenants.map(tenant => ({
        ...tenant,
        payments: payments.filter(p => p.tenantId === tenant.id),
        adjustments: adjustments.filter(a => a.tenantId === tenant.id),
        property: properties.find(p => p.id === tenant.propertyId) || undefined,
      }))
    },

    getPropertiesWithTenants: (includeArchived = false) => {
      const { properties, tenants, payments, adjustments } = get()
      return properties
        .filter(p => includeArchived || !p.archived)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .map(p => ({
          ...p,
          tenants: tenants.filter(t => t.propertyId === p.id && isFinanciallyActive(t.status)).map(t => ({
            ...t,
            payments: payments.filter(p => p.tenantId === t.id),
            adjustments: adjustments.filter(a => a.tenantId === t.id),
          })),
        }))
    },

    getDashboardData: () => {
      const { company, tenants, payments, properties, expenses, maintenanceItems, adjustments } = get()
      const now = new Date()
      const currentMonth = now.getMonth() + 1
      const currentYear = now.getFullYear()

      const activeTenants = tenants.filter(t => isFinanciallyActive(t.status))
      const expectedRevenue = activeTenants.reduce((sum, t) => sum + t.rentAmount, 0)
      const currentMonthPayments = payments.filter(p => p.month === currentMonth && p.year === currentYear)
      const collectedRevenue = currentMonthPayments.reduce((sum, p) => sum + p.amount, 0)

      // Calculate adjustments for current month (including multi-month adjustments)
      const currentMonthAdjustments = adjustments.filter(a => {
        if (a.status !== 'approved') return false
        return isAdjustmentActiveInMonth(a, currentMonth, currentYear)
      })
      const totalAdjustments = currentMonthAdjustments.reduce((sum, a) => sum + a.amount, 0)

      const overdueTenants = activeTenants.filter(t => {
        const hasPaid = payments.some(p => p.tenantId === t.id && p.month === currentMonth && p.year === currentYear)
        return !hasPaid
      })

      const partialTenants = activeTenants.filter(t => {
        const monthPayments = payments.filter(p => p.tenantId === t.id && p.month === currentMonth && p.year === currentYear)
        const totalPaid = monthPayments.reduce((sum, p) => sum + p.amount, 0)
        return totalPaid > 0 && totalPaid < t.rentAmount
      })

      const overdueAmount = overdueTenants.reduce((sum, t) => sum + t.rentAmount, 0)
      const partialAmount = partialTenants.reduce((sum, t) => {
        const paid = payments.filter(p => p.tenantId === t.id && p.month === currentMonth && p.year === currentYear).reduce((s, p) => s + p.amount, 0)
        return sum + (t.rentAmount - paid)
      }, 0)

      const totalUnits = properties.reduce((sum, p) => sum + p.totalUnits, 0)
      const occupiedUnits = activeTenants.length
      const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      const chartData: any[] = []
      for (let i = 5; i >= 0; i--) {
        let m = currentMonth - i, y = currentYear
        if (m <= 0) { m += 12; y -= 1 }
        const monthExpected = activeTenants.reduce((sum, t) => sum + t.rentAmount, 0)
        const monthPayments = payments.filter(p => p.month === m && p.year === y)
        const monthCollected = monthPayments.reduce((sum, p) => sum + p.amount, 0)
        chartData.push({ month: monthNames[m - 1], expected: monthExpected, collected: monthCollected })
      }

      const recentPayments = payments
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 10)
        .map(p => ({
          ...p,
          tenant: tenants.find(t => t.id === p.tenantId) || undefined,
        }))

      const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0)

      return {
        company,
        stats: {
          expectedRevenue,
          collectedRevenue,
          overdueCount: overdueTenants.length,
          overdueAmount: overdueAmount + partialAmount,
          activeTenants: activeTenants.length,
          totalTenants: tenants.length,
          occupancyRate,
          totalUnits,
          occupiedUnits,
          partialCount: partialTenants.length,
          netProfit: collectedRevenue - totalExpenses,
          totalExpenses,
          totalAdjustments,
          netCashCollected: collectedRevenue - totalAdjustments,
        },
        overdueTenants: overdueTenants.map(t => ({
          ...t,
          payments: payments.filter(p => p.tenantId === t.id),
          property: properties.find(p => p.id === t.propertyId) || undefined,
        })),
        partialTenants: partialTenants.map(t => ({
          ...t,
          payments: payments.filter(p => p.tenantId === t.id),
          property: properties.find(p => p.id === t.propertyId) || undefined,
        })),
        dueSoon: [],
        activeTenantsList: activeTenants.map(t => ({
          ...t,
          payments: payments.filter(p => p.tenantId === t.id),
          property: properties.find(p => p.id === t.propertyId) || undefined,
        })),
        recentPayments,
        chartData,
        properties: properties
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
          .map(p => ({
            ...p,
            tenants: tenants.filter(t => t.propertyId === p.id && isFinanciallyActive(t.status)),
          })),
        expenses,
        maintenanceItems,
      }
    },

    getReportData: (month, year) => {
      const { tenants, payments, properties, expenses, adjustments } = get()
      const activeTenants = tenants.filter(t => isFinanciallyActive(t.status))
      const expectedRevenue = activeTenants.reduce((sum, t) => sum + t.rentAmount, 0)
      const monthPayments = payments.filter(p => p.month === month && p.year === year)
      const totalRevenue = monthPayments.reduce((sum, p) => sum + p.amount, 0)

      // Calculate adjustments for this month
      const monthAdjustments = adjustments.filter(a => {
        if (a.status !== 'approved') return false
        return isAdjustmentActiveInMonth(a, month, year)
      })
      const totalAdjustments = monthAdjustments.reduce((sum, a) => sum + a.amount, 0)

      const monthlyExpenses = expenses.filter(e => {
        const d = new Date(e.date)
        return d.getMonth() + 1 === month && d.getFullYear() === year
      })
      const totalExpenses = monthlyExpenses.reduce((sum, e) => sum + e.amount, 0)
      const totalUnits = properties.reduce((sum, p) => sum + p.totalUnits, 0)
      const occupiedUnits = activeTenants.length
      const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0
      const collectionRate = expectedRevenue > 0 ? Math.round((totalRevenue / expectedRevenue) * 100) : 0

      const expenseBreakdown: Record<string, number> = {}
      for (const e of monthlyExpenses) {
        expenseBreakdown[e.category] = (expenseBreakdown[e.category] || 0) + e.amount
      }

      const vacantUnits = totalUnits - occupiedUnits
      const avgRent = activeTenants.length > 0 ? expectedRevenue / activeTenants.length : 0
      const vacancyLoss = vacantUnits * avgRent

      const unpaidTenants = activeTenants.filter(t => !monthPayments.some(p => p.tenantId === t.id))
      const partialTenants = activeTenants.filter(t => {
        const paid = monthPayments.filter(p => p.tenantId === t.id).reduce((s, p) => s + p.amount, 0)
        return paid > 0 && paid < t.rentAmount
      })
      const unpaidAmount = unpaidTenants.reduce((s, t) => s + t.rentAmount, 0) + partialTenants.reduce((s, t) => {
        const paid = monthPayments.filter(p => p.tenantId === t.id).reduce((sum, p) => sum + p.amount, 0)
        return s + (t.rentAmount - paid)
      }, 0)

      const trend: any[] = []
      for (let i = 5; i >= 0; i--) {
        let m = month - i, y = year
        if (m <= 0) { m += 12; y -= 1 }
        const tPayments = payments.filter(p => p.month === m && p.year === y)
        const revenue = tPayments.reduce((s, p) => s + p.amount, 0)
        const tExpenses = expenses.filter(e => {
          const d = new Date(e.date)
          return d.getMonth() + 1 === m && d.getFullYear() === y
        }).reduce((s, e) => s + e.amount, 0)
        trend.push({ month: m, year: y, revenue, expenses: tExpenses, profit: revenue - tExpenses })
      }

      const rentalIncome = totalRevenue
      const otherIncome = 0
      const grossRevenue = rentalIncome + otherIncome
      const badDebt = unpaidAmount
      const grossProfit = grossRevenue - vacancyLoss - badDebt
      const costOfOperations = totalExpenses
      const netIncome = grossProfit - costOfOperations

      return {
        month, year, totalRevenue, expectedRevenue, totalExpenses,
        profitLoss: totalRevenue - totalExpenses,
        occupancyRate, collectionRate, totalUnits, occupiedUnits,
        expenseBreakdown, monthlyExpenses, trend,
        rentalIncome, otherIncome, grossRevenue, vacancyLoss, badDebt,
        grossProfit, costOfOperations, netIncome,
        totalAdjustments,
        cashCollected: totalRevenue,
        adjustmentTotal: totalAdjustments,
        netRevenue: totalRevenue + totalAdjustments,
      }
    },

    // Server-side data fetching (preferred at scale — uses aggregated server endpoints)
    fetchDashboardData: async () => {
      try {
        const data = await apiCall('/api/dashboard')
        return data
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error)
        return null
      }
    },

    fetchReportData: async (month: number, year: number) => {
      try {
        const data = await apiCall(`/api/reports?month=${month}&year=${year}`)
        return data
      } catch (error) {
        console.error('Failed to fetch report data:', error)
        return null
      }
    },
  })
)
