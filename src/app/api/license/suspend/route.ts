import prisma from '@/lib/db'
import { NextRequest } from 'next/server'
import { errorResponse, successResponse } from '@/lib/api-utils'

// POST /api/license/suspend — suspend a license (client's app stops working)
// Body: { licenseKey: string, reason?: string }
// The next time the desktop app verifies the license, it will be blocked.

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const adminToken = process.env.CRON_SECRET || '967ce59955c50e059333bfb2f2d09a39af44cca5f0cb3cc2483de8bee9c08112'
    if (authHeader !== `Bearer ${adminToken}`) {
      return errorResponse('Unauthorized', 401)
    }

    const body = await request.json()
    const { licenseKey, reason } = body

    if (!licenseKey) return errorResponse('licenseKey is required', 400)

    const rows = await prisma.$queryRaw`
      SELECT value FROM app_config WHERE key = ${'license:' + licenseKey}
    ` as any[]

    if (rows.length === 0) return errorResponse('License not found', 404)

    const license = JSON.parse(rows[0].value)
    license.status = 'suspended'
    license.suspendedAt = new Date().toISOString()
    license.suspendReason = reason || 'Suspended by administrator'

    await prisma.$executeRaw`
      UPDATE app_config SET value = ${JSON.stringify(license)}
      WHERE key = ${'license:' + licenseKey}
    `

    return successResponse({
      ...license,
      message: `License ${licenseKey} has been suspended. The client's app will stop working on next verification.`,
    })
  } catch (error) {
    console.error('License suspend error:', error)
    return errorResponse('Failed to suspend license', 500)
  }
}

// PUT /api/license/suspend — reactivate a suspended license
export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const adminToken = process.env.CRON_SECRET || '967ce59955c50e059333bfb2f2d09a39af44cca5f0cb3cc2483de8bee9c08112'
    if (authHeader !== `Bearer ${adminToken}`) {
      return errorResponse('Unauthorized', 401)
    }

    const body = await request.json()
    const { licenseKey } = body

    if (!licenseKey) return errorResponse('licenseKey is required', 400)

    const rows = await prisma.$queryRaw`
      SELECT value FROM app_config WHERE key = ${'license:' + licenseKey}
    ` as any[]

    if (rows.length === 0) return errorResponse('License not found', 404)

    const license = JSON.parse(rows[0].value)
    license.status = license.activatedOn ? 'activated' : 'active'
    license.suspendedAt = null
    license.suspendReason = null

    await prisma.$executeRaw`
      UPDATE app_config SET value = ${JSON.stringify(license)}
      WHERE key = ${'license:' + licenseKey}
    `

    return successResponse({
      ...license,
      message: `License ${licenseKey} has been reactivated.`,
    })
  } catch (error) {
    console.error('License reactivate error:', error)
    return errorResponse('Failed to reactivate license', 500)
  }
}
