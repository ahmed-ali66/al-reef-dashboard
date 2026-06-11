/**
 * Canonical Finance Utility for Recurring Bills
 *
 * SINGLE SOURCE OF TRUTH ARCHITECTURE
 * ====================================
 * This module is the ONLY place where financial calculations for recurring bills
 * are defined. ALL modules (API, PDF, XLSX, Dashboard) MUST use these functions.
 *
 * RULES:
 * 1. bill.currentOutstanding is the ONLY valid source for outstanding balances
 * 2. Paid amounts MUST be derived from actual BillPayment records (never inferred)
 * 3. BillCycle.outstandingAmount is NOT used for global totals
 * 4. No "correctedBills" or override arrays are allowed
 * 5. bill.nextDueDate is the SOLE source of truth for date-based classification
 */

import { safeNumber } from '@/lib/api-utils'

// ─── Types ────────────────────────────────────────────────────────

/** Minimal bill shape required by all finance functions */
export interface FinanceBill {
  id: string
  status: string
  currentOutstanding: number | string
  previousOutstanding?: number | string
  totalAmountDue?: number | string
  nextDueDate: string | Date
  lastPaymentDate?: string | Date | null
  lastPaymentAmount?: number | string | null
  cycles?: Array<{
    amount?: number | string
    paidAmount?: number | string
    outstandingAmount?: number | string
    status?: string
    dueDate?: string | Date
    _count?: { payments?: number }
  }>
  payments?: Array<{
    amount: number | string
    paymentDate: string | Date
    paymentMethod?: string
    reference?: string
  }>
}

export type PaymentStatus = 'paid' | 'partially_paid' | 'unpaid'

// ─── Outstanding ──────────────────────────────────────────────────

/**
 * Get the outstanding balance for a bill.
 * SOLE source of truth: bill.currentOutstanding
 * NEVER use cycle-level aggregation for this.
 */
export function getOutstanding(bill: FinanceBill): number {
  return safeNumber(bill.currentOutstanding)
}

/**
 * Get the previous outstanding balance for a bill.
 * This is the bill-level previousOutstanding, NOT a report-wide value.
 */
export function getPreviousOutstanding(bill: FinanceBill): number {
  return safeNumber(bill.previousOutstanding)
}

// ─── Payment Detection ───────────────────────────────────────────

/**
 * Check if a bill has ANY actual payment records.
 * This is the ONLY valid way to determine if payments have been made.
 *
 * Checks:
 * 1. bill.lastPaymentDate is set (server sets this on payment)
 * 2. Any cycle has paidAmount > 0
 * 3. Any cycle has linked payment records (_count.payments > 0)
 */
export function hasActualPayments(bill: FinanceBill): boolean {
  // 1. lastPaymentDate is the most reliable indicator
  if (bill.lastPaymentDate) return true

  // 2. Check cycle-level evidence of real payments
  if (bill.cycles && bill.cycles.length > 0) {
    return bill.cycles.some((c) => {
      const paidAmt = safeNumber(c.paidAmount)
      if (paidAmt > 0) return true
      if (c._count?.payments && c._count.payments > 0) return true
      return false
    })
  }

  // 3. Check payment records directly
  if (bill.payments && bill.payments.length > 0) {
    return true
  }

  return false
}

// ─── Payment Status Classification ───────────────────────────────

/**
 * Classify a bill's payment status using STRICT rules:
 *
 * PAID:           currentOutstanding <= 0 AND has real payment records
 * PARTIALLY PAID: currentOutstanding > 0 AND has real payment records
 * UNPAID:         currentOutstanding > 0 AND NO real payment records
 *
 * A bill with outstanding <= 0 but NO payment records is UNPAID (never activated).
 */
export function getPaymentStatus(bill: FinanceBill): PaymentStatus {
  const outstanding = getOutstanding(bill)
  const hasPayments = hasActualPayments(bill)

  if (outstanding <= 0 && hasPayments) {
    return 'paid'
  }
  if (outstanding > 0 && hasPayments) {
    return 'partially_paid'
  }
  return 'unpaid'
}

/**
 * Check if a bill is classified as "Paid"
 */
export function isPaid(bill: FinanceBill): boolean {
  return getPaymentStatus(bill) === 'paid'
}

/**
 * Check if a bill is classified as "Partially Paid"
 */
export function isPartiallyPaid(bill: FinanceBill): boolean {
  return getPaymentStatus(bill) === 'partially_paid'
}

/**
 * Check if a bill is classified as "Unpaid"
 */
export function isUnpaid(bill: FinanceBill): boolean {
  return getPaymentStatus(bill) === 'unpaid'
}

/**
 * Check if a bill has an outstanding balance (> 0)
 */
export function hasOutstanding(bill: FinanceBill): boolean {
  return getOutstanding(bill) > 0
}

// ─── Date-Based Classification ───────────────────────────────────

/**
 * Check if a bill is overdue.
 * Uses bill.nextDueDate as SOLE source of truth.
 * Overdue ONLY IF: currentDate > nextDueDate (same-day is NOT overdue).
 */
export function isOverdue(bill: FinanceBill, referenceDate?: Date): boolean {
  if (bill.status !== 'active') return false
  const ref = referenceDate ?? new Date()
  const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
  const dueDate = new Date(bill.nextDueDate)
  const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
  return dueDay < today
}

/**
 * Check if a bill is due soon (within 7 days).
 * Uses bill.nextDueDate as SOLE source of truth.
 */
export function isDueSoon(bill: FinanceBill, referenceDate?: Date): boolean {
  if (bill.status !== 'active') return false
  const ref = referenceDate ?? new Date()
  const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
  const dueDate = new Date(bill.nextDueDate)
  const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
  const sevenDays = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
  return dueDay >= today && dueDay <= sevenDays
}

/**
 * Check if a bill is upcoming (due within 30 days).
 * Uses bill.nextDueDate as SOLE source of truth.
 */
export function isUpcoming(bill: FinanceBill, referenceDate?: Date): boolean {
  if (bill.status !== 'active') return false
  const ref = referenceDate ?? new Date()
  const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
  const dueDate = new Date(bill.nextDueDate)
  const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
  const thirtyDays = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
  return dueDay >= today && dueDay <= thirtyDays
}

// ─── Day Calculations ────────────────────────────────────────────

/**
 * Calculate days overdue for a bill.
 * Uses bill.nextDueDate as SOLE source of truth.
 * Returns 0 if not overdue.
 */
export function getDaysOverdue(bill: FinanceBill, referenceDate?: Date): number {
  if (!isOverdue(bill, referenceDate)) return 0
  const ref = referenceDate ?? new Date()
  const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
  const dueDate = new Date(bill.nextDueDate)
  const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
  const diff = today.getTime() - dueDay.getTime()
  return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)))
}

/**
 * Calculate days remaining until a bill is due.
 * Uses bill.nextDueDate as SOLE source of truth.
 */
export function getDaysRemaining(bill: FinanceBill, referenceDate?: Date): number {
  const ref = referenceDate ?? new Date()
  const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
  const dueDate = new Date(bill.nextDueDate)
  const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
  const diff = dueDay.getTime() - today.getTime()
  return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)))
}

// ─── Aggregate Calculations ──────────────────────────────────────

/**
 * Calculate total outstanding for a list of bills.
 * Uses SUM(bill.currentOutstanding) — the ONLY valid method.
 */
export function getTotalOutstanding(bills: FinanceBill[]): number {
  return bills.reduce((sum, bill) => sum + getOutstanding(bill), 0)
}

/**
 * Calculate total overdue amount for a list of bills.
 * SUM(currentOutstanding) for bills where isOverdue() returns true.
 */
export function getTotalOverdueAmount(bills: FinanceBill[], referenceDate?: Date): number {
  return bills
    .filter((b) => isOverdue(b, referenceDate))
    .reduce((sum, bill) => sum + getOutstanding(bill), 0)
}

/**
 * Categorize bills into classification groups using the canonical rules.
 * Returns counts for dashboard display.
 */
export function categorizeBills(bills: FinanceBill[], referenceDate?: Date) {
  const active = bills.filter((b) => b.status === 'active')
  const overdue = active.filter((b) => isOverdue(b, referenceDate))
  const upcoming = active.filter((b) => isUpcoming(b, referenceDate))
  const dueSoon = active.filter((b) => isDueSoon(b, referenceDate))
  const paid = active.filter((b) => isPaid(b))
  const partiallyPaid = active.filter((b) => isPartiallyPaid(b))
  const unpaid = active.filter((b) => isUnpaid(b))
  const outstanding = active.filter((b) => hasOutstanding(b))

  return {
    total: active.length,
    overdue,
    overdueCount: overdue.length,
    upcoming,
    upcomingCount: upcoming.length,
    dueSoon,
    dueSoonCount: dueSoon.length,
    paid,
    paidCount: paid.length,
    partiallyPaid,
    partiallyPaidCount: partiallyPaid.length,
    unpaid,
    unpaidCount: unpaid.length,
    outstanding,
    outstandingCount: outstanding.length,
    totalOutstanding: getTotalOutstanding(outstanding),
    totalOverdueAmount: getTotalOverdueAmount(active, referenceDate),
  }
}

// ─── Validation Guard ────────────────────────────────────────────

/**
 * Dev-only assertion: ensure totals match across modules.
 * Call this after generating totals from different code paths.
 * Throws in development if totals don't match within tolerance.
 */
export function assertTotalsMatch(
  label1: string,
  total1: number,
  label2: string,
  total2: number,
  tolerance: number = 0.01
): void {
  if (process.env.NODE_ENV === 'development') {
    if (Math.abs(total1 - total2) > tolerance) {
      const msg = `DATA INTEGRITY FAILURE: ${label1} (${total1.toFixed(2)}) != ${label2} (${total2.toFixed(2)}), diff=${Math.abs(total1 - total2).toFixed(2)}`
      console.error(msg)
      throw new Error(msg)
    }
  }
}
