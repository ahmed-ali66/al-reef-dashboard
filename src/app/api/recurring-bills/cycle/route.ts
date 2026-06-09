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
  parsePaginationParams,
  paginatedResponse,
} from '@/lib/api-utils'

// POST /api/recurring-bills/cycle — advance billing cycle for a bill
// Creates a NEW BillCycle with the new amount instead of just overwriting
export async function POST(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    // Only financial users can advance billing cycles
    if (!isFinancialUser(user.role)) {
      return forbiddenResponse('Only owners, admins, and accountants can advance billing cycles')
    }

    const body = await request.json()
    const { billId, newAmount } = body

    if (!billId) return errorResponse('billId is required')
    if (newAmount === undefined || newAmount === null) return errorResponse('newAmount is required — the bill amount for the new cycle')

    const parsedNewAmount = safeDecimal(newAmount)
    if (parsedNewAmount < 0) return errorResponse('newAmount cannot be negative')

    const bill = await prisma.recurringBill.findFirst({
      where: { id: billId, companyId: user.companyId, deletedAt: null },
    })
    if (!bill) return errorResponse('Recurring bill not found', 404)

    // Calculate new due date
    const currentDueDate = new Date(bill.nextDueDate)
    let newDueDate: Date
    switch (bill.billingFrequency) {
      case 'monthly': newDueDate = new Date(currentDueDate); newDueDate.setMonth(newDueDate.getMonth() + 1); break
      case 'quarterly': newDueDate = new Date(currentDueDate); newDueDate.setMonth(newDueDate.getMonth() + 3); break
      case 'semi_annual': newDueDate = new Date(currentDueDate); newDueDate.setMonth(newDueDate.getMonth() + 6); break
      case 'annual': newDueDate = new Date(currentDueDate); newDueDate.setFullYear(newDueDate.getFullYear() + 1); break
      default: return errorResponse('Invalid billingFrequency')
    }

    const result = await prisma.$transaction(async (tx) => {
      // Mark current open cycles as their final status
      const openCycles = await tx.billCycle.findMany({
        where: {
          recurringBillId: billId,
          companyId: user.companyId,
          status: { in: ['pending', 'partially_paid'] },
        },
      })
      for (const cycle of openCycles) {
        const outstanding = safeDecimal(cycle.outstandingAmount)
        await tx.billCycle.update({
          where: { id: cycle.id },
          data: { status: outstanding > 0 ? 'overdue' : 'paid' },
        })
      }

      // Create the new billing cycle
      const periodStart = new Date(currentDueDate)
      const periodEnd = new Date(newDueDate.getTime() - 24 * 60 * 60 * 1000)

      const newCycle = await tx.billCycle.create({
        data: {
          companyId: user.companyId,
          recurringBillId: billId,
          periodStart,
          periodEnd,
          dueDate: newDueDate,
          amount: parsedNewAmount,
          paidAmount: 0,
          outstandingAmount: parsedNewAmount,
          status: 'pending',
        },
      })

      // Update the bill
      const updatedBill = await tx.recurringBill.update({
        where: { id: billId },
        data: {
          previousOutstanding: safeDecimal(bill.currentOutstanding),
          currentOutstanding: parsedNewAmount,
          totalAmountDue: parsedNewAmount,
          nextDueDate: newDueDate,
        },
        include: {
          property: { select: { id: true, name: true, nameAr: true, nameBn: true, nameUr: true } },
          cycles: { orderBy: { dueDate: 'desc' }, take: 5 },
        },
      })

      return { bill: updatedBill, cycle: newCycle }
    })

    // Audit
    await createAuditLog({
      action: 'CYCLE_ADVANCE',
      entity: 'RecurringBill',
      entityId: billId,
      userId: user.id,
      companyId: user.companyId,
      details: {
        previousDueDate: bill.nextDueDate,
        newDueDate: newDueDate.toISOString(),
        newCycleAmount: parsedNewAmount,
        billingFrequency: bill.billingFrequency,
        newCycleId: result.cycle.id,
      },
    })

    return successResponse(serialize(result))
  } catch (error) {
    console.error('Error advancing billing cycle:', error)
    return errorResponse('Failed to advance billing cycle', 500)
  }
}
