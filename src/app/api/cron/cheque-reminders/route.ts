import prisma from '@/lib/db'

// ═══════════════════════════════════════════════════════════════════════════
// CHEQUE REMINDERS CRON
// ═══════════════════════════════════════════════════════════════════════════
// Runs daily via GitHub Actions. Finds all OUTGOING cheques (to property owners)
// that are due in 15, 7, 5, 3, or 1 days, and creates reminder notifications.
//
// Reminder thresholds (escalating urgency) with NON-OVERLAPPING WINDOWS:
//   15d window: due in 8-15 days  → early heads-up (info, blue)
//   7d  window: due in 6-7 days   → first reminder (warning, amber)
//   5d  window: due in 4-5 days   → second reminder (warning, amber)
//   3d  window: due in 2-3 days   → urgent reminder (urgent, orange)
//   1d  window: due in 0-1 days   → critical reminder (critical, red)
//   Overdue (1, 7, 14, 30 days overdue) → overdue alerts (critical, red)
//
// WINDOWS ensure every cheque gets a reminder at each threshold, even if:
//   - The cron missed a day (e.g., a cheque due in 4 days still gets the 5d reminder)
//   - The cheque's due date doesn't fall on an exact threshold day
//
// Example: A cheque due in 13 days fires the 15-day reminder (13 is in the 8-15 window).
// A cheque due in 4 days fires the 5-day reminder (4 is in the 4-5 window).
// A cheque due in 6 days fires the 7-day reminder (6 is in the 6-7 window).
//
// Each notification includes an `actionUrl` in the data field so the UI can
// make the notification clickable — clicking takes the user to the Cheques tab.
//
// AUTH: Bearer CRON_SECRET or x-vercel-cron header.

export async function GET(request: Request) {
  const isVercelCron = request.headers.get('x-vercel-cron') === 'true'
  const authHeader = request.headers.get('authorization')
  const isBearerAuth = authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isVercelCron && !isBearerAuth) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  // Thresholds with non-overlapping windows
  // Each window covers a range of days-until-due, ensuring every cheque gets exactly one reminder per threshold tier.
  const thresholds = [
    { days: 15, type: 'cheque_reminder_15d', urgency: 'info',     windowMin: 8,  windowMax: 15 },
    { days: 7,  type: 'cheque_reminder_7d',  urgency: 'warning',  windowMin: 6,  windowMax: 7  },
    { days: 5,  type: 'cheque_reminder_5d',  urgency: 'warning',  windowMin: 4,  windowMax: 5  },
    { days: 3,  type: 'cheque_reminder_3d',  urgency: 'urgent',   windowMin: 2,  windowMax: 3  },
    { days: 1,  type: 'cheque_reminder_1d',  urgency: 'critical', windowMin: 0,  windowMax: 1  },
  ]

  console.log(`[CHEQUE_REMINDERS] Today: ${today.toISOString().slice(0,10)} | Thresholds: ${thresholds.map(t => `${t.days}d (${t.windowMin}-${t.windowMax}d window)`).join(', ')} | Also checking overdue`)

  // ─── Fetch all companies ───
  const companies = await prisma.company.findMany({ select: { id: true, name: true } })

  const results: any[] = []
  const errors: any[] = []

  const settled = await Promise.allSettled(
    companies.map(async (company) => {
      try {
        const notifications: any[] = []

        // Process each threshold with its window
        for (const { days, type, urgency, windowMin, windowMax } of thresholds) {
          // Compute the date window: cheques due between windowMin and windowMax days from today
          const windowStart = new Date(today)
          windowStart.setDate(windowStart.getDate() + windowMin)
          windowStart.setHours(0, 0, 0, 0)
          const windowEnd = new Date(today)
          windowEnd.setDate(windowEnd.getDate() + windowMax)
          windowEnd.setHours(23, 59, 59, 999)

          const cheques = await prisma.cheque.findMany({
            where: {
              companyId: company.id,
              deletedAt: null,
              status: 'pending',
              dueDate: { gte: windowStart, lte: windowEnd },
            },
            include: { property: { select: { id: true, name: true } } },
          })

          for (const cheque of cheques) {
            // Compute actual days until due (for display)
            const dueDate = new Date(cheque.dueDate)
            dueDate.setHours(0, 0, 0, 0)
            const actualDaysUntilDue = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

            // Idempotency: skip if a notification of this exact type already exists for this cheque today
            const existingNotif = await prisma.notification.findFirst({
              where: {
                companyId: company.id,
                type,
                data: { contains: `"chequeId":"${cheque.id}"` },
                createdAt: { gte: new Date(today) },
              },
              select: { id: true },
            })
            if (existingNotif) {
              console.log(`  [${company.name}] Skipping duplicate ${type} for cheque ${cheque.id}`)
              continue
            }

            const urgencyPrefix = urgency === 'critical' ? 'CRITICAL: ' : urgency === 'urgent' ? 'URGENT: ' : ''
            const dayLabel = actualDaysUntilDue === 0 ? 'TODAY' : actualDaysUntilDue === 1 ? 'TOMORROW' : `in ${actualDaysUntilDue} Days`

            const notif = await prisma.notification.create({
              data: {
                companyId: company.id,
                type,
                title: `Cheque Due ${dayLabel} — AED ${Number(cheque.amount).toLocaleString('en-AE')} to ${cheque.payeeName}`,
                message: `${urgencyPrefix}Outgoing cheque to ${cheque.payeeName} for ${cheque.property.name} is due on ${cheque.dueDate.toISOString().slice(0, 10)}. Amount: AED ${Number(cheque.amount).toLocaleString('en-AE')}${cheque.chequeNumber ? ` | Cheque #: ${cheque.chequeNumber}` : ''}${cheque.bankName ? ` | Bank: ${cheque.bankName}` : ''}${cheque.payeeMobile ? ` | Contact: ${cheque.payeeMobile}` : ''}`,
                data: JSON.stringify({
                  chequeId: cheque.id,
                  payeeName: cheque.payeeName,
                  payeeMobile: cheque.payeeMobile,
                  amount: Number(cheque.amount),
                  dueDate: cheque.dueDate.toISOString(),
                  chequeNumber: cheque.chequeNumber,
                  bankName: cheque.bankName,
                  propertyId: cheque.propertyId,
                  propertyName: cheque.property.name,
                  daysUntilDue: actualDaysUntilDue,
                  threshold: days,
                  urgency,
                  actionUrl: '/cheques',
                  actionLabel: 'View Cheque',
                }),
              },
            })
            notifications.push({ type, cheque, notifId: notif.id, actualDaysUntilDue })
          }
        }

        // ─── Overdue cheques (dueDate < today, status = pending) ───
        const overdueCheques = await prisma.cheque.findMany({
          where: {
            companyId: company.id,
            deletedAt: null,
            status: 'pending',
            dueDate: { lt: today },
          },
          include: { property: { select: { id: true, name: true } } },
        })

        for (const cheque of overdueCheques) {
          const daysOverdue = Math.floor((today.getTime() - new Date(cheque.dueDate).getTime()) / (1000 * 60 * 60 * 24))
          if (![1, 7, 14, 30].includes(daysOverdue)) continue

          // Idempotency check
          const existingOverdueNotif = await prisma.notification.findFirst({
            where: {
              companyId: company.id,
              type: 'cheque_overdue',
              data: { contains: `"chequeId":"${cheque.id}"` },
              createdAt: { gte: new Date(today) },
            },
            select: { id: true },
          })
          if (existingOverdueNotif) continue

          const notif = await prisma.notification.create({
            data: {
              companyId: company.id,
              type: 'cheque_overdue',
              title: `OVERDUE Cheque — AED ${Number(cheque.amount).toLocaleString('en-AE')} to ${cheque.payeeName} (${daysOverdue}d overdue)`,
              message: `OVERDUE: Outgoing cheque to ${cheque.payeeName} for ${cheque.property.name} was due on ${cheque.dueDate.toISOString().slice(0, 10)} (${daysOverdue} days ago). Amount: AED ${Number(cheque.amount).toLocaleString('en-AE')}${cheque.chequeNumber ? ` | Cheque #: ${cheque.chequeNumber}` : ''}${cheque.bankName ? ` | Bank: ${cheque.bankName}` : ''}${cheque.payeeMobile ? ` | Contact: ${cheque.payeeMobile}` : ''}`,
              data: JSON.stringify({
                chequeId: cheque.id,
                payeeName: cheque.payeeName,
                payeeMobile: cheque.payeeMobile,
                amount: Number(cheque.amount),
                dueDate: cheque.dueDate.toISOString(),
                chequeNumber: cheque.chequeNumber,
                bankName: cheque.bankName,
                propertyId: cheque.propertyId,
                propertyName: cheque.property.name,
                daysOverdue,
                urgency: 'critical',
                actionUrl: '/cheques',
                actionLabel: 'View Cheque',
              }),
            },
          })
          notifications.push({ type: 'overdue', cheque, notifId: notif.id, daysOverdue })
        }

        return {
          companyId: company.id,
          companyName: company.name,
          notificationsCreated: notifications.length,
          breakdown: {
            dueIn15Days: notifications.filter((n) => n.type === 'cheque_reminder_15d').length,
            dueIn7Days: notifications.filter((n) => n.type === 'cheque_reminder_7d').length,
            dueIn5Days: notifications.filter((n) => n.type === 'cheque_reminder_5d').length,
            dueIn3Days: notifications.filter((n) => n.type === 'cheque_reminder_3d').length,
            dueIn1Day: notifications.filter((n) => n.type === 'cheque_reminder_1d').length,
            overdue: notifications.filter((n) => n.type === 'overdue').length,
          },
          notifications: notifications.map((n) => ({
            type: n.type,
            payee: n.cheque.payeeName,
            property: n.cheque.property.name,
            amount: Number(n.cheque.amount),
            dueDate: n.cheque.dueDate.toISOString().slice(0, 10),
            daysUntilDue: n.actualDaysUntilDue,
            daysOverdue: n.daysOverdue,
          })),
        }
      } catch (err: any) {
        console.error(`[CHEQUE_REMINDERS] Company ${company.name} failed:`, err.message)
        throw err
      }
    })
  )

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i]
    if (result.status === 'fulfilled') {
      results.push(result.value)
    } else {
      errors.push({
        companyId: companies[i].id,
        companyName: companies[i].name,
        error: result.reason?.message || String(result.reason),
      })
    }
  }

  const summary = {
    timestamp: new Date().toISOString(),
    today: today.toISOString().slice(0, 10),
    thresholds: thresholds.map(t => ({
      days: t.days,
      type: t.type,
      window: `${t.windowMin}-${t.windowMax} days`,
      windowStart: new Date(today.getTime() + t.windowMin * 86400000).toISOString().slice(0, 10),
      windowEnd: new Date(today.getTime() + t.windowMax * 86400000).toISOString().slice(0, 10),
    })),
    companiesProcessed: results.length,
    companiesFailed: errors.length,
    totalNotificationsCreated: results.reduce((s, r) => s + r.notificationsCreated, 0),
    results,
    errors,
  }

  console.log(`[CHEQUE_REMINDERS] DONE | notifications=${summary.totalNotificationsCreated} | companies=${results.length} | failed=${errors.length}`)

  return new Response(JSON.stringify(summary, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
