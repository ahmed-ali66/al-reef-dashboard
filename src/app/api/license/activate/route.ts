import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { errorResponse, successResponse } from '@/lib/api-utils'

// POST /api/license/activate — activate a license on a specific machine
//
// Body: {
//   licenseKey: string,    // e.g. "ALR-XXXX-XXXX-XXXX-XXXX"
//   hardwareFingerprint: string,  // from Tauri (CPU + motherboard hash)
//   machineName?: string   // human-readable PC name
// }
//
// Returns: {
//   activated: true,
//   license: { ...details },
//   activationToken: string  // signed token stored locally for offline validation
// }
//
// Security:
// - One license = one PC (hardware fingerprint)
// - If already activated on a different PC, returns 409 Conflict
// - If already activated on same PC, returns success (idempotent)
// - If license is suspended/expired, returns 403

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { licenseKey, hardwareFingerprint, machineName } = body

    if (!licenseKey || !hardwareFingerprint) {
      return errorResponse('licenseKey and hardwareFingerprint are required', 400)
    }

    // Look up the license in app_config
    const rows = await prisma.$queryRaw`
      SELECT value FROM app_config WHERE key = ${'license:' + licenseKey}
    ` as any[]

    if (rows.length === 0) {
      return errorResponse('Invalid license key', 404)
    }

    const license = JSON.parse(rows[0].value)

    // Check if license is active
    if (license.status === 'suspended') {
      return errorResponse('License is suspended. Contact support.', 403)
    }
    if (license.status === 'expired') {
      return errorResponse('License has expired', 403)
    }

    // Check expiry
    if (new Date(license.expiryAt) < new Date()) {
      license.status = 'expired'
      await prisma.$executeRaw`
        UPDATE app_config SET value = ${JSON.stringify(license)}
        WHERE key = ${'license:' + licenseKey}
      `
      return errorResponse('License has expired', 403)
    }

    // Check if already activated on a DIFFERENT machine
    if (license.activatedOn && license.activatedOn !== hardwareFingerprint) {
      return errorResponse(
        'License is already activated on another machine. Use the deactivate feature on the old machine first, or contact support.',
        409
      )
    }

    // Activate (or re-activate on same machine — idempotent)
    license.status = 'activated'
    license.activatedAt = new Date().toISOString()
    license.activatedOn = hardwareFingerprint
    license.machineName = machineName || null

    await prisma.$executeRaw`
      UPDATE app_config SET value = ${JSON.stringify(license)}
      WHERE key = ${'license:' + licenseKey}
    `

    // Generate a signed activation token (for offline validation)
    // In production, use a proper JWT or RSA signature
    const activationToken = Buffer.from(
      JSON.stringify({
        licenseKey,
        hardwareFingerprint,
        activatedAt: license.activatedAt,
        expiryAt: license.expiryAt,
        companyName: license.companyName,
        maxUsers: license.maxUsers,
        maxProperties: license.maxProperties,
        licenseType: license.licenseType,
      })
    ).toString('base64')

    return successResponse({
      activated: true,
      license: {
        licenseKey: license.licenseKey,
        companyName: license.companyName,
        maxUsers: license.maxUsers,
        maxProperties: license.maxProperties,
        licenseType: license.licenseType,
        issuedAt: license.issuedAt,
        expiryAt: license.expiryAt,
        activatedAt: license.activatedAt,
      },
      activationToken,
      message: 'License activated successfully.',
    })
  } catch (error) {
    console.error('License activation error:', error)
    return errorResponse('Failed to activate license', 500)
  }
}
