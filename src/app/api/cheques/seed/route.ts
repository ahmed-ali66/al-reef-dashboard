import prisma from '@/lib/db'
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
  createAuditLog,
} from '@/lib/api-utils'

// POST /api/cheques/seed — one-time seed of Neima Villa cheques
// Owner/admin only. Idempotent: if cheques already exist for this property +
// payee combination within the date range, it skips re-creating them.
//
// Seeds 17 cheques for Neima Villa:
//   Payee: Ali Majdi Ghareeb Nasser (+971554444918)
//   9 paid (Jul 2023 → Jan 2026, totaling AED 600,000)
//   8 pending (Jul 2026 → Oct 2028, totaling AED 550,000)
//   Total: AED 1,150,000 across 17 cheques
export async function POST(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()
    if (user.role !== 'owner' && user.role !== 'admin') {
      return forbiddenResponse('Only owners and admins can seed cheques')
    }

    // Neima Villa property ID (verified from DB — 'Neima Villa', type=villa, 17 units)
    // NOT 'Neima New' (which is an apartment building with 43 units)
    const NEIMA_VILLA_ID = 'cmpzshu0x000xnj5g6pcom1fz'

    // Verify property exists in this company
    const property = await prisma.property.findFirst({
      where: { id: NEIMA_VILLA_ID, companyId: user.companyId, deletedAt: null },
      select: { id: true, name: true },
    })
    if (!property) return errorResponse('Neima Villa property not found in this company', 404)

    // Idempotency check: skip if any cheque already exists for this property + payee
    const existingCount = await prisma.cheque.count({
      where: {
        propertyId: NEIMA_VILLA_ID,
        payeeName: 'Ali Majdi Ghareeb Nasser',
        deletedAt: null,
      },
    })
    if (existingCount > 0) {
      return successResponse({
        message: `Seed skipped — ${existingCount} cheques already exist for Neima Villa / Ali Majdi Ghareeb Nasser`,
        skipped: true,
        existingCount,
      })
    }

    // The 17 cheques to seed (verified against the owner's data)
    const chequesToSeed = [
      // 9 PAID cheques (Jul 2023 → Jan 2026)
      { dueDate: '2023-07-01', amount: 50000, status: 'paid', paidDate: '2023-07-01' },
      { dueDate: '2023-10-01', amount: 50000, status: 'paid', paidDate: '2023-10-01' },
      { dueDate: '2024-01-01', amount: 100000, status: 'paid', paidDate: '2024-01-01' },
      { dueDate: '2024-07-01', amount: 50000, status: 'paid', paidDate: '2024-07-01' },
      { dueDate: '2024-10-01', amount: 50000, status: 'paid', paidDate: '2024-10-01' },
      { dueDate: '2025-01-01', amount: 100000, status: 'paid', paidDate: '2025-01-01' },
      { dueDate: '2025-07-01', amount: 50000, status: 'paid', paidDate: '2025-07-01' },
      { dueDate: '2025-10-01', amount: 50000, status: 'paid', paidDate: '2025-10-01' },
      { dueDate: '2026-01-01', amount: 100000, status: 'paid', paidDate: '2026-01-01' },

      // 8 PENDING cheques (Jul 2026 → Oct 2028)
      { dueDate: '2026-07-01', amount: 50000, status: 'pending', paidDate: null },
      { dueDate: '2026-10-01', amount: 50000, status: 'pending', paidDate: null },
      { dueDate: '2027-01-10', amount: 100000, status: 'pending', paidDate: null },
      { dueDate: '2027-07-10', amount: 50000, status: 'pending', paidDate: null },
      { dueDate: '2027-10-10', amount: 50000, status: 'pending', paidDate: null },
      { dueDate: '2028-01-10', amount: 100000, status: 'pending', paidDate: null },
      { dueDate: '2028-07-10', amount: 50000, status: 'pending', paidDate: null },
      { dueDate: '2028-10-10', amount: 50000, status: 'pending', paidDate: null },
    ]

    const payeeName = 'Ali Majdi Ghareeb Nasser'
    const payeeMobile = '+971554444918'

    // Create all cheques
    const created = await Promise.all(
      chequesToSeed.map(c =>
        prisma.cheque.create({
          data: {
            companyId: user.companyId,
            propertyId: NEIMA_VILLA_ID,
            payeeName,
            payeeMobile,
            amount: c.amount,
            dueDate: new Date(c.dueDate),
            status: c.status,
            paidDate: c.paidDate ? new Date(c.paidDate) : null,
            notes: `Annual rent cheque — Neima Villa (200,000 AED/year split on 3 cheques)`,
          },
        }),
      ),
    )

    await createAuditLog({
      action: 'SEED',
      entity: 'Cheque',
      entityId: NEIMA_VILLA_ID,
      userId: user.id,
      companyId: user.companyId,
      details: {
        property: property.name,
        payeeName,
        payeeMobile,
        count: created.length,
        paidCount: created.filter(c => c.status === 'paid').length,
        pendingCount: created.filter(c => c.status === 'pending').length,
        totalAmount: created.reduce((s, c) => s + Number(c.amount), 0),
      },
    })

    const totalPaid = created.filter(c => c.status === 'paid').reduce((s, c) => s + Number(c.amount), 0)
    const totalPending = created.filter(c => c.status === 'pending').reduce((s, c) => s + Number(c.amount), 0)

    return successResponse({
      message: `Successfully seeded ${created.length} cheques for Neima Villa`,
      created: {
        total: created.length,
        paid: created.filter(c => c.status === 'paid').length,
        pending: created.filter(c => c.status === 'pending').length,
        totalPaidAmount: totalPaid,
        totalPendingAmount: totalPending,
        grandTotal: totalPaid + totalPending,
      },
      property: { id: property.id, name: property.name },
      payee: { name: payeeName, mobile: payeeMobile },
    }, 201)
  } catch (error) {
    console.error('Error seeding cheques:', error)
    return errorResponse('Failed to seed cheques', 500)
  }
}
