import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { safeNumber } from '@/lib/api-utils'

// Vercel Cron Job endpoint - generates daily report at 00:00 midnight Dubai time
// Schedule: "0 20 * * *" (20:00 UTC = 00:00 Dubai, Asia/Dubai = UTC+4, no DST)
// CRITICAL: Reports cover the PREVIOUS day (the completed business day), not the new day
// PHASE 1 FIX: Uses aggregate() instead of findMany + reduce — safe at scale
// PHASE 2 FIX: Uses Promise.allSettled() with per-company error isolation
export async function GET(request: NextRequest) {
  try {
    // Verify this is a cron job request
    // Vercel Cron sends Authorization: Bearer <CRON_SECRET> (if configured)
    // Also accept Vercel's internal cron header as fallback
    const authHeader = request.headers.get('authorization')
    const vercelCronHeader = request.headers.get('x-vercel-cron')
    const isVercelCron = vercelCronHeader === 'true'

    if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the PREVIOUS day's date in Dubai timezone (the completed business day)
    // At midnight Dubai, the date rolls over to the new day, so we subtract 1 day
    // to capture the full completed day's transactions
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const reportDate = yesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })

    // Get all active companies (only IDs and names — lightweight)
    const companies = await prisma.company.findMany({
      select: { id: true, name: true },
    })

    const startOfDay = new Date(reportDate + 'T00:00:00.000Z')
    const endOfDay = new Date(reportDate + 'T23:59:59.999Z')

    // PHASE 2: Process all companies in parallel with Promise.allSettled()
    // One failing company does NOT break the entire execution cycle
    const settledResults = await Promise.allSettled(
      companies.map(async (company) => {
        try {
          // Use aggregate() instead of findMany — no data loading into memory
          const [incomeResult, expensesResult] = await Promise.all([
            prisma.payment.aggregate({
              where: {
                date: { gte: startOfDay, lte: endOfDay },
                companyId: company.id,
              },
              _sum: { amount: true },
            }),
            prisma.expense.aggregate({
              where: {
                date: { gte: startOfDay, lte: endOfDay },
                deletedAt: null,
                companyId: company.id,
              },
              _sum: { amount: true },
            }),
          ])

          const totalIncome = safeNumber(incomeResult._sum.amount)
          const totalExpenses = safeNumber(expensesResult._sum.amount)

          // Create a notification for the daily report
          await prisma.notification.create({
            data: {
              companyId: company.id,
              type: 'daily_report',
              title: `Daily Report - ${reportDate}`,
              message: `Income: AED ${totalIncome.toFixed(2)} | Expenses: AED ${totalExpenses.toFixed(2)} | Net: AED ${(totalIncome - totalExpenses).toFixed(2)}`,
              data: JSON.stringify({
                date: reportDate,
                totalIncome,
                totalExpenses,
                netProfitLoss: totalIncome - totalExpenses,
              }),
            },
          })

          return {
            companyId: company.id,
            companyName: company.name,
            date: reportDate,
            totalIncome,
            totalExpenses,
            netProfitLoss: totalIncome - totalExpenses,
          }
        } catch (companyError) {
          // Per-company error isolation — log and throw to be caught by allSettled
          console.error(`Cron error for company ${company.id} (${company.name}):`, companyError)
          throw new Error(`Company ${company.name} failed: ${companyError instanceof Error ? companyError.message : 'Unknown error'}`)
        }
      })
    )

    // Separate successful and failed results
    const results: Array<{
      companyId: string
      companyName: string
      date: string
      totalIncome: number
      totalExpenses: number
      netProfitLoss: number
    }> = []

    const errors: Array<{ companyId: string; companyName: string; error: string }> = []

    settledResults.forEach((result, index) => {
      const company = companies[index]
      if (result.status === 'fulfilled') {
        results.push(result.value)
      } else {
        errors.push({
          companyId: company.id,
          companyName: company.name,
          error: result.reason?.message || 'Unknown error',
        })
      }
    })

    // Trigger auto-backup as a fallback — ensures daily backups even if
    // the dedicated /api/backup/auto cron is not registered (Vercel Hobby = 2 cron limit)
    // Fire-and-forget: backup failure should not affect the daily report response
    try {
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'
      const backupUrl = `${baseUrl}/api/backup/auto?cron_secret=${encodeURIComponent(process.env.CRON_SECRET || '')}`
      fetch(backupUrl, { headers: { 'x-vercel-cron': 'true' } }).catch(() => {})
    } catch {
      // Non-critical — ignore backup trigger failures
    }

    return NextResponse.json({
      success: errors.length === 0,
      date: reportDate,
      companiesProcessed: results.length,
      companiesFailed: errors.length,
      results,
      ...(errors.length > 0 && { errors }),
    })
  } catch (error) {
    console.error('Cron daily report error:', error)
    return NextResponse.json({ error: 'Failed to generate daily reports' }, { status: 500 })
  }
}
