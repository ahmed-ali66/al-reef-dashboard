import prisma from '@/lib/db'

// ═══════════════════════════════════════════════════════════════════════════
// CHEQUE REMINDERS CRON
// ═══════════════════════════════════════════════════════════════════════════
// Runs daily via GitHub Actions. Finds all OUTGOING cheques (to property owners)
// that are due in exactly 7 days, and creates reminder notifications.
//
// "Outgoing cheques" = cheques in the Cheques table (payments TO property owners).
// This does NOT track incoming tenant cheques — those are tracked via Payment records
// with method='cheque'.
//
// For each cheque due in 7 days:
//   - Creates a notification with cheque details (payee, amount, property, bank)
//   - Notification type: 'cheque_reminder_7d'
//   - Urgency: 'warning' (yellow)
//
// Also finds cheques due in 3 days and 1 day for escalating reminders.
//
// AUTH: Bearer CRON_SECRET or x-vercel-cron header.

export async function GET(request: Request) {
  // ─── Auth ───
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

  // Compute target dates: +7 days, +3 days, +1 day
  const in7Days = new Date(today)
  in7Days.setDate(in7Days.getDate() + 7)

  const in3Days = new Date(today)
  in3Days.setDate(in3Days.getDate() + 3)

  const in1Day = new Date(today)
  in1Day.setDate(in1Day.getDate() + 1)

  // Also find OVERDUE cheques (dueDate < today, status = pending)
  // These are the most urgent — should have been deposited already

  console.log(`[CHEQUE_REMINDERS] Checking for cheques due on: ${in7Days.toISOString().slice(0,10)} (7d), ${in3Days.toISOString().slice(0,10)} (3d), ${in1Day.toISOString().slice(0,10)} (1d), and overdue`)

  // ─── Fetch all companies ───
  const companies = await prisma.company.findMany({ select: { id: true, name: true } })

  const results: any[] = []
  const errors: any[] = []

  const settled = await Promise.allSettled(
    companies.map(async (company) => {
      try {
        const notifications: any[] = []

        // ─── 1. Cheques due in exactly 7 days ───
        const cheques7d = await prisma.cheque.findMany({
          where: {
            companyId: company.id,
            deletedAt: null,
            status: 'pending',
            dueDate: {
              gte: in7Days,
              lt: new Date(in7Days.getTime() + 24 * 60 * 60 * 1000),
            },
          },
          include: {
            property: { select: { id: true, name: true } },
          },
        })

        for (const cheque of cheques7d) {
          const notif = await prisma.notification.create({
            data: {
              companyId: company.id,
              type: 'cheque_reminder_7d',
              title: `Cheque Due in 7 Days — AED ${Number(cheque.amount).toLocaleString('en-AE')} to ${cheque.payeeName}`,
              message: `Outgoing cheque to ${cheque.payeeName} for ${cheque.property.name} is due on ${cheque.dueDate.toISOString().slice(0, 10)}. Amount: AED ${Number(cheque.amount).toLocaleString('en-AE')}${cheque.chequeNumber ? ` | Cheque #: ${cheque.chequeNumber}` : ''}${cheque.bankName ? ` | Bank: ${cheque.bankName}` : ''}`,
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
                daysUntilDue: 7,
              }),
            },
          })
          notifications.push({ type: '7d', cheque, notifId: notif.id })
        }

        // ─── 2. Cheques due in exactly 3 days ───
        const cheques3d = await prisma.cheque.findMany({
          where: {
            companyId: company.id,
            deletedAt: null,
            status: 'pending',
            dueDate: {
              gte: in3Days,
              lt: new Date(in3Days.getTime() + 24 * 60 * 60 * 1000),
            },
          },
          include: {
            property: { select: { id: true, name: true } },
          },
        })

        for (const cheque of cheques3d) {
          const notif = await prisma.notification.create({
            data: {
              companyId: company.id,
              type: 'cheque_reminder_3d',
              title: `Cheque Due in 3 Days — AED ${Number(cheque.amount).toLocaleString('en-AE')} to ${cheque.payeeName}`,
              message: `URGENT: Outgoing cheque to ${cheque.payeeName} for ${cheque.property.name} is due on ${cheque.dueDate.toISOString().slice(0, 10)}. Amount: AED ${Number(cheque.amount).toLocaleString('en-AE')}${cheque.chequeNumber ? ` | Cheque #: ${cheque.chequeNumber}` : ''}${cheque.bankName ? ` | Bank: ${cheque.bankName}` : ''}`,
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
                daysUntilDue: 3,
              }),
            },
          })
          notifications.push({ type: '3d', cheque, notifId: notif.id })
        }

        // ─── 3. Cheques due in exactly 1 day ───
        const cheques1d = await prisma.cheque.findMany({
          where: {
            companyId: company.id,
            deletedAt: null,
            status: 'pending',
            dueDate: {
              gte: in1Day,
              lt: new Date(in1Day.getTime() + 24 * 60 * 60 * 1000),
            },
          },
          include: {
            property: { select: { id: true, name: true } },
          },
        })

        for (const cheque of cheques1d) {
          const notif = await prisma.notification.create({
            data: {
              companyId: company.id,
              type: 'cheque_reminder_1d',
              title: `Cheque Due TOMORROW — AED ${Number(cheque.amount).toLocaleString('en-AE')} to ${cheque.payeeName}`,
              message: `CRITICAL: Outgoing cheque to ${cheque.payeeName} for ${cheque.property.name} is due TOMORROW (${cheque.dueDate.toISOString().slice(0, 10)}). Amount: AED ${Number(cheque.amount).toLocaleString('en-AE')}${cheque.chequeNumber ? ` | Cheque #: ${cheque.chequeNumber}` : ''}${cheque.bankName ? ` | Bank: ${cheque.bankName}` : ''}${cheque.payeeMobile ? ` | Contact: ${cheque.payeeMobile}` : ''}`,
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
                daysUntilDue: 1,
              }),
            },
          })
          notifications.push({ type: '1d', cheque, notifId: notif.id })
        }

        // ─── 4. Overdue cheques (dueDate < today, status = pending) ───
        const overdueCheques = await prisma.cheque.findMany({
          where: {
            companyId: company.id,
            deletedAt: null,
            status: 'pending',
            dueDate: { lt: today },
          },
          include: {
            property: { select: { id: true, name: true } },
          },
        })

        for (const cheque of overdueCheques) {
          const daysOverdue = Math.floor((today.getTime() - new Date(cheque.dueDate).getTime()) / (1000 * 60 * 60 * 24))
          // Only notify on specific milestones to avoid spam: 1, 7, 14, 30 days overdue
          if (![1, 7, 14, 30].includes(daysOverdue)) continue

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
            dueIn7Days: notifications.filter((n) => n.type === '7d').length,
            dueIn3Days: notifications.filter((n) => n.type === '3d').length,
            dueIn1Day: notifications.filter((n) => n.type === '1d').length,
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
    checkDates: {
      in7Days: in7Days.toISOString().slice(0, 10),
      in3Days: in3Days.toISOString().slice(0, 10),
      in1Day: in1Day.toISOString().slice(0, 10),
    },
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
