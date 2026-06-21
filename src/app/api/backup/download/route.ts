import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  isFinancialUser,
} from '@/lib/api-utils'

/**
 * GET /api/backup/download?recordId=xxx
 *
 * Downloads a backup file from Vercel Blob storage.
 *
 * Authentication: requires owner/admin role (financial access).
 * The BLOB_READ_WRITE_TOKEN is used server-side to fetch the private blob
 * and stream it back to the authenticated user as a downloadable file.
 *
 * Query params:
 *   recordId: string (required) — the backup_records.id to download
 *
 * Response:
 *   - 200: binary file stream with Content-Disposition: attachment
 *   - 401: not authenticated
 *   - 403: not authorized (non-financial role) OR backup has no storage URL
 *   - 404: backup record not found
 *   - 502: failed to fetch from Vercel Blob
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate the user
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    // 2. Require financial access (owner/admin only)
    if (!isFinancialUser(user.role)) {
      return forbiddenResponse('Only owners and admins can download backups')
    }

    // 3. Parse and validate the recordId
    const { searchParams } = new URL(request.url)
    const recordId = searchParams.get('recordId')
    if (!recordId) {
      return errorResponse('recordId query parameter is required', 400)
    }

    // 4. Fetch the backup record from DB
    const record = await prisma.backupRecord.findFirst({
      where: {
        id: recordId,
        companyId: user.companyId,  // ensure user can only download their own company's backups
      },
    })

    if (!record) {
      return errorResponse('Backup record not found', 404)
    }

    if (!record.storageUrl) {
      return errorResponse('This backup has no stored file (storageUrl is null)', 404)
    }

    // 5. Fetch the file from Vercel Blob using the server-side token
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN
    if (!blobToken) {
      console.error('BLOB_READ_WRITE_TOKEN not configured')
      return errorResponse('Blob storage not configured on server', 500)
    }

    const blobResponse = await fetch(record.storageUrl, {
      headers: { Authorization: `Bearer ${blobToken}` },
    })

    if (!blobResponse.ok) {
      console.error(`Failed to fetch blob: ${blobResponse.status} ${blobResponse.statusText}`)
      return errorResponse(
        `Failed to fetch backup file from storage (HTTP ${blobResponse.status})`,
        502,
      )
    }

    // 6. Stream the file back to the user as a downloadable attachment
    const blobBuffer = await blobResponse.arrayBuffer()

    // Build a descriptive filename: backup-YYYY-MM-DD-HHmmss.json
    const createdAt = record.createdAt
    const datePart = createdAt.toISOString().split('T')[0]  // YYYY-MM-DD
    const timePart = createdAt.toISOString().split('T')[1].split('.')[0].replace(/:/g, '')  // HHmmss
    const filename = `backup-${datePart}-${timePart}.json`

    // Return as downloadable file
    return new NextResponse(blobBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(blobBuffer.byteLength),
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    })
  } catch (error) {
    console.error('Backup download error:', error)
    return errorResponse('Failed to download backup', 500)
  }
}
