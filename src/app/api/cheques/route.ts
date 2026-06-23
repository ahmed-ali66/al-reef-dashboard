import prisma from '@/lib/db'
import {
  getAuthUser,
  createAuditLog,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
  safeNumber,
  safeDecimal,
  sanitizeString,
  parsePaginationParams,
  serialize,
} from '@/lib/api-utils'

// GET /api/cheques — list cheques with optional filters
// Query params:
//   - status: pending | paid | bounced | cancelled
//   - propertyId: filter by property
//   - upcoming: 'true' — pending cheques due in next 30 days
//   - overdue: 'true' — pending cheques past due date
//   - search: filter by payeeName, chequeNumber, property name
export async function GET(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const { searchParams } = new URL(request.url)
    const pagination = parsePaginationParams(searchParams)
    const status = searchParams.get('status')?.trim() || undefined
    const propertyId = searchParams.get('propertyId')?.trim() || undefined
    const upcoming = searchParams.get('upcoming')?.trim() === 'true'
    const overdue = searchParams.get('overdue')?.trim() === 'true'
    const search = searchParams.get('search')?.trim() || undefined

    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const thirtyDaysLater = new Date(startOfToday.getTime() + 30 * 24 * 60 * 60 * 1000)

    const where: any = {
      companyId: user.companyId,
      deletedAt: null,
    }

    if (status) where.status = status
    if (propertyId) where.propertyId = propertyId

    // Upcoming: pending AND dueDate >= today AND dueDate <= today + 30 days
    if (upcoming) {
      where.status = 'pending'
      where.dueDate = { gte: startOfToday, lte: thirtyDaysLater }
    }

    // Overdue: pending AND dueDate < today
    if (overdue) {
      where.status = 'pending'
      where.dueDate = { lt: startOfToday }
    }

    // Search filter
    if (search) {
      where.OR = [
        { payeeName: { contains: search, mode: 'insensitive' } },
        { chequeNumber: { contains: search, mode: 'insensitive' } },
        { property: { name: { contains: search, mode: 'insensitive' } } },
      ]
    }

    const [cheques, total] = await Promise.all([
      prisma.cheque.findMany({
        where,
        include: {
          property: {
            select: { id: true, name: true, nameAr: true, nameBn: true, nameUr: true, type: true },
          },
        },
        orderBy: [{ dueDate: 'asc' }],
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.cheque.count({ where }),
    ])

    return successResponse({
      data: cheques.map(serialize),
      pagination: { page: pagination.page, pageSize: pagination.pageSize, total, totalPages: Math.ceil(total / pagination.pageSize) },
    })
  } catch (error) {
    console.error('Error fetching cheques:', error)
    return errorResponse('Failed to fetch cheques', 500)
  }
}

// POST /api/cheques — create a new cheque
// Body: { propertyId, payeeName, payeeMobile?, amount, dueDate, chequeNumber?, bankName?, notes?, status?, paidDate? }
export async function POST(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    // All authenticated users can create cheques (staff included — they need to record them)
    const body = await request.json()

    const propertyId = sanitizeString(body.propertyId)
    const payeeName = sanitizeString(body.payeeName)
    const payeeMobile = sanitizeString(body.payeeMobile)
    const amount = safeDecimal(body.amount)
    const dueDate = body.dueDate ? new Date(body.dueDate) : null
    const chequeNumber = sanitizeString(body.chequeNumber)
    const bankName = sanitizeString(body.bankName)
    const notes = sanitizeString(body.notes)
    const status = body.status === 'paid' ? 'paid' : body.status === 'bounced' ? 'bounced' : body.status === 'cancelled' ? 'cancelled' : 'pending'
    const paidDate = body.paidDate ? new Date(body.paidDate) : null

    if (!propertyId) return errorResponse('Property is required', 400)
    if (!payeeName) return errorResponse('Payee name is required', 400)
    if (amount <= 0) return errorResponse('Amount must be greater than 0', 400)
    if (!dueDate || isNaN(dueDate.getTime())) return errorResponse('Valid due date is required', 400)

    // Verify property belongs to user's company
    const property = await prisma.property.findFirst({
      where: { id: propertyId, companyId: user.companyId, deletedAt: null },
      select: { id: true, name: true },
    })
    if (!property) return errorResponse('Property not found', 404)

    const cheque = await prisma.cheque.create({
      data: {
        companyId: user.companyId,
        propertyId,
        payeeName,
        payeeMobile,
        amount,
        dueDate,
        chequeNumber,
        bankName,
        notes,
        status,
        paidDate: status === 'paid' ? (paidDate || new Date()) : null,
      },
      include: {
        property: { select: { id: true, name: true, nameAr: true, nameBn: true, nameUr: true, type: true } },
      },
    })

    await createAuditLog({
      action: 'CREATE',
      entity: 'Cheque',
      entityId: cheque.id,
      userId: user.id,
      companyId: user.companyId,
      details: { payeeName, amount: Number(amount), dueDate: dueDate.toISOString(), propertyId, property: property.name, status },
    })

    return successResponse({ data: serialize(cheque), message: 'Cheque created successfully' }, 201)
  } catch (error) {
    console.error('Error creating cheque:', error)
    return errorResponse('Failed to create cheque', 500)
  }
}
