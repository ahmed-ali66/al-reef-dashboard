import prisma from '@/lib/db'
import {
  getAuthUser,
  createAuditLog,
  serialize,
  errorResponse,
  successResponse,
  unauthorizedResponse,
  forbiddenResponse,
  isOwnerOrAdmin,
  parseOCCVersion,
  occUpdate,
} from '@/lib/api-utils'

// GET /api/company — Return the company info for the authenticated user's companyId
export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
    })

    if (!company) {
      return errorResponse('Company not found', 404)
    }

    return successResponse(serialize(company))
  } catch (error) {
    console.error('GET /api/company error:', error)
    return errorResponse('Failed to fetch company info', 500)
  }
}

// PUT /api/company — Update company info (only owner/admin + OCC)
// PHASE 2: RBAC + OCC for concurrency safety
export async function PUT(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    // Only owner or admin can update company info
    if (!isOwnerOrAdmin(user.role)) {
      return forbiddenResponse('Only owners and admins can update company info')
    }

    const body = await request.json()

    // PHASE 2: Optimistic Concurrency Control
    const occVersion = parseOCCVersion(body)

    // Fetch current company for audit log
    const currentCompany = await prisma.company.findUnique({
      where: { id: user.companyId },
    })

    if (!currentCompany) {
      return errorResponse('Company not found', 404)
    }

    // Build update data — only allow specific fields
    const updateData: Record<string, any> = {}

    const allowedFields = ['name', 'nameAr', 'nameBn', 'nameUr', 'phone', 'email', 'address', 'logoUrl']

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field] === null ? null : String(body[field]).trim() || null
      }
    }

    // systemGoLiveDate is a special field — accepts null (clears restriction) or ISO date string
    if (body.systemGoLiveDate !== undefined) {
      if (body.systemGoLiveDate === null || body.systemGoLiveDate === '') {
        updateData.systemGoLiveDate = null
      } else {
        const parsed = new Date(body.systemGoLiveDate)
        if (isNaN(parsed.getTime())) {
          return errorResponse('Invalid systemGoLiveDate — must be a valid date (YYYY-MM-DD)')
        }
        updateData.systemGoLiveDate = parsed
      }
    }

    // Ensure at least the primary name is not empty if provided
    if (updateData.name !== undefined && updateData.name !== null && !updateData.name) {
      return errorResponse('Company name cannot be empty')
    }

    if (Object.keys(updateData).length === 0) {
      return errorResponse('No valid fields provided for update')
    }

    // PHASE 2: Use OCC-protected update
    const updatedCompany = await occUpdate(
      prisma.company,
      user.companyId,
      occVersion,
      updateData
    )

    if (updatedCompany instanceof Response) return updatedCompany

    await createAuditLog({
      action: 'UPDATE',
      entity: 'Company',
      entityId: user.companyId,
      userId: user.id,
      companyId: user.companyId,
      details: {
        before: serialize(currentCompany),
        after: serialize(updatedCompany),
        updatedFields: Object.keys(updateData),
        occProtected: !!occVersion,
      },
    })

    return successResponse(serialize(updatedCompany))
  } catch (error) {
    console.error('PUT /api/company error:', error)
    return errorResponse('Failed to update company info', 500)
  }
}
