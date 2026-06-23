import prisma from '@/lib/db'
import { errorResponse, successResponse } from '@/lib/api-utils'
import { NextRequest } from 'next/server'

// POST /api/desktop/sync-push
// Body: { companyId: "xxx", changes: [...] }
//
// Desktop-only route for the Tauri sync agent. See sync-pull for security notes.
export async function POST(request: NextRequest) {
  // ── Security: only allow localhost ──────────────────────────────────
  const host = request.headers.get('host') || ''
  const xForwardedFor = request.headers.get('x-forwarded-for') || ''
  const isLocalhost = host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('192.168.')

  if (!isLocalhost && xForwardedFor && !xForwardedFor.startsWith('127.0.0.1') && !xForwardedFor.startsWith('::1')) {
    return errorResponse('Desktop sync routes only work on localhost', 403)
  }

  try {
    const body = await request.json()
    const companyId = body.companyId
    const changes = body.changes || []

    if (!companyId) {
      return errorResponse('companyId is required', 400)
    }

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
            // Verify property belongs to this company
            const property = await prisma.property.findFirst({
              where: { id: record.propertyId, companyId },
              select: { id: true },
            })
            if (!property) {
              errors.push({ recordId, error: 'Property not found' })
              continue
            }

            await prisma.cheque.upsert({
              where: { id: recordId },
              create: {
                id: recordId,
                companyId,
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
            await prisma.cheque.updateMany({
              where: { id: recordId, companyId },
              data: { deletedAt: new Date() },
            }).catch(() => {})
            applied++
          }
        }
      } catch (err: any) {
        errors.push({ recordId: change.recordId || 'unknown', error: err.message || 'Unknown error' })
      }
    }

    return successResponse({ applied, errors, serverTime: new Date().toISOString() })
  } catch (error) {
    console.error('Desktop sync push error:', error)
    return errorResponse('Failed to process sync push', 500)
  }
}
