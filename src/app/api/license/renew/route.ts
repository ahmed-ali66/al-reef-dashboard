import prisma from '@/lib/db'
import { NextRequest } from 'next/server'
import { errorResponse, successResponse } from '@/lib/api-utils'

// POST /api/license/renew — extend a license's expiry date
// Body: { licenseKey: string, addMonths: number }
// Example: { licenseKey: "ALR-XXXX-...", addMonths: 12 } → adds 1 year

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const adminToken = process.env.CRON_SECRET || '967ce59955c50e059333bfb2f2d09a39af44cca5f0cb3cc2483de8bee9c08112'
    if (authHeader !== `Bearer ${adminToken}`) {
      return errorResponse('Unauthorized', 401)
    }

    const body = await request.json()
    const { licenseKey, addMonths } = body

    if (!licenseKey) return errorResponse('licenseKey is required', 400)
    if (!addMonths || addMonths <= 0) return errorResponse('addMonths must be a positive number', 400)

    const rows = await prisma.$queryRaw`
      SELECT value FROM app_config WHERE key = ${'license:' + licenseKey}
    ` as any[]

    if (rows.length === 0) return errorResponse('License not found', 404)

    const license = JSON.parse(rows[0].value)

    // If expired, renew from now. If active, extend from current expiry.
    const currentExpiry = new Date(license.expiryAt)
    const now = new Date()
    const baseDate = currentExpiry > now ? currentExpiry : now
    const newExpiry = new Date(baseDate)
    newExpiry.setMonth(newExpiry.getMonth() + addMonths)

    license.expiryAt = newExpiry.toISOString()
    if (license.status === 'expired') {
      license.status = license.activatedOn ? 'activated' : 'active'
    }

    await prisma.$executeRaw`
      UPDATE app_config SET value = ${JSON.stringify(license)}
      WHERE key = ${'license:' + licenseKey}
    `

    return successResponse({
      ...license,
      message: `License renewed. New expiry: ${newExpiry.toISOString().split('T')[0]} (+${addMonths} months)`,
    })
  } catch (error) {
    console.error('License renew error:', error)
    return errorResponse('Failed to renew license', 500)
  }
}
