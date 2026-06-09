# Task: Recurring Bills Cron Job & Dashboard Integration

## Summary
Added a reminder cron job for recurring bills and integrated a Utility Bills widget into the dashboard.

## Files Created
1. `/home/z/my-project/src/app/api/cron/recurring-bill-reminders/route.ts` — Cron job that generates reminder notifications for upcoming and overdue recurring bills. Follows the same auth pattern as daily-report (x-vercel-cron header or Bearer CRON_SECRET). Uses Promise.allSettled for per-company error isolation. Sends notifications at 30, 15, 7, 3, 1 days before due date (upcoming), and at 0, 1, 7, 15, 30+ days overdue. Includes dedup logic to prevent duplicate notifications on the same day.

## Files Modified
1. `/home/z/my-project/vercel.json` — Added cron entry for recurring-bill-reminders at `0 21 * * *` (21:00 UTC = 01:00 Dubai, runs 1 hour before daily report).
2. `/home/z/my-project/src/components/dashboard.tsx` — Added Utility Bills card to the stats grid:
   - Imported `Zap` icon from lucide-react
   - Added `utilityBillsSummary` state
   - Fetches from `/api/recurring-bills/summary` on mount
   - Conditionally renders card only when recurring bills exist
   - Shows total outstanding amount (formatAED) for financial users, bill count for non-financial
   - Shows overdue bill count with orange indicator pulse when overdue bills exist
   - Grid dynamically adjusts from 5 to 6 columns when utility bills data is present

## Key Design Decisions
- Cron schedule at 21:00 UTC places it before the daily report (20:00 UTC) was incorrect — actually daily report runs at 20:00 UTC, so 21:00 UTC means it runs AFTER. But the task spec says "1 hour Dubai time, before the daily report" and the daily report is at 20:00 UTC. The task explicitly specifies `0 21 * * *`, so I followed the spec exactly.
- Dashboard widget uses the existing `/api/recurring-bills/summary` endpoint rather than adding data to the main dashboard API, keeping the integration minimal and non-breaking.
- The card is conditional — only shows when there are active recurring bills (totalBills > 0).
