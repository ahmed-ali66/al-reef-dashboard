import prisma from '@/lib/db'
import {
  getAuthUser,
  serialize,
  errorResponse,
  successResponse,
  unauthorizedResponse,
  parsePaginationParams,
  paginatedResponse,
} from '@/lib/api-utils'

// GET /api/recurring-bills/[id]/cycles — list billing cycles for a bill
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const { id } = await params

    const bill = await prisma.recurringBill.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
    })
    if (!bill) return errorResponse('Recurring bill not found', 404)

    const { searchParams } = new URL(request.url)
    const pagination = parsePaginationParams(searchParams)
    const status = searchParams.get('status') || undefined

    const where: any = {
      recurringBillId: id,
      companyId: user.companyId,
      ...(status ? { status } : {}),
    }

    const [cycles, total] = await Promise.all([
      prisma.billCycle.findMany({
        where,
        orderBy: { dueDate: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
        include: {
          _count: { select: { payments: true } },
        },
      }),
      prisma.billCycle.count({ where }),
    ])

    return successResponse(paginatedResponse(cycles.map(serialize), total, pagination))
  } catch (error) {
    console.error('Error fetching bill cycles:', error)
    return errorResponse('Failed to fetch bill cycles', 500)
  }
}
