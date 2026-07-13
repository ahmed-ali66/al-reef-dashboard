import prisma from '@/lib/db'
import { safeNumber } from '@/lib/api-utils'
import { FINANCIALLY_ACTIVE_STATUSES } from '@/lib/utils'

// ═══════════════════════════════════════════════════════════════════════════
// MONTHLY ROLLOVER CRON
// ═══════════════════════════════════════════════════════════════════════════
// Runs on the 1st of each month at 00:00 UTC (04:00 Dubai time).
// Performs 3 critical operations for each company:
//
//   1. CARRY FORWARD UNPAID RENT → openingBalance
//      For each tenant active in the PREVIOUS month who didn't pay full rent,
//      add the unpaid amount to their openingBalance (tracked as overdue debt).
//
//   2. CONSUME CREDIT BALANCE for the NEW month's rent
//      For each tenant with creditBalance > 0, consume up to 1 month's rent,
//      creating a CURRENT_RENT payment record (so July shows "paid via credit").
//      Reduces tenant.creditBalance accordingly.
//
//   3. AUTO-ADVANCE RECURRING BILL CYCLES
//      For each active recurring bill whose nextDueDate has passed,
//      create a new BillCycle for the next period.
//      The new cycle's `amount` is 0 — the accountant enters the actual bill
//      amount manually when the new statement arrives. Only the previous
//      cycle's UNPAID balance (outstandingAmount) is carried forward to the
//      new cycle's outstandingAmount. If the previous cycle was fully paid,
//      the new cycle starts at 0.
//
// IDEMPOTENCY: A RolloverLog record is created at the end. The unique
// constraint on (companyId, targetMonth, targetYear, dryRun) ensures re-running
// the cron for the same month is a no-op.
//
// DRY RUN: Pass ?dryRun=true to preview what would happen without making changes.
// TARGET OVERRIDE: Pass ?targetMonth=7&targetYear=2026 to override the target month
// (useful for testing or manual triggers).
//
// AUTH: Accepts x-vercel-cron header (for Vercel Cron) OR Bearer CRON_SECRET
// (for manual triggers). The dryRun mode is also auth-protected to prevent
// unauthorized data preview.

export async function GET(request: Request) {
  // ─── 1. Auth ───
  const isVercelCron = request.headers.get('x-vercel-cron') === 'true'
  const authHeader = request.headers.get('authorization')
  const isBearerAuth = authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isVercelCron && !isBearerAuth) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ─── 2. Parse query params ───
  const { searchParams } = new URL(request.url)
  const dryRun = searchParams.get('dryRun') === 'true'
  const targetMonthParam = searchParams.get('targetMonth')
  const targetYearParam = searchParams.get('targetYear')

  const now = new Date()
  // Default target = current month (the cron fires on the 1st, so "current month" is the new month)
  let targetMonth = targetMonthParam ? parseInt(targetMonthParam) : now.getMonth() + 1
  let targetYear = targetYearParam ? parseInt(targetYearParam) : now.getFullYear()

  if (!targetMonth || targetMonth < 1 || targetMonth > 12) {
    return new Response(JSON.stringify({ error: 'Invalid targetMonth' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (!targetYear || targetYear < 2020 || targetYear > 2100) {
    return new Response(JSON.stringify({ error: 'Invalid targetYear' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Previous month = target month - 1
  let prevMonth = targetMonth - 1
  let prevYear = targetYear
  if (prevMonth === 0) {
    prevMonth = 12
    prevYear = targetYear - 1
  }

  const triggeredBy = isVercelCron ? 'cron' : 'manual'

  console.log(`[MONTHLY_ROLLOVER] START | target=${targetYear}-${String(targetMonth).padStart(2, '0')} | prev=${prevYear}-${String(prevMonth).padStart(2, '0')} | dryRun=${dryRun} | triggeredBy=${triggeredBy}`)

  // ─── 3. Get all companies ───
  const companies = await prisma.company.findMany({ select: { id: true, name: true } })

  const results: any[] = []
  const errors: any[] = []

  // Process each company independently — one failing company doesn't break others
  const settled = await Promise.allSettled(
    companies.map(async (company) => {
      try {
        return await processCompanyRollover({
          companyId: company.id,
          companyName: company.name,
          targetMonth,
          targetYear,
          prevMonth,
          prevYear,
          dryRun,
          triggeredBy,
        })
      } catch (err: any) {
        console.error(`[MONTHLY_ROLLOVER] Company ${company.name} failed:`, err.message)
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
    targetMonth,
    targetYear,
    prevMonth,
    prevYear,
    dryRun,
    triggeredBy,
    companiesProcessed: results.length,
    companiesFailed: errors.length,
    results,
    errors,
  }

  console.log(`[MONTHLY_ROLLOVER] DONE | processed=${results.length} failed=${errors.length}`)

  return new Response(JSON.stringify(summary, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// PER-COMPANY ROLLOVER
// ═══════════════════════════════════════════════════════════════════════════

async function processCompanyRollover(params: {
  companyId: string
  companyName: string
  targetMonth: number
  targetYear: number
  prevMonth: number
  prevYear: number
  dryRun: boolean
  triggeredBy: string
}): Promise<any> {
  const { companyId, companyName, targetMonth, targetYear, prevMonth, prevYear, dryRun, triggeredBy } = params

  console.log(`  [${companyName}] Starting rollover (dryRun=${dryRun})`)

  // ─── GO-LIVE DATE GUARD ───
  // The system go-live date is the first month this company started using the system for production.
  // The rollover will NEVER carry forward unpaid rent for months before this date.
  // Historical debt for pre-go-live months must be entered manually via HISTORICAL_DEBT payments.
  // If systemGoLiveDate is null, no restriction is applied (treat all months as live).
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { systemGoLiveDate: true },
  })
  if (company?.systemGoLiveDate) {
    const goLiveDate = new Date(company.systemGoLiveDate)
    // Go-live month = the month containing systemGoLiveDate (e.g., June 1, 2026 → June 2026)
    const goLiveMonth = goLiveDate.getMonth() + 1  // 1-indexed
    const goLiveYear = goLiveDate.getFullYear()

    // The PREVIOUS month is the one whose unpaid rent would be carried forward.
    // If the previous month is before the go-live month, refuse to process.
    const prevMonthIsBeforeGoLive = (prevYear < goLiveYear) || (prevYear === goLiveYear && prevMonth < goLiveMonth)

    if (prevMonthIsBeforeGoLive) {
      console.log(`  [${companyName}] SKIPPED — previous month ${prevYear}-${prevMonth} is before system go-live date ${goLiveDate.toISOString().slice(0, 10)}. Historical debt for pre-go-live months must be entered manually.`)
      return {
        companyId,
        companyName,
        status: 'skipped_before_go_live',
        goLiveDate: goLiveDate.toISOString(),
        targetMonth,
        targetYear,
        prevMonth,
        prevYear,
        message: `Skipped: previous month (${prevYear}-${String(prevMonth).padStart(2, '0')}) is before system go-live date (${goLiveDate.toISOString().slice(0, 10)}). Historical debt for pre-go-live months must be entered manually via HISTORICAL_DEBT payments.`,
      }
    }
  }

  // ─── IDEMPOTENCY CHECK ───
  // If a NON-dry-run rollover already completed for this (company, month, year), skip.
  // Dry-run records don't block real runs (they have a different unique key).
  if (!dryRun) {
    const existing = await prisma.rolloverLog.findUnique({
      where: {
        companyId_targetMonth_targetYear_dryRun: {
          companyId,
          targetMonth,
          targetYear,
          dryRun: false,
        },
      },
    })
    if (existing && existing.status === 'completed') {
      console.log(`  [${companyName}] Already completed at ${existing.createdAt.toISOString()} — skipping`)
      return {
        companyId,
        companyName,
        status: 'skipped_already_done',
        completedAt: existing.createdAt.toISOString(),
        stats: existing,
      }
    }
  }

  // ─── FETCH DATA ───
  // All financially active tenants (we'll filter by lease dates inside the loop)
  const tenants = await prisma.tenant.findMany({
    where: {
      companyId,
      deletedAt: null,
      status: { in: [...FINANCIALLY_ACTIVE_STATUSES] },
    },
    select: {
      id: true,
      name: true,
      rentAmount: true,
      creditBalance: true,
      openingBalance: true,
      municipalityFee: true,
      leaseStart: true,
      leaseEnd: true,
      property: { select: { name: true } },
    },
  })

  // Previous month's payments (excluding HISTORICAL_DEBT — those already reduced openingBalance)
  const prevMonthPayments = await prisma.payment.findMany({
    where: {
      companyId,
      month: prevMonth,
      year: prevYear,
      allocationType: { not: 'HISTORICAL_DEBT' },
    },
    select: { tenantId: true, amount: true, allocationType: true },
  })

  // Existing rollover payments for the TARGET month (idempotency: skip tenants already processed)
  const targetMonthRolloverRef = `ROLLOVER-${targetYear}-${String(targetMonth).padStart(2, '0')}`
  const existingRolloverPayments = await prisma.payment.findMany({
    where: {
      companyId,
      month: targetMonth,
      year: targetYear,
      reference: targetMonthRolloverRef,
    },
    select: { tenantId: true },
  })
  const tenantsAlreadyProcessed = new Set(existingRolloverPayments.map((p) => p.tenantId))

  // ALL existing payments for the TARGET month (not just rollover ones).
  // Used in Phase B to skip credit consumption for tenants who already paid the target month's rent.
  // This prevents double-payment when a tenant has both a credit balance AND a manual payment for the same month.
  const targetMonthAllPayments = await prisma.payment.findMany({
    where: {
      companyId,
      month: targetMonth,
      year: targetYear,
      allocationType: { not: 'HISTORICAL_DEBT' },
    },
    select: { tenantId: true, amount: true },
  })
  const targetMonthPaidMap = new Map<string, number>()
  for (const p of targetMonthAllPayments) {
    targetMonthPaidMap.set(p.tenantId, (targetMonthPaidMap.get(p.tenantId) || 0) + safeNumber(p.amount))
  }

  // Rent adjustments effective in the previous month
  const prevMonthAdjustments = await prisma.rentAdjustment.findMany({
    where: {
      companyId,
      status: 'approved',
      effectiveMonth: prevMonth,
      effectiveYear: prevYear,
    },
    select: { tenantId: true, amount: true, durationMonths: true, effectiveMonth: true, effectiveYear: true },
  })
  // Only apply adjustments whose duration covers the previous month
  // (effectiveMonth/Year is the start; durationMonths extends forward)
  const adjustmentMap = new Map<string, number>()
  for (const adj of prevMonthAdjustments) {
    const monthsFromStart = (prevYear - adj.effectiveYear) * 12 + (prevMonth - adj.effectiveMonth)
    if (monthsFromStart >= 0 && monthsFromStart < adj.durationMonths) {
      adjustmentMap.set(adj.tenantId, (adjustmentMap.get(adj.tenantId) || 0) + safeNumber(adj.amount))
    }
  }

  // Active recurring bills that need cycle advancement
  const recurringBills = await prisma.recurringBill.findMany({
    where: {
      companyId,
      deletedAt: null,
      status: 'active',
    },
    include: {
      cycles: {
        where: { status: { in: ['pending', 'partially_paid'] } },
        orderBy: { dueDate: 'desc' },
        take: 1,
      },
    },
  })

  // ─── STATS ───
  let tenantsProcessed = 0
  let creditsConsumed = 0
  let creditsConsumedTotal = 0
  let debtsCarriedForward = 0
  let debtsCarriedTotal = 0
  let billsAdvanced = 0

  // Preview arrays for dry-run response
  const preview: any[] = []

  // Target month boundary
  const targetMonthStart = new Date(targetYear, targetMonth - 1, 1)
  const targetMonthRolloverDate = new Date(targetYear, targetMonth - 1, 1, 0, 0, 0, 0) // 1st of target month

  // Previous month boundary
  const prevMonthStart = new Date(prevYear, prevMonth - 1, 1)
  const prevMonthEnd = new Date(prevYear, prevMonth, 0, 23, 59, 59, 999)

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE A: CARRY FORWARD UNPAID RENT (previous month → openingBalance)
  // ═══════════════════════════════════════════════════════════════════════
  // For each tenant who was active during the previous month (lease was active),
  // compute: unpaidAmount = max(0, rentAmount + munFee - totalPaid - adjustments - creditApplied)
  // If unpaidAmount > 0, add it to openingBalance.
  //
  // NOTE: This does NOT create a payment record — the debt is tracked via openingBalance
  // (consistent with how HISTORICAL_DEBT payments work: they reduce openingBalance).
  // The user can then collect on it later via a HISTORICAL_DEBT payment.

  for (const tenant of tenants) {
    // Skip if already processed in a prior run (idempotency)
    if (tenantsAlreadyProcessed.has(tenant.id)) continue

    // Check if tenant's lease was active during the previous month
    const leaseStart = tenant.leaseStart ? new Date(tenant.leaseStart) : null
    const leaseEnd = tenant.leaseEnd ? new Date(tenant.leaseEnd) : null
    if (leaseStart && leaseStart > prevMonthEnd) continue // lease started after prev month ended
    if (leaseEnd && leaseEnd < prevMonthStart) continue // lease ended before prev month started

    // Compute total paid in previous month for this tenant (excluding HISTORICAL_DEBT)
    const tenantPrevPayments = prevMonthPayments.filter((p) => p.tenantId === tenant.id)
    const totalPaidPrev = tenantPrevPayments.reduce((s, p) => s + safeNumber(p.amount), 0)

    // Get adjustments for this tenant in the previous month
    const adjustments = adjustmentMap.get(tenant.id) || 0

    // Credit balance available at start of prev month
    // (We use the CURRENT creditBalance as a proxy — it represents advance payments
    // made before now. This is an approximation; a perfectly accurate system would
    // snapshot creditBalance at month boundaries. For v1 this is acceptable.)
    const creditAvailable = safeNumber(tenant.creditBalance)

    // Monthly charges
    const monthlyRent = safeNumber(tenant.rentAmount)
    const monthlyMunFee = safeNumber(tenant.municipalityFee)
    const monthlyCharges = monthlyRent + monthlyMunFee

    // Credit that would have been applied in prev month (display logic matches rent-collection.tsx)
    const creditAppliedPrev = Math.min(creditAvailable, Math.max(0, monthlyCharges - totalPaidPrev - adjustments))

    // Unpaid amount after all credits/adjustments
    const unpaidAmount = Math.max(0, monthlyCharges - totalPaidPrev - adjustments - creditAppliedPrev)

    tenantsProcessed++

    if (unpaidAmount > 0) {
      debtsCarriedForward++
      debtsCarriedTotal += unpaidAmount

      if (dryRun) {
        preview.push({
          action: 'CARRY_FORWARD_DEBT',
          tenantId: tenant.id,
          tenantName: tenant.name,
          property: tenant.property.name,
          prevMonth: `${prevYear}-${String(prevMonth).padStart(2, '0')}`,
          monthlyCharges,
          totalPaid: totalPaidPrev,
          adjustments,
          creditApplied: creditAppliedPrev,
          unpaidAmount,
          currentOpeningBalance: safeNumber(tenant.openingBalance),
          newOpeningBalance: safeNumber(tenant.openingBalance) + unpaidAmount,
        })
      } else {
        // Add unpaid amount to openingBalance
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: {
            openingBalance: { increment: unpaidAmount },
          },
        })
        console.log(`    [${tenant.property.name} | ${tenant.name}] Carried forward AED ${unpaidAmount.toFixed(2)} → openingBalance`)
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE B: CONSUME CREDIT BALANCE for the NEW month's rent
  // ═══════════════════════════════════════════════════════════════════════
  // For each tenant with creditBalance > 0 (after Phase A's carry-forward logic,
  // which used the pre-rollover creditBalance for calculation but did NOT reduce it),
  // consume up to 1 month's rent for the NEW month.
  //
  // This creates a CURRENT_RENT payment record (so the new month shows "paid via credit")
  // and reduces tenant.creditBalance.
  //
  // IMPORTANT: We re-fetch tenants here because Phase A may have updated openingBalance
  // (but not creditBalance — that's unchanged in Phase A). We use the creditBalance
  // as-is from the initial fetch.

  for (const tenant of tenants) {
    if (tenantsAlreadyProcessed.has(tenant.id)) continue

    const creditBalance = safeNumber(tenant.creditBalance)
    if (creditBalance <= 0) continue

    // Check if tenant's lease is active for the TARGET month
    const leaseStart = tenant.leaseStart ? new Date(tenant.leaseStart) : null
    const leaseEnd = tenant.leaseEnd ? new Date(tenant.leaseEnd) : null
    const targetMonthEnd = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999)
    if (leaseStart && leaseStart > targetMonthEnd) continue
    if (leaseEnd && leaseEnd < targetMonthStart) continue

    const monthlyRent = safeNumber(tenant.rentAmount)
    const monthlyMunFee = safeNumber(tenant.municipalityFee)
    const monthlyCharges = monthlyRent + monthlyMunFee

    // CRITICAL: Skip credit consumption if the tenant already has sufficient payments
    // for the target month. This prevents double-payment when a tenant has both a credit
    // balance AND a manual payment for the same month.
    // Example: Tenant paid 11,000 advance in June → 3,667 to June rent, 7,333 to credit.
    // If rollover also consumes 3,667 from credit for June, the tenant is double-paid.
    const alreadyPaidTargetMonth = targetMonthPaidMap.get(tenant.id) || 0
    if (alreadyPaidTargetMonth >= monthlyCharges) {
      // Tenant already paid the target month's rent — don't consume credit
      continue
    }

    // Consume up to 1 month's charges from credit (minus any partial payment already made)
    const remainingCharges = Math.max(0, monthlyCharges - alreadyPaidTargetMonth)
    const amountToConsume = Math.min(creditBalance, remainingCharges)
    if (amountToConsume <= 0) continue

    creditsConsumed++
    creditsConsumedTotal += amountToConsume

    if (dryRun) {
      preview.push({
        action: 'CONSUME_CREDIT',
        tenantId: tenant.id,
        tenantName: tenant.name,
        property: tenant.property.name,
        targetMonth: `${targetYear}-${String(targetMonth).padStart(2, '0')}`,
        monthlyCharges,
        alreadyPaidTargetMonth,
        creditBalanceBefore: creditBalance,
        amountToConsume,
        creditBalanceAfter: creditBalance - amountToConsume,
      })
    } else {
      // Create a payment record for the consumed credit
      await prisma.payment.create({
        data: {
          companyId,
          tenantId: tenant.id,
          amount: amountToConsume,
          date: targetMonthRolloverDate,
          month: targetMonth,
          year: targetYear,
          method: 'credit_balance',
          allocationType: 'CURRENT_RENT',
          reference: targetMonthRolloverRef,
          notes: `Auto-applied from credit balance during monthly rollover to ${targetYear}-${String(targetMonth).padStart(2, '0')}`,
        },
      })

      // Reduce creditBalance
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          creditBalance: { decrement: amountToConsume },
        },
      })

      console.log(`    [${tenant.property.name} | ${tenant.name}] Consumed AED ${amountToConsume.toFixed(2)} from creditBalance → July rent`)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE C: AUTO-ADVANCE RECURRING BILL CYCLES
  // ═══════════════════════════════════════════════════════════════════════
  // For each active recurring bill whose nextDueDate is in the past (before target month start),
  // create a new BillCycle for the next period.
  // Any outstanding amount from the previous cycle is carried forward to the new cycle's
  // outstandingAmount (and the bill's currentOutstanding).

  for (const bill of recurringBills) {
    const nextDueDate = new Date(bill.nextDueDate)

    // Only advance if the nextDueDate is before the target month start
    // (i.e., the bill is due in the past relative to the rollover target)
    if (nextDueDate >= targetMonthStart) {
      continue // bill is still due in the future, no need to advance
    }

    // Calculate new due date based on billing frequency
    const newDueDate = computeNextDueDate(nextDueDate, bill.billingFrequency)
    if (!newDueDate) {
      console.warn(`    [BILL ${bill.id}] Invalid billingFrequency: ${bill.billingFrequency} — skipping`)
      continue
    }

    // Get the most recent open cycle (if any)
    const openCycle = bill.cycles[0] || null
    const carriedOutstanding = openCycle ? safeNumber(openCycle.outstandingAmount) : 0

    // BUSINESS LOGIC (per owner requirement 2026-07-14):
    //   - New cycle's `amount` is 0 — the accountant enters the actual bill
    //     amount manually when the new statement arrives.
    //   - Only the previous cycle's UNPAID balance (outstandingAmount) is
    //     carried forward to the new cycle's outstandingAmount.
    //   - If the previous cycle was fully paid (carriedOutstanding = 0), the
    //     new cycle starts at 0/0/0.
    //   - The recurring bill record itself is preserved (status stays 'active');
    //     only its nextDueDate and outstanding tracking are updated.
    const newAmount = 0
    const newOutstanding = carriedOutstanding

    billsAdvanced++

    if (dryRun) {
      preview.push({
        action: 'ADVANCE_BILL_CYCLE',
        billId: bill.id,
        providerName: bill.providerName,
        serviceType: bill.serviceType,
        oldDueDate: nextDueDate.toISOString().slice(0, 10),
        newDueDate: newDueDate.toISOString().slice(0, 10),
        billingFrequency: bill.billingFrequency,
        newAmount,
        carriedOutstanding,
        newOutstanding,
        oldCycleStatus: openCycle ? openCycle.status : 'none',
      })
    } else {
      // Mark old open cycle as overdue (if outstanding > 0) or paid
      if (openCycle) {
        await prisma.billCycle.update({
          where: { id: openCycle.id },
          data: {
            status: carriedOutstanding > 0 ? 'overdue' : 'paid',
          },
        })
      }

      // Create new cycle
      const periodStart = new Date(nextDueDate)
      const periodEnd = new Date(newDueDate.getTime() - 24 * 60 * 60 * 1000) // day before new due date

      await prisma.billCycle.create({
        data: {
          companyId,
          recurringBillId: bill.id,
          periodStart,
          periodEnd,
          dueDate: newDueDate,
          amount: newAmount,
          paidAmount: 0,
          outstandingAmount: newOutstanding,
          status: 'pending',
          notes: carriedOutstanding > 0 ? `Carried forward AED ${carriedOutstanding.toFixed(2)} unpaid balance from previous cycle` : null,
        },
      })

      // Update the bill's nextDueDate and outstanding tracking
      await prisma.recurringBill.update({
        where: { id: bill.id },
        data: {
          nextDueDate: newDueDate,
          previousOutstanding: carriedOutstanding,
          currentOutstanding: newOutstanding,
          totalAmountDue: newOutstanding,
        },
      })

      console.log(`    [BILL ${bill.providerName} (${bill.serviceType})] Advanced: ${nextDueDate.toISOString().slice(0, 10)} → ${newDueDate.toISOString().slice(0, 10)} | carried=AED ${carriedOutstanding.toFixed(2)} | newAmount=AED 0.00 (accountant will enter actual amount)`)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE D: RECORD ROLLOVER LOG (idempotency tracking)
  // ═══════════════════════════════════════════════════════════════════════
  if (!dryRun) {
    // Delete any existing failed/partial log for this (company, month, year, dryRun=false)
    // to allow re-running after a failure. Only 'completed' logs block re-runs.
    await prisma.rolloverLog.deleteMany({
      where: {
        companyId,
        targetMonth,
        targetYear,
        dryRun: false,
        status: { in: ['failed', 'partial'] },
      },
    }).catch(() => {}) // ignore errors if no rows to delete

    await prisma.rolloverLog.create({
      data: {
        companyId,
        targetMonth,
        targetYear,
        dryRun: false,
        status: 'completed',
        tenantsProcessed,
        creditsConsumed,
        creditsConsumedTotal,
        debtsCarriedForward,
        debtsCarriedTotal,
        billsAdvanced,
        triggeredBy,
      },
    })
  }

  console.log(`  [${companyName}] DONE | tenants=${tenantsProcessed} creditsConsumed=${creditsConsumed} (AED ${creditsConsumedTotal.toFixed(2)}) debtsCarried=${debtsCarriedForward} (AED ${debtsCarriedTotal.toFixed(2)}) billsAdvanced=${billsAdvanced}`)

  return {
    companyId,
    companyName,
    status: 'completed',
    dryRun,
    targetMonth,
    targetYear,
    prevMonth,
    prevYear,
    stats: {
      tenantsProcessed,
      creditsConsumed,
      creditsConsumedTotal: Number(creditsConsumedTotal.toFixed(2)),
      debtsCarriedForward,
      debtsCarriedTotal: Number(debtsCarriedTotal.toFixed(2)),
      billsAdvanced,
    },
    preview: dryRun ? preview.slice(0, 50) : undefined, // limit preview in dry-run for response size
    previewTotal: dryRun ? preview.length : undefined,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Compute next due date based on billing frequency
// ═══════════════════════════════════════════════════════════════════════════
function computeNextDueDate(currentDueDate: Date, frequency: string): Date | null {
  const d = new Date(currentDueDate)
  switch (frequency) {
    case 'monthly':
      d.setMonth(d.getMonth() + 1)
      return d
    case 'quarterly':
      d.setMonth(d.getMonth() + 3)
      return d
    case 'semi_annual':
      d.setMonth(d.getMonth() + 6)
      return d
    case 'annual':
      d.setFullYear(d.getFullYear() + 1)
      return d
    default:
      return null
  }
}
