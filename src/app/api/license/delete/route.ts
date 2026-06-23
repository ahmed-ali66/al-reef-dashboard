import prisma from '@/lib/db'
import { NextRequest } from 'next/server'
import { errorResponse, successResponse } from '@/lib/api-utils'

// DELETE /api/license/delete?licenseKey=ALR-XXXX-... — permanently delete a license
// This cannot be undone. The client's app will stop working immediately.

export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const adminToken = process.env.CRON_SECRET || '967ce59955c50e059333bfb2f2d09a39af44cca5f0cb3cc2483de8bee9c08112'
    if (authHeader !== `Bearer ${adminToken}`) {
      return errorResponse('Unauthorized', 401)
    }

    const { searchParams } = new URL(request.url)
    const licenseKey = searchParams.get('licenseKey')

    if (!licenseKey) return errorResponse('licenseKey is required', 400)

    const result = await prisma.$executeRaw`
      DELETE FROM app_config WHERE key = ${'license:' + licenseKey}
    `

    if (result === 0) return errorResponse('License not found', 404)

    return successResponse({
      deleted: true,
      licenseKey,
      message: `License ${licenseKey} has been permanently deleted.`,
    })
  } catch (error) {
    console.error('License delete error:', error)
    return errorResponse('Failed to delete license', 500)
  }
}
