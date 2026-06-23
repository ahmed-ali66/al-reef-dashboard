import prisma from '@/lib/db'
import {
  getAuthUser,
  createAuditLog,
  unauthorizedResponse,
  errorResponse,
  successResponse,
  safeDecimal,
  sanitizeString,
  serialize,
} from '@/lib/api-utils'

// GET /api/cheques/[id] — fetch a single cheque
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const { id } = await params

    const cheque = await prisma.cheque.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      include: {
        property: { select: { id: true, name: true, nameAr: true, nameBn: true, nameUr: true, type: true } },
      },
    })

    if (!cheque) return errorResponse('Cheque not found', 404)

    return successResponse({ data: serialize(cheque) })
  } catch (error) {
    console.error('Error fetching cheque:', error)
    return errorResponse('Failed to fetch cheque', 500)
  }
}

// PATCH /api/cheques/[id] — update a cheque
// Supports: mark as paid (status=paid + paidDate), update any field, soft delete
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const { id } = await params
    const body = await request.json()

    // Fetch existing cheque (for audit log)
    const existing = await prisma.cheque.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
    })
    if (!existing) return errorResponse('Cheque not found', 404)

    // Build update data from allowed fields
    const data: any = {}
    if (body.propertyId !== undefined) {
      // Verify new property belongs to company
      if (body.propertyId) {
        const prop = await prisma.property.findFirst({
          where: { id: body.propertyId, companyId: user.companyId, deletedAt: null },
        })
        if (!prop) return errorResponse('Property not found', 404)
        data.propertyId = body.propertyId
      }
    }
    if (body.payeeName !== undefined) data.payeeName = sanitizeString(body.payeeName) || existing.payeeName
    if (body.payeeMobile !== undefined) data.payeeMobile = sanitizeString(body.payeeMobile)
    if (body.amount !== undefined) {
      const amount = safeDecimal(body.amount)
      if (amount <= 0) return errorResponse('Amount must be greater than 0', 400)
      data.amount = amount
    }
    if (body.dueDate !== undefined) {
      const dueDate = new Date(body.dueDate)
      if (isNaN(dueDate.getTime())) return errorResponse('Valid due date is required', 400)
      data.dueDate = dueDate
    }
    if (body.chequeNumber !== undefined) data.chequeNumber = sanitizeString(body.chequeNumber)
    if (body.bankName !== undefined) data.bankName = sanitizeString(body.bankName)
    if (body.notes !== undefined) data.notes = sanitizeString(body.notes)

    // Status transitions
    if (body.status !== undefined) {
      const newStatus = ['pending', 'paid', 'bounced', 'cancelled'].includes(body.status) ? body.status : existing.status
      data.status = newStatus
      // When marking as paid, set paidDate if not provided
      if (newStatus === 'paid' && !existing.paidDate) {
        data.paidDate = body.paidDate ? new Date(body.paidDate) : new Date()
      }
      // When reverting from paid back to pending, clear paidDate
      if (newStatus !== 'paid') {
        data.paidDate = null
      }
    }
    if (body.paidDate !== undefined) {
      data.paidDate = body.paidDate ? new Date(body.paidDate) : null
    }

    const updated = await prisma.cheque.update({
      where: { id },
      data,
      include: {
        property: { select: { id: true, name: true, nameAr: true, nameBn: true, nameUr: true, type: true } },
      },
    })

    await createAuditLog({
      action: 'UPDATE',
      entity: 'Cheque',
      entityId: id,
      userId: user.id,
      companyId: user.companyId,
      details: { before: serialize(existing), after: serialize(updated) },
    })

    return successResponse({ data: serialize(updated), message: 'Cheque updated successfully' })
  } catch (error) {
    console.error('Error updating cheque:', error)
    return errorResponse('Failed to update cheque', 500)
  }
}

// DELETE /api/cheques/[id] — soft delete a cheque
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const { id } = await params

    const existing = await prisma.cheque.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
    })
    if (!existing) return errorResponse('Cheque not found', 404)

    await prisma.cheque.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    await createAuditLog({
      action: 'DELETE',
      entity: 'Cheque',
      entityId: id,
      userId: user.id,
      companyId: user.companyId,
      details: { payeeName: existing.payeeName, amount: Number(existing.amount), dueDate: existing.dueDate.toISOString() },
    })

    return successResponse({ message: 'Cheque deleted successfully' })
  } catch (error) {
    console.error('Error deleting cheque:', error)
    return errorResponse('Failed to delete cheque', 500)
  }
}
