import prisma from '@/lib/db'
import { getAuthUser, unauthorizedResponse, errorResponse, successResponse, serialize } from '@/lib/api-utils'

// POST /api/sync/push — receives a batch of local changes from the desktop app
// and applies them to the cloud database (Neon).
//
// Body: {
//   changes: [
//     {
//       table: 'cheques',
//       action: 'create' | 'update' | 'delete',
//       record: { id, propertyId, payeeName, amount, ... },
//       recordId: string
//     },
//     ...
//   ]
// }
//
// Returns: {
//   applied: number,
//   errors: Array<{ recordId: string, error: string }>
// }
export async function POST(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const body = await request.json()
    const changes = body.changes || []

    if (!Array.isArray(changes) || changes.length === 0) {
      return successResponse({ applied: 0, errors: [] })
    }

    let applied = 0
    const errors: Array<{ recordId: string; error: string }> = []

    for (const change of changes) {
      try {
        const { table, action, record, recordId } = change

        if (table === 'cheques') {
          if (action === 'create' || action === 'update') {
            // Upsert: create if doesn't exist, update if it does
            // Verify the cheque belongs to this company
            const existing = await prisma.cheque.findUnique({
              where: { id: recordId },
            })

            if (existing && existing.companyId !== user.companyId) {
              errors.push({ recordId, error: 'Cheque belongs to a different company' })
              continue
            }

            // Verify property belongs to this company
            const property = await prisma.property.findFirst({
              where: { id: record.propertyId, companyId: user.companyId },
              select: { id: true },
            })
            if (!property) {
              errors.push({ recordId, error: 'Property not found in this company' })
              continue
            }

            await prisma.cheque.upsert({
              where: { id: recordId },
              create: {
                id: recordId,
                companyId: user.companyId,
                propertyId: record.propertyId,
                payeeName: record.payeeName || '',
                payeeMobile: record.payeeMobile || null,
                amount: parseFloat(record.amount) || 0,
                dueDate: new Date(record.dueDate),
                chequeNumber: record.chequeNumber || null,
                bankName: record.bankName || null,
                status: record.status || 'pending',
                paidDate: record.paidDate ? new Date(record.paidDate) : null,
                notes: record.notes || null,
              },
              update: {
                propertyId: record.propertyId,
                payeeName: record.payeeName || '',
                payeeMobile: record.payeeMobile || null,
                amount: parseFloat(record.amount) || 0,
                dueDate: new Date(record.dueDate),
                chequeNumber: record.chequeNumber || null,
                bankName: record.bankName || null,
                status: record.status || 'pending',
                paidDate: record.paidDate ? new Date(record.paidDate) : null,
                notes: record.notes || null,
              },
            })
            applied++
          } else if (action === 'delete') {
            await prisma.cheque.deleteMany({
              where: { id: recordId, companyId: user.companyId },
            }).catch(() => {})
            applied++
          }
        }
        // Add other tables here in future: payments, tenants, etc.
      } catch (err: any) {
        errors.push({ recordId: change.recordId || 'unknown', error: err.message || 'Unknown error' })
      }
    }

    return successResponse({
      applied,
      errors,
      serverTime: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Sync push error:', error)
    return errorResponse('Failed to process sync push', 500)
  }
}
