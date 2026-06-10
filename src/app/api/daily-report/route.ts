import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import {
  getAuthUser,
  unauthorizedResponse,
  safeNumber,
} from '@/lib/api-utils'

// GET /api/daily-report?date=YYYY-MM-DD
// PHASE 1 FIX: companyId derived from authenticated session — NO client-provided IDs
export async function GET(request: NextRequest) {
  try {
    // ─── Auth check (was missing!) ───
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')

    if (!date) {
      return NextResponse.json({ error: 'Date parameter is required' }, { status: 400 })
    }

    // companyId ALWAYS from session — never from query params
    const companyId = user.companyId

    // Parse the date for filtering (start and end of day in UTC)
    const startOfDay = new Date(date + 'T00:00:00.000Z')
    const endOfDay = new Date(date + 'T23:59:59.999Z')

    // ─── Use aggregate() instead of findMany + reduce ───
    const [totalIncomeResult, totalExpensesResult] = await Promise.all([
      prisma.payment.aggregate({
        where: {
          date: { gte: startOfDay, lte: endOfDay },
          companyId,
        },
        _sum: { amount: true },
      }),
      prisma.expense.aggregate({
        where: {
          date: { gte: startOfDay, lte: endOfDay },
          deletedAt: null,
          companyId,
        },
        _sum: { amount: true },
      }),
    ])

    const totalIncome = safeNumber(totalIncomeResult._sum.amount)
    const totalExpenses = safeNumber(totalExpensesResult._sum.amount)
    const netProfitLoss = totalIncome - totalExpenses

    // ─── Expense category breakdown via groupBy ───
    const expenseBreakdownResult = await prisma.expense.groupBy({
      by: ['category'],
      where: {
        date: { gte: startOfDay, lte: endOfDay },
        deletedAt: null,
        companyId,
      },
      _sum: { amount: true },
    })

    const expenseBreakdown: Record<string, number> = {}
    for (const row of expenseBreakdownResult) {
      expenseBreakdown[row.category] = safeNumber(row._sum.amount)
    }

    // ─── Detail items for report display (bounded) ───
    const [payments, expenses] = await Promise.all([
      prisma.payment.findMany({
        where: {
          date: { gte: startOfDay, lte: endOfDay },
          companyId,
        },
        include: {
          tenant: {
            include: {
              property: true,
            },
          },
        },
        orderBy: { date: 'desc' },
        take: 200,
      }),
      prisma.expense.findMany({
        where: {
          date: { gte: startOfDay, lte: endOfDay },
          deletedAt: null,
          companyId,
        },
        orderBy: { date: 'desc' },
        take: 200,
      }),
    ])

    // Format income items
    const incomeItems = payments.map(p => ({
      tenantName: p.tenant?.name || 'Unknown',
      propertyName: p.tenant?.property?.name || '',
      unitNumber: p.tenant?.unitNumber || null,
      amount: p.amount,
      time: new Date(p.date).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' }),
      method: p.method,
    }))

    // Format expense items
    const expenseItems = expenses.map(e => ({
      id: e.id,
      category: e.category,
      description: e.description,
      amount: e.amount,
      vendor: e.vendor,
      time: new Date(e.date).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' }),
    }))

    // ─── Recurring Bills payments for this day (single source of truth) ───
    const billPaymentsResult = await prisma.billPayment.aggregate({
      where: {
        companyId,
        paymentDate: { gte: startOfDay, lte: endOfDay },
      },
      _sum: { amount: true },
    })
    const billPaymentsTotal = safeNumber(billPaymentsResult._sum.amount)

    const billPaymentItems = await prisma.billPayment.findMany({
      where: {
        companyId,
        paymentDate: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        recurringBill: {
          select: {
            id: true,
            providerName: true,
            serviceType: true,
            accountNumber: true,
            property: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { paymentDate: 'desc' },
      take: 200,
    })

    const utilityPaymentItems = billPaymentItems.map(bp => ({
      id: bp.id,
      providerName: bp.recurringBill?.providerName || '',
      serviceType: bp.recurringBill?.serviceType || '',
      accountNumber: bp.recurringBill?.accountNumber || '',
      propertyName: bp.recurringBill?.property?.name || '',
      amount: bp.amount,
      paymentMethod: bp.paymentMethod,
      reference: bp.reference,
      time: new Date(bp.paymentDate).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' }),
    }))

    return NextResponse.json({
      date,
      totalIncome,
      totalExpenses,
      netProfitLoss,
      expenseBreakdown,
      incomeItems,
      expenseItems,
      // Recurring Bills & Utilities (single source of truth)
      utilityPayments: {
        totalAmount: billPaymentsTotal,
        items: utilityPaymentItems,
      },
      totalUtilityPayments: billPaymentsTotal,
    })
  } catch (error) {
    console.error('Daily report API error:', error)
    return NextResponse.json({ error: 'Failed to generate daily report' }, { status: 500 })
  }
}
