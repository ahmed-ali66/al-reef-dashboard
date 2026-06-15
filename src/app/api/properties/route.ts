import prisma from '@/lib/db'
import {
  getAuthUser,
  createAuditLog,
  serialize,
  errorResponse,
  successResponse,
  unauthorizedResponse,
  safeNumber,
  safeInt,
  parsePaginationParams,
  paginatedResponse,
} from '@/lib/api-utils'
import { FINANCIALLY_ACTIVE_STATUSES } from '@/lib/utils'

// Valid property types
const VALID_PROPERTY_TYPES = ['apartment', 'villa', 'office', 'shop', 'studio', 'mixed_use']

// GET /api/properties — List all properties with pagination for the authenticated user's company
export async function GET(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const { searchParams } = new URL(request.url)
    const includeArchived = searchParams.get('includeArchived') === 'true'
    const search = searchParams.get('search')?.trim() || undefined
    const type = searchParams.get('type')?.trim() || undefined
    const pagination = parsePaginationParams(searchParams)

    // Build where clause — always exclude soft-deleted records
    const where: any = {
      companyId: user.companyId,
      deletedAt: null,
    }

    // Filter archived unless explicitly included
    if (!includeArchived) {
      where.archived = false
    }

    // Filter by type if provided
    if (type) {
      if (!VALID_PROPERTY_TYPES.includes(type)) {
        return errorResponse(
          `Invalid property type. Must be one of: ${VALID_PROPERTY_TYPES.join(', ')}`
        )
      }
      where.type = type
    }

    // Search by name or address
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { nameAr: { contains: search, mode: 'insensitive' } },
        { nameBn: { contains: search, mode: 'insensitive' } },
        { nameUr: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [properties, total] = await Promise.all([
      prisma.property.findMany({
        where,
        include: {
          tenants: {
            where: { deletedAt: null },
            select: {
              id: true,
              status: true,
            },
          },
        },
        orderBy: { name: 'asc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.property.count({ where }),
    ])

    // Compute tenant counts for each property
    const result = properties.map((property) => {
      const { tenants, ...propertyData } = property
      const tenantCount = tenants.length
      const activeTenantCount = tenants.filter((t) => FINANCIALLY_ACTIVE_STATUSES.includes(t.status as any)).length

      return {
        ...propertyData,
        tenantCount,
        activeTenantCount,
      }
    })

    return successResponse(paginatedResponse(serialize(result), total, pagination))
  } catch (error) {
    console.error('GET /api/properties error:', error)
    return errorResponse('Failed to fetch properties', 500)
  }
}

// POST /api/properties — Create a new property (all authenticated users)
// Staff can create properties but only owner/admin can edit/delete
export async function POST(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const body = await request.json()

    // Validate required fields
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return errorResponse('Property name is required')
    }

    if (!body.type || typeof body.type !== 'string') {
      return errorResponse('Property type is required')
    }

    if (!VALID_PROPERTY_TYPES.includes(body.type)) {
      return errorResponse(
        `Invalid property type. Must be one of: ${VALID_PROPERTY_TYPES.join(', ')}`
      )
    }

    // Validate numeric fields with NaN guards
    const totalUnits = body.totalUnits !== undefined ? safeInt(body.totalUnits, -1) : 1
    const floors = body.floors !== undefined ? safeInt(body.floors, -1) : 1

    if (totalUnits < 1) {
      return errorResponse('totalUnits must be a positive integer')
    }

    if (floors < 1) {
      return errorResponse('floors must be a positive integer')
    }

    // Check for duplicate name within the same company (excluding soft-deleted)
    const existing = await prisma.property.findFirst({
      where: {
        companyId: user.companyId,
        name: body.name.trim(),
        deletedAt: null,
      },
    })

    if (existing) {
      return errorResponse('A property with this name already exists', 409)
    }

    const property = await prisma.property.create({
      data: {
        companyId: user.companyId,
        name: body.name.trim(),
        nameAr: body.nameAr?.trim() || null,
        nameBn: body.nameBn?.trim() || null,
        nameUr: body.nameUr?.trim() || null,
        type: body.type,
        address: body.address?.trim() || null,
        totalUnits,
        floors,
        archived: body.archived === true,
      },
    })

    await createAuditLog({
      action: 'CREATE',
      entity: 'Property',
      entityId: property.id,
      userId: user.id,
      companyId: user.companyId,
      details: {
        after: serialize(property),
      },
    })

    return successResponse(serialize(property), 201)
  } catch (error) {
    console.error('POST /api/properties error:', error)
    return errorResponse('Failed to create property', 500)
  }
}
