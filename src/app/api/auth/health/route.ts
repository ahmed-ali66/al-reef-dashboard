import { getAuthMetrics } from '@/lib/auth'
import { getAuthUser, successResponse, unauthorizedResponse, isSystemAdmin } from '@/lib/api-utils'
import prisma from '@/lib/db'

// GET /api/auth/health — Authentication system health check (admin only)
export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()
    if (!isSystemAdmin(user.role)) {
      return Response.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Check database connectivity
    let dbStatus = 'healthy'
    let dbResponseTime = 0
    try {
      const start = Date.now()
      await prisma.$queryRaw`SELECT 1`
      dbResponseTime = Date.now() - start
    } catch (error: any) {
      dbStatus = 'error'
      console.error('[AUTH-HEALTH] DB connectivity check failed:', error?.message)
    }

    // Check NEXTAUTH_SECRET
    const secretStatus = process.env.NEXTAUTH_SECRET
      ? (process.env.NEXTAUTH_SECRET.length >= 32 ? 'healthy' : 'weak')
      : 'missing'

    // Get rate limit stats
    const activeLockouts = await prisma.rateLimitEntry.count({
      where: {
        lockedUntil: { not: null, gt: new Date() },
        identifier: { not: 'auth:cleanup:lock' },
      },
    })

    const totalRateLimitEntries = await prisma.rateLimitEntry.count({
      where: {
        identifier: { not: 'auth:cleanup:lock' },
      },
    })

    const metrics = getAuthMetrics()

    return successResponse({
      status: dbStatus === 'healthy' && secretStatus === 'healthy' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      database: {
        status: dbStatus,
        responseTimeMs: dbResponseTime,
      },
      nextAuthSecret: {
        status: secretStatus,
        length: process.env.NEXTAUTH_SECRET?.length || 0,
      },
      rateLimiting: {
        activeLockouts,
        totalEntries: totalRateLimitEntries,
      },
      metrics,
      environment: {
        nodeEnv: process.env.NODE_ENV,
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
        hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
      },
    })
  } catch (error) {
    console.error('[AUTH-HEALTH] Health check error:', error)
    return Response.json(
      { status: 'error', error: 'Health check failed' },
      { status: 500 }
    )
  }
}
