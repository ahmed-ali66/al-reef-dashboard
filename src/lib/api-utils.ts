import { auth } from '@/lib/auth'
import prisma from '@/lib/db'

// ─── Auth ──────────────────────────────────────────────────────

// Get the current authenticated user from the request
export async function getAuthUser() {
  const session = await auth()
  if (!session?.user) return null
  return {
    id: (session.user as any).id,
    email: session.user.email!,
    name: session.user.name!,
    role: (session.user as any).role,
    companyId: (session.user as any).companyId,
    nameAr: (session.user as any).nameAr,
    nameBn: (session.user as any).nameBn,
    nameUr: (session.user as any).nameUr,
    mustChangePassword: (session.user as any).mustChangePassword,
  }
}

// Check if user has financial access (owner, admin, or accountant)
export function isFinancialUser(role: string): boolean {
  return role === 'owner' || role === 'admin' || role === 'accountant'
}

// Check if user is system admin (admin only — manages users/settings)
export function isSystemAdmin(role: string): boolean {
  return role === 'admin'
}

// ─── Audit Logging ─────────────────────────────────────────────

// Create an audit log entry
export async function createAuditLog(params: {
  action: string
  entity: string
  entityId?: string
  userId: string
  companyId: string
  details?: any
}) {
  try {
    await prisma.auditLog.create({
      data: {
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        userId: params.userId,
        companyId: params.companyId,
        details: params.details ? JSON.stringify(params.details) : null,
      },
    })
  } catch (error) {
    console.error('Failed to create audit log:', error)
    // Don't throw - audit logging should not break operations
  }
}

// ─── NaN Guards ────────────────────────────────────────────────

/**
 * Safely convert a value to a number. Returns `fallback` (default 0) if the
 * result is NaN or not finite. Use this for ALL user-supplied numeric input.
 * PHASE 3: Also handles Prisma.Decimal objects from aggregate queries.
 */
export function safeNumber(value: unknown, fallback: number = 0): number {
  // PHASE 3: Handle Prisma.Decimal (from aggregate _sum results)
  if (value !== null && typeof value === 'object' && typeof (value as any).toFixed === 'function') {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Safely convert a value to a positive integer. Returns `fallback` if the
 * result is NaN, not finite, or negative.
 */
export function safeInt(value: unknown, fallback: number = 0): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback
}

/**
 * PHASE 3: Safely convert a value to a Decimal-compatible value for Prisma.
 * Returns a number (safe for Prisma Decimal fields) with 2 decimal precision.
 * Guarantees no NaN or Infinity values reach the database.
 * Note: Returns number type for TypeScript compatibility with Prisma generated types.
 */
export function safeDecimal(value: unknown, fallback: string = '0'): number {
  if (value === null || value === undefined) return Number(fallback)
  // Handle Prisma.Decimal objects
  if (typeof value === 'object' && typeof (value as any).toFixed === 'function') {
    const n = Number((value as any).toString())
    return Number.isFinite(n) ? Number(n.toFixed(2)) : Number(fallback)
  }
  const n = Number(value)
  if (!Number.isFinite(n)) return Number(fallback)
  // Limit to 2 decimal places for monetary values
  return Number(n.toFixed(2))
}

// ─── Input Sanitization ────────────────────────────────────────

/**
 * PHASE 3: Sanitize a string value to prevent XSS attacks.
 * Strips HTML tags, encodes dangerous characters, and trims whitespace.
 * Use for ALL user-supplied string input before storing in the database.
 */
export function sanitizeString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return null

  let sanitized = value.trim()

  // Return null for empty strings
  if (!sanitized) return null

  // Strip HTML tags (basic protection against stored XSS)
  sanitized = sanitized.replace(/<[^>]*>/g, '')

  // Encode dangerous characters that could be used in XSS
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')

  return sanitized
}

/**
 * PHASE 3: Sanitize a string value but allow basic formatting.
 * Only strips script tags and event handlers — allows safe HTML if needed.
 * Use for fields that might need line breaks or basic formatting (e.g., notes, descriptions).
 */
export function sanitizeRichString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return null

  let sanitized = value.trim()

  // Return null for empty strings
  if (!sanitized) return null

  // Remove script tags and their content
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')

  // Remove event handlers (onclick, onload, onerror, etc.)
  sanitized = sanitized.replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')

  // Remove javascript: URLs
  sanitized = sanitized.replace(/javascript\s*:/gi, '')

  return sanitized
}

/**
 * PHASE 3: Validate and sanitize an email address.
 * Returns the cleaned email or null if invalid.
 */
export function sanitizeEmail(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return null

  const email = value.trim().toLowerCase()
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!emailRegex.test(email)) return null

  return email
}

// ─── Pagination ────────────────────────────────────────────────

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 1000

export interface PaginationParams {
  page: number   // 1-based
  limit: number
  skip: number
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasMore: boolean
  }
}

/**
 * Parse pagination query params from a URL.
 * Supports `page` (1-based) and `limit` (capped at MAX_PAGE_SIZE).
 */
export function parsePaginationParams(searchParams: URLSearchParams): PaginationParams {
  const page = Math.max(1, safeInt(searchParams.get('page'), 1))
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, safeInt(searchParams.get('limit'), DEFAULT_PAGE_SIZE)))
  const skip = (page - 1) * limit
  return { page, limit, skip }
}

/**
 * Build a standard paginated response envelope.
 */
export function paginatedResponse<T>(data: T[], total: number, params: PaginationParams): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / params.limit)
  return {
    data,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages,
      hasMore: params.page < totalPages,
    },
  }
}

// ─── Serialization ─────────────────────────────────────────────

// Serialize a Prisma model for API responses (convert DateTime/Decimal to safe types)
// PHASE 3: Handles Prisma.Decimal by converting to string for JSON-safe precision
export function serialize<T extends Record<string, any>>(obj: T): T {
  if (!obj) return obj
  const result: any = Array.isArray(obj) ? [] : {}
  for (const key of Object.keys(obj)) {
    const value = (obj as any)[key]
    if (value instanceof Date) {
      (result as any)[key] = value.toISOString()
    } else if (value !== null && typeof value === 'object' && typeof value.toFixed === 'function' && 'd' in value) {
      // PHASE 3: Prisma.Decimal — convert to string for full precision, then to number for JSON
      ;(result as any)[key] = Number(value.toFixed(2))
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Handle nested objects (like relations).
      // Serialize any object that looks like a Prisma model record: it has an `id`
      // and at least one other field (covers full models AND `select`-restricted
      // projections that omit createdAt/updatedAt).
      const keys = Object.keys(value)
      if ('id' in value && keys.length >= 2) {
        ;(result as any)[key] = serialize(value)
      }
    } else if (Array.isArray(value)) {
      (result as any)[key] = value.map((item: any) =>
        typeof item === 'object' && item !== null ? serialize(item) : item
      )
    } else {
      (result as any)[key] = value
    }
  }
  return result
}

// Parse JSON string fields from DB (details, data, etc.)
export function parseJsonField(value: string | null | undefined): any {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

// ─── Response Helpers ──────────────────────────────────────────

// Standard error response helper
export function errorResponse(message: string, status: number = 400) {
  return Response.json({ error: message }, { status })
}

// Standard success response helper
export function successResponse(data: any, status: number = 200) {
  return Response.json(data, { status })
}

// Unauthorized response
export function unauthorizedResponse() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 })
}

// Forbidden response
export function forbiddenResponse(message: string = 'Access denied') {
  return Response.json({ error: message }, { status: 403 })
}

// Conflict response (for optimistic concurrency control failures)
export function conflictResponse(message: string = 'Record was modified by another user. Please refresh and try again.') {
  return Response.json({ error: message }, { status: 409 })
}

// ─── RBAC Helpers ───────────────────────────────────────────────

/**
 * Check if the user role is owner, admin, or accountant (financial user).
 * Used for write operations on Properties, Tenants, Expenses, etc.
 */
export function isOwnerOrAdmin(role: string): boolean {
  return role === 'owner' || role === 'admin' || role === 'accountant'
}

// ─── Optimistic Concurrency Control ────────────────────────────

/**
 * Parse the `updatedAt` value from the request body for OCC.
 * Expects the client to send the `updatedAt` timestamp of the record they read.
 * Returns a Date object or null if not provided.
 */
export function parseOCCVersion(body: Record<string, unknown>): Date | null {
  const updatedAt = body.updatedAt || body._updatedAt
  if (!updatedAt) return null
  const d = new Date(updatedAt as string)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Build the OCC WHERE clause for Prisma update operations.
 * If a version is provided, adds `updatedAt: version` to the where clause
 * so the update will fail if the record was modified since the client read it.
 */
export function occWhereClause(
  id: string,
  version: Date | null,
  extraConditions: Record<string, unknown> = {}
): Record<string, unknown> {
  const where: Record<string, unknown> = { id, ...extraConditions }
  if (version) {
    where.updatedAt = version
  }
  return where
}

/**
 * Check the result of an OCC update. If `count` is 0, the record was
 * modified by another user (or doesn't exist). Returns an appropriate response.
 */
export function checkOCCResult(
  result: { count: number } | null | undefined,
  entityName: string = 'Record'
): Response | null {
  if (!result || result.count === 0) {
    return conflictResponse(
      `${entityName} was modified by another user since you last read it. Please refresh and try again.`
    )
  }
  return null
}

/**
 * Perform an OCC-protected update using Prisma's updateMany which returns { count }.
 * Returns the updated record on success, or a 409 Conflict response on OCC failure.
 *
 * Usage:
 *   const result = await occUpdate(
 *     prisma.property, id, version, data, user.companyId
 *   )
 *   if (result instanceof Response) return result  // 409 conflict
 *   // result is the updated record
 */
export async function occUpdate<T>(
  model: { updateMany: (args: any) => Promise<{ count: number }>; findUnique: (args: any) => Promise<T | null> },
  id: string,
  version: Date | null,
  data: Record<string, unknown>,
  extraWhere: Record<string, unknown> = {}
): Promise<T | Response> {
  const where = occWhereClause(id, version, extraWhere)

  const result = await model.updateMany({
    where,
    data,
  })

  if (result.count === 0) {
    // Could be OCC failure or record not found — check if record exists
    const exists = await model.findUnique({ where: { id } })
    if (!exists) {
      return errorResponse('Record not found', 404)
    }
    return conflictResponse()
  }

  // Fetch and return the updated record
  return await model.findUnique({ where: { id } }) as T
}

// ─── Property Ownership Validation ─────────────────────────────

/**
 * Validate that a property belongs to the given company.
 * Returns the property if valid, or a Response if invalid/not found.
 */
export async function validatePropertyOwnership(
  propertyId: string | null | undefined,
  companyId: string
): Promise<{ id: string; companyId: string } | null | Response> {
  if (!propertyId) return null // No propertyId to validate

  const property = await prisma.property.findFirst({
    where: { id: propertyId, companyId, deletedAt: null },
    select: { id: true, companyId: true },
  })

  if (!property) {
    return errorResponse('Property not found or does not belong to your company', 404)
  }

  return property
}
