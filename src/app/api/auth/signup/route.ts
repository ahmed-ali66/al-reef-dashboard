import prisma from '@/lib/db'
import { errorResponse, successResponse } from '@/lib/api-utils'
import { checkApiRateLimit, recordApiRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { sendWelcomeEmail } from '@/lib/email'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

// Zod validation schema for signup
const signupSchema = z.object({
  companyName: z.string().min(2, 'Company name must be at least 2 characters').max(100),
  adminName: z.string().min(2, 'Admin name must be at least 2 characters').max(100),
  adminEmail: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
})

// POST /api/auth/signup — Create a new company + admin user (no auth required)
export async function POST(request: Request) {
  try {
    // Rate limit: max 3 signups per IP per hour
    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown'
    const rateKey = `signup:${ip}`
    const rateCheck = await checkApiRateLimit(rateKey, 3, 60 * 60 * 1000)
    if (!rateCheck.allowed) {
      return rateLimitResponse(rateCheck.retryAfterMs)
    }

    const body = await request.json()

    // Validate input with Zod
    const result = signupSchema.safeParse(body)
    if (!result.success) {
      const firstError = result.error.issues[0]
      return errorResponse(firstError.message)
    }

    const { companyName, adminName, password } = result.data
    // FIX: Normalize email to lowercase to match the login flow
    const adminEmail = result.data.adminEmail.trim().toLowerCase()

    // Check email uniqueness globally
    const existingUser = await prisma.user.findUnique({
      where: { email: adminEmail },
    })

    if (existingUser) {
      return errorResponse('An account with this email already exists')
    }

    // Check if too many companies exist (prevent abuse)
    const companyCount = await prisma.company.count()
    if (companyCount >= 1000) {
      return errorResponse('Maximum number of companies reached. Please contact support.', 403)
    }

    // Create the company
    const company = await prisma.company.create({
      data: {
        name: companyName,
      },
    })

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 12)

    // Create the admin user
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        name: adminName,
        role: 'admin',
        companyId: company.id,
        isActive: true,
      },
    })

    // Create initial audit log
    await prisma.auditLog.create({
      data: {
        action: 'COMPANY_SIGNUP',
        entity: 'Company',
        entityId: company.id,
        userId: admin.id,
        companyId: company.id,
        details: JSON.stringify({
          companyName,
          adminEmail,
          adminName,
        }),
      },
    })

    // Record rate limit
    await recordApiRateLimit(rateKey, 3, 60 * 60 * 1000)

    // Send welcome email (non-blocking)
    const baseUrl = process.env.NEXTAUTH_URL || 'https://al-reef-al-junoobi.vercel.app'
    sendWelcomeEmail(adminEmail, adminName, companyName, baseUrl).catch(() => {})

    return successResponse({
      message: 'Company created successfully!',
      company: {
        id: company.id,
        name: company.name,
      },
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    }, 201)
  } catch (error: any) {
    console.error('Signup error:', error)

    // Handle unique constraint violation
    if (error.code === 'P2002') {
      return errorResponse('An account with this email already exists')
    }

    return errorResponse('Failed to create company. Please try again.', 500)
  }
}
