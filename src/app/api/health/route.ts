import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

// Health check endpoint for monitoring and uptime checks
// Unauthenticated — allowed through middleware for Kubernetes/Datadog/uptime monitors
export async function GET() {
  const startTime = Date.now()
  const checks: Record<string, { status: string; latencyMs?: number; details?: any; error?: string }> = {}

  // 1. Database connectivity check
  try {
    const dbStart = Date.now()
    await prisma.$queryRaw`SELECT 1`
    checks.database = {
      status: 'healthy',
      latencyMs: Date.now() - dbStart,
    }
  } catch (error) {
    checks.database = {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown database error',
    }
  }

  // 2. Environment check
  const requiredEnvVars = ['DATABASE_URL', 'NEXTAUTH_SECRET']
  const recommendedEnvVars = ['BLOB_READ_WRITE_TOKEN', 'CRON_SECRET']
  const missingRequired = requiredEnvVars.filter((key) => !process.env[key])
  const missingRecommended = recommendedEnvVars.filter((key) => !process.env[key])
  checks.environment = {
    status: missingRequired.length === 0 ? 'healthy' : 'unhealthy',
    details: {
      missingRequired,
      missingRecommended,
    },
    ...(missingRequired.length > 0 && { error: `Missing required: ${missingRequired.join(', ')}` }),
  }

  // 3. Blob storage check
  try {
    const blobStart = Date.now()
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { list } = await import('@vercel/blob')
      await list({ limit: 1, token: process.env.BLOB_READ_WRITE_TOKEN })
      checks.blobStorage = {
        status: 'healthy',
        latencyMs: Date.now() - blobStart,
      }
    } else {
      checks.blobStorage = {
        status: 'degraded',
        error: 'BLOB_READ_WRITE_TOKEN not configured — auto-backups will not persist to cloud',
      }
    }
  } catch (error) {
    checks.blobStorage = {
      status: 'degraded',
      error: error instanceof Error ? error.message : 'Blob storage check failed',
    }
  }

  // 4. Data integrity check — quick counts for anomaly detection
  try {
    const integrityStart = Date.now()
    const [
      companyCount, propertyCount, tenantCount, paymentCount,
      expenseCount, maintenanceCount, userCount, backupRecordCount,
    ] = await Promise.all([
      prisma.company.count(),
      prisma.property.count({ where: { deletedAt: null } }),
      prisma.tenant.count({ where: { deletedAt: null } }),
      prisma.payment.count(),
      prisma.expense.count({ where: { deletedAt: null } }),
      prisma.maintenance.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null, isActive: true } }),
      prisma.backupRecord.count({ where: { status: 'completed' } }),
    ])

    // Check for last successful backup
    const lastBackup = await prisma.backupRecord.findFirst({
      where: { status: 'completed' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    })

    const hoursSinceLastBackup = lastBackup
      ? (Date.now() - lastBackup.createdAt.getTime()) / (1000 * 60 * 60)
      : null

    // BACKUP AGE THRESHOLDS — daily auto-backup cron runs at 02:00 UTC.
    // - < 30 hours: healthy (allows ~6 hours of skew past the 24-hour cycle)
    // - 30-48 hours: degraded (likely missed one daily cycle — investigate)
    // - > 48 hours: degraded (CRITICAL — multiple cycles missed, data loss risk)
    const BACKUP_DEGRADED_HOURS = 30
    const BACKUP_CRITICAL_HOURS = 48
    const backupStale = hoursSinceLastBackup !== null && hoursSinceLastBackup > BACKUP_DEGRADED_HOURS
    const backupCritical = hoursSinceLastBackup !== null && hoursSinceLastBackup > BACKUP_CRITICAL_HOURS

    checks.dataIntegrity = {
      status: backupStale ? 'degraded' : 'healthy',
      latencyMs: Date.now() - integrityStart,
      details: {
        companies: companyCount,
        properties: propertyCount,
        tenants: tenantCount,
        payments: paymentCount,
        expenses: expenseCount,
        maintenance: maintenanceCount,
        activeUsers: userCount,
        completedBackups: backupRecordCount,
        lastBackupAt: lastBackup?.createdAt?.toISOString() || null,
        hoursSinceLastBackup: hoursSinceLastBackup ? Math.round(hoursSinceLastBackup) : null,
        backupAgeThresholdHours: BACKUP_DEGRADED_HOURS,
        backupCriticalThresholdHours: BACKUP_CRITICAL_HOURS,
      },
      ...(backupStale && {
        error: backupCritical
          ? `Last backup was ${Math.round(hoursSinceLastBackup!)} hours ago — exceeds ${BACKUP_CRITICAL_HOURS}-hour CRITICAL threshold (multiple cron cycles missed, possible data loss risk)`
          : `Last backup was ${Math.round(hoursSinceLastBackup!)} hours ago — exceeds ${BACKUP_DEGRADED_HOURS}-hour threshold (likely missed one daily cron cycle)`,
      }),
    }

    // Dedicated backup freshness check — surfaces as its own check so monitoring
    // tools can alert on this dimension independently of overall dataIntegrity.
    checks.backupFreshness = {
      status: (!lastBackup || backupStale) ? 'degraded' : 'healthy',
      details: {
        lastBackupAt: lastBackup?.createdAt?.toISOString() || null,
        hoursSinceLastBackup: hoursSinceLastBackup ? Math.round(hoursSinceLastBackup) : null,
        thresholdHours: BACKUP_DEGRADED_HOURS,
        criticalThresholdHours: BACKUP_CRITICAL_HOURS,
        schedule: 'Daily at 02:00 UTC (Vercel Cron)',
      },
      ...(lastBackup === null && { error: 'No completed backup found — auto-backup has never run successfully' }),
      ...(backupStale && lastBackup !== null && {
        error: backupCritical
          ? `Last backup ${Math.round(hoursSinceLastBackup!)}h ago — CRITICAL (> ${BACKUP_CRITICAL_HOURS}h). Investigate Vercel Cron execution for /api/backup/auto.`
          : `Last backup ${Math.round(hoursSinceLastBackup!)}h ago — degraded (> ${BACKUP_DEGRADED_HOURS}h). Verify Vercel Cron fired at 02:00 UTC.`,
      }),
    }
  } catch (error) {
    checks.dataIntegrity = {
      status: 'degraded',
      error: error instanceof Error ? error.message : 'Data integrity check failed',
    }
  }

  // 5. Overall status
  const allHealthy = Object.values(checks).every((c) => c.status === 'healthy')
  const anyUnhealthy = Object.values(checks).some((c) => c.status === 'unhealthy')

  const overallStatus = anyUnhealthy ? 'unhealthy' : allHealthy ? 'healthy' : 'degraded'

  const response = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    totalLatencyMs: Date.now() - startTime,
    checks,
  }

  return NextResponse.json(response, {
    status: overallStatus === 'unhealthy' ? 503 : 200,
  })
}
