import prisma from '@/lib/db'
import crypto from 'crypto'
import {
  getAuthUser,
  createAuditLog,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/api-utils'

// GET /api/backup — Export ALL company data as JSON (comprehensive backup v2.0)
// Includes: Company, Properties, Tenants, Payments, Expenses, Maintenance,
// RecurringBills, BillPayments, Reservations, RentAdjustments, Receipts,
// Notifications, ScoreAuditLogs, Users (no passwords), AuditLogs, ResetRequests
export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    // Only owner/admin can create backups
    if (user.role !== 'owner' && user.role !== 'admin') {
      return forbiddenResponse('Only owners and admins can create backups')
    }

    const companyId = user.companyId

    // ─── Fetch ALL active data in parallel ───
    const [
      company,
      properties,
      tenants,
      expenses,
      maintenance,
      users,
      auditLogs,
      recurringBills,
      billPayments,
      reservations,
      rentAdjustments,
      receipts,
      notifications,
      scoreAuditLogs,
      resetRequests,
    ] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId } }),
      prisma.property.findMany({ where: { companyId, deletedAt: null } }),
      prisma.tenant.findMany({
        where: { companyId, deletedAt: null },
        include: { payments: true, adjustments: true, scoreAuditLogs: true },
      }),
      prisma.expense.findMany({ where: { companyId, deletedAt: null } }),
      prisma.maintenance.findMany({ where: { companyId, deletedAt: null } }),
      prisma.user.findMany({
        where: { companyId },
        select: {
          id: true, email: true, name: true, nameAr: true, nameBn: true, nameUr: true,
          role: true, isActive: true, mustChangePassword: true, twoFactorEnabled: true,
          createdAt: true, updatedAt: true,
          // Exclude password and 2FA secrets for security
        },
      }),
      prisma.auditLog.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      }),
      // ─── NEW: Recurring Bills with payments ───
      prisma.recurringBill.findMany({
        where: { companyId, deletedAt: null },
        include: { payments: { orderBy: { paymentDate: 'desc' } } },
      }),
      // ─── NEW: Standalone Bill Payments (for cross-reference) ───
      prisma.billPayment.findMany({
        where: { companyId },
        orderBy: { paymentDate: 'desc' },
      }),
      // ─── NEW: Reservations ───
      prisma.reservation.findMany({
        where: { companyId, deletedAt: null },
      }),
      // ─── NEW: Rent Adjustments ───
      prisma.rentAdjustment.findMany({
        where: { companyId },
      }),
      // ─── NEW: Receipts ───
      prisma.receipt.findMany({
        where: { companyId },
      }),
      // ─── NEW: Notifications ───
      prisma.notification.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      }),
      // ─── NEW: Score Audit Logs ───
      prisma.scoreAuditLog.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
      }),
      // ─── NEW: Reset Requests ───
      prisma.resetRequest.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    ])

    // ─── Fetch ALL soft-deleted data ───
    const [
      deletedProperties,
      deletedTenants,
      deletedExpenses,
      deletedMaintenance,
      deletedRecurringBills,
      deletedReservations,
    ] = await Promise.all([
      prisma.property.findMany({ where: { companyId, deletedAt: { not: null } } }),
      prisma.tenant.findMany({
        where: { companyId, deletedAt: { not: null } },
        include: { payments: true },
      }),
      prisma.expense.findMany({ where: { companyId, deletedAt: { not: null } } }),
      prisma.maintenance.findMany({ where: { companyId, deletedAt: { not: null } } }),
      prisma.recurringBill.findMany({
        where: { companyId, deletedAt: { not: null } },
        include: { payments: true },
      }),
      prisma.reservation.findMany({
        where: { companyId, deletedAt: { not: null } },
      }),
    ])

    const backup = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      exportedBy: user.email,
      company,
      data: {
        properties,
        tenants,
        expenses,
        maintenance,
        users,
        auditLogs,
        // v2.0 additions
        recurringBills,
        billPayments,
        reservations,
        rentAdjustments,
        receipts,
        notifications,
        scoreAuditLogs,
        resetRequests,
      },
      deleted: {
        properties: deletedProperties,
        tenants: deletedTenants,
        expenses: deletedExpenses,
        maintenance: deletedMaintenance,
        recurringBills: deletedRecurringBills,
        reservations: deletedReservations,
      },
    }

    const backupJson = JSON.stringify(backup, null, 2)
    const backupSize = Buffer.byteLength(backupJson, 'utf-8')
    const recordCount =
      properties.length + tenants.length + expenses.length + maintenance.length +
      users.length + recurringBills.length + billPayments.length +
      reservations.length + rentAdjustments.length + receipts.length

    // Compute SHA-256 data hash for integrity verification
    const dataHash = crypto.createHash('sha256').update(backupJson).digest('hex')

    // Create BackupRecord
    await prisma.backupRecord.create({
      data: {
        companyId,
        type: 'manual',
        size: backupSize,
        recordCount,
        status: 'completed',
        dataHash,
        triggeredBy: user.id,
      },
    })

    // Log the backup
    await createAuditLog({
      action: 'BACKUP',
      entity: 'Company',
      entityId: companyId,
      userId: user.id,
      companyId,
      details: {
        version: '2.0',
        properties: properties.length,
        tenants: tenants.length,
        expenses: expenses.length,
        maintenance: maintenance.length,
        users: users.length,
        recurringBills: recurringBills.length,
        billPayments: billPayments.length,
        reservations: reservations.length,
        rentAdjustments: rentAdjustments.length,
        receipts: receipts.length,
        notifications: notifications.length,
        dataHash,
      },
    })

    return new Response(backupJson, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="al-reef-backup-${new Date().toISOString().split('T')[0]}.json"`,
        'X-Backup-Hash': dataHash,
        'X-Backup-Version': '2.0',
      },
    })
  } catch (error) {
    console.error('Backup error:', error)
    return errorResponse('Failed to create backup', 500)
  }
}

// POST /api/backup — Restore data from a backup file (v1.0 and v2.0 compatible)
export async function POST(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    // Only admin can restore backups
    if (user.role !== 'admin') {
      return forbiddenResponse('Only admins can restore backups')
    }

    const body = await request.json()

    if (!body.version || !body.company || !body.data) {
      return errorResponse('Invalid backup file format')
    }

    const companyId = user.companyId

    // Verify the backup belongs to this company
    if (body.company.id !== companyId) {
      return errorResponse('Backup file belongs to a different company')
    }

    // Log the restore attempt
    await createAuditLog({
      action: 'RESTORE_START',
      entity: 'Company',
      entityId: companyId,
      userId: user.id,
      companyId,
      details: { backupDate: body.exportedAt, version: body.version },
    })

    const summary: Record<string, number> = {
      properties: 0, tenants: 0, payments: 0, expenses: 0, maintenance: 0,
      recurringBills: 0, billPayments: 0, reservations: 0, rentAdjustments: 0,
      receipts: 0, notifications: 0, scoreAuditLogs: 0, resetRequests: 0,
      deletedProperties: 0, deletedTenants: 0, deletedExpenses: 0,
      deletedMaintenance: 0, deletedRecurringBills: 0, deletedReservations: 0,
    }

    // ─── Upsert Properties ───
    if (body.data.properties) {
      for (const prop of body.data.properties) {
        await prisma.property.upsert({
          where: { id: prop.id },
          update: {
            name: prop.name, nameAr: prop.nameAr, nameBn: prop.nameBn, nameUr: prop.nameUr,
            type: prop.type, address: prop.address, totalUnits: prop.totalUnits, floors: prop.floors,
            archived: prop.archived,
          },
          create: {
            id: prop.id, companyId,
            name: prop.name, nameAr: prop.nameAr, nameBn: prop.nameBn, nameUr: prop.nameUr,
            type: prop.type, address: prop.address, totalUnits: prop.totalUnits, floors: prop.floors,
            archived: prop.archived,
          },
        })
        summary.properties++
      }
    }

    // ─── Upsert Tenants (with Phase 1 fields) ───
    if (body.data.tenants) {
      for (const tenant of body.data.tenants) {
        await prisma.tenant.upsert({
          where: { id: tenant.id },
          update: {
            name: tenant.name, phone: tenant.phone, rentAmount: tenant.rentAmount,
            status: tenant.status, unitNumber: tenant.unitNumber,
            openingBalance: tenant.openingBalance ?? 0,
            creditBalance: tenant.creditBalance ?? 0,
            legalCase: tenant.legalCase ?? false,
            legalCaseNumber: tenant.legalCaseNumber ?? null,
            legalCaseNotes: tenant.legalCaseNotes ?? null,
          },
          create: {
            id: tenant.id, companyId, propertyId: tenant.propertyId,
            name: tenant.name, nameAr: tenant.nameAr, nameBn: tenant.nameBn, nameUr: tenant.nameUr,
            phone: tenant.phone, whatsapp: tenant.whatsapp, email: tenant.email,
            emiratesId: tenant.emiratesId, nationality: tenant.nationality,
            employer: tenant.employer, emergencyContact: tenant.emergencyContact,
            unitNumber: tenant.unitNumber, unitType: tenant.unitType,
            floor: tenant.floor, sizeSqft: tenant.sizeSqft,
            rentAmount: tenant.rentAmount, municipalityFee: tenant.municipalityFee,
            securityDeposit: tenant.securityDeposit, paymentMethod: tenant.paymentMethod,
            leaseStart: tenant.leaseStart ? new Date(tenant.leaseStart) : null,
            leaseEnd: tenant.leaseEnd ? new Date(tenant.leaseEnd) : null,
            contractDuration: tenant.contractDuration, renewalStatus: tenant.renewalStatus,
            newRent: tenant.newRent, status: tenant.status || 'active',
            latePaymentCount: tenant.latePaymentCount || 0,
            tenantScore: tenant.tenantScore ?? 100,
            systemScore: tenant.systemScore ?? 100,
            notes: tenant.notes,
            openingBalance: tenant.openingBalance ?? 0,
            creditBalance: tenant.creditBalance ?? 0,
            legalCase: tenant.legalCase ?? false,
            legalCaseNumber: tenant.legalCaseNumber ?? null,
            legalCaseNotes: tenant.legalCaseNotes ?? null,
          },
        })
        summary.tenants++

        // Upsert payments
        if (tenant.payments) {
          for (const payment of tenant.payments) {
            await prisma.payment.upsert({
              where: { id: payment.id },
              update: { amount: payment.amount, date: new Date(payment.date), month: payment.month, year: payment.year },
              create: {
                id: payment.id, tenantId: tenant.id, companyId,
                amount: payment.amount, date: new Date(payment.date),
                month: payment.month, year: payment.year,
                method: payment.method, reference: payment.reference,
                receiptNumber: payment.receiptNumber, notes: payment.notes,
                isLate: payment.isLate || false, daysLate: payment.daysLate || 0,
                allocationType: payment.allocationType || 'CURRENT_RENT',
              },
            })
            summary.payments++
          }
        }

        // Upsert score audit logs (v2.0)
        if (tenant.scoreAuditLogs) {
          for (const log of tenant.scoreAuditLogs) {
            await prisma.scoreAuditLog.upsert({
              where: { id: log.id },
              update: { previousScore: log.previousScore, newScore: log.newScore, changeType: log.changeType },
              create: {
                id: log.id, tenantId: tenant.id, companyId,
                previousScore: log.previousScore, newScore: log.newScore,
                changeType: log.changeType, changedBy: log.changedBy,
                changedById: log.changedById, reason: log.reason,
              },
            })
            summary.scoreAuditLogs++
          }
        }
      }
    }

    // ─── Upsert Expenses ───
    if (body.data.expenses) {
      for (const expense of body.data.expenses) {
        await prisma.expense.upsert({
          where: { id: expense.id },
          update: { category: expense.category, description: expense.description, amount: expense.amount },
          create: {
            id: expense.id, companyId,
            category: expense.category, description: expense.description,
            amount: expense.amount, date: new Date(expense.date),
            vendor: expense.vendor, invoiceNumber: expense.invoiceNumber,
            recurring: expense.recurring || false, building: expense.building,
          },
        })
        summary.expenses++
      }
    }

    // ─── Upsert Maintenance ───
    if (body.data.maintenance) {
      for (const maint of body.data.maintenance) {
        await prisma.maintenance.upsert({
          where: { id: maint.id },
          update: { title: maint.title, status: maint.status },
          create: {
            id: maint.id, companyId, propertyId: maint.propertyId,
            title: maint.title, description: maint.description,
            category: maint.category, vendor: maint.vendor,
            priority: maint.priority || 'medium', status: maint.status || 'pending',
            estimatedCost: maint.estimatedCost, actualCost: maint.actualCost,
            completedAt: maint.completedAt ? new Date(maint.completedAt) : null,
          },
        })
        summary.maintenance++
      }
    }

    // ─── v2.0: Upsert Recurring Bills ───
    if (body.data.recurringBills) {
      for (const bill of body.data.recurringBills) {
        await prisma.recurringBill.upsert({
          where: { id: bill.id },
          update: {
            providerName: bill.providerName, serviceType: bill.serviceType,
            currentOutstanding: bill.currentOutstanding,
            previousOutstanding: bill.previousOutstanding,
            totalAmountDue: bill.totalAmountDue,
            nextDueDate: new Date(bill.nextDueDate),
            status: bill.status,
          },
          create: {
            id: bill.id, companyId, propertyId: bill.propertyId,
            providerName: bill.providerName, serviceType: bill.serviceType,
            accountNumber: bill.accountNumber, contractNumber: bill.contractNumber,
            currentOutstanding: bill.currentOutstanding,
            previousOutstanding: bill.previousOutstanding ?? 0,
            totalAmountDue: bill.totalAmountDue,
            lastPaymentAmount: bill.lastPaymentAmount,
            lastPaymentDate: bill.lastPaymentDate ? new Date(bill.lastPaymentDate) : null,
            nextDueDate: new Date(bill.nextDueDate),
            billingFrequency: bill.billingFrequency,
            autoRenew: bill.autoRenew ?? true,
            gracePeriodDays: bill.gracePeriodDays ?? 0,
            status: bill.status || 'active',
            notes: bill.notes,
            attachmentUrls: bill.attachmentUrls,
            buildingName: bill.buildingName,
            ownerName: bill.ownerName,
            propertyManager: bill.propertyManager,
          },
        })
        summary.recurringBills++

        // Upsert bill payments
        if (bill.payments) {
          for (const bp of bill.payments) {
            await prisma.billPayment.upsert({
              where: { id: bp.id },
              update: { amount: bp.amount, paymentDate: new Date(bp.paymentDate) },
              create: {
                id: bp.id, companyId, recurringBillId: bill.id,
                amount: bp.amount, paymentDate: new Date(bp.paymentDate),
                paymentMethod: bp.paymentMethod, reference: bp.reference,
                notes: bp.notes, outstandingBefore: bp.outstandingBefore,
                outstandingAfter: bp.outstandingAfter, createdBy: bp.createdBy,
              },
            })
            summary.billPayments++
          }
        }
      }
    }

    // ─── v2.0: Upsert Standalone Bill Payments (for bills that may be soft-deleted) ───
    if (body.data.billPayments && !body.data.recurringBills) {
      for (const bp of body.data.billPayments) {
        await prisma.billPayment.upsert({
          where: { id: bp.id },
          update: { amount: bp.amount, paymentDate: new Date(bp.paymentDate) },
          create: {
            id: bp.id, companyId, recurringBillId: bp.recurringBillId,
            amount: bp.amount, paymentDate: new Date(bp.paymentDate),
            paymentMethod: bp.paymentMethod, reference: bp.reference,
            notes: bp.notes, outstandingBefore: bp.outstandingBefore,
            outstandingAfter: bp.outstandingAfter, createdBy: bp.createdBy,
          },
        })
        summary.billPayments++
      }
    }

    // ─── v2.0: Upsert Reservations ───
    if (body.data.reservations) {
      for (const res of body.data.reservations) {
        await prisma.reservation.upsert({
          where: { id: res.id },
          update: { status: res.status, depositStatus: res.depositStatus },
          create: {
            id: res.id, companyId, propertyId: res.propertyId,
            unitNumber: res.unitNumber, prospectName: res.prospectName,
            prospectNameAr: res.prospectNameAr, prospectNameBn: res.prospectNameBn,
            prospectNameUr: res.prospectNameUr, prospectPhone: res.prospectPhone,
            prospectWhatsapp: res.prospectWhatsapp, prospectEmail: res.prospectEmail,
            reservationDate: new Date(res.reservationDate),
            expectedMoveInDate: res.expectedMoveInDate ? new Date(res.expectedMoveInDate) : null,
            expiryDate: res.expiryDate ? new Date(res.expiryDate) : null,
            depositAmount: res.depositAmount, depositStatus: res.depositStatus || 'unpaid',
            depositPaymentMethod: res.depositPaymentMethod,
            depositReference: res.depositReference,
            status: res.status || 'pending',
            convertedTenantId: res.convertedTenantId,
            depositAppliedTo: res.depositAppliedTo,
            depositAppliedAmount: res.depositAppliedAmount,
            notes: res.notes,
          },
        })
        summary.reservations++
      }
    }

    // ─── v2.0: Upsert Rent Adjustments ───
    if (body.data.rentAdjustments) {
      for (const adj of body.data.rentAdjustments) {
        await prisma.rentAdjustment.upsert({
          where: { id: adj.id },
          update: { amount: adj.amount, status: adj.status },
          create: {
            id: adj.id, companyId, tenantId: adj.tenantId, propertyId: adj.propertyId,
            amount: adj.amount, adjustmentType: adj.adjustmentType,
            reason: adj.reason, notes: adj.notes,
            effectiveMonth: adj.effectiveMonth, effectiveYear: adj.effectiveYear,
            durationMonths: adj.durationMonths || 1,
            status: adj.status || 'approved', createdBy: adj.createdBy,
          },
        })
        summary.rentAdjustments++
      }
    }

    // ─── v2.0: Upsert Receipts ───
    if (body.data.receipts) {
      for (const rec of body.data.receipts) {
        await prisma.receipt.upsert({
          where: { id: rec.id },
          update: { amount: rec.amount },
          create: {
            id: rec.id, companyId, tenantId: rec.tenantId,
            paymentId: rec.paymentId, receiptNumber: rec.receiptNumber,
            amount: rec.amount, date: new Date(rec.date),
            month: rec.month, year: rec.year,
            description: rec.description, createdBy: rec.createdBy,
          },
        })
        summary.receipts++
      }
    }

    // ─── v2.0: Upsert Notifications ───
    if (body.data.notifications) {
      for (const notif of body.data.notifications) {
        await prisma.notification.upsert({
          where: { id: notif.id },
          update: { read: notif.read },
          create: {
            id: notif.id, companyId,
            userId: notif.userId, type: notif.type,
            title: notif.title, message: notif.message,
            data: notif.data, read: notif.read || false,
          },
        })
        summary.notifications++
      }
    }

    // ─── v2.0: Upsert Reset Requests ───
    if (body.data.resetRequests) {
      for (const req of body.data.resetRequests) {
        await prisma.resetRequest.upsert({
          where: { id: req.id },
          update: { status: req.status },
          create: {
            id: req.id, email: req.email, name: req.name,
            message: req.message, status: req.status || 'pending',
            companyId: req.companyId,
          },
        })
        summary.resetRequests++
      }
    }

    // ─── Restore soft-deleted records ───
    if (body.deleted?.properties) {
      for (const prop of body.deleted.properties) {
        await prisma.property.upsert({
          where: { id: prop.id },
          update: { name: prop.name, deletedAt: prop.deletedAt ? new Date(prop.deletedAt) : null },
          create: {
            id: prop.id, companyId, name: prop.name, nameAr: prop.nameAr,
            type: prop.type, address: prop.address, totalUnits: prop.totalUnits,
            floors: prop.floors, archived: prop.archived,
            deletedAt: prop.deletedAt ? new Date(prop.deletedAt) : null,
          },
        })
        summary.deletedProperties++
      }
    }

    if (body.deleted?.tenants) {
      for (const tenant of body.deleted.tenants) {
        await prisma.tenant.upsert({
          where: { id: tenant.id },
          update: { name: tenant.name, phone: tenant.phone, deletedAt: tenant.deletedAt ? new Date(tenant.deletedAt) : null },
          create: {
            id: tenant.id, companyId, propertyId: tenant.propertyId,
            name: tenant.name, phone: tenant.phone,
            rentAmount: tenant.rentAmount, status: tenant.status || 'inactive',
            deletedAt: tenant.deletedAt ? new Date(tenant.deletedAt) : null,
          },
        })
        summary.deletedTenants++
      }
    }

    if (body.deleted?.expenses) {
      for (const expense of body.deleted.expenses) {
        await prisma.expense.upsert({
          where: { id: expense.id },
          update: { category: expense.category, amount: expense.amount, deletedAt: expense.deletedAt ? new Date(expense.deletedAt) : null },
          create: {
            id: expense.id, companyId, category: expense.category,
            description: expense.description, amount: expense.amount,
            date: new Date(expense.date), vendor: expense.vendor,
            deletedAt: expense.deletedAt ? new Date(expense.deletedAt) : null,
          },
        })
        summary.deletedExpenses++
      }
    }

    if (body.deleted?.maintenance) {
      for (const maint of body.deleted.maintenance) {
        await prisma.maintenance.upsert({
          where: { id: maint.id },
          update: { title: maint.title, deletedAt: maint.deletedAt ? new Date(maint.deletedAt) : null },
          create: {
            id: maint.id, companyId, propertyId: maint.propertyId,
            title: maint.title, description: maint.description,
            status: maint.status || 'completed',
            deletedAt: maint.deletedAt ? new Date(maint.deletedAt) : null,
          },
        })
        summary.deletedMaintenance++
      }
    }

    // ─── v2.0: Restore soft-deleted Recurring Bills ───
    if (body.deleted?.recurringBills) {
      for (const bill of body.deleted.recurringBills) {
        await prisma.recurringBill.upsert({
          where: { id: bill.id },
          update: { providerName: bill.providerName, deletedAt: bill.deletedAt ? new Date(bill.deletedAt) : null },
          create: {
            id: bill.id, companyId, propertyId: bill.propertyId,
            providerName: bill.providerName, serviceType: bill.serviceType,
            currentOutstanding: bill.currentOutstanding,
            totalAmountDue: bill.totalAmountDue,
            nextDueDate: new Date(bill.nextDueDate),
            status: bill.status || 'cancelled',
            deletedAt: bill.deletedAt ? new Date(bill.deletedAt) : null,
          },
        })
        summary.deletedRecurringBills++
      }
    }

    // ─── v2.0: Restore soft-deleted Reservations ───
    if (body.deleted?.reservations) {
      for (const res of body.deleted.reservations) {
        await prisma.reservation.upsert({
          where: { id: res.id },
          update: { status: res.status, deletedAt: res.deletedAt ? new Date(res.deletedAt) : null },
          create: {
            id: res.id, companyId, propertyId: res.propertyId,
            prospectName: res.prospectName, prospectPhone: res.prospectPhone,
            depositAmount: res.depositAmount, status: res.status || 'cancelled',
            reservationDate: new Date(res.reservationDate),
            deletedAt: res.deletedAt ? new Date(res.deletedAt) : null,
          },
        })
        summary.deletedReservations++
      }
    }

    // Log the restore completion
    await createAuditLog({
      action: 'RESTORE_COMPLETE',
      entity: 'Company',
      entityId: companyId,
      userId: user.id,
      companyId,
      details: summary,
    })

    return successResponse({
      message: 'Backup restored successfully',
      summary,
    })
  } catch (error) {
    console.error('Restore error:', error)
    return errorResponse('Failed to restore backup', 500)
  }
}
