import prisma from '@/lib/db'
import { errorResponse, successResponse, safeNumber, serialize } from '@/lib/api-utils'
import { NextRequest } from 'next/server'

// GET /api/desktop/sync-pull?companyId=xxx&since=ISO_TIMESTAMP
//
// This route is for the Tauri desktop sync agent ONLY. It accepts a companyId
// parameter instead of using NextAuth session (because the Rust sync agent
// can't access HttpOnly cookies).
//
// SECURITY: This route only works when called from localhost (the desktop app
// runs on the same machine as the Next.js dev server). On Vercel, it rejects
// all requests.
export async function GET(request: NextRequest) {
  // ── Security: only allow requests from localhost ────────────────────
  const host = request.headers.get('host') || ''
  const xForwardedFor = request.headers.get('x-forwarded-for') || ''
  const isLocalhost = host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('192.168.')

  // On Vercel, x-forwarded-for is set to the real client IP (not localhost)
  if (!isLocalhost && xForwardedFor && !xForwardedFor.startsWith('127.0.0.1') && !xForwardedFor.startsWith('::1')) {
    return errorResponse('Desktop sync routes only work on localhost', 403)
  }

  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('companyId')
  const since = searchParams.get('since')

  if (!companyId) {
    return errorResponse('companyId is required', 400)
  }

  // Parse the "since" timestamp
  let sinceDate: Date
  if (since) {
    sinceDate = new Date(since)
    if (isNaN(sinceDate.getTime())) {
      sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
    }
  } else {
    sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
  }

  const changes: any[] = []

  // ── Pull cheques ────────────────────────────────────────────────────
  const cheques = await prisma.cheque.findMany({
    where: {
      companyId,
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
    take: 500,
  })

  for (const cheque of cheques) {
    const s = serialize(cheque)
    const totalPaid = (cheque.payments || []).reduce((sum, p) => sum + safeNumber(p.amount), 0)
    const chequeAmount = safeNumber(cheque.amount)
    s.totalPaid = Number(totalPaid.toFixed(2))
    s.remaining = Number(Math.max(0, chequeAmount - totalPaid).toFixed(2))
    changes.push({ table: 'cheques', action: 'upsert', record: s, recordId: cheque.id })
  }

  // ── Pull soft-deleted cheques ──────────────────────────────────────
  const deletedCheques = await prisma.cheque.findMany({
    where: { companyId, deletedAt: { gte: sinceDate } },
    select: { id: true },
  })
  for (const c of deletedCheques) {
    changes.push({ table: 'cheques', action: 'delete', recordId: c.id })
  }

  // ── Pull properties ────────────────────────────────────────────────
  const properties = await prisma.property.findMany({
    where: { companyId, deletedAt: null, updatedAt: { gte: sinceDate } },
    select: { id: true, name: true, nameAr: true, nameBn: true, nameUr: true, type: true, totalUnits: true },
  })
  for (const p of properties) {
    changes.push({ table: 'properties', action: 'upsert', record: p, recordId: p.id })
  }

  return successResponse({
    changes,
    serverTime: new Date().toISOString(),
    changeCount: changes.length,
  })
}
