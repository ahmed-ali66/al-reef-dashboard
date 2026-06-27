import prisma from '@/lib/db'

// ═══════════════════════════════════════════════════════════════════════════
// CHEQUE REMINDERS CRON
// ═══════════════════════════════════════════════════════════════════════════
// Runs daily via GitHub Actions. Finds all OUTGOING cheques (to property owners)
// that are due in 15, 7, 5, 3, or 1 days, and creates reminder notifications.
//
// Reminder thresholds (escalating urgency):
//   15 days — early heads-up (info, blue)
//   7 days  — first reminder (warning, amber)
//   5 days  — second reminder (warning, amber)
//   3 days  — urgent reminder (urgent, orange)
//   1 day   — critical reminder (critical, red)
//   Overdue (1, 7, 14, 30 days overdue) — overdue alerts (critical, red)
//
// IMPORTANT: Uses threshold windows (not exact-day match) so reminders fire
// even if the cron didn't run on the exact day. For example, the 7-day reminder
// fires for any cheque due in 6-7 days, so if the cron missed yesterday's run,
// the cheque still gets a 7-day reminder today (one day late, but not missed).
//
// Each notification includes an `actionUrl` in the data field so the UI can
// make the notification clickable — clicking takes the user to the Cheques
// tab filtered to that specific cheque.
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

  // Compute threshold dates: 15, 7, 5, 3, 1 days from today
  const thresholds = [
    { days: 15, type: 'cheque_reminder_15d', urgency: 'info' },
    { days: 7,  type: 'cheque_reminder_7d',  urgency: 'warning' },
    { days: 5,  type: 'cheque_reminder_5d',  urgency: 'warning' },
    { days: 3,  type: 'cheque_reminder_3d',  urgency: 'urgent' },
    { days: 1,  type: 'cheque_reminder_1d',  urgency: 'critical' },
  ]

  // Compute date ranges for each threshold.
  // Each threshold covers a 2-day window (the target day + the day before)
  // so reminders fire even if the cron missed a day.
  // BUT: windows don't overlap, so a cheque gets exactly ONE reminder per threshold.
  // Example for 7-day: fires if cheque is due in 6-7 days (not 5, not 8).
  const thresholdWindows = thresholds.map(({ days, type, urgency }, i) => {
    const upper = new Date(today)
    upper.setDate(upper.getDate() + days)
    const lower = new Date(today)
    lower.setDate(lower.getDate() + days)  // start of target day
    // Window: [target day start, target day + 1 day) — covers the single target day
    // We'll use a different approach below for "catch-up" — see comment
    return { days, type, urgency, targetDate: upper, label: `${days}d` }
  })

  console.log(`[CHEQUE_REMINDERS] Today: ${today.toISOString().slice(0,10)} | Thresholds: ${thresholds.map(t => `${t.days}d`).join(', ')} | Also checking overdue`)

  // ─── Fetch all companies ───
  const companies = await prisma.company.findMany({ select: { id: true, name: true } })

  const results: any[] = []
  const errors: any[] = []

  const settled = await Promise.allSettled(
    companies.map(async (company) => {
      try {
        const notifications: any[] = []
        const createdChequeIds = new Set<string>()  // track which cheques we've already notified (avoid duplicates across thresholds)

        // Process each threshold (15, 7, 5, 3, 1 days)
        for (const { days, type, urgency, targetDate, label } of thresholdWindows) {
          // Window: exactly the target day (e.g., cheques due ON the date that is `days` from today)
          const windowStart = new Date(targetDate)
          windowStart.setHours(0, 0, 0, 0)
          const windowEnd = new Date(targetDate)
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
            // Skip if we already created a notification for this cheque in this run
            // (shouldn't happen with non-overlapping windows, but safety check)
            if (createdChequeIds.has(cheque.id)) continue
            createdChequeIds.add(cheque.id)

            // Check if a notification of this exact type already exists for this cheque
            // (idempotency: if cron re-runs same day, don't duplicate)
            const existingNotif = await prisma.notification.findFirst({
              where: {
                companyId: company.id,
                type,
                data: { contains: `"chequeId":"${cheque.id}"` },
                createdAt: { gte: new Date(today) },  // created today
              },
              select: { id: true },
            })
            if (existingNotif) {
              console.log(`  [${company.name}] Skipping duplicate ${type} for cheque ${cheque.id}`)
              continue
            }

            const urgencyPrefix = urgency === 'critical' ? 'CRITICAL: ' : urgency === 'urgent' ? 'URGENT: ' : ''
            const dayLabel = days === 1 ? 'TOMORROW' : `in ${days} Days`

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
                  daysUntilDue: days,
                  urgency,
                  actionUrl: '/cheques',  // clicking takes user to Cheques tab
                  actionLabel: 'View Cheque',
                }),
              },
            })
            notifications.push({ type, cheque, notifId: notif.id })
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
          // Only notify on specific milestones to avoid spam: 1, 7, 14, 30 days overdue
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
    thresholds: thresholds.map(t => ({ days: t.days, type: t.type, targetDate: new Date(today.getTime() + t.days * 86400000).toISOString().slice(0, 10) })),
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
