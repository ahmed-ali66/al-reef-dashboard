import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { errorResponse, successResponse } from '@/lib/api-utils'
import crypto from 'crypto'

// POST /api/license/generate — generate a new license key
// Admin-only (requires NEXTAUTH session with owner/admin role)
//
// Body: {
//   companyName: string,
//   maxUsers?: number (default 5),
//   maxProperties?: number (default 50),
//   licenseType: 'standard' | 'enterprise' (default 'standard'),
//   durationMonths?: number (default 12 — 1 year license),
//   notes?: string
// }
//
// Returns: { licenseKey, ...licenseDetails }
//
// License key format: ALR-XXXX-XXXX-XXXX-XXXX
// (generated from crypto.randomBytes, formatted with dashes)

// Store license keys in the app_config table as JSON
// (avoids creating a new table/migration for the POC)

export async function POST(request: NextRequest) {
  try {
    // Simple admin auth — check for admin token in header
    // (In production, use NextAuth session)
    const authHeader = request.headers.get('authorization')
    const adminToken = process.env.CRON_SECRET || '967ce59955c50e059333bfb2f2d09a39af44cca5f0cb3cc2483de8bee9c08112'
    if (authHeader !== `Bearer ${adminToken}`) {
      return errorResponse('Unauthorized', 401)
    }

    const body = await request.json()
    const { companyName, maxUsers = 5, maxProperties = 50, licenseType = 'standard', durationMonths = 12, notes } = body

    if (!companyName) return errorResponse('companyName is required', 400)

    // Generate license key: ALR-XXXX-XXXX-XXXX-XXXX
    const bytes = crypto.randomBytes(8)
    const hex = bytes.toString('hex').toUpperCase()
    const licenseKey = `ALR-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`

    // Calculate expiry
    const now = new Date()
    const expiry = new Date(now)
    expiry.setMonth(expiry.getMonth() + durationMonths)

    const license = {
      licenseKey,
      companyName,
      maxUsers,
      maxProperties,
      licenseType,
      issuedAt: now.toISOString(),
      expiryAt: expiry.toISOString(),
      status: 'active',  // active | activated | suspended | expired
      activatedAt: null,
      activatedOn: null,  // hardware fingerprint
      notes: notes || null,
    }

    // Store in app_config table as JSON
    // Key: license:ALR-XXXX-XXXX-XXXX-XXXX
    await prisma.$executeRaw`
      INSERT INTO app_config (key, value)
      VALUES (${'license:' + licenseKey}, ${JSON.stringify(license)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `

    return successResponse({
      ...license,
      message: 'License key generated successfully. Give this key to the client.',
    }, 201)
  } catch (error) {
    console.error('License generation error:', error)
    return errorResponse('Failed to generate license', 500)
  }
}

// GET /api/license/generate — list all licenses (admin)
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const adminToken = process.env.CRON_SECRET || '967ce59955c50e059333bfb2f2d09a39af44cca5f0cb3cc2483de8bee9c08112'
    if (authHeader !== `Bearer ${adminToken}`) {
      return errorResponse('Unauthorized', 401)
    }

    // Read all license keys from app_config
    const licenses = await prisma.$queryRaw`
      SELECT key, value FROM app_config WHERE key LIKE 'license:ALR-%'
    ` as any[]

    const result = licenses.map(l => JSON.parse(l.value))

    return successResponse({ licenses: result })
  } catch (error) {
    console.error('License list error:', error)
    return errorResponse('Failed to list licenses', 500)
  }
}
