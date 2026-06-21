import prisma from '@/lib/db'
import crypto from 'crypto'
import {
  getAuthUser,
  createAuditLog,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/api-utils'

// GET /api/backup/auto — Trigger automated backup (called by Vercel Cron or manually)
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const cronSecret = url.searchParams.get('cron_secret')
    const isCron = request.headers.get('x-vercel-cron') === 'true'

    let triggeredBy = 'system'

    // Validate cron secret for automated calls
    if (isCron) {
      if (cronSecret !== process.env.CRON_SECRET) {
        return errorResponse('Invalid cron secret', 403)
      }
    } else {
      // Manual trigger requires auth
      const user = await getAuthUser()
      if (!user) return unauthorizedResponse()
      if (user.role !== 'owner' && user.role !== 'admin') {
        return forbiddenResponse('Only owners and admins can create backups')
      }
      triggeredBy = user.id
    }

    // Get all companies (for cron job, back up all; for manual, only the user's company)
    let companyIds: string[] = []

    if (isCron) {
      const companies = await prisma.company.findMany({ select: { id: true } })
      companyIds = companies.map(c => c.id)
    } else {
      const user = await getAuthUser()
      if (user) {
        companyIds = [user.companyId]
      }
    }

    // Deduplication: skip auto-backup if a completed auto-backup already exists today
    // This prevents duplicates when both the dedicated cron AND the daily-report fallback trigger run
    if (isCron) {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date()
      todayEnd.setHours(23, 59, 59, 999)

      const todayBackups = await prisma.backupRecord.findMany({
        where: {
          type: 'auto',
          status: 'completed',
          createdAt: { gte: todayStart, lte: todayEnd },
        },
        select: { companyId: true },
      })

      const alreadyBackedUp = new Set(todayBackups.map(b => b.companyId))
      const remaining = companyIds.filter(id => !alreadyBackedUp.has(id))

      if (remaining.length === 0) {
        return successResponse({
          message: 'Auto-backup already completed today — skipping duplicate',
          skipped: companyIds.length,
          timestamp: new Date().toISOString(),
        })
      }

      companyIds = remaining
    }

    const results: Array<{
      companyId: string
      companyName?: string
      size?: number
      recordCount?: number
      status: string
      error?: string
      storageUrl?: string | null
      dataHash?: string
    }> = []

    for (const companyId of companyIds) {
      try {
        // Fetch all company data (including Reservations, RentAdjustments, RecurringBills, TenantGroups)
        const [company, properties, tenants, expenses, maintenance, users, auditLogs, reservations, rentAdjustments, recurringBills, billPayments, tenantGroups, billCycles] = await Promise.all([
          prisma.company.findUnique({ where: { id: companyId } }),
          prisma.property.findMany({ where: { companyId, deletedAt: null } }),
          prisma.tenant.findMany({
            where: { companyId, deletedAt: null },
            include: { payments: true, adjustments: true },
          }),
          prisma.expense.findMany({ where: { companyId, deletedAt: null } }),
          prisma.maintenance.findMany({ where: { companyId, deletedAt: null } }),
          prisma.user.findMany({
            where: { companyId },
            select: {
              id: true, email: true, name: true, nameAr: true, nameBn: true, nameUr: true,
              role: true, isActive: true, createdAt: true,
            },
          }),
          prisma.auditLog.findMany({
            where: { companyId },
            orderBy: { createdAt: 'desc' },
            take: 1000,
          }),
          prisma.reservation.findMany({ where: { companyId, deletedAt: null } }),
          prisma.rentAdjustment.findMany({ where: { tenant: { companyId } } }),
          prisma.recurringBill.findMany({ where: { companyId, deletedAt: null } }),
          prisma.billPayment.findMany({ where: { recurringBill: { companyId } } }),
          prisma.tenantGroup.findMany({ where: { companyId, deletedAt: null } }),
          prisma.billCycle.findMany({ where: { recurringBill: { companyId } } }),
        ])

        // Also fetch soft-deleted records
        const [deletedProperties, deletedTenants, deletedExpenses, deletedMaintenance, deletedReservations, deletedRecurringBills, deletedTenantGroups] = await Promise.all([
          prisma.property.findMany({ where: { companyId, deletedAt: { not: null } } }),
          prisma.tenant.findMany({
            where: { companyId, deletedAt: { not: null } },
            include: { payments: true, adjustments: true },
          }),
          prisma.expense.findMany({ where: { companyId, deletedAt: { not: null } } }),
          prisma.maintenance.findMany({ where: { companyId, deletedAt: { not: null } } }),
          prisma.reservation.findMany({ where: { companyId, deletedAt: { not: null } } }),
          prisma.recurringBill.findMany({ where: { companyId, deletedAt: { not: null } } }),
          prisma.tenantGroup.findMany({ where: { companyId, deletedAt: { not: null } } }),
        ])

        const backup = {
          version: '1.3',
          exportedAt: new Date().toISOString(),
          type: isCron ? 'auto' : 'manual',
          company,
          data: { properties, tenants, expenses, maintenance, users, auditLogs, reservations, rentAdjustments, recurringBills, billPayments, tenantGroups, billCycles },
          deleted: { properties: deletedProperties, tenants: deletedTenants, expenses: deletedExpenses, maintenance: deletedMaintenance, reservations: deletedReservations, recurringBills: deletedRecurringBills, tenantGroups: deletedTenantGroups },
        }

        const backupJson = JSON.stringify(backup)
        const backupSize = Buffer.byteLength(backupJson, 'utf-8')
        const recordCount = properties.length + tenants.length + expenses.length + maintenance.length + users.length + reservations.length + rentAdjustments.length + recurringBills.length + tenantGroups.length + billCycles.length

        // Compute SHA-256 data hash for integrity verification
        const dataHash = crypto.createHash('sha256').update(backupJson).digest('hex')

        // Attempt to persist backup to Vercel Blob
        let storageUrl: string | null = null
        if (process.env.BLOB_READ_WRITE_TOKEN) {
          try {
            const { put } = await import('@vercel/blob')
            const date = new Date().toISOString().split('T')[0]
            const blobKey = `backups/${companyId}/${date}.json`
            const blobResult = await put(blobKey, backupJson, {
              access: 'private',
              contentType: 'application/json',
              token: process.env.BLOB_READ_WRITE_TOKEN,
              allowOverwrite: true,
            })
            storageUrl = blobResult.url
          } catch (blobErr: any) {
            console.warn(`Failed to upload backup to Vercel Blob for company ${companyId}:`, blobErr.message)
            // Graceful fallback — continue without storageUrl
          }
        }

        // Create backup record
        await prisma.backupRecord.create({
          data: {
            companyId,
            type: isCron ? 'auto' : 'manual',
            size: backupSize,
            recordCount,
            status: 'completed',
            storageUrl,
            dataHash,
            triggeredBy,
          },
        })

        // Clean up old auto-backups (keep last 90 days)
        const ninetyDaysAgo = new Date()
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

        // Delete old blobs from Vercel Blob storage before removing DB records
        const oldRecords = await prisma.backupRecord.findMany({
          where: {
            companyId,
            type: 'auto',
            createdAt: { lt: ninetyDaysAgo },
            storageUrl: { not: null },
          },
        })

        if (oldRecords.length > 0 && process.env.BLOB_READ_WRITE_TOKEN) {
          try {
            const { del } = await import('@vercel/blob')
            for (const record of oldRecords) {
              if (record.storageUrl) {
                try {
                  await del(record.storageUrl, { token: process.env.BLOB_READ_WRITE_TOKEN })
                } catch (delErr: any) {
                  console.warn(`Failed to delete old blob ${record.storageUrl}:`, delErr.message)
                }
              }
            }
          } catch (importErr) {
            console.warn('Failed to import @vercel/blob for cleanup:', importErr)
          }
        }

        await prisma.backupRecord.deleteMany({
          where: {
            companyId,
            type: 'auto',
            createdAt: { lt: ninetyDaysAgo },
          },
        })

        // Log the backup
        await createAuditLog({
          action: 'AUTO_BACKUP',
          entity: 'Company',
          entityId: companyId,
          userId: triggeredBy,
          companyId,
          details: {
            type: isCron ? 'auto' : 'manual',
            size: backupSize,
            recordCount,
            dataHash,
            storageUrl,
            properties: properties.length,
            tenants: tenants.length,
            expenses: expenses.length,
            maintenance: maintenance.length,
            reservations: reservations.length,
            rentAdjustments: rentAdjustments.length,
            recurringBills: recurringBills.length,
            tenantGroups: tenantGroups.length,
            billCycles: billCycles.length,
          },
        })

        results.push({
          companyId,
          companyName: company?.name,
          size: backupSize,
          recordCount,
          status: 'completed',
          storageUrl,
          dataHash,
        })
      } catch (err: any) {
        // Record failed backup
        await prisma.backupRecord.create({
          data: {
            companyId,
            type: isCron ? 'auto' : 'manual',
            size: 0,
            recordCount: 0,
            status: 'failed',
            error: err.message || 'Unknown error',
            triggeredBy,
          },
        }).catch(() => {})

        results.push({
          companyId,
          status: 'failed',
          error: err.message,
        })
      }
    }

    return successResponse({
      message: `Backup completed for ${results.length} company(ies)`,
      results,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Auto backup error:', error)
    return errorResponse('Failed to create backup', 500)
  }
}
