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
  isOwnerOrAdmin,
  safeNumber,
  safeDecimal,
  parseOCCVersion,
  occUpdate,
} from '@/lib/api-utils'

// PUT /api/payments/[id] — Edit a payment record (financial users only)
// Supports editing: amount, date, month, year, method, reference, notes, isLate, daysLate
// Automatically adjusts tenant score/late count when isLate status changes
// Audit trail logs before/after values
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    if (!isFinancialUser(user.role)) {
      return forbiddenResponse('Only financial users can edit payments')
    }

    const { id } = await params

    // Fetch existing payment with tenant info
    const existing = await prisma.payment.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        tenant: {
          select: {
            id: true,
            latePaymentCount: true,
            tenantScore: true,
            systemScore: true,
            manualScoreOverride: true,
            openingBalance: true,
            creditBalance: true,
            rentAmount: true,
          },
        },
      },
    })

    if (!existing) {
      return errorResponse('Payment not found', 404)
    }

    const body = await request.json()
    const { amount, date, month, year, method, reference, notes, isLate, daysLate, reason } = body

    // Build update data — only include provided fields
    const data: Record<string, unknown> = {}
    if (amount !== undefined) {
      const parsedAmount = safeDecimal(amount)
      if (parsedAmount <= 0) return errorResponse('Amount must be greater than zero')
      data.amount = parsedAmount
    }
    if (date !== undefined) data.date = new Date(date)
    if (month !== undefined) {
      const parsedMonth = safeNumber(month, 0)
      if (!parsedMonth) return errorResponse('Invalid month')
      data.month = parsedMonth
    }
    if (year !== undefined) {
      const parsedYear = safeNumber(year, 0)
      if (!parsedYear) return errorResponse('Invalid year')
      data.year = parsedYear
    }
    if (method !== undefined) data.method = method || null
    if (reference !== undefined) data.reference = reference || null
    if (notes !== undefined) data.notes = notes || null
    if (isLate !== undefined) data.isLate = isLate === true
    if (daysLate !== undefined) data.daysLate = safeNumber(daysLate, 0)
    if (body.allocationType !== undefined) {
      const validAllocationTypes = ['CURRENT_RENT', 'HISTORICAL_DEBT', 'ADVANCE_PAYMENT']
      data.allocationType = validAllocationTypes.includes(body.allocationType) ? body.allocationType : 'CURRENT_RENT'
    }

    if (Object.keys(data).length === 0) {
      return errorResponse('No valid fields provided for update')
    }

    // Handle isLate status change and tenant score adjustment in a transaction
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.payment.update({
        where: { id },
        data,
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              unitNumber: true,
              propertyId: true,
            },
          },
        },
      })

      // If isLate status changed, adjust tenant score
      if (isLate !== undefined && isLate !== existing.isLate && existing.tenant) {
        const tenant = existing.tenant
        const currentSystemScore = tenant.systemScore ?? tenant.tenantScore
        const hasOverride = tenant.manualScoreOverride !== null && tenant.manualScoreOverride !== undefined

        if (isLate) {
          // Changed from not-late to late: increase count, decrease score
          const newSystemScore = Math.max(0, currentSystemScore - 5)
          const newTenantScore = hasOverride ? tenant.tenantScore : newSystemScore
          await tx.tenant.update({
            where: { id: tenant.id },
            data: {
              latePaymentCount: tenant.latePaymentCount + 1,
              tenantScore: newTenantScore,
              systemScore: newSystemScore,
            },
          })
        } else {
          // Changed from late to not-late: decrease count, increase score
          const newSystemScore = Math.min(100, currentSystemScore + 5)
          const newTenantScore = hasOverride ? tenant.tenantScore : newSystemScore
          await tx.tenant.update({
            where: { id: tenant.id },
            data: {
              latePaymentCount: Math.max(0, tenant.latePaymentCount - 1),
              tenantScore: newTenantScore,
              systemScore: newSystemScore,
            },
          })
        }
      }

      // Handle allocation type changes: reverse old effects, apply new effects
      const oldAllocationType = existing.allocationType || 'CURRENT_RENT'
      const newAllocationType = (data.allocationType as string) || oldAllocationType
      const paymentAmount = data.amount !== undefined ? Number(data.amount) : Number(existing.amount)

      if (oldAllocationType !== newAllocationType && existing.tenant) {
        const tenant = existing.tenant
        const oldAmount = Number(existing.amount)

        // Step 1: Reverse the OLD allocation type's effects
        if (oldAllocationType === 'HISTORICAL_DEBT') {
          // Was reducing openingBalance — restore it
          const currentOpening = Number(tenant.openingBalance) || 0
          await tx.tenant.update({
            where: { id: tenant.id },
            data: { openingBalance: currentOpening + oldAmount },
          })
        } else if (oldAllocationType === 'ADVANCE_PAYMENT') {
          // Was adding excess to creditBalance — reverse it
          const rentAmount = Number(tenant.rentAmount)
          const otherCurrentRentPayments = await tx.payment.findMany({
            where: {
              tenantId: tenant.id,
              month: existing.month,
              year: existing.year,
              allocationType: 'CURRENT_RENT',
              id: { not: id },
            },
          })
          const currentRentPaid = otherCurrentRentPayments.reduce((sum, p) => sum + Number(p.amount), 0)
          const oldExcess = Math.max(0, currentRentPaid + oldAmount - rentAmount)
          if (oldExcess > 0) {
            const currentCredit = Number(tenant.creditBalance) || 0
            await tx.tenant.update({
              where: { id: tenant.id },
              data: { creditBalance: Math.max(0, currentCredit - oldExcess) },
            })
          }
        }

        // Step 2: Apply the NEW allocation type's effects
        if (newAllocationType === 'HISTORICAL_DEBT') {
          // Reduce openingBalance by payment amount
          // Re-fetch tenant to get updated values after reversal
          const updatedTenant = await tx.tenant.findUnique({ where: { id: tenant.id } })
          const currentOpening = Number(updatedTenant?.openingBalance) || 0
          await tx.tenant.update({
            where: { id: tenant.id },
            data: { openingBalance: Math.max(0, currentOpening - paymentAmount) },
          })
        } else if (newAllocationType === 'ADVANCE_PAYMENT') {
          // Add excess to creditBalance
          const rentAmount = Number(tenant.rentAmount)
          const otherCurrentRentPayments = await tx.payment.findMany({
            where: {
              tenantId: tenant.id,
              month: existing.month,
              year: existing.year,
              allocationType: 'CURRENT_RENT',
            },
          })
          const currentRentPaid = otherCurrentRentPayments.reduce((sum, p) => sum + Number(p.amount), 0)
          const newExcess = Math.max(0, currentRentPaid + paymentAmount - rentAmount)
          if (newExcess > 0) {
            const updatedTenant = await tx.tenant.findUnique({ where: { id: tenant.id } })
            const currentCredit = Number(updatedTenant?.creditBalance) || 0
            await tx.tenant.update({
              where: { id: tenant.id },
              data: { creditBalance: currentCredit + newExcess },
            })
          }
        }
      } else if (data.amount !== undefined && existing.tenant) {
        // Amount changed but allocation type didn't change — adjust the difference
        const tenant = existing.tenant
        const oldAmount = Number(existing.amount)
        const amountDiff = paymentAmount - oldAmount

        if (oldAllocationType === 'HISTORICAL_DEBT' && amountDiff !== 0) {
          // Adjust openingBalance by the difference
          const currentOpening = Number(tenant.openingBalance) || 0
          await tx.tenant.update({
            where: { id: tenant.id },
            data: { openingBalance: Math.max(0, currentOpening - amountDiff) },
          })
        }
        // For ADVANCE_PAYMENT amount changes, the credit adjustment is complex
        // and would require full recalculation — skip for now as it's rarely used
      }

      return result
    })

    // Audit log with before/after snapshot
    await createAuditLog({
      action: 'UPDATE',
      entity: 'Payment',
      entityId: id,
      userId: user.id,
      companyId: user.companyId,
      details: {
        before: {
          amount: Number(existing.amount),
          date: existing.date,
          month: existing.month,
          year: existing.year,
          method: existing.method,
          isLate: existing.isLate,
          daysLate: existing.daysLate,
        },
        after: {
          amount: Number(updated.amount),
          date: updated.date,
          month: updated.month,
          year: updated.year,
          method: updated.method,
          isLate: updated.isLate,
          daysLate: updated.daysLate,
        },
        reason: reason || null,
      },
    })

    return successResponse(serialize(updated))
  } catch (error) {
    console.error('Error updating payment:', error)
    return errorResponse('Failed to update payment', 500)
  }
}

// DELETE /api/payments/[id] — Delete/reverse a payment (financial users only)
// Hard-deletes the payment record and adjusts tenant score/late count
// Audit trail preserves the deleted payment details
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    if (!isFinancialUser(user.role)) {
      return forbiddenResponse('Only financial users can delete payments')
    }

    const { id } = await params

    // Fetch existing payment with tenant info for score adjustment and audit
    const existing = await prisma.payment.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            latePaymentCount: true,
            tenantScore: true,
            systemScore: true,
            manualScoreOverride: true,
            openingBalance: true,
            creditBalance: true,
            rentAmount: true,
          },
        },
      },
    })

    if (!existing) {
      return errorResponse('Payment not found', 404)
    }

    // Parse reason from URL query params
    const { searchParams } = new URL(request.url)
    const reason = searchParams.get('reason') || 'Payment deleted'

    // Delete payment and adjust tenant score in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.payment.delete({
        where: { id },
      })

      // If the deleted payment was late, restore tenant score
      if (existing.isLate && existing.tenant) {
        const tenant = existing.tenant
        const currentSystemScore = tenant.systemScore ?? tenant.tenantScore
        const hasOverride = tenant.manualScoreOverride !== null && tenant.manualScoreOverride !== undefined
        const newSystemScore = Math.min(100, currentSystemScore + 5)
        const newTenantScore = hasOverride ? tenant.tenantScore : newSystemScore
        await tx.tenant.update({
          where: { id: tenant.id },
          data: {
            latePaymentCount: Math.max(0, tenant.latePaymentCount - 1),
            tenantScore: newTenantScore,
            systemScore: newSystemScore,
          },
        })
      }

      // Reverse the allocation effects of the deleted payment
      if (existing.tenant) {
        const tenant = existing.tenant
        const deletedAmount = Number(existing.amount)

        if (existing.allocationType === 'HISTORICAL_DEBT') {
          // Restore openingBalance: add back the amount that was previously subtracted
          const currentOpening = Number(tenant.openingBalance) || 0
          await tx.tenant.update({
            where: { id: tenant.id },
            data: { openingBalance: currentOpening + deletedAmount },
          })
        } else if (existing.allocationType === 'ADVANCE_PAYMENT') {
          // Reverse the credit that was added from the excess
          // Recalculate: how much excess would this payment have created?
          const rentAmount = Number(tenant.rentAmount)
          // Find other CURRENT_RENT payments for the same month to determine what the excess was
          const otherCurrentRentPayments = await tx.payment.findMany({
            where: {
              tenantId: tenant.id,
              month: existing.month,
              year: existing.year,
              allocationType: 'CURRENT_RENT',
            },
          })
          const currentRentPaid = otherCurrentRentPayments.reduce((sum, p) => sum + Number(p.amount), 0)
          const excessForCredit = Math.max(0, currentRentPaid + deletedAmount - rentAmount)
          if (excessForCredit > 0) {
            const currentCredit = Number(tenant.creditBalance) || 0
            await tx.tenant.update({
              where: { id: tenant.id },
              data: { creditBalance: Math.max(0, currentCredit - excessForCredit) },
            })
          }
        }
      }
    })

    // Audit log with full payment details before deletion
    await createAuditLog({
      action: 'DELETE',
      entity: 'Payment',
      entityId: id,
      userId: user.id,
      companyId: user.companyId,
      details: {
        deletedPayment: {
          amount: Number(existing.amount),
          date: existing.date,
          month: existing.month,
          year: existing.year,
          method: existing.method,
          reference: existing.reference,
          receiptNumber: existing.receiptNumber,
          notes: existing.notes,
          isLate: existing.isLate,
          daysLate: existing.daysLate,
          tenantId: existing.tenantId,
          tenantName: existing.tenant?.name,
        },
        reason,
      },
    })

    return successResponse({ message: 'Payment deleted successfully' })
  } catch (error) {
    console.error('Error deleting payment:', error)
    return errorResponse('Failed to delete payment', 500)
  }
}
