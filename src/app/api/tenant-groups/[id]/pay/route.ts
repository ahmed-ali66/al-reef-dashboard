import prisma from '@/lib/db'
import {
  getAuthUser,
  createAuditLog,
  serialize,
  errorResponse,
  successResponse,
  unauthorizedResponse,
  forbiddenResponse,
  isFinancialUser,
  safeDecimal,
  safeNumber,
} from '@/lib/api-utils'

/**
 * POST /api/tenant-groups/[id]/pay
 *
 * Record a single payment for an entire tenant group.
 * The payment is automatically allocated across the group's tenants
 * proportionally to their rent amounts.
 *
 * Body:
 *   amount: number (total payment amount)
 *   month: number (base month — the first month this payment covers)
 *   year: number (base year)
 *   method: string (cash, bank_transfer, cheque)
 *   reference?: string
 *   notes?: string
 *   paymentDate: string (ISO date — when the cash/cheque was received)
 *   allocationType?: string (CURRENT_RENT, HISTORICAL_DEBT, ADVANCE_PAYMENT)
 *   monthsCovered?: number (default 1; >1 for multi-month advances like JUN-AUG)
 *   customAllocation?: { tenantId: string, amount: number }[] (optional override)
 *
 * Multi-month advance behavior (monthsCovered > 1):
 *   - Creates monthsCovered payment records per tenant (one per month)
 *   - Each payment = tenant.rentAmount, dated as the original paymentDate
 *   - month/year fields advance: (month, year), (month+1, year), etc.
 *   - allocationType = CURRENT_RENT (each payment covers that month's rent)
 *   - Excess (if total split < amount) → creditBalance distributed equally
 *   - This ensures future monthly reports automatically show the advance
 *   - Example: 11,250 AED JUN-AUG for 3 tenants → 9 payments (3 tenants × 3 months)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()
    if (!isFinancialUser(user.role)) return forbiddenResponse()

    const { id: groupId } = await params
    const body = await request.json()

    const {
      amount,
      month,
      year,
      method,
      reference,
      notes,
      paymentDate,
      allocationType,
      monthsCovered,
      customAllocation,
    } = body

    // Validate required fields
    if (!amount || amount <= 0) return errorResponse('amount must be greater than zero')
    if (!month || !year) return errorResponse('month and year are required')
    if (!paymentDate) return errorResponse('paymentDate is required')

    const parsedAmount = safeDecimal(amount)
    if (parsedAmount <= 0) return errorResponse('amount must be greater than zero')

    const parsedMonth = safeNumber(month, 0)
    const parsedYear = safeNumber(year, 0)
    if (!parsedMonth || !parsedYear) return errorResponse('Invalid month or year')

    const validAllocationTypes = ['CURRENT_RENT', 'HISTORICAL_DEBT', 'ADVANCE_PAYMENT']
    const parsedAllocationType = allocationType && validAllocationTypes.includes(allocationType)
      ? allocationType
      : 'CURRENT_RENT'

    // Parse monthsCovered (default 1; >1 for multi-month advances)
    const parsedMonthsCovered = safeNumber(monthsCovered, 1)
    if (parsedMonthsCovered < 1 || parsedMonthsCovered > 36) {
      return errorResponse('monthsCovered must be between 1 and 36')
    }

    // For multi-month advances, force allocationType to CURRENT_RENT
    // (each monthly payment covers that month's rent, not an "advance")
    const effectiveAllocationType = parsedMonthsCovered > 1 ? 'CURRENT_RENT' : parsedAllocationType

    // Verify group exists
    const group = await prisma.tenantGroup.findFirst({
      where: { id: groupId, companyId: user.companyId, deletedAt: null, status: 'active' },
      include: {
        tenants: {
          where: { deletedAt: null, status: { in: ['active', 'notice'] } },
        },
      },
    })
    if (!group) return errorResponse('Tenant group not found or inactive', 404)
    if (group.tenants.length === 0) return errorResponse('No active tenants in this group')

    const paymentDateObj = new Date(paymentDate)
    const isLate = paymentDateObj.getDate() > 5
    const daysLate = isLate ? paymentDateObj.getDate() - 5 : 0

    // Calculate allocation
    let allocations: { tenantId: string; amount: number }[] = []

    if (customAllocation && customAllocation.length > 0) {
      // Validate custom allocation
      const totalCustom = customAllocation.reduce((sum: number, a: any) => sum + Number(a.amount), 0)

      // Allow small rounding tolerance (1 AED)
      if (Math.abs(totalCustom - parsedAmount) > 1) {
        return errorResponse(`Custom allocation total (${totalCustom}) does not match payment amount (${parsedAmount})`)
      }

      // Verify all tenantIds belong to this group
      const groupTenantIds = new Set(group.tenants.map(t => t.id))
      for (const alloc of customAllocation) {
        if (!groupTenantIds.has(alloc.tenantId)) {
          return errorResponse(`Tenant ${alloc.tenantId} does not belong to this group`)
        }
        if (Number(alloc.amount) < 0) {
          return errorResponse('Allocation amounts must be non-negative')
        }
      }

      allocations = customAllocation.map((a: any) => ({
        tenantId: a.tenantId,
        amount: Number(a.amount),
      }))
    } else {
      // Proportional allocation based on rent amounts
      const totalRent = group.tenants.reduce((sum, t) => sum + Number(t.rentAmount), 0)

      if (totalRent === 0) {
        return errorResponse('Total rent for group is zero — cannot allocate proportionally')
      }

      let remainingAmount = parsedAmount

      allocations = group.tenants.map((tenant, index) => {
        const rentShare = Number(tenant.rentAmount) / totalRent
        let allocated: number

        if (index === group.tenants.length - 1) {
          // Last tenant gets the remainder to avoid rounding errors
          allocated = remainingAmount
        } else {
          allocated = Math.round(rentShare * parsedAmount * 100) / 100 // Round to 2 decimals
          remainingAmount -= allocated
        }

        return {
          tenantId: tenant.id,
          amount: Math.max(0, allocated),
        }
      })
    }

    // Helper: advance (month, year) by `offset` months
    const advanceMonth = (m: number, y: number, offset: number): { month: number; year: number } => {
      const total = y * 12 + (m - 1) + offset
      return { month: (total % 12) + 1, year: Math.floor(total / 12) }
    }

    // Create individual payment records in a transaction
    const paymentRecords = await prisma.$transaction(async (tx) => {
      const records = []

      // For multi-month advances (monthsCovered > 1):
      // Each tenant gets `monthsCovered` payment records, one per month.
      // Each payment = tenant.rentAmount (not proportional — exact rent per month).
      // Excess (amount - sum_of_all_rents) → creditBalance distributed equally.
      if (parsedMonthsCovered > 1) {
        const totalRentAllMonths = group.tenants.reduce(
          (sum, t) => sum + Number(t.rentAmount) * parsedMonthsCovered, 0
        )
        const excess = Math.max(0, parsedAmount - totalRentAllMonths)
        const creditPerTenant = excess > 0 ? Math.floor(excess / group.tenants.length) : 0
        let remainingExcess = excess - creditPerTenant * group.tenants.length

        for (const tenant of group.tenants) {
          const rentAmount = Number(tenant.rentAmount)
          for (let offset = 0; offset < parsedMonthsCovered; offset++) {
            const { month: payMonth, year: payYear } = advanceMonth(parsedMonth, parsedYear, offset)
            const payment = await tx.payment.create({
              data: {
                companyId: user.companyId,
                tenantId: tenant.id,
                groupId,  // link payment to the group
                amount: rentAmount,
                date: paymentDateObj,
                month: payMonth,
                year: payYear,
                method: method || null,
                reference: reference || null,
                notes: notes
                  ? `[Group: ${group.name}] ${notes} (Month ${offset + 1}/${parsedMonthsCovered}: ${payMonth}/${payYear})`
                  : `[Group: ${group.name}] Multi-month advance — Month ${offset + 1}/${parsedMonthsCovered} (${payMonth}/${payYear})`,
                isLate,
                daysLate,
                allocationType: 'CURRENT_RENT',
              },
            })
            records.push(payment)
          }

          // Apply credit balance for excess
          if (creditPerTenant > 0 || remainingExcess > 0) {
            const tenantCredit = creditPerTenant + (remainingExcess > 0 ? 1 : 0)
            if (remainingExcess > 0) remainingExcess -= 1
            const currentCredit = Number(tenant.creditBalance) || 0
            await tx.tenant.update({
              where: { id: tenant.id },
              data: { creditBalance: currentCredit + tenantCredit },
            })
          }

          // Late payment score adjustment (once per tenant, not per month)
          if (isLate) {
            const newLatePaymentCount = tenant.latePaymentCount + 1
            const newSystemScore = Math.max(0, (tenant.systemScore ?? tenant.tenantScore) - 5)
            const hasOverride = tenant.manualScoreOverride !== null && tenant.manualScoreOverride !== undefined
            const newTenantScore = hasOverride ? tenant.tenantScore : newSystemScore
            await tx.tenant.update({
              where: { id: tenant.id },
              data: {
                latePaymentCount: newLatePaymentCount,
                tenantScore: newTenantScore,
                systemScore: newSystemScore,
              },
            })
          }
        }
        return records
      }

      // Single-month flow (original logic)
      for (const alloc of allocations) {
        if (alloc.amount <= 0) continue

        const tenant = group.tenants.find(t => t.id === alloc.tenantId)!
        const allocAmount = safeDecimal(alloc.amount)

        const payment = await tx.payment.create({
          data: {
            companyId: user.companyId,
            tenantId: alloc.tenantId,
            groupId,  // link payment to the group
            amount: allocAmount,
            date: paymentDateObj,
            month: parsedMonth,
            year: parsedYear,
            method: method || null,
            reference: reference || null,
            notes: notes ? `[Group: ${group.name}] ${notes}` : `[Group: ${group.name}]`,
            isLate,
            daysLate,
            allocationType: effectiveAllocationType,
          },
        })

        // Handle allocation type business logic per tenant
        if (effectiveAllocationType === 'ADVANCE_PAYMENT') {
          const currentPeriodPayments = await tx.payment.findMany({
            where: {
              tenantId: alloc.tenantId,
              month: parsedMonth,
              year: parsedYear,
              allocationType: 'CURRENT_RENT',
            },
          })
          const currentPaid = currentPeriodPayments.reduce((sum, p) => sum + Number(p.amount), 0)
          const rentAmount = Number(tenant.rentAmount)
          const excessForCredit = Math.max(0, currentPaid + allocAmount - rentAmount)

          if (excessForCredit > 0) {
            const currentCredit = Number(tenant.creditBalance) || 0
            await tx.tenant.update({
              where: { id: alloc.tenantId },
              data: { creditBalance: currentCredit + excessForCredit },
            })
          }
        } else if (effectiveAllocationType === 'HISTORICAL_DEBT') {
          const currentOpening = Number(tenant.openingBalance) || 0
          const newOpening = Math.max(0, currentOpening - allocAmount)
          await tx.tenant.update({
            where: { id: alloc.tenantId },
            data: { openingBalance: newOpening },
          })
        }

        // Late payment score adjustment
        if (isLate) {
          const newLatePaymentCount = tenant.latePaymentCount + 1
          const newSystemScore = Math.max(0, (tenant.systemScore ?? tenant.tenantScore) - 5)
          const hasOverride = tenant.manualScoreOverride !== null && tenant.manualScoreOverride !== undefined
          const newTenantScore = hasOverride ? tenant.tenantScore : newSystemScore

          await tx.tenant.update({
            where: { id: alloc.tenantId },
            data: {
              latePaymentCount: newLatePaymentCount,
              tenantScore: newTenantScore,
              systemScore: newSystemScore,
            },
          })
        }

        records.push(payment)
      }

      return records
    })

    await createAuditLog({
      action: 'CREATE',
      entity: 'Payment',
      entityId: groupId,
      userId: user.id,
      companyId: user.companyId,
      details: {
        type: 'GROUP_PAYMENT',
        groupId,
        groupName: group.name,
        totalAmount: parsedAmount,
        allocationType: parsedAllocationType,
        month: parsedMonth,
        year: parsedYear,
        allocations: allocations.map(a => ({ tenantId: a.tenantId, amount: a.amount })),
      },
    })

    return successResponse({
      groupId,
      totalAmount: parsedAmount,
      paymentCount: paymentRecords.length,
      allocations: allocations,
      payments: paymentRecords.map(serialize),
    }, 201)
  } catch (error) {
    console.error('Error creating group payment:', error)
    return errorResponse('Failed to create group payment', 500)
  }
}
