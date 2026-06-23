import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { errorResponse, successResponse } from '@/lib/api-utils'

// POST /api/license/verify — verify a license is still valid
// Called by the desktop app periodically (every 30 days) to check if
// the license is still active, not suspended, and not expired.
//
// Body: {
//   licenseKey: string,
//   hardwareFingerprint: string
// }
//
// Returns: {
//   valid: boolean,
//   reason?: string,
//   license?: { ...details }
// }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { licenseKey, hardwareFingerprint } = body

    if (!licenseKey || !hardwareFingerprint) {
      return errorResponse('licenseKey and hardwareFingerprint are required', 400)
    }

    const rows = await prisma.$queryRaw`
      SELECT value FROM app_config WHERE key = ${'license:' + licenseKey}
    ` as any[]

    if (rows.length === 0) {
      return successResponse({ valid: false, reason: 'License key not found' })
    }

    const license = JSON.parse(rows[0].value)

    // Check status
    if (license.status === 'suspended') {
      return successResponse({ valid: false, reason: 'License is suspended' })
    }

    // Check expiry
    if (new Date(license.expiryAt) < new Date()) {
      return successResponse({ valid: false, reason: 'License has expired' })
    }

    // Check hardware fingerprint
    if (license.activatedOn !== hardwareFingerprint) {
      return successResponse({ valid: false, reason: 'License is activated on a different machine' })
    }

    return successResponse({
      valid: true,
      license: {
        licenseKey: license.licenseKey,
        companyName: license.companyName,
        maxUsers: license.maxUsers,
        maxProperties: license.maxProperties,
        licenseType: license.licenseType,
        expiryAt: license.expiryAt,
      },
    })
  } catch (error) {
    console.error('License verification error:', error)
    return errorResponse('Failed to verify license', 500)
  }
}

// POST /api/license/deactivate — deactivate a license (free it for a new PC)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { licenseKey, hardwareFingerprint } = body

    if (!licenseKey || !hardwareFingerprint) {
      return errorResponse('licenseKey and hardwareFingerprint are required', 400)
    }

    const rows = await prisma.$queryRaw`
      SELECT value FROM app_config WHERE key = ${'license:' + licenseKey}
    ` as any[]

    if (rows.length === 0) {
      return errorResponse('License key not found', 404)
    }

    const license = JSON.parse(rows[0].value)

    // Only allow deactivation from the same machine
    if (license.activatedOn !== hardwareFingerprint) {
      return errorResponse('Can only deactivate from the activated machine', 403)
    }

    license.status = 'active'
    license.activatedAt = null
    license.activatedOn = null
    license.machineName = null

    await prisma.$executeRaw`
      UPDATE app_config SET value = ${JSON.stringify(license)}
      WHERE key = ${'license:' + licenseKey}
    `

    return successResponse({
      deactivated: true,
      message: 'License deactivated. You can now activate it on a new machine.',
    })
  } catch (error) {
    console.error('License deactivation error:', error)
    return errorResponse('Failed to deactivate license', 500)
  }
}
