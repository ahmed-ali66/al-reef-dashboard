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
} from '@/lib/api-utils'

// POST /api/recurring-bills/cycle — advance billing cycle for a bill
//
// BUSINESS LOGIC (per owner requirement 2026-07-14):
//   1. The new cycle does NOT auto-copy the previous bill amount.
//   2. The new cycle's `amount` defaults to 0 — the accountant enters the
//      actual bill amount later when the new statement arrives.
//   3. The previous cycle's UNPAID balance (outstandingAmount) is carried
//      forward to the new cycle's outstandingAmount.
//   4. If the previous cycle was fully paid, the new cycle starts at 0.
//
// Body:
//   - billId: string (required)
//   - newAmount: number | string (optional, default 0) — the new bill amount
//     for the upcoming period. Pass 0 (or omit) if the statement hasn't
//     arrived yet; the accountant can edit the cycle amount later.
//
// Audit log: action = 'CYCLE_ADVANCE'
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

    // newAmount is OPTIONAL — defaults to 0. The accountant can enter the
    // actual bill amount later when the statement arrives.
    const parsedNewAmount =
      newAmount === undefined || newAmount === null || newAmount === ''
        ? safeDecimal(0)
        : safeDecimal(newAmount)
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
      // ─── Determine carry-forward balance from the most recent cycle ───
      // The previous cycle is the one with the latest dueDate that is on or
      // before the current bill.nextDueDate. We look at its outstandingAmount
      // (remaining unpaid balance) and carry it forward to the new cycle.
      const previousCycles = await tx.billCycle.findMany({
        where: {
          recurringBillId: billId,
          companyId: user.companyId,
          dueDate: { lte: currentDueDate },
        },
        orderBy: { dueDate: 'desc' },
        take: 1,
      })
      const previousCycle = previousCycles[0]
      const previousUnpaid = previousCycle
        ? safeDecimal(previousCycle.outstandingAmount)
        : safeDecimal(0)

      // ─── Mark all currently-open cycles with their final status ───
      // (Same as before — pending/partially_paid cycles get closed out.)
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

      // ─── Create the new billing cycle ───
      // amount = parsedNewAmount (default 0 — accountant enters actual amount later)
      // outstandingAmount = previousUnpaid + newAmount (carry-forward + new charges)
      const periodStart = new Date(currentDueDate)
      const periodEnd = new Date(newDueDate.getTime() - 24 * 60 * 60 * 1000)
      const newOutstanding = previousUnpaid.add(parsedNewAmount)

      const newCycle = await tx.billCycle.create({
        data: {
          companyId: user.companyId,
          recurringBillId: billId,
          periodStart,
          periodEnd,
          dueDate: newDueDate,
          amount: parsedNewAmount,
          paidAmount: 0,
          outstandingAmount: newOutstanding,
          status: 'pending',
        },
      })

      // ─── Update the bill ───
      // previousOutstanding = carry-forward from previous cycle
      // currentOutstanding = previousUnpaid + newAmount
      // totalAmountDue = previousUnpaid + newAmount
      const updatedBill = await tx.recurringBill.update({
        where: { id: billId },
        data: {
          previousOutstanding: previousUnpaid,
          currentOutstanding: newOutstanding,
          totalAmountDue: newOutstanding,
          nextDueDate: newDueDate,
        },
        include: {
          property: { select: { id: true, name: true, nameAr: true, nameBn: true, nameUr: true } },
          cycles: { orderBy: { dueDate: 'desc' }, take: 5 },
        },
      })

      return { bill: updatedBill, cycle: newCycle, previousUnpaid, previousCycleId: previousCycle?.id }
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
        newCycleAmount: parsedNewAmount.toString(),
        previousUnpaidBalance: result.previousUnpaid.toString(),
        newCycleOutstanding: result.previousUnpaid.add(parsedNewAmount).toString(),
        previousCycleId: result.previousCycleId || null,
        billingFrequency: bill.billingFrequency,
        newCycleId: result.cycle.id,
        note: 'New cycle amount defaults to 0; previous unpaid balance carried forward.',
      },
    })

    return successResponse(serialize(result))
  } catch (error) {
    console.error('Error advancing billing cycle:', error)
    return errorResponse('Failed to advance billing cycle', 500)
  }
}
