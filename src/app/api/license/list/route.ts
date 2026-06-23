import prisma from '@/lib/db'
import { NextRequest } from 'next/server'
import { errorResponse, successResponse } from '@/lib/api-utils'

// GET /api/license/list — list all licenses (admin only)
// Returns all license keys with their status, activation info, and expiry

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const adminToken = process.env.CRON_SECRET || '967ce59955c50e059333bfb2f2d09a39af44cca5f0cb3cc2483de8bee9c08112'
    if (authHeader !== `Bearer ${adminToken}`) {
      return errorResponse('Unauthorized', 401)
    }

    const rows = await prisma.$queryRaw`
      SELECT key, value FROM app_config WHERE key LIKE 'license:ALR-%' ORDER BY key
    ` as any[]

    const licenses = rows.map((r, i) => {
      const data = JSON.parse(r.value)
      return {
        id: i + 1,
        ...data,
        isExpired: data.expiryAt ? new Date(data.expiryAt) < new Date() : false,
        isActive: data.status === 'activated',
        daysUntilExpiry: data.expiryAt
          ? Math.ceil((new Date(data.expiryAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : null,
      }
    })

    return successResponse({ licenses, total: licenses.length })
  } catch (error) {
    console.error('License list error:', error)
    return errorResponse('Failed to list licenses', 500)
  }
}
