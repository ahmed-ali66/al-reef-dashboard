import prisma from '@/lib/db'
import { getAuthUser, unauthorizedResponse, errorResponse, successResponse, safeNumber, serialize } from '@/lib/api-utils'

// GET /api/sync/pull?since=ISO_TIMESTAMP — returns all changes since the given timestamp
// for the authenticated user's company.
//
// This is called by the desktop sync agent every 30 seconds to pull cloud changes
// down to the local SQLite database.
//
// Returns: {
//   changes: [
//     { table: 'cheques', action: 'upsert', record: {...} },
//     { table: 'cheques', action: 'delete', recordId: '...' },
//   ],
//   serverTime: ISO_TIMESTAMP  // use this as the "since" for the next pull
// }
export async function GET(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const { searchParams } = new URL(request.url)
    const since = searchParams.get('since')

    // Parse the "since" timestamp; default to 24 hours ago if not provided
    let sinceDate: Date
    if (since) {
      sinceDate = new Date(since)
      if (isNaN(sinceDate.getTime())) {
        sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000) // 24h ago
      }
    } else {
      // First sync — pull everything from the last 30 days to keep it manageable
      sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    }

    const changes: any[] = []

    // ── Pull cheques updated since the timestamp ──────────────────────
    const cheques = await prisma.cheque.findMany({
      where: {
        companyId: user.companyId,
        updatedAt: { gte: sinceDate },
        deletedAt: null,
      },
      include: {
        property: {
          select: { id: true, name: true, nameAr: true, nameBn: true, nameUr: true, type: true },
        },
        payments: {
          orderBy: { paymentDate: 'desc' },
          select: { id: true, amount: true, paymentDate: true, paymentMethod: true, reference: true, notes: true, createdAt: true },
        },
      },
      orderBy: { updatedAt: 'asc' },
      take: 500, // Cap at 500 per sync cycle to keep responses manageable
    })

    for (const cheque of cheques) {
      const s = serialize(cheque)
      const totalPaid = (cheque.payments || []).reduce((sum, p) => sum + safeNumber(p.amount), 0)
      const chequeAmount = safeNumber(cheque.amount)
      s.totalPaid = Number(totalPaid.toFixed(2))
      s.remaining = Number(Math.max(0, chequeAmount - totalPaid).toFixed(2))
      changes.push({
        table: 'cheques',
        action: 'upsert',
        record: s,
        recordId: cheque.id,
      })
    }

    // Also pull soft-deleted cheques (so the local DB can mark them as deleted)
    const deletedCheques = await prisma.cheque.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: { gte: sinceDate },
      },
      select: { id: true, deletedAt: true },
    })
    for (const c of deletedCheques) {
      changes.push({
        table: 'cheques',
        action: 'delete',
        recordId: c.id,
      })
    }

    // ── Pull properties (for offline property list) ──────────────────
    const properties = await prisma.property.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        updatedAt: { gte: sinceDate },
      },
      select: { id: true, name: true, nameAr: true, nameBn: true, nameUr: true, type: true, totalUnits: true },
    })
    for (const p of properties) {
      changes.push({
        table: 'properties',
        action: 'upsert',
        record: p,
        recordId: p.id,
      })
    }

    return successResponse({
      changes,
      serverTime: new Date().toISOString(),
      changeCount: changes.length,
    })
  } catch (error) {
    console.error('Sync pull error:', error)
    return errorResponse('Failed to process sync pull', 500)
  }
}
