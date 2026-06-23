import prisma from '@/lib/db'
import {
  getAuthUser,
  createAuditLog,
  unauthorizedResponse,
  errorResponse,
  successResponse,
  safeDecimal,
  safeNumber,
  sanitizeString,
  serialize,
} from '@/lib/api-utils'

// Helper: recalculate cheque status based on sum of payments
// Returns the new status + paidDate (if applicable)
async function recalcChequeStatus(chequeId: string) {
  const cheque = await prisma.cheque.findUnique({
    where: { id: chequeId },
    select: { id: true, amount: true, status: true },
  })
  if (!cheque) return

  const paymentsAgg = await prisma.chequePayment.aggregate({
    where: { chequeId },
    _sum: { amount: true },
  })
  const totalPaid = safeNumber(paymentsAgg._sum.amount)
  const chequeAmount = safeNumber(cheque.amount)

  let newStatus: string
  let paidDate: Date | null = null

  if (totalPaid >= chequeAmount && chequeAmount > 0) {
    // Fully paid — set paidDate to the latest payment date
    newStatus = 'paid'
    const latestPayment = await prisma.chequePayment.findFirst({
      where: { chequeId },
      orderBy: { paymentDate: 'desc' },
      select: { paymentDate: true },
    })
    paidDate = latestPayment?.paymentDate || new Date()
  } else if (totalPaid > 0) {
    // Partially paid
    newStatus = 'partially_paid'
  } else {
    // No payments — back to pending (unless bounced/cancelled)
    newStatus = cheque.status === 'bounced' || cheque.status === 'cancelled' ? cheque.status : 'pending'
  }

  // Update only if status changed (or paidDate needs setting)
  if (newStatus !== cheque.status || (newStatus === 'paid' && paidDate)) {
    await prisma.cheque.update({
      where: { id: chequeId },
      data: {
        status: newStatus,
        paidDate: newStatus === 'paid' ? paidDate : null,
      },
    })
  }

  return { status: newStatus, totalPaid, chequeAmount }
}

// GET /api/cheques/[id]/payments — list all payments for a cheque
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const { id } = await params

    // Verify cheque belongs to user's company
    const cheque = await prisma.cheque.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      select: { id: true, amount: true, status: true, payeeName: true },
    })
    if (!cheque) return errorResponse('Cheque not found', 404)

    const payments = await prisma.chequePayment.findMany({
      where: { chequeId: id },
      orderBy: { paymentDate: 'desc' },
    })

    const totalPaid = payments.reduce((s, p) => s + safeNumber(p.amount), 0)
    const chequeAmount = safeNumber(cheque.amount)
    const remaining = Math.max(0, chequeAmount - totalPaid)

    return successResponse({
      payments: payments.map(serialize),
      cheque: serialize(cheque),
      summary: {
        chequeAmount: Number(chequeAmount.toFixed(2)),
        totalPaid: Number(totalPaid.toFixed(2)),
        remaining: Number(remaining.toFixed(2)),
        paymentCount: payments.length,
        isFullyPaid: totalPaid >= chequeAmount,
      },
    })
  } catch (error) {
    console.error('Error fetching cheque payments:', error)
    return errorResponse('Failed to fetch cheque payments', 500)
  }
}

// POST /api/cheques/[id]/payments — record a new payment against a cheque
// Body: { amount, paymentDate, paymentMethod?, reference?, notes? }
// Auto-updates cheque status: pending → partially_paid → paid
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const { id } = await params
    const body = await request.json()

    // Verify cheque belongs to user's company and is in a payable state
    const cheque = await prisma.cheque.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      include: {
        payments: { select: { amount: true, paymentDate: true } },
      },
    })
    if (!cheque) return errorResponse('Cheque not found', 404)

    if (cheque.status === 'bounced' || cheque.status === 'cancelled') {
      return errorResponse(`Cannot record payment on a ${cheque.status} cheque`, 400)
    }

    const amount = safeDecimal(body.amount)
    if (amount <= 0) return errorResponse('Payment amount must be greater than 0', 400)

    const paymentDate = body.paymentDate ? new Date(body.paymentDate) : new Date()
    if (isNaN(paymentDate.getTime())) return errorResponse('Valid payment date is required', 400)

    const paymentMethod = sanitizeString(body.paymentMethod)
    const reference = sanitizeString(body.reference)
    const notes = sanitizeString(body.notes)

    // Check if this payment would exceed the cheque amount
    const currentPaid = cheque.payments.reduce((s, p) => s + safeNumber(p.amount), 0)
    const chequeAmount = safeNumber(cheque.amount)
    const newTotal = currentPaid + amount
    if (newTotal > chequeAmount + 0.01) {
      // Allow 0.01 tolerance for rounding
      return errorResponse(
        `Payment of AED ${amount.toFixed(2)} would exceed cheque amount (AED ${chequeAmount.toFixed(2)}). Already paid: AED ${currentPaid.toFixed(2)}, remaining: AED ${(chequeAmount - currentPaid).toFixed(2)}.`,
        400,
      )
    }

    // Create the payment record
    const payment = await prisma.chequePayment.create({
      data: {
        chequeId: id,
        companyId: user.companyId,
        amount,
        paymentDate,
        paymentMethod,
        reference,
        notes,
        createdBy: user.id,
      },
    })

    // Recalculate cheque status (pending → partially_paid → paid)
    const statusResult = await recalcChequeStatus(id)

    await createAuditLog({
      action: 'CREATE',
      entity: 'ChequePayment',
      entityId: payment.id,
      userId: user.id,
      companyId: user.companyId,
      details: {
        chequeId: id,
        payeeName: cheque.payeeName,
        amount: Number(amount),
        paymentDate: paymentDate.toISOString(),
        paymentMethod,
        reference,
        newChequeStatus: statusResult?.status,
        totalPaidAfter: statusResult?.totalPaid,
        chequeAmount: statusResult?.chequeAmount,
      },
    })

    return successResponse({
      data: serialize(payment),
      message: 'Payment recorded successfully',
      chequeStatus: statusResult?.status,
      summary: statusResult ? {
        totalPaid: Number(statusResult.totalPaid.toFixed(2)),
        chequeAmount: Number(statusResult.chequeAmount.toFixed(2)),
        remaining: Number((statusResult.chequeAmount - statusResult.totalPaid).toFixed(2)),
        isFullyPaid: statusResult.status === 'paid',
      } : null,
    }, 201)
  } catch (error) {
    console.error('Error recording cheque payment:', error)
    return errorResponse('Failed to record cheque payment', 500)
  }
}
