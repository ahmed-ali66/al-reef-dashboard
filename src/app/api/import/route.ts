import prisma from '@/lib/db'
import {
  getAuthUser,
  createAuditLog,
  serialize,
  errorResponse,
  successResponse,
  unauthorizedResponse,
  forbiddenResponse,
  safeNumber,
  safeDecimal,
  safeInt,
  validatePropertyOwnership,
} from '@/lib/api-utils'

// Valid property types for validation
const VALID_PROPERTY_TYPES = ['apartment', 'villa', 'office', 'shop', 'studio', 'mixed_use']
const VALID_UNIT_TYPES = ['studio', '1bedroom', '2bedroom', '3bedroom', 'shop', 'office']
const VALID_PAYMENT_METHODS = ['cash', 'bank_transfer', 'cheque']
const VALID_EXPENSE_CATEGORIES = [
  'manpower', 'municipality', 'utilities', 'maintenance',
  'leasing', 'insurance', 'security', 'other',
]
const VALID_MAINTENANCE_CATEGORIES = [
  'ac', 'plumbing', 'electrical', 'painting', 'lock_door', 'cleaning', 'other',
]
const VALID_MAINTENANCE_PRIORITIES = ['urgent', 'high', 'medium', 'low']
const VALID_MAINTENANCE_STATUSES = ['pending', 'in-progress', 'completed']

// Batch size for transactional imports
const IMPORT_BATCH_SIZE = 100

interface PropertyInput {
  name: string
  nameAr?: string
  nameBn?: string
  nameUr?: string
  type: string
  address?: string
  totalUnits?: number
  floors?: number
  id?: string // temporary id for mapping
}

interface TenantInput {
  name: string
  nameAr?: string
  nameBn?: string
  nameUr?: string
  phone: string
  whatsapp?: string
  email?: string
  emiratesId?: string
  nationality?: string
  employer?: string
  emergencyContact?: string
  unitNumber?: string
  unitType?: string
  floor?: number
  sizeSqft?: number
  rentAmount: number
  municipalityFee?: number
  securityDeposit?: number
  paymentMethod?: string
  leaseStart?: string
  leaseEnd?: string
  contractDuration?: number
  status?: string
  latePaymentCount?: number
  tenantScore?: number
  notes?: string
  propertyId?: string
}

interface ExpenseInput {
  category: string
  description: string
  amount: number
  date: string
  vendor?: string
  invoiceNumber?: string
  recurring?: boolean
  building?: string
}

interface MaintenanceInput {
  title: string
  description: string
  category?: string
  vendor?: string
  priority?: string
  status?: string
  estimatedCost?: number
  actualCost?: number
  propertyId?: string
}

function validateProperty(data: PropertyInput): string | null {
  if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
    return 'Property name is required'
  }
  if (!data.type || !VALID_PROPERTY_TYPES.includes(data.type)) {
    return `Invalid property type. Must be one of: ${VALID_PROPERTY_TYPES.join(', ')}`
  }
  if (data.totalUnits !== undefined && (isNaN(Number(data.totalUnits)) || Number(data.totalUnits) < 1)) {
    return 'totalUnits must be a positive number'
  }
  if (data.floors !== undefined && (isNaN(Number(data.floors)) || Number(data.floors) < 1)) {
    return 'floors must be a positive number'
  }
  return null
}

function validateTenant(data: TenantInput): string | null {
  if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
    return 'Tenant name is required'
  }
  if (!data.phone || typeof data.phone !== 'string') {
    return 'Tenant phone is required'
  }
  if (data.rentAmount === undefined || isNaN(Number(data.rentAmount)) || Number(data.rentAmount) <= 0) {
    return 'rentAmount must be a positive number'
  }
  if (data.unitType && !VALID_UNIT_TYPES.includes(data.unitType)) {
    return `Invalid unitType. Must be one of: ${VALID_UNIT_TYPES.join(', ')}`
  }
  if (data.paymentMethod && !VALID_PAYMENT_METHODS.includes(data.paymentMethod)) {
    return `Invalid paymentMethod. Must be one of: ${VALID_PAYMENT_METHODS.join(', ')}`
  }
  return null
}

function validateExpense(data: ExpenseInput): string | null {
  if (!data.category) return 'Expense category is required'
  if (!data.description) return 'Expense description is required'
  if (data.amount === undefined || isNaN(Number(data.amount)) || Number(data.amount) <= 0) {
    return 'Expense amount must be a positive number'
  }
  if (!data.date) return 'Expense date is required'
  if (isNaN(new Date(data.date).getTime())) return 'Invalid expense date format'
  return null
}

function validateMaintenance(data: MaintenanceInput): string | null {
  if (!data.title) return 'Maintenance title is required'
  if (!data.description) return 'Maintenance description is required'
  if (data.priority && !VALID_MAINTENANCE_PRIORITIES.includes(data.priority)) {
    return `Invalid priority. Must be one of: ${VALID_MAINTENANCE_PRIORITIES.join(', ')}`
  }
  if (data.status && !VALID_MAINTENANCE_STATUSES.includes(data.status)) {
    return `Invalid status. Must be one of: ${VALID_MAINTENANCE_STATUSES.join(', ')}`
  }
  return null
}

// POST /api/import — Bulk data import (replace or append mode)
// PHASE 2: All multi-step operations wrapped in prisma.$transaction()
export async function POST(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    // Only owner/admin can import data
    if (user.role !== 'owner' && user.role !== 'admin') {
      return forbiddenResponse('Only owners and admins can import data')
    }

    const body = await request.json()
    const { mode, data } = body

    // Validate mode
    if (!mode || !['replace', 'append'].includes(mode)) {
      return errorResponse('mode must be "replace" or "append"')
    }

    if (!data || typeof data !== 'object') {
      return errorResponse('data object is required')
    }

    const companyId = user.companyId
    const summary = {
      properties: { imported: 0, errors: 0, errorDetails: [] as string[] },
      tenants: { imported: 0, errors: 0, errorDetails: [] as string[] },
      expenses: { imported: 0, errors: 0, errorDetails: [] as string[] },
      maintenance: { imported: 0, errors: 0, errorDetails: [] as string[] },
    }

    // In replace mode: soft-delete all existing data for the company IN A TRANSACTION
    if (mode === 'replace') {
      const now = new Date()

      await prisma.$transaction(async (tx) => {
        // PHASE 3: Also soft-delete receipts (cascade before tenants)
        const companyTenants = await tx.tenant.findMany({
          where: { companyId, deletedAt: null },
          select: { id: true },
        })
        const tenantIds = companyTenants.map(t => t.id)

        if (tenantIds.length > 0) {
          // Delete receipts before payments (FK constraint order)
          await tx.receipt.deleteMany({
            where: { tenantId: { in: tenantIds } },
          })

          await tx.payment.deleteMany({
            where: { tenantId: { in: tenantIds } },
          })
        }

        await tx.maintenance.updateMany({
          where: { companyId, deletedAt: null },
          data: { deletedAt: now },
        })
        await tx.expense.updateMany({
          where: { companyId, deletedAt: null },
          data: { deletedAt: now },
        })
        await tx.tenant.updateMany({
          where: { companyId, deletedAt: null },
          data: { deletedAt: now },
        })
        await tx.property.updateMany({
          where: { companyId, deletedAt: null },
          data: { deletedAt: now },
        })
      })
    }

    // ─── Import Properties (batched transactions) ───
    const propertiesToImport: PropertyInput[] = Array.isArray(data.properties) ? data.properties : []
    const propertyIdMap = new Map<string, string>()

    // Validate all properties first
    const validProperties: { index: number; data: PropertyInput }[] = []
    for (let i = 0; i < propertiesToImport.length; i++) {
      const propData = propertiesToImport[i]
      const validationError = validateProperty(propData)
      if (validationError) {
        summary.properties.errors++
        summary.properties.errorDetails.push(`Row ${i + 1}: ${validationError}`)
        continue
      }
      validProperties.push({ index: i, data: propData })
    }

    // Import properties in batched transactions
    for (let batch = 0; batch < validProperties.length; batch += IMPORT_BATCH_SIZE) {
      const batchItems = validProperties.slice(batch, batch + IMPORT_BATCH_SIZE)

      try {
        await prisma.$transaction(async (tx) => {
          for (const { data: propData } of batchItems) {
            const property = await tx.property.create({
              data: {
                companyId,
                name: propData.name.trim(),
                nameAr: propData.nameAr?.trim() || null,
                nameBn: propData.nameBn?.trim() || null,
                nameUr: propData.nameUr?.trim() || null,
                type: propData.type,
                address: propData.address?.trim() || null,
                totalUnits: propData.totalUnits ? safeInt(propData.totalUnits, 1) : 1,
                floors: propData.floors ? safeInt(propData.floors, 1) : 1,
              },
            })

            if (propData.id) {
              propertyIdMap.set(propData.id, property.id)
            }
            summary.properties.imported++
          }
        })
      } catch (err: any) {
        // Batch failed — mark all items in batch as errors
        for (const { index } of batchItems) {
          summary.properties.errors++
          summary.properties.errorDetails.push(`Row ${index + 1}: ${err.message || 'Batch transaction failed'}`)
        }
        summary.properties.imported -= batchItems.length // Undo counted imports
      }
    }

    // Fetch company property IDs for tenant validation
    const companyProperties = await prisma.property.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true },
    })
    const companyPropertyIds = new Set(companyProperties.map(p => p.id))

    // ─── Import Tenants (batched transactions) ───
    const tenantsToImport: TenantInput[] = Array.isArray(data.tenants) ? data.tenants : []

    // Validate all tenants first
    const validTenants: { index: number; data: TenantInput; resolvedPropertyId: string }[] = []
    for (let i = 0; i < tenantsToImport.length; i++) {
      const tenantData = tenantsToImport[i]
      const validationError = validateTenant(tenantData)
      if (validationError) {
        summary.tenants.errors++
        summary.tenants.errorDetails.push(`Row ${i + 1}: ${validationError}`)
        continue
      }

      // Resolve propertyId: map from import data or validate existing
      let propertyId = tenantData.propertyId
      if (propertyIdMap.has(propertyId || '')) {
        propertyId = propertyIdMap.get(propertyId!)!
      }

      if (!propertyId || !companyPropertyIds.has(propertyId)) {
        summary.tenants.errors++
        summary.tenants.errorDetails.push(`Row ${i + 1}: propertyId "${tenantData.propertyId}" not found in company properties`)
        continue
      }

      validTenants.push({ index: i, data: tenantData, resolvedPropertyId: propertyId })
    }

    // Import tenants in batched transactions
    for (let batch = 0; batch < validTenants.length; batch += IMPORT_BATCH_SIZE) {
      const batchItems = validTenants.slice(batch, batch + IMPORT_BATCH_SIZE)

      try {
        await prisma.$transaction(async (tx) => {
          for (const { data: tenantData, resolvedPropertyId } of batchItems) {
            await tx.tenant.create({
              data: {
                companyId,
                propertyId: resolvedPropertyId,
                name: tenantData.name.trim(),
                nameAr: tenantData.nameAr?.trim() || null,
                nameBn: tenantData.nameBn?.trim() || null,
                nameUr: tenantData.nameUr?.trim() || null,
                phone: tenantData.phone.trim(),
                whatsapp: tenantData.whatsapp?.trim() || null,
                email: tenantData.email?.trim() || null,
                emiratesId: tenantData.emiratesId?.trim() || null,
                nationality: tenantData.nationality?.trim() || null,
                employer: tenantData.employer?.trim() || null,
                emergencyContact: tenantData.emergencyContact?.trim() || null,
                unitNumber: tenantData.unitNumber?.trim() || null,
                unitType: tenantData.unitType || null,
                floor: tenantData.floor ? safeInt(tenantData.floor) : null,
                sizeSqft: tenantData.sizeSqft ? safeDecimal(tenantData.sizeSqft) : null,
                rentAmount: safeDecimal(tenantData.rentAmount, '0'),
                municipalityFee: tenantData.municipalityFee ? safeDecimal(tenantData.municipalityFee) : null,
                securityDeposit: tenantData.securityDeposit ? safeDecimal(tenantData.securityDeposit) : null,
                paymentMethod: tenantData.paymentMethod || null,
                leaseStart: tenantData.leaseStart ? new Date(tenantData.leaseStart) : null,
                leaseEnd: tenantData.leaseEnd ? new Date(tenantData.leaseEnd) : null,
                contractDuration: tenantData.contractDuration ? safeInt(tenantData.contractDuration) : null,
                status: tenantData.status || 'active',
                latePaymentCount: tenantData.latePaymentCount ? safeInt(tenantData.latePaymentCount, 0) : 0,
                tenantScore: tenantData.tenantScore ? safeInt(tenantData.tenantScore, 100) : 100,
                systemScore: tenantData.tenantScore ? safeInt(tenantData.tenantScore, 100) : 100,
                notes: tenantData.notes?.trim() || null,
              },
            })
            summary.tenants.imported++
          }
        })
      } catch (err: any) {
        for (const { index } of batchItems) {
          summary.tenants.errors++
          summary.tenants.errorDetails.push(`Row ${index + 1}: ${err.message || 'Batch transaction failed'}`)
        }
        summary.tenants.imported -= batchItems.length
      }
    }

    // ─── Import Expenses (batched transactions) ───
    const expensesToImport: ExpenseInput[] = Array.isArray(data.expenses) ? data.expenses : []

    const validExpenses: { index: number; data: ExpenseInput }[] = []
    for (let i = 0; i < expensesToImport.length; i++) {
      const expenseData = expensesToImport[i]
      const validationError = validateExpense(expenseData)
      if (validationError) {
        summary.expenses.errors++
        summary.expenses.errorDetails.push(`Row ${i + 1}: ${validationError}`)
        continue
      }
      validExpenses.push({ index: i, data: expenseData })
    }

    for (let batch = 0; batch < validExpenses.length; batch += IMPORT_BATCH_SIZE) {
      const batchItems = validExpenses.slice(batch, batch + IMPORT_BATCH_SIZE)

      try {
        await prisma.$transaction(async (tx) => {
          for (const { data: expenseData } of batchItems) {
            await tx.expense.create({
              data: {
                companyId,
                category: expenseData.category,
                description: expenseData.description.trim(),
                amount: safeDecimal(expenseData.amount, '0'),
                date: new Date(expenseData.date),
                vendor: expenseData.vendor?.trim() || null,
                invoiceNumber: expenseData.invoiceNumber?.trim() || null,
                recurring: expenseData.recurring === true,
                building: expenseData.building?.trim() || null,
              },
            })
            summary.expenses.imported++
          }
        })
      } catch (err: any) {
        for (const { index } of batchItems) {
          summary.expenses.errors++
          summary.expenses.errorDetails.push(`Row ${index + 1}: ${err.message || 'Batch transaction failed'}`)
        }
        summary.expenses.imported -= batchItems.length
      }
    }

    // ─── Import Maintenance (batched transactions + propertyId ownership validation) ───
    const maintenanceToImport: MaintenanceInput[] = Array.isArray(data.maintenance) ? data.maintenance : []

    const validMaintenance: { index: number; data: MaintenanceInput; resolvedPropertyId: string | null }[] = []
    for (let i = 0; i < maintenanceToImport.length; i++) {
      const maintData = maintenanceToImport[i]
      const validationError = validateMaintenance(maintData)
      if (validationError) {
        summary.maintenance.errors++
        summary.maintenance.errorDetails.push(`Row ${i + 1}: ${validationError}`)
        continue
      }

      // PHASE 2: Validate propertyId ownership
      let maintPropertyId = maintData.propertyId || null
      if (maintPropertyId && propertyIdMap.has(maintPropertyId)) {
        maintPropertyId = propertyIdMap.get(maintPropertyId)!
      }
      // Only allow propertyIds that belong to this company
      if (maintPropertyId && !companyPropertyIds.has(maintPropertyId)) {
        maintPropertyId = null // Drop invalid reference
      }

      validMaintenance.push({ index: i, data: maintData, resolvedPropertyId: maintPropertyId })
    }

    for (let batch = 0; batch < validMaintenance.length; batch += IMPORT_BATCH_SIZE) {
      const batchItems = validMaintenance.slice(batch, batch + IMPORT_BATCH_SIZE)

      try {
        await prisma.$transaction(async (tx) => {
          for (const { data: maintData, resolvedPropertyId } of batchItems) {
            await tx.maintenance.create({
              data: {
                companyId,
                propertyId: resolvedPropertyId,
                title: maintData.title.trim(),
                description: maintData.description.trim(),
                category: maintData.category || null,
                vendor: maintData.vendor?.trim() || null,
                priority: maintData.priority || 'medium',
                status: maintData.status || 'pending',
                estimatedCost: maintData.estimatedCost ? safeDecimal(maintData.estimatedCost) : null,
                actualCost: maintData.actualCost ? safeDecimal(maintData.actualCost) : null,
                completedAt: maintData.status === 'completed' ? new Date() : null,
              },
            })
            summary.maintenance.imported++
          }
        })
      } catch (err: any) {
        for (const { index } of batchItems) {
          summary.maintenance.errors++
          summary.maintenance.errorDetails.push(`Row ${index + 1}: ${err.message || 'Batch transaction failed'}`)
        }
        summary.maintenance.imported -= batchItems.length
      }
    }

    // Create audit log
    await createAuditLog({
      action: 'IMPORT',
      entity: 'Company',
      entityId: companyId,
      userId: user.id,
      companyId,
      details: {
        mode,
        summary: {
          properties: summary.properties.imported,
          tenants: summary.tenants.imported,
          expenses: summary.expenses.imported,
          maintenance: summary.maintenance.imported,
          totalErrors:
            summary.properties.errors +
            summary.tenants.errors +
            summary.expenses.errors +
            summary.maintenance.errors,
        },
      },
    })

    return successResponse({
      message: `Import completed in ${mode} mode`,
      summary,
    })
  } catch (error) {
    console.error('POST /api/import error:', error)
    return errorResponse('Failed to import data', 500)
  }
}
