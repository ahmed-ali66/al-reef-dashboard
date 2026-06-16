/**
 * Centralized Financial Calculation Utilities
 *
 * All balance calculations across the application MUST use these functions
 * to ensure consistency between tenant cards, invoices, PDFs, dashboard, and reports.
 *
 * Formula:
 *   Current Charges = rentAmount + municipalityFee - adjustments
 *   Total Due       = Opening Balance + Current Charges - Credit Balance
 *   Remaining       = Total Due - Payments Received
 *
 * CRITICAL PAYMENT ALLOCATION CONVENTION:
 *   - HISTORICAL_DEBT payments: These reduce tenant.openingBalance in the database.
 *     They must be EXCLUDED from paymentsReceived to avoid double-counting.
 *     (Once via reduced openingBalance, once via paymentsReceived = wrong.)
 *   - CURRENT_RENT payments: These are included in paymentsReceived.
 *   - ADVANCE_PAYMENT payments: The excess portion above current charges is ALSO
 *     mirrored into tenant.creditBalance when the payment is recorded. To avoid
 *     double-counting the excess (once as creditBalance reducing totalDue, once
 *     as part of paymentsReceived reducing remaining), only the rent-coverage
 *     portion of an ADVANCE_PAYMENT belongs in paymentsReceived.
 *
 * When summing payments for the `paymentsReceived` parameter, callers MUST:
 *   1. Filter out payments where allocationType === 'HISTORICAL_DEBT'.
 *   2. For ADVANCE_PAYMENT rows, only count the portion up to the current
 *      charges (rentAmount + muniFee - adjustments). The remainder is the
 *      credit excess already reflected in tenant.creditBalance.
 *
 * Use `calculateEffectivePaymentsReceived()` below to apply this convention
 * consistently across all consumers.
 */

export interface PaymentLike {
  amount: number | string | { toNumber: () => number } // accept Prisma Decimal
  allocationType?: string | null
}

/**
 * Sum of payments that should be counted as "payments received" against
 * current charges, applying the allocation convention:
 *
 *   - Exclude HISTORICAL_DEBT (reduces openingBalance instead).
 *   - For ADVANCE_PAYMENT, cap each payment's contribution at the remaining
 *     current-charges gap so the excess (already in creditBalance) is not
 *     counted again here.
 *
 * Callers should pass the same `rentAmount`, `municipalityFee`, and
 * `adjustments` values that will be passed to `calculateFinancials()` so
 * the cap is computed against the same current-charges figure.
 */
export function calculateEffectivePaymentsReceived(
  payments: PaymentLike[],
  rentAmount: number,
  municipalityFee: number = 0,
  adjustments: number = 0,
): number {
  const toNum = (v: any): number => {
    if (v == null) return 0
    if (typeof v === 'number') return v
    if (typeof v === 'string') return Number(v) || 0
    if (typeof v.toNumber === 'function') return v.toNumber() // Prisma Decimal
    return Number(v) || 0
  }
  const currentCharges = (Number(rentAmount) || 0) + (Number(municipalityFee) || 0) - (Number(adjustments) || 0)
  let applied = 0

  // First pass: count CURRENT_RENT and untyped payments (capped at currentCharges)
  for (const p of payments) {
    const alloc = (p.allocationType || 'CURRENT_RENT').toUpperCase()
    if (alloc === 'HISTORICAL_DEBT') continue
    if (alloc === 'ADVANCE_PAYMENT') continue // handled in second pass
    applied += toNum(p.amount)
  }

  // Second pass: count ADVANCE_PAYMENT only up to the remaining current-charges gap
  let remainingCharges = Math.max(0, currentCharges - applied)
  for (const p of payments) {
    const alloc = (p.allocationType || 'CURRENT_RENT').toUpperCase()
    if (alloc !== 'ADVANCE_PAYMENT') continue
    const amount = toNum(p.amount)
    const portion = Math.min(amount, remainingCharges)
    applied += portion
    remainingCharges = Math.max(0, remainingCharges - portion)
  }

  return applied
}

export interface FinancialCalcInput {
  rentAmount: number
  municipalityFee?: number
  adjustments?: number
  openingBalance?: number
  creditBalance?: number
  paymentsReceived: number
  includeMuniFee?: boolean
}

export interface FinancialCalcResult {
  currentCharges: number      // rentAmount + muniFee - adjustments
  totalDue: number            // openingBalance + currentCharges - creditBalance
  remainingBalance: number    // totalDue - paymentsReceived
  paymentsReceived: number
  openingBalance: number
  creditBalance: number
  muniFee: number
  adjustments: number
  /**
   * True unconsumed credit on the account. Equals -remainingBalance when
   * the account is in a net credit position (i.e. payments + credits exceed
   * charges + opening balance), otherwise 0.
   */
  availableCredit: number
}

/**
 * Calculate the complete financial position for a tenant.
 *
 * This is the SINGLE SOURCE OF TRUTH for all balance calculations.
 * Every component, API route, and PDF generator must use this function.
 */
export function calculateFinancials(input: FinancialCalcInput): FinancialCalcResult {
  const openingBalance = Number(input.openingBalance) || 0
  const creditBalance = Number(input.creditBalance) || 0
  const rentAmount = Number(input.rentAmount) || 0
  const adjustments = Number(input.adjustments) || 0
  const paymentsReceived = Number(input.paymentsReceived) || 0
  const includeMuniFee = input.includeMuniFee !== false // default true

  const muniFee = includeMuniFee
    ? (input.municipalityFee != null ? Number(input.municipalityFee) : 0)
    : 0

  const currentCharges = rentAmount + muniFee - adjustments
  const totalDue = openingBalance + currentCharges - creditBalance
  const remainingBalance = totalDue - paymentsReceived

  return {
    currentCharges,
    totalDue,
    remainingBalance,
    paymentsReceived,
    openingBalance,
    creditBalance,
    muniFee,
    adjustments,
    availableCredit: remainingBalance < 0 ? Math.abs(remainingBalance) : 0,
  }
}

/**
 * Simplified calculation for tenant card display.
 * Returns just the balance that should be shown on the card.
 *
 * Balance = Opening Balance + Current Charges - Credit Balance - Payments Received
 */
export function calculateTenantCardBalance(input: FinancialCalcInput): number {
  return calculateFinancials(input).remainingBalance
}

/**
 * Determine if a tenant's financial status should show as "overdue"
 * based on their total outstanding position, not just current month rent.
 */
export function isTenantOutstanding(input: FinancialCalcInput): boolean {
  const { remainingBalance } = calculateFinancials(input)
  return remainingBalance > 0
}
