import prisma from '@/lib/db'
import {
  getAuthUser,
  successResponse,
  unauthorizedResponse,
  errorResponse,
} from '@/lib/api-utils'
import { Prisma } from '@prisma/client'
import { calculateEffectivePaymentsReceived } from '@/lib/financial-utils'

// GET /api/invoices/search?q=INV-202506-101 — Search invoices by invoice number
export async function GET(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')?.trim()

    if (!query || query.length < 2) {
      return errorResponse('Search query must be at least 2 characters', 400)
    }

    const companyId = user.companyId
    const canSeeFinancials = user.role === 'owner' || user.role === 'admin'

    // ── 1. Search Expense Invoices (exact match first, then partial) ──
    const expenseExact = await prisma.expense.findMany({
      where: { companyId, deletedAt: null, invoiceNumber: query },
      take: 10,
      orderBy: { date: 'desc' },
    })

    const expensePartial = query.length >= 3
      ? await prisma.expense.findMany({
          where: {
            companyId,
            deletedAt: null,
            invoiceNumber: { contains: query, mode: Prisma.QueryMode.insensitive },
          },
          take: 20,
          orderBy: { date: 'desc' },
        })
      : []

    // Merge and deduplicate expense results
    const expenseIds = new Set(expenseExact.map(e => e.id))
    const expenseResults = [
      ...expenseExact,
      ...expensePartial.filter(e => !expenseIds.has(e.id)),
    ].map(expense => ({
      type: 'expense' as const,
      id: expense.id,
      invoiceNumber: expense.invoiceNumber || '',
      description: expense.description,
      amount: Number(expense.amount),
      date: expense.date.toISOString(),
      category: expense.category,
      vendor: expense.vendor,
      building: expense.building,
      paymentStatus: 'paid' as const,
      tenantName: null,
      propertyName: null,
      unitNumber: null,
    }))

    // ── 2. Search Tenant Invoices (generated pattern: INV-{YYYYMM}-{unit}) ──
    // We search across tenants whose generated invoice number matches the query
    const tenants = await prisma.tenant.findMany({
      where: { companyId, deletedAt: null },
      include: {
        property: { select: { id: true, name: true } },
        payments: { orderBy: { date: 'desc' } },
      },
      take: 200,
    })

    const tenantInvoiceResults: any[] = []
    for (const tenant of tenants) {
      // Generate possible invoice numbers for the last 12 months
      const now = new Date()
      for (let offset = 0; offset < 12; offset++) {
        let m = now.getMonth() + 1 - offset
        let y = now.getFullYear()
        if (m <= 0) { m += 12; y -= 1 }

        const invoiceNumber = `INV-${y}${String(m).padStart(2, '0')}-${tenant.unitNumber || '000'}`

        // Exact match
        if (invoiceNumber.toLowerCase() === query.toLowerCase() ||
            (query.length >= 3 && invoiceNumber.toLowerCase().includes(query.toLowerCase()))) {
          const payments = tenant.payments.filter(p => p.month === m && p.year === y && p.allocationType !== 'HISTORICAL_DEBT')
          // Use effective payments to avoid double-counting ADVANCE_PAYMENT excess
          // that is already reflected in tenant.creditBalance.
          const totalPaid = calculateEffectivePaymentsReceived(payments, Number(tenant.rentAmount), 0, 0)
          const rentAmount = Number(tenant.rentAmount)

          let paymentStatus: 'paid' | 'partial' | 'overdue' | 'unpaid' | 'due-soon' = 'unpaid'
          if (totalPaid >= rentAmount) paymentStatus = 'paid'
          else if (totalPaid > 0) paymentStatus = 'partial'
          else {
            const dueDate = new Date(y, m - 1, 5)
            if (now > dueDate) paymentStatus = 'overdue'
            else paymentStatus = 'due-soon'
          }

          tenantInvoiceResults.push({
            type: 'tenant_invoice' as const,
            id: tenant.id,
            invoiceNumber,
            description: `Rent Invoice - ${tenant.property?.name || ''} - Unit ${tenant.unitNumber || ''}`,
            amount: canSeeFinancials ? rentAmount : 0,
            date: new Date(y, m - 1, 1).toISOString(),
            category: 'rent',
            vendor: null,
            building: tenant.property?.name || null,
            paymentStatus,
            tenantName: tenant.name,
            tenantNameAr: tenant.nameAr,
            propertyName: tenant.property?.name || null,
            unitNumber: tenant.unitNumber,
            paidAmount: canSeeFinancials ? totalPaid : 0,
            // CRITICAL: totalPaid uses effective payments (ADVANCE_PAYMENT excess excluded;
            // it is already in creditBalance). HISTORICAL_DEBT excluded (reflected in openingBalance).
            remaining: canSeeFinancials ? Math.max(0, (Number(tenant.openingBalance) || 0) + rentAmount - (Number(tenant.creditBalance) || 0) - totalPaid) : 0,
          })

          // Only one invoice per tenant per month matches
          break
        }
      }
    }

    // Combine results: exact matches first, then partial
    const exactMatches = [
      ...expenseResults.filter(r => r.invoiceNumber.toLowerCase() === query.toLowerCase()),
      ...tenantInvoiceResults.filter(r => r.invoiceNumber.toLowerCase() === query.toLowerCase()),
    ]

    const partialMatches = [
      ...expenseResults.filter(r => r.invoiceNumber.toLowerCase() !== query.toLowerCase()),
      ...tenantInvoiceResults.filter(r => r.invoiceNumber.toLowerCase() !== query.toLowerCase()),
    ]

    // Sort by relevance: exact matches first, then by date descending
    const results = [...exactMatches, ...partialMatches].slice(0, 50)

    return successResponse({ results, total: results.length })
  } catch (error) {
    console.error('Invoice search error:', error)
    return errorResponse('Failed to search invoices', 500)
  }
}
