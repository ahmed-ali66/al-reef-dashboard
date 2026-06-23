import prisma from '@/lib/db'
import { errorResponse, successResponse, serialize } from '@/lib/api-utils'
import { NextRequest } from 'next/server'

// GET /api/desktop/sync-pull-all?companyId=xxx&since=ISO_TIMESTAMP
//
// Generic sync endpoint — pulls ALL tables for the company in one request.
// SECURITY: localhost-only

export async function GET(request: NextRequest) {
  const host = request.headers.get('host') || ''
  const isLocalhost = host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('192.168.')
  if (!isLocalhost) {
    return errorResponse('Desktop sync routes only work on localhost', 403)
  }

  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('companyId')
  const since = searchParams.get('since')

  if (!companyId) return errorResponse('companyId is required', 400)

  let sinceDate: Date
  if (since) {
    sinceDate = new Date(since)
    if (isNaN(sinceDate.getTime())) {
      sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    }
  } else {
    sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  }

  const changes: any[] = []

  // Properties
  const properties = await prisma.property.findMany({
    where: { companyId, deletedAt: null, updatedAt: { gte: sinceDate } },
    select: { id: true, name: true, nameAr: true, nameBn: true, nameUr: true, type: true, totalUnits: true, floors: true, address: true, archived: true, createdAt: true, updatedAt: true },
  })
  for (const r of properties) changes.push({ table: 'properties', action: 'upsert', record: serialize(r), recordId: r.id })

  // Tenants
  const tenants = await prisma.tenant.findMany({
    where: { companyId, deletedAt: null, updatedAt: { gte: sinceDate } },
    select: {
      id: true, companyId: true, propertyId: true, groupId: true,
      name: true, nameAr: true, nameBn: true, nameUr: true,
      phone: true, whatsapp: true, email: true, emiratesId: true,
      nationality: true, employer: true, emergencyContact: true,
      unitNumber: true, unitType: true, floor: true, sizeSqft: true,
      rentAmount: true, municipalityFee: true, securityDeposit: true,
      paymentMethod: true, leaseStart: true, leaseEnd: true,
      contractDuration: true, renewalStatus: true, newRent: true,
      status: true, movedOutAt: true, latePaymentCount: true,
      tenantScore: true, systemScore: true, notes: true,
      openingBalance: true, creditBalance: true, legalCase: true,
      legalCaseNumber: true, legalCaseNotes: true,
      createdAt: true, updatedAt: true,
    },
  })
  for (const r of tenants) changes.push({ table: 'tenants', action: 'upsert', record: serialize(r), recordId: r.id })

  // Payments
  const payments = await prisma.payment.findMany({
    where: { companyId, updatedAt: { gte: sinceDate } },
    select: {
      id: true, companyId: true, tenantId: true, amount: true,
      date: true, month: true, year: true, method: true,
      reference: true, receiptNumber: true, notes: true,
      isLate: true, daysLate: true, allocationType: true,
      groupId: true, createdAt: true, updatedAt: true,
    },
  })
  for (const r of payments) changes.push({ table: 'payments', action: 'upsert', record: serialize(r), recordId: r.id })

  // Expenses
  const expenses = await prisma.expense.findMany({
    where: { companyId, deletedAt: null, updatedAt: { gte: sinceDate } },
    select: {
      id: true, companyId: true, category: true, description: true,
      amount: true, date: true, vendor: true, invoiceNumber: true,
      recurring: true, building: true, createdAt: true, updatedAt: true,
    },
  })
  for (const r of expenses) changes.push({ table: 'expenses', action: 'upsert', record: serialize(r), recordId: r.id })

  // Maintenance
  const maintenance = await prisma.maintenance.findMany({
    where: { companyId, deletedAt: null, updatedAt: { gte: sinceDate } },
  })
  for (const r of maintenance) changes.push({ table: 'maintenance', action: 'upsert', record: serialize(r), recordId: r.id })

  // Reservations
  const reservations = await prisma.reservation.findMany({
    where: { companyId, deletedAt: null, updatedAt: { gte: sinceDate } },
  })
  for (const r of reservations) changes.push({ table: 'reservations', action: 'upsert', record: serialize(r), recordId: r.id })

  // Recurring Bills
  const recurringBills = await prisma.recurringBill.findMany({
    where: { companyId, deletedAt: null, updatedAt: { gte: sinceDate } },
  })
  for (const r of recurringBills) changes.push({ table: 'recurring_bills', action: 'upsert', record: serialize(r), recordId: r.id })

  // Cheques (with payments + properties)
  const cheques = await prisma.cheque.findMany({
    where: { companyId, deletedAt: null, updatedAt: { gte: sinceDate } },
    include: {
      property: { select: { id: true, name: true, nameAr: true, type: true } },
      payments: { select: { id: true, amount: true, paymentDate: true, paymentMethod: true, reference: true, notes: true, createdAt: true } },
    },
  })
  for (const r of cheques) {
    const s = serialize(r)
    s.totalPaid = (r.payments || []).reduce((sum, p) => sum + Number(p.amount), 0)
    s.remaining = Math.max(0, Number(r.amount) - s.totalPaid)
    changes.push({ table: 'cheques', action: 'upsert', record: s, recordId: r.id })
  }

  // Notifications
  const notifications = await prisma.notification.findMany({
    where: { companyId, updatedAt: { gte: sinceDate } },
  })
  for (const r of notifications) changes.push({ table: 'notifications', action: 'upsert', record: serialize(r), recordId: r.id })

  // Rent Adjustments
  const adjustments = await prisma.rentAdjustment.findMany({
    where: { updatedAt: { gte: sinceDate } },
  })
  for (const r of adjustments) changes.push({ table: 'rent_adjustments', action: 'upsert', record: serialize(r), recordId: r.id })

  // Tenant Groups
  const tenantGroups = await prisma.tenantGroup.findMany({
    where: { companyId, deletedAt: null, updatedAt: { gte: sinceDate } },
  })
  for (const r of tenantGroups) changes.push({ table: 'tenant_groups', action: 'upsert', record: serialize(r), recordId: r.id })

  // Bill Payments
  const billPayments = await prisma.billPayment.findMany({
    where: { companyId, updatedAt: { gte: sinceDate } },
  })
  for (const r of billPayments) changes.push({ table: 'bill_payments', action: 'upsert', record: serialize(r), recordId: r.id })

  // Bill Cycles
  const billCycles = await prisma.billCycle.findMany({
    where: { updatedAt: { gte: sinceDate } },
  })
  for (const r of billCycles) changes.push({ table: 'bill_cycles', action: 'upsert', record: serialize(r), recordId: r.id })

  // Users (safe fields only — no passwords)
  const users = await prisma.user.findMany({
    where: { companyId, deletedAt: null, updatedAt: { gte: sinceDate } },
    select: {
      id: true, email: true, name: true, nameAr: true, nameBn: true, nameUr: true,
      role: true, isActive: true, mustChangePassword: true, twoFactorEnabled: true,
      createdAt: true, updatedAt: true,
    },
  })
  for (const r of users) changes.push({ table: 'users', action: 'upsert', record: serialize(r), recordId: r.id })

  // Soft-deleted records (so local DB can remove them)
  const [delProps, delTenants, delExpenses, delMaint, delReserv, delBills, delCheques, delGroups] = await Promise.all([
    prisma.property.findMany({ where: { companyId, deletedAt: { gte: sinceDate } }, select: { id: true } }),
    prisma.tenant.findMany({ where: { companyId, deletedAt: { gte: sinceDate } }, select: { id: true } }),
    prisma.expense.findMany({ where: { companyId, deletedAt: { gte: sinceDate } }, select: { id: true } }),
    prisma.maintenance.findMany({ where: { companyId, deletedAt: { gte: sinceDate } }, select: { id: true } }),
    prisma.reservation.findMany({ where: { companyId, deletedAt: { gte: sinceDate } }, select: { id: true } }),
    prisma.recurringBill.findMany({ where: { companyId, deletedAt: { gte: sinceDate } }, select: { id: true } }),
    prisma.cheque.findMany({ where: { companyId, deletedAt: { gte: sinceDate } }, select: { id: true } }),
    prisma.tenantGroup.findMany({ where: { companyId, deletedAt: { gte: sinceDate } }, select: { id: true } }),
  ])
  for (const r of delProps) changes.push({ table: 'properties', action: 'delete', recordId: r.id })
  for (const r of delTenants) changes.push({ table: 'tenants', action: 'delete', recordId: r.id })
  for (const r of delExpenses) changes.push({ table: 'expenses', action: 'delete', recordId: r.id })
  for (const r of delMaint) changes.push({ table: 'maintenance', action: 'delete', recordId: r.id })
  for (const r of delReserv) changes.push({ table: 'reservations', action: 'delete', recordId: r.id })
  for (const r of delBills) changes.push({ table: 'recurring_bills', action: 'delete', recordId: r.id })
  for (const r of delCheques) changes.push({ table: 'cheques', action: 'delete', recordId: r.id })
  for (const r of delGroups) changes.push({ table: 'tenant_groups', action: 'delete', recordId: r.id })

  return successResponse({
    changes,
    serverTime: new Date().toISOString(),
    changeCount: changes.length,
  })
}
