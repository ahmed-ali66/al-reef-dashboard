export type PageType = 'dashboard' | 'properties' | 'tenants' | 'rent' | 'maintenance' | 'expenses' | 'recurring-bills' | 'daily-report' | 'reports' | 'contracts' | 'reservations' | 'settings' | 'system' | 'audit-logs'

export interface DashboardData {
  company: {
    id: string
    name: string
    nameAr: string | null
    nameBn: string | null
    nameUr: string | null
    phone: string | null
    email: string | null
    address: string | null
  } | null
  stats: {
    expectedRevenue: number
    collectedRevenue: number
    overdueCount: number
    overdueAmount: number
    activeTenants: number
    totalTenants: number
    occupancyRate: number
    totalUnits: number
    occupiedUnits: number
    partialCount: number
    netProfit: number
    totalExpenses: number
    totalAdjustments: number
    netCashCollected: number
  }
  overdueTenants: TenantData[]
  partialTenants: TenantData[]
  dueSoon: TenantData[]
  activeTenantsList: TenantData[]
  recentPayments: PaymentData[]
  chartData: { month: string; expected: number; collected: number }[]
  properties: PropertyData[]
  expenses: ExpenseData[]
  maintenanceItems: MaintenanceData[]
  reservationStats?: {
    pendingCount: number
    confirmedCount: number
    convertedCount: number
    cancelledCount: number
    totalDepositsCollected: number
    upcomingMoveIns: number
  }
}

export interface PropertyData {
  id: string
  companyId: string
  name: string
  nameAr: string | null
  nameBn: string | null
  nameUr: string | null
  type: string
  address: string | null
  totalUnits: number
  floors: number
  archived: boolean
  createdAt: string
  tenants: TenantData[]
}

export interface TenantGroupData {
  id: string
  companyId: string
  propertyId: string
  name: string
  nameAr: string | null
  nameBn: string | null
  nameUr: string | null
  billingMode: string // consolidated, individual
  status: string // active, inactive
  notes: string | null
  deletedAt: string | null
  createdAt: string
  updatedAt: string
  tenants?: TenantData[]
  property?: PropertyData
}

export interface TenantData {
  id: string
  companyId: string
  propertyId: string
  groupId: string | null
  unitId?: string | null
  name: string
  nameAr: string | null
  nameBn: string | null
  nameUr: string | null
  phone: string
  whatsapp: string | null
  email: string | null
  emiratesId: string | null
  nationality: string | null
  employer: string | null
  emergencyContact: string | null
  unitNumber: string | null
  unitType: string | null
  floor: number | null
  sizeSqft: number | null
  rentAmount: number
  municipalityFee: number | null
  securityDeposit: number | null
  paymentMethod: string | null
  leaseStart: string | null
  leaseEnd: string | null
  contractDuration: number | null
  renewalStatus: string | null
  newRent: number | null
  status: string
  movedOutAt: string | null
  latePaymentCount: number
  tenantScore: number
  systemScore: number
  manualScoreOverride: number | null
  manualScoreReason: string | null
  manualOverrideBy: string | null
  manualOverrideById: string | null
  manualOverrideAt: string | null
  notes: string | null
  // Phase 1 Rental Accounting
  openingBalance: number
  creditBalance: number
  legalCase: boolean
  legalCaseNumber: string | null
  legalCaseNotes: string | null
  createdAt: string
  property?: PropertyData
  payments?: PaymentData[]
  adjustments?: RentAdjustmentData[]
  scoreAuditLogs?: ScoreAuditLogData[]
  group?: TenantGroupData
}

export interface ScoreAuditLogData {
  id: string
  tenantId: string
  previousScore: number
  newScore: number
  changeType: string // SYSTEM_CALCULATED, MANUAL_OVERRIDE, RESET_TO_SYSTEM
  changedBy: string
  changedById: string | null
  reason: string | null
  companyId: string
  createdAt: string
}

export interface PaymentData {
  id: string
  tenantId: string
  amount: number
  date: string
  month: number
  year: number
  method: string | null
  reference: string | null
  receiptNumber: string | null
  notes: string | null
  isLate: boolean
  daysLate: number
  // Phase 1 Rental Accounting: Payment Allocation Type
  allocationType: string | null
  createdAt: string
  tenant?: TenantData
}

export interface RentAdjustmentData {
  id: string
  companyId: string
  tenantId: string
  propertyId: string
  amount: number
  adjustmentType: string
  reason: string
  notes: string | null
  effectiveMonth: number
  effectiveYear: number
  durationMonths: number
  status: string
  createdBy: string
  createdAt: string
  updatedAt: string
  tenant?: TenantData
  property?: PropertyData
}

export interface ExpenseData {
  id: string
  companyId: string
  category: string
  description: string
  amount: number
  date: string
  vendor: string | null
  invoiceNumber: string | null
  recurring: boolean
  building: string | null
  createdAt: string
}

export interface MaintenanceData {
  id: string
  companyId: string
  propertyId: string | null
  title: string
  description: string
  category: string | null
  vendor: string | null
  priority: string
  status: string
  estimatedCost: number | null
  actualCost: number | null
  completedAt: string | null
  createdAt: string
}

export interface ReportData {
  month: number
  year: number
  totalRevenue: number
  expectedRevenue: number
  totalExpenses: number
  profitLoss: number
  occupancyRate: number
  collectionRate: number
  totalUnits: number
  occupiedUnits: number
  expenseBreakdown: Record<string, number>
  monthlyExpenses: ExpenseData[]
  trend: { month: number; year: number; revenue: number; expenses: number; profit: number }[]
  // P&L fields
  rentalIncome: number
  otherIncome: number
  grossRevenue: number
  vacancyLoss: number
  badDebt: number
  grossProfit: number
  costOfOperations: number
  netIncome: number
  totalAdjustments: number
  cashCollected: number
  adjustmentTotal: number
  netRevenue: number
}

export interface ReservationData {
  id: string
  companyId: string
  propertyId: string
  groupId: string | null
  unitNumber: string | null
  prospectName: string
  prospectNameAr: string | null
  prospectNameBn: string | null
  prospectNameUr: string | null
  prospectPhone: string
  prospectWhatsapp: string | null
  prospectEmail: string | null
  reservationDate: string
  expectedMoveInDate: string | null
  expiryDate: string | null
  depositAmount: number
  depositStatus: string
  depositPaymentMethod: string | null
  depositReference: string | null
  depositPaymentDate: string | null
  emiratesId: string | null
  status: string
  convertedTenantId: string | null
  depositAppliedTo: string | null
  depositAppliedAmount: number | null
  notes: string | null
  createdAt: string
  property?: { id: string; name: string; nameAr: string | null; nameBn: string | null; nameUr: string | null }
  group?: TenantGroupData
}

export interface RecurringBillData {
  id: string
  companyId: string
  propertyId: string
  providerName: string
  serviceType: string
  accountNumber: string | null
  contractNumber: string | null
  currentOutstanding: number
  previousOutstanding: number
  totalAmountDue: number
  lastPaymentAmount: number | null
  lastPaymentDate: string | null
  nextDueDate: string
  billingFrequency: string
  autoRenew: boolean
  gracePeriodDays: number
  status: string
  notes: string | null
  attachmentUrls: string | null
  buildingName: string | null
  ownerName: string | null
  propertyManager: string | null
  createdAt: string
  updatedAt: string
  property?: PropertyData
  _count?: { payments: number }
  payments?: BillPaymentData[]
  cycles?: BillCycleData[]
}

export interface BillCycleData {
  id: string
  companyId: string
  recurringBillId: string
  periodStart: string
  periodEnd: string
  dueDate: string
  amount: number
  paidAmount: number
  outstandingAmount: number
  status: string
  notes: string | null
  createdAt: string
  updatedAt: string
  payments?: BillPaymentData[]
  _count?: { payments: number }
  recurringBill?: {
    id: string
    providerName: string
    serviceType: string
    buildingName: string | null
  }
}

export interface BillPaymentData {
  id: string
  companyId: string
  recurringBillId: string
  amount: number
  paymentDate: string
  paymentMethod: string | null
  reference: string | null
  notes: string | null
  outstandingBefore: number
  outstandingAfter: number
  createdBy: string
  createdAt: string
  billCycleId?: string | null
  billCycle?: { id: string; amount: number; periodStart: string; periodEnd: string; status: string }
  recurringBill?: {
    id: string
    providerName: string
    serviceType: string
    buildingName: string | null
    accountNumber: string | null
    currentOutstanding: number
    totalAmountDue: number
  }
}

export interface AuditLogData {
  id: string
  action: string
  entity: string
  entityId: string | null
  userId: string | null
  user?: {
    id: string
    name: string
    email: string
    role: string
  } | null
  details: Record<string, any> | string | null
  companyId: string | null
  createdAt: string
}
