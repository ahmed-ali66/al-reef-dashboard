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
  parseOCCVersion,
  occUpdate,
} from '@/lib/api-utils'

// PUT /api/recurring-bills/[id] — update a recurring bill (financial users only)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    // Only financial users can update recurring bills
    if (!isFinancialUser(user.role)) {
      return forbiddenResponse('Only owners, admins, and accountants can update recurring bills')
    }

    const { id } = await params

    // Verify bill exists and belongs to user's company
    const existing = await prisma.recurringBill.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
    })
    if (!existing) {
      return errorResponse('Recurring bill not found', 404)
    }

    const body = await request.json()

    // PHASE 2: Optimistic Concurrency Control
    const occVersion = parseOCCVersion(body)

    const {
      providerName,
      serviceType,
      accountNumber,
      contractNumber,
      currentOutstanding,
      nextDueDate,
      billingFrequency,
      autoRenew,
      gracePeriodDays,
      status,
      notes,
      buildingName,
      ownerName,
      propertyManager,
    } = body

    // PHASE 3: Use safeDecimal for monetary precision
    const parsedCurrentOutstanding =
      currentOutstanding !== undefined ? safeDecimal(currentOutstanding) : undefined

    if (parsedCurrentOutstanding !== undefined && parsedCurrentOutstanding < 0) {
      return errorResponse('currentOutstanding cannot be negative')
    }

    // Build update data
    const data: Record<string, unknown> = {}
    if (providerName !== undefined) data.providerName = providerName
    if (serviceType !== undefined) data.serviceType = serviceType
    if (accountNumber !== undefined) data.accountNumber = accountNumber || null
    if (contractNumber !== undefined) data.contractNumber = contractNumber || null
    if (parsedCurrentOutstanding !== undefined) data.currentOutstanding = parsedCurrentOutstanding
    if (nextDueDate !== undefined) data.nextDueDate = new Date(nextDueDate)
    if (billingFrequency !== undefined) data.billingFrequency = billingFrequency
    if (autoRenew !== undefined) data.autoRenew = autoRenew === true
    if (gracePeriodDays !== undefined) data.gracePeriodDays = gracePeriodDays
    if (status !== undefined) data.status = status
    if (notes !== undefined) data.notes = notes || null
    if (buildingName !== undefined) data.buildingName = buildingName || null
    if (ownerName !== undefined) data.ownerName = ownerName || null
    if (propertyManager !== undefined) data.propertyManager = propertyManager || null

    // Check for duplicate account number if being changed
    if (accountNumber !== undefined && accountNumber && accountNumber.trim()) {
      const duplicateBill = await prisma.recurringBill.findFirst({
        where: {
          companyId: user.companyId,
          accountNumber: accountNumber.trim(),
          deletedAt: null,
          id: { not: id }, // Exclude the current bill
        },
        include: {
          property: { select: { name: true } },
        },
      })
      if (duplicateBill) {
        return errorResponse(
          `An account with this Account Number already exists. Provider: ${duplicateBill.providerName}, Property: ${duplicateBill.property?.name || duplicateBill.buildingName || 'N/A'}. Please review the existing record before updating.`,
          409
        )
      }
    }

    // When currentOutstanding is manually changed, update totalAmountDue to match
    // only if the new outstanding is GREATER than current totalAmountDue (user is raising the bill)
    // Otherwise, leave totalAmountDue unchanged (user is adjusting balance, not bill amount)
    if (parsedCurrentOutstanding !== undefined) {
      const currentTotalAmountDue = safeDecimal(existing.totalAmountDue)
      if (parsedCurrentOutstanding > currentTotalAmountDue) {
        data.totalAmountDue = parsedCurrentOutstanding
      }
    }

    // PHASE 2: Use OCC-protected update
    const updated = await occUpdate(
      prisma.recurringBill,
      id,
      occVersion,
      data,
      { companyId: user.companyId, deletedAt: null }
    )

    if (updated instanceof Response) return updated

    // Fetch with property relation for response
    const fullBill = await prisma.recurringBill.findUnique({
      where: { id },
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
        cycles: {
          orderBy: { dueDate: 'desc' },
          take: 5,
        },
      },
    })

    if (!fullBill) {
      return errorResponse('Failed to fetch updated recurring bill', 500)
    }

    // Audit log
    await createAuditLog({
      action: 'UPDATE',
      entity: 'RecurringBill',
      entityId: id,
      userId: user.id,
      companyId: user.companyId,
      details: {
        before: serialize(existing),
        after: {
          providerName: fullBill.providerName,
          serviceType: fullBill.serviceType,
          currentOutstanding: fullBill.currentOutstanding,
          totalAmountDue: fullBill.totalAmountDue,
          nextDueDate: fullBill.nextDueDate,
          billingFrequency: fullBill.billingFrequency,
          status: fullBill.status,
        },
        occProtected: !!occVersion,
      },
    })

    return successResponse(serialize(fullBill))
  } catch (error) {
    console.error('Error updating recurring bill:', error)
    return errorResponse('Failed to update recurring bill', 500)
  }
}

// DELETE /api/recurring-bills/[id] — soft delete a recurring bill (financial users only)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    // Only financial users can delete recurring bills
    if (!isFinancialUser(user.role)) {
      return forbiddenResponse('Only owners, admins, and accountants can delete recurring bills')
    }

    const { id } = await params

    // Verify bill exists and belongs to user's company
    const existing = await prisma.recurringBill.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
    })
    if (!existing) {
      return errorResponse('Recurring bill not found', 404)
    }

    // Soft delete by setting deletedAt
    const bill = await prisma.recurringBill.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    // Audit log
    await createAuditLog({
      action: 'DELETE',
      entity: 'RecurringBill',
      entityId: id,
      userId: user.id,
      companyId: user.companyId,
      details: {
        softDelete: true,
        providerName: existing.providerName,
        serviceType: existing.serviceType,
        currentOutstanding: existing.currentOutstanding,
      },
    })

    return successResponse({ message: 'Recurring bill deleted successfully', id })
  } catch (error) {
    console.error('Error deleting recurring bill:', error)
    return errorResponse('Failed to delete recurring bill', 500)
  }
}
