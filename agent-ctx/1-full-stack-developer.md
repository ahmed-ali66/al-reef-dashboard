---
Task ID: 1
Agent: full-stack-developer
Task: Implement production-grade backup, data protection, and admin management system

Work Log:
- Read and analyzed all existing codebase files (prisma schema, API routes, components, store, i18n, sidebar, page.tsx)
- Updated Prisma schema: added `storageUrl`, `dataHash`, `triggeredBy` nullable fields and `@@index([status])` to BackupRecord model
- Created migration file: `prisma/migrations/20260607100000_add_backup_persistence_fields/migration.sql`
- Upgraded `src/app/api/backup/auto/route.ts`:
  - Added conditional @vercel/blob import with graceful fallback
  - Added SHA-256 data hash computation via `crypto.createHash('sha256')`
  - Added `storageUrl` field to BackupRecord creation
  - Added `dataHash` field to BackupRecord creation
  - Added `triggeredBy` field (userId or "system" for cron)
  - Changed retention from 30 days to 90 days (`ninetyDaysAgo`)
  - Added `storageUrl` and `dataHash` to API results
- Upgraded `src/app/api/backup/route.ts`:
  - Added `X-Backup-Hash` response header with SHA-256 hash on GET
  - Added BackupRecord creation for manual backups (type: 'manual')
  - Added soft-deleted record restoration in POST handler:
    - Restores `body.deleted.properties` with preserved `deletedAt`
    - Restores `body.deleted.tenants` with preserved `deletedAt` and their payments
    - Restores `body.deleted.expenses` with preserved `deletedAt`
    - Restores `body.deleted.maintenance` with preserved `deletedAt`
  - Added `dataHash` and `triggeredBy` to BackupRecord creation
- Created `src/app/api/backup/history/route.ts`:
  - GET endpoint with pagination (parsePaginationParams/paginatedResponse)
  - Filters by type (auto|manual|all) and status (completed|failed|all)
  - Returns paginated list of BackupRecord entries
- Created `src/app/api/backup/integrity/route.ts`:
  - GET endpoint (read-only) for data integrity verification
  - Returns record counts, financial totals, orphan detection, soft-deleted counts, last backup info, DB latency
- Created `src/app/api/system/stats/route.ts`:
  - GET endpoint for admin dashboard system statistics
  - Returns record counts, active users, recent logins, backup status, health check, uptime
- Updated `vercel.json`: Added backup cron job at 2:00 AM UTC (6:00 AM Dubai)
- Updated `src/lib/store.ts`: Added 'system' to PageType union
- Updated `src/components/sidebar.tsx`: Added system management nav item with ShieldCheck icon
- Updated `src/app/page.tsx`: Added SystemManagement import and 'system' case in switch
- Created `src/components/system-management.tsx`:
  - 4-tab interface: Data Protection, Backup History, Data Integrity, System Health
  - Create Backup and Upload & Restore functionality
  - Warning dialog before restore
  - Paginated backup history with type/status filters
  - Integrity check with record counts, financials, orphan detection, soft-deleted counts
  - System health with DB status, active users, recent logins, uptime
  - Auto-refresh every 60 seconds on health tab
  - Full i18n support via t() function
  - Same styling patterns as audit-logs.tsx
- Added 40+ i18n translation keys in 4 languages (en, ar, bn, ur)
- Installed @vercel/blob package
- Verified: ESLint passes for all src/ files, Next.js build succeeds with no errors

Stage Summary:
- Files modified: prisma/schema.prisma, vercel.json, src/lib/store.ts, src/components/sidebar.tsx, src/app/page.tsx, src/lib/i18n.ts, src/app/api/backup/auto/route.ts, src/app/api/backup/route.ts
- Files created: src/app/api/backup/history/route.ts, src/app/api/backup/integrity/route.ts, src/app/api/system/stats/route.ts, src/components/system-management.tsx, prisma/migrations/20260607100000_add_backup_persistence_fields/migration.sql
- Build: PASS (no errors)
- Lint: PASS for all src/ files (remaining errors are pre-existing in scripts/)
- All changes are additive and backward-compatible
