import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatAED(amount: number): string {
  return new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount) + ' AED'
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-AE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function getPaymentStatusColor(status: 'paid' | 'overdue' | 'unpaid' | 'partial' | 'inactive' | 'due-soon'): string {
  switch (status) {
    case 'paid': return 'bg-emerald-500 text-white'
    case 'overdue': return 'bg-red-500 text-white'
    case 'unpaid': return 'bg-orange-500 text-white'
    case 'partial': return 'bg-amber-500 text-white'
    case 'due-soon': return 'bg-yellow-400 text-gray-900'
    case 'inactive': return 'bg-gray-300 text-gray-600'
    default: return 'bg-gray-300 text-gray-600'
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'active': return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    case 'inactive': return 'bg-gray-100 text-gray-800 border-gray-200'
    case 'evicted': return 'bg-red-100 text-red-800 border-red-200'
    case 'notice': return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'moved_out': return 'bg-blue-100 text-blue-800 border-blue-200'
    default: return 'bg-gray-100 text-gray-800 border-gray-200'
  }
}

export function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'urgent': return 'bg-red-500 text-white'
    case 'high': return 'bg-orange-500 text-white'
    case 'medium': return 'bg-amber-500 text-white'
    case 'low': return 'bg-emerald-500 text-white'
    default: return 'bg-gray-400 text-white'
  }
}

export function getMaintenanceStatusColor(status: string): string {
  switch (status) {
    case 'pending': return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'in-progress': return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'completed': return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    default: return 'bg-gray-100 text-gray-800 border-gray-200'
  }
}

export function getCategoryIcon(category: string): string {
  switch (category) {
    case 'utility': case 'utilities': return '⚡'
    case 'maintenance': case 'Maintenance': return '🔧'
    case 'insurance': return '🛡️'
    case 'salary': case 'manpower': return '👤'
    case 'other': return '📦'
    default: return '📦'
  }
}

// Helper for conditional class joining (lightweight)
export function cn2(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

/**
 * Determines if a tenant should be included in financial/operational workflows.
 * Active and Notice Period tenants are financially active (they still occupy units and owe rent).
 * Moved-out, inactive, and evicted tenants are excluded from operational calculations.
 */
export function isFinanciallyActive(status: string): boolean {
  return status === 'active' || status === 'notice'
}

/**
 * Prisma-compatible status filter for financially active tenants.
 * Use in Prisma where clauses: { status: { in: FINANCIALLY_ACTIVE_STATUSES } }
 */
export const FINANCIALLY_ACTIVE_STATUSES = ['active', 'notice'] as const

/**
 * Natural-sort collator for unit numbers.
 * - Numeric mode so '2' comes before '10' (not lexicographic).
 * - Case-insensitive so 'A1' == 'a1'.
 * - Empty unit numbers always sort last.
 */
const UNIT_NUMBER_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

/**
 * Compare two unit numbers using natural ordering.
 * Empty/null values are pushed to the end so real units stay on top.
 *
 * Examples (ascending):
 *   '1', '2', '9', '10', '11', '15', 'A1', 'A2', 'B2', 'Shop 1', 'Shop 2', '', null
 */
export function compareUnitNumbers(a?: string | null, b?: string | null): number {
  const ua = (a ?? '').trim().toLowerCase()
  const ub = (b ?? '').trim().toLowerCase()
  if (!ua && !ub) return 0
  if (!ua) return 1   // empty unit → last
  if (!ub) return -1  // empty unit → last
  return UNIT_NUMBER_COLLATOR.compare(ua, ub)
}

/**
 * Return a new array of tenants sorted by unit number ascending (natural sort).
 * Does NOT mutate the input. Tenants with no unit number are kept at the end.
 *
 * Optionally provide a secondary key — e.g. sort by property name first,
 * then by unit number within each property.
 */
export function sortByUnitNumber<T extends { unitNumber?: string | null }>(
  items: T[],
  options?: { groupBy?: (item: T) => string | undefined }
): T[] {
  const groupBy = options?.groupBy
  if (groupBy) {
    return [...items].sort((a, b) => {
      const ga = (groupBy(a) ?? '').trim().toLowerCase()
      const gb = (groupBy(b) ?? '').trim().toLowerCase()
      if (ga !== gb) return ga.localeCompare(gb)
      return compareUnitNumbers(a.unitNumber, b.unitNumber)
    })
  }
  return [...items].sort((a, b) => compareUnitNumbers(a.unitNumber, b.unitNumber))
}
