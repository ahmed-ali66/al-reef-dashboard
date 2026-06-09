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

// Helper to recalculate cycle amounts from all payments
async function recalculateCycle(tx: any, cycleId: string, companyId: string) {
  const cycle = await tx.billCycle.findUnique({ where: { id: cycleId } })
  if (!cycle) return

  const cyclePayments = await tx.billPayment.findMany({
    where: { billCycleId: cycleId, companyId },
  })
  const totalPaid = cyclePayments.reduce((sum: number, p: any) => sum + safeDecimal(p.amount), 0)
  const newOutstanding = Math.max(0, safeDecimal(cycle.amount) - totalPaid)
  await tx.billCycle.update({
    where: { id: cycleId },
    data: {
      paidAmount: safeDecimal(totalPaid),
      outstandingAmount: safeDecimal(newOutstanding),
      status: newOutstanding === 0 ? 'paid' : (totalPaid > 0 ? 'partially_paid' : 'pending'),
    },
  })
}

// PUT /api/recurring-bills/payments/[paymentId] — edit a payment
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    // Only financial users can edit payments
    if (!isFinancialUser(user.role)) {
      return forbiddenResponse('Only financial users can edit payments')
    }

    const { paymentId } = await params

    // Find the payment
    const payment = await prisma.billPayment.findFirst({
      where: { id: paymentId, companyId: user.companyId },
      include: { recurringBill: true },
    })

    if (!payment) {
      return errorResponse('Payment not found', 404)
    }

    // Verify the bill is not soft-deleted
    if (payment.recurringBill.deletedAt) {
      return errorResponse('Cannot edit payment for a deleted bill', 400)
    }

    const body = await request.json()
    const { amount, paymentDate, paymentMethod, reference, notes } = body

    const oldAmount = safeDecimal(payment.amount)
    const newAmount = amount !== undefined ? safeDecimal(amount) : oldAmount

    // Validate amount if provided
    if (amount !== undefined && newAmount <= 0) {
      return errorResponse('Amount must be greater than zero')
    }

    // If amount changed, we need to recalculate the bill's outstanding balance
    if (newAmount !== oldAmount) {
      const amountDiff = newAmount - oldAmount
      const currentOutstanding = safeDecimal(payment.recurringBill.currentOutstanding)
      const newOutstanding = Math.max(0, currentOutstanding + amountDiff)

      await prisma.$transaction(async (tx) => {
        // Update the payment
        await tx.billPayment.update({
          where: { id: paymentId },
          data: {
            ...(newAmount !== oldAmount ? { amount: newAmount } : {}),
            ...(paymentDate ? { paymentDate: new Date(paymentDate) } : {}),
            paymentMethod: paymentMethod !== undefined ? (paymentMethod || null) : undefined,
            reference: reference !== undefined ? (reference || null) : undefined,
            notes: notes !== undefined ? (notes || null) : undefined,
            // Recalculate outstandingBefore/After based on position
            outstandingAfter: safeDecimal(newOutstanding),
          },
        })

        // Update the bill's outstanding balance — do NOT change totalAmountDue
        // totalAmountDue represents the original bill cycle amount
        await tx.recurringBill.update({
          where: { id: payment.recurringBillId },
          data: {
            currentOutstanding: safeDecimal(newOutstanding),
          },
        })

        // If the payment is linked to a cycle, update cycle amounts
        if (payment.billCycleId) {
          await recalculateCycle(tx, payment.billCycleId, user.companyId)
        }
      })
    } else {
      // Just update non-amount fields
      await prisma.billPayment.update({
        where: { id: paymentId },
        data: {
          ...(paymentDate ? { paymentDate: new Date(paymentDate) } : {}),
          paymentMethod: paymentMethod !== undefined ? (paymentMethod || null) : undefined,
          reference: reference !== undefined ? (reference || null) : undefined,
          notes: notes !== undefined ? (notes || null) : undefined,
        },
      })
    }

    // Fetch updated payment
    const updatedPayment = await prisma.billPayment.findUnique({
      where: { id: paymentId },
      include: {
        recurringBill: {
          select: {
            id: true,
            providerName: true,
            serviceType: true,
            buildingName: true,
            currentOutstanding: true,
            totalAmountDue: true,
          },
        },
        billCycle: {
          select: {
            id: true,
            amount: true,
            periodStart: true,
            periodEnd: true,
            status: true,
          },
        },
      },
    })

    // Audit log
    await createAuditLog({
      action: 'UPDATE',
      entity: 'BillPayment',
      entityId: paymentId,
      userId: user.id,
      companyId: user.companyId,
      details: {
        recurringBillId: payment.recurringBillId,
        oldAmount,
        newAmount,
        amountChanged: newAmount !== oldAmount,
      },
    })

    return successResponse(serialize(updatedPayment))
  } catch (error) {
    console.error('Error updating bill payment:', error)
    return errorResponse('Failed to update bill payment', 500)
  }
}

// DELETE /api/recurring-bills/payments/[paymentId] — delete a payment (reverse balance)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    // Only financial users can delete payments
    if (!isFinancialUser(user.role)) {
      return forbiddenResponse('Only financial users can delete payments')
    }

    const { paymentId } = await params

    // Find the payment
    const payment = await prisma.billPayment.findFirst({
      where: { id: paymentId, companyId: user.companyId },
      include: { recurringBill: true },
    })

    if (!payment) {
      return errorResponse('Payment not found', 404)
    }

    // Verify the bill is not soft-deleted
    if (payment.recurringBill.deletedAt) {
      return errorResponse('Cannot delete payment for a deleted bill')
    }

    const deletedAmount = safeDecimal(payment.amount)
    const currentOutstanding = safeDecimal(payment.recurringBill.currentOutstanding)
    const newOutstanding = currentOutstanding + deletedAmount
    const cycleId = payment.billCycleId

    // Delete the payment and update the bill in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete the payment
      await tx.billPayment.delete({
        where: { id: paymentId },
      })

      // Recalculate the bill's outstanding balance
      // When deleting a payment, the outstanding increases by the deleted amount
      // Do NOT change totalAmountDue — it represents the original bill cycle amount
      await tx.recurringBill.update({
        where: { id: payment.recurringBillId },
        data: {
          currentOutstanding: safeDecimal(newOutstanding),
        },
      })

      // Check if this was the last payment — if so, clear lastPaymentAmount/Date
      const remainingPayments = await tx.billPayment.count({
        where: { recurringBillId: payment.recurringBillId, companyId: user.companyId },
      })

      if (remainingPayments === 0) {
        await tx.recurringBill.update({
          where: { id: payment.recurringBillId },
          data: {
            lastPaymentAmount: null,
            lastPaymentDate: null,
          },
        })
      } else {
        // Find the most recent payment and update lastPayment
        const latestPayment = await tx.billPayment.findFirst({
          where: { recurringBillId: payment.recurringBillId, companyId: user.companyId },
          orderBy: { paymentDate: 'desc' },
        })
        if (latestPayment) {
          await tx.recurringBill.update({
            where: { id: payment.recurringBillId },
            data: {
              lastPaymentAmount: safeDecimal(latestPayment.amount),
              lastPaymentDate: latestPayment.paymentDate,
            },
          })
        }
      }

      // If the payment was linked to a cycle, recalculate cycle amounts
      if (cycleId) {
        await recalculateCycle(tx, cycleId, user.companyId)
      }
    })

    // Audit log
    await createAuditLog({
      action: 'DELETE',
      entity: 'BillPayment',
      entityId: paymentId,
      userId: user.id,
      companyId: user.companyId,
      details: {
        recurringBillId: payment.recurringBillId,
        deletedAmount,
        outstandingBefore: currentOutstanding,
        outstandingAfter: safeDecimal(newOutstanding),
      },
    })

    return successResponse({ deleted: true, id: paymentId })
  } catch (error) {
    console.error('Error deleting bill payment:', error)
    return errorResponse('Failed to delete bill payment', 500)
  }
}
