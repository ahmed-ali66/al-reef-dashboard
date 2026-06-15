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
 *   month: number
 *   year: number
 *   method: string (cash, bank_transfer, cheque)
 *   reference?: string
 *   notes?: string
 *   paymentDate: string (ISO date)
 *   allocationType?: string (CURRENT_RENT, HISTORICAL_DEBT, ADVANCE_PAYMENT)
 *   customAllocation?: { tenantId: string, amount: number }[] (optional override)
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

    // Create individual payment records in a transaction
    const paymentRecords = await prisma.$transaction(async (tx) => {
      const records = []

      for (const alloc of allocations) {
        if (alloc.amount <= 0) continue

        const tenant = group.tenants.find(t => t.id === alloc.tenantId)!
        const allocAmount = safeDecimal(alloc.amount)

        const payment = await tx.payment.create({
          data: {
            companyId: user.companyId,
            tenantId: alloc.tenantId,
            amount: allocAmount,
            date: paymentDateObj,
            month: parsedMonth,
            year: parsedYear,
            method: method || null,
            reference: reference || null,
            notes: notes ? `[Group: ${group.name}] ${notes}` : `[Group: ${group.name}]`,
            isLate,
            daysLate,
            allocationType: parsedAllocationType,
          },
        })

        // Handle allocation type business logic per tenant
        if (parsedAllocationType === 'ADVANCE_PAYMENT') {
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
        } else if (parsedAllocationType === 'HISTORICAL_DEBT') {
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
