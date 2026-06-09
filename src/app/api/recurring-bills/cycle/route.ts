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
// When a bill's due date has passed and a new cycle begins:
//   - Set previousOutstanding = currentOutstanding
//   - Keep currentOutstanding as-is (carry forward)
//   - Recalculate totalAmountDue = monthlyExpectedAmount + currentOutstanding
//   - Set nextDueDate based on billingFrequency
export async function POST(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    // Only financial users can advance billing cycles
    if (!isFinancialUser(user.role)) {
      return forbiddenResponse('Only owners, admins, and accountants can advance billing cycles')
    }

    const body = await request.json()
    const { billId } = body

    if (!billId) return errorResponse('billId is required')

    // Verify bill exists and belongs to user's company
    const bill = await prisma.recurringBill.findFirst({
      where: { id: billId, companyId: user.companyId, deletedAt: null },
    })
    if (!bill) {
      return errorResponse('Recurring bill not found', 404)
    }

    // Verify the bill's due date has passed (or is today)
    const now = new Date()
    if (bill.nextDueDate > now) {
      return errorResponse('Cannot advance cycle: bill due date has not yet passed')
    }

    // Calculate new nextDueDate based on billingFrequency
    const currentDueDate = new Date(bill.nextDueDate)
    let newDueDate: Date

    switch (bill.billingFrequency) {
      case 'monthly':
        newDueDate = new Date(currentDueDate)
        newDueDate.setMonth(newDueDate.getMonth() + 1)
        break
      case 'quarterly':
        newDueDate = new Date(currentDueDate)
        newDueDate.setMonth(newDueDate.getMonth() + 3)
        break
      case 'semi_annual':
        newDueDate = new Date(currentDueDate)
        newDueDate.setMonth(newDueDate.getMonth() + 6)
        break
      case 'annual':
        newDueDate = new Date(currentDueDate)
        newDueDate.setFullYear(newDueDate.getFullYear() + 1)
        break
      default:
        return errorResponse(
          `Invalid billingFrequency: ${bill.billingFrequency}. Must be monthly, quarterly, semi_annual, or annual`
        )
    }

    // Carry forward outstanding
    const currentOutstanding = safeDecimal(bill.currentOutstanding)
    const monthlyExpected = safeDecimal(bill.monthlyExpectedAmount)
    const newTotalAmountDue = safeDecimal(monthlyExpected + currentOutstanding)

    // Update the bill
    const updatedBill = await prisma.recurringBill.update({
      where: { id: billId },
      data: {
        previousOutstanding: currentOutstanding,
        // currentOutstanding stays as-is (carry forward)
        totalAmountDue: newTotalAmountDue,
        nextDueDate: newDueDate,
      },
      include: {
        property: {
          select: {
            id: true,
            name: true,
            nameAr: true,
            nameBn: true,
            nameUr: true,
          },
        },
      },
    })

    // Audit log
    await createAuditLog({
      action: 'CYCLE_ADVANCE',
      entity: 'RecurringBill',
      entityId: billId,
      userId: user.id,
      companyId: user.companyId,
      details: {
        previousOutstanding: currentOutstanding,
        currentOutstanding,
        newTotalAmountDue,
        previousDueDate: bill.nextDueDate,
        newDueDate: newDueDate.toISOString(),
        billingFrequency: bill.billingFrequency,
      },
    })

    return successResponse(serialize(updatedBill))
  } catch (error) {
    console.error('Error advancing billing cycle:', error)
    return errorResponse('Failed to advance billing cycle', 500)
  }
}
