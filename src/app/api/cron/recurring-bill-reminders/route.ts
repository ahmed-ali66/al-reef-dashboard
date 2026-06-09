import prisma from '@/lib/db'

// Vercel Cron Job endpoint — generates reminder notifications for upcoming and overdue recurring bills
// Schedule: "0 21 * * *" (21:00 UTC = 01:00 Dubai, Asia/Dubai = UTC+4, no DST)
// Runs 1 hour before the daily report cron to allow bill reminders to appear first
export async function GET(request: Request) {
  // 1. Verify cron auth (same pattern as daily-report)
  const isVercelCron = request.headers.get('x-vercel-cron') === 'true'
  const authHeader = request.headers.get('authorization')
  if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const now = new Date()
  const results: any[] = []
  const errors: any[] = []

  // 2. Get all companies
  const companies = await prisma.company.findMany({ select: { id: true, name: true } })

  const companyResults = await Promise.allSettled(
    companies.map(async (company) => {
      try {
        const notifications: any[] = []

        // 3. Get active recurring bills for this company
        const bills = await prisma.recurringBill.findMany({
          where: {
            companyId: company.id,
            status: 'active',
            deletedAt: null,
          },
          include: {
            property: { select: { id: true, name: true } },
          },
        })

        for (const bill of bills) {
          const dueDate = new Date(bill.nextDueDate)
          const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          const isOverdue = daysUntilDue < 0

          // Upcoming reminders: 30, 15, 7, 3, 1 days before
          // Overdue: today (0), 1, 7, 15, 30+ days
          let shouldNotify = false
          let notificationType = ''
          let urgencyLevel = 'info'

          if (isOverdue) {
            const daysOverdue = Math.abs(daysUntilDue)
            // Notify at: 0 (today), 1, 7, 15, 30 days overdue
            if (daysOverdue === 0 || daysOverdue === 1 || daysOverdue === 7 || daysOverdue === 15 || daysOverdue === 30 || daysOverdue > 30) {
              shouldNotify = true
              notificationType = daysOverdue === 0 ? 'BILL_DUE_TODAY' : 'BILL_OVERDUE'
              urgencyLevel = daysOverdue > 7 ? 'critical' : daysOverdue > 1 ? 'warning' : 'info'
            }
          } else {
            // Upcoming: 30, 15, 7, 3, 1 days
            if ([30, 15, 7, 3, 1].includes(daysUntilDue)) {
              shouldNotify = true
              notificationType = 'BILL_UPCOMING'
              urgencyLevel = daysUntilDue <= 3 ? 'warning' : 'info'
            }
          }

          if (shouldNotify) {
            // Check if we already sent this exact notification today (prevent duplicates)
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
            const existingNotification = await prisma.notification.findFirst({
              where: {
                companyId: company.id,
                type: notificationType,
                createdAt: { gte: todayStart },
                data: { contains: bill.id },
              },
            })

            if (!existingNotification) {
              const amount = Number(bill.currentOutstanding) || Number(bill.totalAmountDue)
              const propertyInfo = bill.property?.name || bill.buildingName || 'Unknown Property'

              let title = ''
              let message = ''

              if (notificationType === 'BILL_UPCOMING') {
                title = `Upcoming Bill: ${bill.providerName}`
                message = `${bill.providerName} bill for ${propertyInfo} - AED ${amount.toFixed(2)} due in ${daysUntilDue} day(s)`
              } else if (notificationType === 'BILL_DUE_TODAY') {
                title = `Bill Due Today: ${bill.providerName}`
                message = `${bill.providerName} bill for ${propertyInfo} - AED ${amount.toFixed(2)} is due today!`
              } else {
                const daysOverdue = Math.abs(daysUntilDue)
                title = `Overdue Bill: ${bill.providerName}`
                message = `${bill.providerName} bill for ${propertyInfo} - AED ${amount.toFixed(2)} is ${daysOverdue} day(s) overdue!`
              }

              notifications.push({
                companyId: company.id,
                type: notificationType,
                title,
                message,
                data: JSON.stringify({
                  billId: bill.id,
                  providerName: bill.providerName,
                  serviceType: bill.serviceType,
                  amount,
                  daysUntilDue,
                  propertyId: bill.propertyId,
                  urgencyLevel,
                }),
              })
            }
          }
        }

        // Create all notifications
        if (notifications.length > 0) {
          await prisma.notification.createMany({ data: notifications })
        }

        return { companyId: company.id, companyName: company.name, notificationsSent: notifications.length }
      } catch (error: any) {
        errors.push({ companyId: company.id, error: error.message })
        return { companyId: company.id, error: error.message }
      }
    })
  )

  // Process results (same pattern as daily-report)
  for (const result of companyResults) {
    if (result.status === 'fulfilled') {
      results.push(result.value)
    } else {
      errors.push({ error: result.reason?.message || 'Unknown error' })
    }
  }

  const companiesProcessed = results.filter((r: any) => !r.error).length
  const companiesFailed = errors.length
  const totalNotifications = results.reduce((sum: number, r: any) => sum + (r.notificationsSent || 0), 0)

  return new Response(JSON.stringify({
    success: true,
    companiesProcessed,
    companiesFailed,
    totalNotifications,
    results,
    errors,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
