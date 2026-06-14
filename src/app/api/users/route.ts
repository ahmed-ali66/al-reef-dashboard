import prisma from '@/lib/db'
import {
  getAuthUser,
  createAuditLog,
  serialize,
  errorResponse,
  successResponse,
  unauthorizedResponse,
  forbiddenResponse,
  isSystemAdmin,
  parsePaginationParams,
  paginatedResponse,
  parseOCCVersion,
  occUpdate,
} from '@/lib/api-utils'
import bcrypt from 'bcryptjs'

// GET /api/users - List users with pagination for the company (admin only)
export async function GET(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    if (!isSystemAdmin(user.role)) {
      return forbiddenResponse('Only system admins can view users')
    }

    const { searchParams } = new URL(request.url)
    const pagination = parsePaginationParams(searchParams)

    const where = {
      companyId: user.companyId,
      deletedAt: null, // Exclude soft-deleted users
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          nameAr: true,
          nameBn: true,
          nameUr: true,
          role: true,
          companyId: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.user.count({ where }),
    ])

    return successResponse(paginatedResponse(serialize(users), total, pagination))
  } catch (error) {
    console.error('Error fetching users:', error)
    return errorResponse('Failed to fetch users', 500)
  }
}

// POST /api/users - Create a new user (admin only)
export async function POST(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    if (!isSystemAdmin(user.role)) {
      return forbiddenResponse('Only system admins can create users')
    }

    const body = await request.json()
    const { password, name, nameAr, nameBn, nameUr, role } = body
    // FIX: Normalize email to lowercase to match the login flow
    // The authorize() function in auth.ts lowercases the email for lookup,
    // so if a user is created with mixed-case email (e.g., "Accountant@AlReef.ae"),
    // they can never log in because the lookup uses the lowercase version.
    const email = (body.email || '').trim().toLowerCase()

    if (!email || !password || !name) {
      return errorResponse('Email, password, and name are required')
    }

    // Validate role is one of the allowed values
    const validRoles = ['owner', 'admin', 'staff', 'accountant']
    if (role && !validRoles.includes(role)) {
      return errorResponse(`Invalid role. Must be one of: ${validRoles.join(', ')}`)
    }

    // Password policy: minimum 8 chars, at least 1 uppercase, 1 number
    if (password.length < 8) {
      return errorResponse('Password must be at least 8 characters long')
    }
    if (!/[A-Z]/.test(password)) {
      return errorResponse('Password must contain at least one uppercase letter')
    }
    if (!/[0-9]/.test(password)) {
      return errorResponse('Password must contain at least one number')
    }

    // Check if email is already taken (using lowercase for consistency)
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return errorResponse('Email is already in use')
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return errorResponse('Invalid email format')
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    const newUser = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        nameAr: nameAr || null,
        nameBn: nameBn || null,
        nameUr: nameUr || null,
        role: role || 'staff',
        companyId: user.companyId,
        mustChangePassword: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        nameAr: true,
        nameBn: true,
        nameUr: true,
        role: true,
        companyId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    await createAuditLog({
      action: 'CREATE',
      entity: 'User',
      entityId: newUser.id,
      userId: user.id,
      companyId: user.companyId,
      details: { email, name, role: newUser.role },
    })

    return successResponse(serialize(newUser), 201)
  } catch (error) {
    console.error('Error creating user:', error)
    return errorResponse('Failed to create user', 500)
  }
}
