/**
 * Centralized Financial Calculation Utilities
 *
 * All balance calculations across the application MUST use these functions
 * to ensure consistency between tenant cards, invoices, PDFs, dashboard, and reports.
 *
 * Formula:
 *   Current Charges = rentAmount + municipalityFee + adjustments
 *   Total Due       = Opening Balance + Current Charges - Credit Balance
 *   Remaining       = Total Due - Payments Received
 */

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
  currentCharges: number      // rentAmount + muniFee + adjustments
  totalDue: number            // openingBalance + currentCharges - creditBalance
  remainingBalance: number    // totalDue - paymentsReceived
  paymentsReceived: number
  openingBalance: number
  creditBalance: number
  muniFee: number
  adjustments: number
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
    ? (input.municipalityFee != null ? Number(input.municipalityFee) : Math.round(rentAmount * 0.05))
    : 0

  const currentCharges = rentAmount + muniFee + adjustments
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
