import prisma from '@/lib/db'
import {
  getAuthUser,
  createAuditLog,
  errorResponse,
  successResponse,
  unauthorizedResponse,
  forbiddenResponse,
} from '@/lib/api-utils'
import { isFinanciallyActive } from '@/lib/utils'

// POST /api/seed — Seed demo data for the company
// Only works if company has no data yet. Only admin can seed.
// PHASE 3: DISABLED in production environment
export async function POST() {
  try {
    // PHASE 3: Block seed endpoint in production
    if (process.env.NODE_ENV === 'production') {
      return forbiddenResponse('Seed endpoint is disabled in production')
    }

    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    // Only admin can seed
    if (user.role !== 'admin' && user.role !== 'owner') {
      return forbiddenResponse('Only admins and owners can seed demo data')
    }

    const companyId = user.companyId

    // Check if company already has data (non-deleted)
    const existingProperties = await prisma.property.count({
      where: { companyId, deletedAt: null },
    })
    const existingTenants = await prisma.tenant.count({
      where: { companyId, deletedAt: null },
    })

    if (existingProperties > 0 || existingTenants > 0) {
      return errorResponse('Company already has data. Clear existing data before seeding.', 409)
    }

    // Current date info for generating payment data
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()

    // ═══════════════════════════════════════════════════════════
    // TASK 3: Updated Property Names
    // ═══════════════════════════════════════════════════════════
    const building1 = await prisma.property.create({
      data: {
        companyId,
        name: 'Al Reef Al Madeena - Building 1',
        nameAr: 'الريف المدينة - المبنى 1',
        nameBn: 'আল রিফ আল মাদিনা - ভবন ১',
        nameUr: 'الریف المدینہ - عمارت 1',
        type: 'apartment',
        address: 'Street 5, Khalifa City A, Abu Dhabi',
        totalUnits: 15,
        floors: 5,
      },
    })

    const building2 = await prisma.property.create({
      data: {
        companyId,
        name: 'Al Reef Al Madeena - Building 2',
        nameAr: 'الريف المدينة - المبنى 2',
        nameBn: 'আল রিফ আল মাদিনা - ভবন ২',
        nameUr: 'الریف المدینہ - عمارت 2',
        type: 'apartment',
        address: 'Street 7, Khalifa City A, Abu Dhabi',
        totalUnits: 14,
        floors: 5,
      },
    })

    const building3 = await prisma.property.create({
      data: {
        companyId,
        name: 'Reef Al Madeena - Building 1',
        nameAr: 'ريف المدينة - المبنى 1',
        nameBn: 'রিফ আল মাদিনা - ভবন ১',
        nameUr: 'ریف المدینہ - عمارت 1',
        type: 'apartment',
        address: 'Street 9, Khalifa City A, Abu Dhabi',
        totalUnits: 16,
        floors: 5,
      },
    })

    const building4 = await prisma.property.create({
      data: {
        companyId,
        name: 'Reef Al Madeena - Building 2',
        nameAr: 'ريف المدينة - المبنى 2',
        nameBn: 'রিফ আল মাদিনা - ভবন ২',
        nameUr: 'ریف المدینہ - عمارت 2',
        type: 'mixed_use',
        address: 'Main Road, Musaffah, Abu Dhabi',
        totalUnits: 10,
        floors: 4,
      },
    })

    // ═══════════════════════════════════════════════════════════
    // TASK 2 + 5: 35+ Tenants with correct rent ranges
    // TASK 5 Rent Ranges:
    //   Studio: 1,400–2,200 AED/month
    //   1 Bedroom: 2,200–3,500 AED/month
    //   2 Bedroom: 3,200–4,500 AED/month
    //   Shop: 3,500–4,500 AED/month
    //   Office: 2,500–4,000 AED/month
    // Security Deposit = 1 month rent, Municipality Fee = 5%
    // ═══════════════════════════════════════════════════════════

    const tenantsData = [
      // ── Al Reef Al Madeena - Building 1 (10 tenants) ──
      { name: 'Muhammad Ali', nameAr: 'محمد علي', nameBn: 'মুহাম্মদ আলী', nameUr: 'محمد علی', phone: '050-588-9844', whatsapp: '050-588-9844', emiratesId: '784-1990-1234567-1', nationality: 'Pakistani', employer: 'Emirates NBD', unitNumber: '101', unitType: 'studio', floor: 1, sizeSqft: 440, rentAmount: 1800, paymentMethod: 'bank_transfer', latePaymentCount: 0, tenantScore: 97, propertyId: building1.id, leaseStart: new Date(currentYear - 1, 0, 1), leaseEnd: new Date(currentYear + 1, 11, 31), contractDuration: 36, status: 'active' },
      { name: 'Ahmed Khan', nameAr: 'أحمد خان', nameBn: 'আহমেদ খান', nameUr: 'احمد خان', phone: '050-501-5342', whatsapp: '050-501-5342', emiratesId: '784-1988-2345678-2', nationality: 'Pakistani', employer: 'Lulu Group', unitNumber: '102', unitType: 'studio', floor: 1, sizeSqft: 444, rentAmount: 1500, paymentMethod: 'cheque', latePaymentCount: 1, tenantScore: 85, propertyId: building1.id, leaseStart: new Date(currentYear - 1, 2, 1), leaseEnd: new Date(currentYear + 1, 1, 28), contractDuration: 24, status: 'active' },
      { name: 'Fatima Noor', nameAr: 'فاطمة نور', nameBn: 'ফাতিমা নূর', nameUr: 'فاطمہ نور', phone: '050-295-6577', whatsapp: '050-295-6577', emiratesId: '784-1995-3456789-3', nationality: 'Syrian', employer: 'Abu Dhabi Municipality', unitNumber: '103', unitType: 'studio', floor: 1, sizeSqft: 448, rentAmount: 1700, paymentMethod: 'bank_transfer', latePaymentCount: 2, tenantScore: 72, propertyId: building1.id, leaseStart: new Date(currentYear - 1, 5, 1), leaseEnd: new Date(currentYear, 4, 30), contractDuration: 12, status: 'active' },
      { name: 'Rajesh Kumar', nameAr: 'راجيش كومار', nameBn: 'রাজেশ কুমার', nameUr: 'راجیش کمار', phone: '050-442-8331', whatsapp: '050-442-8331', emiratesId: '784-1992-4567890-4', nationality: 'Indian', employer: 'DP World', unitNumber: '105', unitType: 'studio', floor: 1, sizeSqft: 456, rentAmount: 1600, paymentMethod: 'bank_transfer', latePaymentCount: 0, tenantScore: 98, propertyId: building1.id, leaseStart: new Date(currentYear - 1, 0, 1), leaseEnd: new Date(currentYear + 0, 11, 31), contractDuration: 24, status: 'active' },
      { name: 'Priya Sharma', nameAr: 'بريا شارما', nameBn: 'প্রিয়া শর্মা', nameUr: 'پریا شرما', phone: '050-806-8816', whatsapp: '050-806-8816', emiratesId: '784-1993-5678901-5', nationality: 'Indian', employer: 'Al Futtaim Group', unitNumber: '201', unitType: '1bedroom', floor: 2, sizeSqft: 740, rentAmount: 2800, paymentMethod: 'cash', latePaymentCount: 0, tenantScore: 100, propertyId: building1.id, leaseStart: new Date(currentYear - 1, 0, 1), leaseEnd: new Date(currentYear + 1, 11, 31), contractDuration: 36, status: 'active' },
      { name: 'Omar Hassan', nameAr: 'عمر حسن', nameBn: 'ওমর হাসান', nameUr: 'عمر حسن', phone: '050-606-9838', whatsapp: '050-606-9838', emiratesId: '784-1991-6789012-6', nationality: 'Jordanian', employer: 'Etisalat', unitNumber: '202', unitType: '1bedroom', floor: 2, sizeSqft: 760, rentAmount: 3000, paymentMethod: 'bank_transfer', latePaymentCount: 3, tenantScore: 55, propertyId: building1.id, leaseStart: new Date(currentYear - 1, 3, 1), leaseEnd: new Date(currentYear + 1, 2, 31), contractDuration: 24, status: 'active' },
      { name: 'Youssef Ibrahim', nameAr: 'يوسف إبراهيم', nameBn: 'ইউসুফ ইব্রাহিম', nameUr: 'یوسف ابراہیم', phone: '050-213-2191', whatsapp: '050-213-2191', emiratesId: '784-1989-7890123-7', nationality: 'Egyptian', employer: 'Emirates Airline', unitNumber: '203', unitType: '1bedroom', floor: 2, sizeSqft: 770, rentAmount: 2600, paymentMethod: 'bank_transfer', latePaymentCount: 1, tenantScore: 80, propertyId: building1.id, leaseStart: new Date(currentYear - 1, 6, 1), leaseEnd: new Date(currentYear + 1, 5, 30), contractDuration: 24, status: 'active' },
      { name: 'Sunil Patel', nameAr: 'سونيل باتيل', nameBn: 'সুনীল পটেল', nameUr: 'سنیل پٹیل', phone: '050-538-9567', whatsapp: '050-538-9567', emiratesId: '784-1987-8901234-8', nationality: 'Indian', employer: 'Al Ghurair Group', unitNumber: '301', unitType: '2bedroom', floor: 3, sizeSqft: 1100, rentAmount: 3800, paymentMethod: 'cheque', latePaymentCount: 0, tenantScore: 100, propertyId: building1.id, leaseStart: new Date(currentYear - 1, 0, 1), leaseEnd: new Date(currentYear + 1, 11, 31), contractDuration: 36, status: 'active' },
      { name: 'Hassan Al Farsi', nameAr: 'حسن الفارسي', nameBn: 'হাসান আল ফারসি', nameUr: 'حسن الفارسی', phone: '050-268-5177', whatsapp: '050-268-5177', emiratesId: '784-1985-9012345-9', nationality: 'Emirati', employer: 'ADNOC', unitNumber: '302', unitType: '2bedroom', floor: 3, sizeSqft: 1150, rentAmount: 4200, paymentMethod: 'bank_transfer', latePaymentCount: 0, tenantScore: 96, propertyId: building1.id, leaseStart: new Date(currentYear - 1, 1, 1), leaseEnd: new Date(currentYear + 2, 0, 31), contractDuration: 36, status: 'active' },
      { name: 'Nadia Al Suwaidi', nameAr: 'نادية السويدي', nameBn: 'নাদিয়া আল সুওয়াইদি', nameUr: 'نادیہ السویدی', phone: '050-778-3344', whatsapp: '050-778-3344', emiratesId: '784-1994-0123456-0', nationality: 'Emirati', employer: 'Abu Dhabi Council', unitNumber: '401', unitType: '1bedroom', floor: 4, sizeSqft: 720, rentAmount: 2500, paymentMethod: 'bank_transfer', latePaymentCount: 0, tenantScore: 99, propertyId: building1.id, leaseStart: new Date(currentYear - 0, 0, 1), leaseEnd: new Date(currentYear + 1, 11, 31), contractDuration: 24, status: 'active' },

      // ── Al Reef Al Madeena - Building 2 (9 tenants) ──
      { name: 'Habibur Rahman', nameAr: 'حبيب الرحمن', nameBn: 'হাবিবুর রহমান', nameUr: 'حب الرحمن', phone: '050-217-6593', whatsapp: '050-217-6593', emiratesId: '784-1996-1122334-1', nationality: 'Bangladeshi', employer: 'Al Reef Maintenance', unitNumber: '107', unitType: 'studio', floor: 1, sizeSqft: 460, rentAmount: 1400, paymentMethod: 'cash', latePaymentCount: 2, tenantScore: 70, propertyId: building2.id, leaseStart: new Date(currentYear - 1, 0, 1), leaseEnd: new Date(currentYear + 0, 11, 31), contractDuration: 24, status: 'active' },
      { name: 'Rizwan Ahmed', nameAr: 'رضوان أحمد', nameBn: 'রিজওয়ান আহমেদ', nameUr: 'رضوان احمد', phone: '050-657-2469', whatsapp: '050-657-2469', emiratesId: '784-1996-2233445-2', nationality: 'Pakistani', employer: 'Etihad Airways', unitNumber: '108', unitType: 'studio', floor: 1, sizeSqft: 465, rentAmount: 1900, paymentMethod: 'bank_transfer', latePaymentCount: 1, tenantScore: 82, propertyId: building2.id, leaseStart: new Date(currentYear - 1, 4, 1), leaseEnd: new Date(currentYear + 1, 3, 30), contractDuration: 24, status: 'active' },
      { name: 'Amina Khatun', nameAr: 'أمينة خاتون', nameBn: 'আমিনা খাতুন', nameUr: 'امینہ خاتون', phone: '050-112-3344', whatsapp: '050-112-3344', emiratesId: '784-1997-3344556-3', nationality: 'Bangladeshi', employer: 'Emirates Hospital', unitNumber: '201', unitType: '1bedroom', floor: 2, sizeSqft: 730, rentAmount: 2400, paymentMethod: 'cash', latePaymentCount: 0, tenantScore: 100, propertyId: building2.id, leaseStart: new Date(currentYear - 1, 0, 1), leaseEnd: new Date(currentYear + 1, 11, 31), contractDuration: 36, status: 'active' },
      { name: 'Nasreen Akter', nameAr: 'نسرين أكتر', nameBn: 'নাসরিন আক্তার', nameUr: 'نسرین اختر', phone: '050-445-6677', whatsapp: '050-445-6677', emiratesId: '784-1998-4455667-4', nationality: 'Bangladeshi', employer: 'Abu Dhabi Coop', unitNumber: '202', unitType: '1bedroom', floor: 2, sizeSqft: 750, rentAmount: 2700, paymentMethod: 'bank_transfer', latePaymentCount: 0, tenantScore: 95, propertyId: building2.id, leaseStart: new Date(currentYear - 1, 0, 1), leaseEnd: new Date(currentYear + 1, 11, 31), contractDuration: 36, status: 'active' },
      { name: 'Abdul Karim', nameAr: 'عبد الكريم', nameBn: 'আব্দুল করিম', nameUr: 'عبد الکریم', phone: '050-332-8899', whatsapp: '050-332-8899', emiratesId: '784-1999-5566778-5', nationality: 'Bangladeshi', employer: 'Transguard Group', unitNumber: '203', unitType: 'studio', floor: 2, sizeSqft: 442, rentAmount: 1450, paymentMethod: 'cash', latePaymentCount: 0, tenantScore: 90, propertyId: building2.id, leaseStart: new Date(currentYear - 1, 6, 1), leaseEnd: new Date(currentYear + 1, 5, 30), contractDuration: 24, status: 'active' },
      { name: 'Mohammed Salem', nameAr: 'محمد سالم', nameBn: 'মোহাম্মদ সালেম', nameUr: 'محمد سالم', phone: '050-887-2233', whatsapp: '050-887-2233', emiratesId: '784-1986-6677889-6', nationality: 'Emirati', employer: 'Abu Dhabi Police', unitNumber: '301', unitType: '2bedroom', floor: 3, sizeSqft: 1100, rentAmount: 4000, paymentMethod: 'cheque', latePaymentCount: 0, tenantScore: 98, propertyId: building2.id, leaseStart: new Date(currentYear - 1, 0, 1), leaseEnd: new Date(currentYear + 2, 11, 31), contractDuration: 36, status: 'active' },
      { name: 'Lakshmi Devi', nameAr: 'لاكشمي ديفي', nameBn: 'লক্ষ্মী দেবী', nameUr: 'لکشمی دیوی', phone: '050-554-7766', whatsapp: '050-554-7766', emiratesId: '784-2000-7788990-7', nationality: 'Indian', employer: 'Mediclinic', unitNumber: '302', unitType: '1bedroom', floor: 3, sizeSqft: 700, rentAmount: 2300, paymentMethod: 'bank_transfer', latePaymentCount: 0, tenantScore: 94, propertyId: building2.id, leaseStart: new Date(currentYear - 1, 0, 1), leaseEnd: new Date(currentYear + 1, 11, 31), contractDuration: 36, status: 'active' },
      { name: 'Saeed Al Mansoori', nameAr: 'سعيد المنصوري', nameBn: 'সাঈদ আল মানসুরি', nameUr: 'سعید المنصوری', phone: '050-661-4455', whatsapp: '050-661-4455', emiratesId: '784-1984-8899001-8', nationality: 'Emirati', employer: 'Mubadala', unitNumber: '303', unitType: '2bedroom', floor: 3, sizeSqft: 1120, rentAmount: 4500, paymentMethod: 'bank_transfer', latePaymentCount: 0, tenantScore: 100, propertyId: building2.id, leaseStart: new Date(currentYear - 0, 2, 1), leaseEnd: new Date(currentYear + 2, 1, 28), contractDuration: 24, status: 'active' },
      { name: 'Kamal Hossain', nameAr: 'كمال حسين', nameBn: 'কমল হোসেন', nameUr: 'کمال حسین', phone: '050-998-1122', whatsapp: '050-998-1122', emiratesId: '784-2001-9900112-9', nationality: 'Bangladeshi', employer: 'Al Reef Maintenance', unitNumber: '401', unitType: 'studio', floor: 4, sizeSqft: 440, rentAmount: 1400, paymentMethod: 'cash', latePaymentCount: 4, tenantScore: 48, propertyId: building2.id, leaseStart: new Date(currentYear - 1, 0, 1), leaseEnd: new Date(currentYear + 0, 11, 31), contractDuration: 24, status: 'active' },

      // ── Reef Al Madeena - Building 1 (9 tenants) ──
      { name: 'Arjun Reddy', nameAr: 'أرجون ريدي', nameBn: 'অর্জুন রেড্ডি', nameUr: 'ارجن ریڈی', phone: '050-258-2922', whatsapp: '050-258-2922', emiratesId: '784-1993-5566778-5', nationality: 'Indian', employer: 'Tech Solutions', unitNumber: '101', unitType: 'studio', floor: 1, sizeSqft: 440, rentAmount: 2000, paymentMethod: 'bank_transfer', latePaymentCount: 4, tenantScore: 52, propertyId: building3.id, leaseStart: new Date(currentYear - 1, 0, 1), leaseEnd: new Date(currentYear + 0, 11, 31), contractDuration: 24, status: 'active' },
      { name: 'Vikram Singh', nameAr: 'فيكرام سينغ', nameBn: 'বিক্রম সিং', nameUr: 'وکرم سنگھ', phone: '050-657-2469', whatsapp: '050-657-2469', emiratesId: '784-1991-6677889-6', nationality: 'Indian', employer: 'Deloitte', unitNumber: '205', unitType: '1bedroom', floor: 2, sizeSqft: 750, rentAmount: 3200, paymentMethod: 'cheque', latePaymentCount: 2, tenantScore: 72, propertyId: building3.id, leaseStart: new Date(currentYear - 1, 3, 1), leaseEnd: new Date(currentYear + 1, 2, 31), contractDuration: 24, status: 'active' },
      { name: 'Vivek Joshi', nameAr: 'فيفيك جوشي', nameBn: 'বিবেক জোশী', nameUr: 'ویویک جوشی', phone: '050-708-9988', whatsapp: '050-708-9988', emiratesId: '784-1990-7788990-7', nationality: 'Indian', employer: 'Mubadala', unitNumber: '301', unitType: '2bedroom', floor: 3, sizeSqft: 1100, rentAmount: 3500, paymentMethod: 'bank_transfer', latePaymentCount: 1, tenantScore: 85, propertyId: building3.id, leaseStart: new Date(currentYear - 1, 0, 1), leaseEnd: new Date(currentYear + 1, 11, 31), contractDuration: 36, status: 'active' },
      { name: 'Sanjay Verma', nameAr: 'سنجاي فيرما', nameBn: 'সঞ্জয় বর্মা', nameUr: 'سنجے ورما', phone: '050-444-9647', whatsapp: '050-444-9647', emiratesId: '784-1992-8899001-8', nationality: 'Indian', employer: 'Borouge', unitNumber: '204', unitType: '1bedroom', floor: 2, sizeSqft: 740, rentAmount: 2900, paymentMethod: 'bank_transfer', latePaymentCount: 0, tenantScore: 92, propertyId: building3.id, leaseStart: new Date(currentYear - 1, 0, 1), leaseEnd: new Date(currentYear + 1, 11, 31), contractDuration: 36, status: 'active' },
      { name: 'Maria Santos', nameAr: 'ماريا سانتوس', nameBn: 'মারিয়া সান্তোস', nameUr: 'ماریا سانتوس', phone: '050-321-6654', whatsapp: '050-321-6654', emiratesId: '784-1997-9900112-9', nationality: 'Filipino', employer: 'Abu Dhabi Airport', unitNumber: '102', unitType: 'studio', floor: 1, sizeSqft: 450, rentAmount: 1600, paymentMethod: 'cash', latePaymentCount: 0, tenantScore: 96, propertyId: building3.id, leaseStart: new Date(currentYear - 1, 6, 1), leaseEnd: new Date(currentYear + 1, 5, 30), contractDuration: 24, status: 'active' },
      { name: 'Jose Reyes', nameAr: 'خوسيه رييس', nameBn: 'জোসে রেয়েস', nameUr: 'جوز ریس', phone: '050-789-3321', whatsapp: '050-789-3321', emiratesId: '784-1998-0011223-0', nationality: 'Filipino', employer: 'Etihad Airways', unitNumber: '206', unitType: '1bedroom', floor: 2, sizeSqft: 720, rentAmount: 2500, paymentMethod: 'bank_transfer', latePaymentCount: 0, tenantScore: 90, propertyId: building3.id, leaseStart: new Date(currentYear - 1, 0, 1), leaseEnd: new Date(currentYear + 1, 11, 31), contractDuration: 36, status: 'active' },
      { name: 'Khalid Al Ameri', nameAr: 'خالد العميري', nameBn: 'খালিদ আল আমেরি', nameUr: 'خالد العمیری', phone: '050-423-5566', whatsapp: '050-423-5566', emiratesId: '784-1983-1122334-1', nationality: 'Emirati', employer: 'ADNOC', unitNumber: '302', unitType: '2bedroom', floor: 3, sizeSqft: 1080, rentAmount: 3800, paymentMethod: 'bank_transfer', latePaymentCount: 0, tenantScore: 97, propertyId: building3.id, leaseStart: new Date(currentYear - 1, 1, 1), leaseEnd: new Date(currentYear + 2, 0, 31), contractDuration: 36, status: 'active' },
      { name: 'Tariq Mahmoud', nameAr: 'طارق محمود', nameBn: 'তারিক মাহমুদ', nameUr: 'طارق محمود', phone: '050-556-7788', whatsapp: '050-556-7788', emiratesId: '784-1994-2233445-2', nationality: 'Sudanese', employer: 'Al Dar Properties', unitNumber: '303', unitType: '1bedroom', floor: 3, sizeSqft: 735, rentAmount: 2800, paymentMethod: 'cash', latePaymentCount: 1, tenantScore: 78, propertyId: building3.id, leaseStart: new Date(currentYear - 1, 8, 1), leaseEnd: new Date(currentYear + 1, 7, 31), contractDuration: 24, status: 'active' },
      { name: 'Bishnu Prasad', nameAr: 'بشنو براساد', nameBn: 'বিষ্ণু প্রসাদ', nameUr: 'وشنو پرساد', phone: '050-234-8899', whatsapp: '050-234-8899', emiratesId: '784-2002-3344556-3', nationality: 'Nepali', employer: 'Al Reef Maintenance', unitNumber: '401', unitType: 'studio', floor: 4, sizeSqft: 438, rentAmount: 1500, paymentMethod: 'cash', latePaymentCount: 0, tenantScore: 88, propertyId: building3.id, leaseStart: new Date(currentYear - 1, 0, 1), leaseEnd: new Date(currentYear + 0, 11, 31), contractDuration: 24, status: 'notice' },

      // ── Reef Al Madeena - Building 2 (8 tenants) ──
      { name: 'Walid Al Zaabi', nameAr: 'وليد الزعابي', nameBn: 'ওয়ালিদ আল জাবি', nameUr: 'ولید الزعابی', phone: '050-306-3183', whatsapp: '050-306-3183', emiratesId: '784-1988-9900112-9', nationality: 'Emirati', employer: 'AD Police', unitNumber: '103', unitType: 'studio', floor: 1, sizeSqft: 445, rentAmount: 1800, paymentMethod: 'cheque', latePaymentCount: 1, tenantScore: 80, propertyId: building4.id, leaseStart: new Date(currentYear - 1, 0, 1), leaseEnd: new Date(currentYear + 1, 11, 31), contractDuration: 36, status: 'active' },
      { name: 'Sultan Al Darmaki', nameAr: 'سلطان الدرمكي', nameBn: 'সুলতান আল দারমাকি', nameUr: 'سلطان الدارمکی', phone: '050-712-1575', whatsapp: '050-712-1575', emiratesId: '784-1986-0011223-0', nationality: 'Emirati', employer: 'Abu Dhabi Council', unitNumber: '203', unitType: '1bedroom', floor: 2, sizeSqft: 720, rentAmount: 3100, paymentMethod: 'bank_transfer', latePaymentCount: 2, tenantScore: 68, propertyId: building4.id, leaseStart: new Date(currentYear - 1, 0, 1), leaseEnd: new Date(currentYear + 0, 11, 31), contractDuration: 24, status: 'active' },
      { name: 'Al Madina Grocery', nameAr: 'بقالة المدينة', nameBn: 'আল মদিনা মুদি দোকান', nameUr: 'المدینہ گروسری', phone: '050-123-4567', whatsapp: '050-123-4567', emiratesId: '784-2000-1122334-1', nationality: 'Yemeni', employer: 'Self-employed', unitNumber: 'Shop1', unitType: 'shop', floor: 1, sizeSqft: 500, rentAmount: 4000, paymentMethod: 'cash', latePaymentCount: 0, tenantScore: 90, propertyId: building4.id, leaseStart: new Date(currentYear - 1, 0, 1), leaseEnd: new Date(currentYear + 1, 11, 31), contractDuration: 36, status: 'active' },
      { name: 'Al Noor Tailoring', nameAr: 'خياطة النور', nameBn: 'আল নূর টেইলারিং', nameUr: 'النور درزی', phone: '050-876-5432', whatsapp: '050-876-5432', emiratesId: '784-2001-2233445-2', nationality: 'Indian', employer: 'Self-employed', unitNumber: 'Shop2', unitType: 'shop', floor: 1, sizeSqft: 420, rentAmount: 3500, paymentMethod: 'cash', latePaymentCount: 0, tenantScore: 85, propertyId: building4.id, leaseStart: new Date(currentYear - 1, 3, 1), leaseEnd: new Date(currentYear + 1, 2, 31), contractDuration: 24, status: 'active' },
      { name: 'Deepak Thapa', nameAr: 'ديباك ثابا', nameBn: 'দীপক থাপা', nameUr: 'دیپک تھاپا', phone: '050-678-9900', whatsapp: '050-678-9900', emiratesId: '784-2003-4455667-4', nationality: 'Nepali', employer: 'Al Reef Maintenance', unitNumber: '104', unitType: 'studio', floor: 1, sizeSqft: 440, rentAmount: 1400, paymentMethod: 'cash', latePaymentCount: 0, tenantScore: 86, propertyId: building4.id, leaseStart: new Date(currentYear - 1, 0, 1), leaseEnd: new Date(currentYear + 0, 11, 31), contractDuration: 24, status: 'active' },
      { name: 'Farida Begum', nameAr: 'فريدة بيغوم', nameBn: 'ফরিদা বেগম', nameUr: 'فریدہ بیگم', phone: '050-432-1100', whatsapp: '050-432-1100', emiratesId: '784-2004-5566778-5', nationality: 'Bangladeshi', employer: 'Emirates Palace', unitNumber: '204', unitType: '1bedroom', floor: 2, sizeSqft: 710, rentAmount: 2200, paymentMethod: 'cash', latePaymentCount: 0, tenantScore: 93, propertyId: building4.id, leaseStart: new Date(currentYear - 1, 0, 1), leaseEnd: new Date(currentYear + 1, 11, 31), contractDuration: 36, status: 'active' },
      { name: 'Imran Malik', nameAr: 'عمران مالك', nameBn: 'ইমরান মালিক', nameUr: 'عمران ملک', phone: '050-987-6543', whatsapp: '050-987-6543', emiratesId: '784-1995-6677889-6', nationality: 'Pakistani', employer: 'Emirates Steel', unitNumber: '205', unitType: '1bedroom', floor: 2, sizeSqft: 730, rentAmount: 2600, paymentMethod: 'bank_transfer', latePaymentCount: 3, tenantScore: 42, propertyId: building4.id, leaseStart: new Date(currentYear - 1, 0, 1), leaseEnd: new Date(currentYear + 0, 11, 31), contractDuration: 24, status: 'active' },
      { name: 'Ahmed Al Qubaisi', nameAr: 'أحمد القبيسي', nameBn: 'আহমেদ আল কুবাইসি', nameUr: 'احمد القبیسی', phone: '050-345-2211', emiratesId: '784-1982-7788990-7', nationality: 'Emirati', employer: 'Government Entity', unitNumber: '303', unitType: '2bedroom', floor: 3, sizeSqft: 1090, rentAmount: 3600, paymentMethod: 'bank_transfer', latePaymentCount: 0, tenantScore: 99, propertyId: building4.id, leaseStart: new Date(currentYear - 0, 0, 1), leaseEnd: new Date(currentYear + 2, 11, 31), contractDuration: 36, status: 'inactive' },
    ]

    const tenants: any[] = []
    for (const td of tenantsData) {
      const tenant = await prisma.tenant.create({
        data: {
          companyId,
          propertyId: td.propertyId,
          name: td.name,
          nameAr: td.nameAr,
          nameBn: td.nameBn,
          nameUr: td.nameUr,
          phone: td.phone,
          whatsapp: td.whatsapp || null,
          emiratesId: td.emiratesId,
          nationality: td.nationality,
          employer: td.employer,
          unitNumber: td.unitNumber,
          unitType: td.unitType,
          floor: td.floor,
          sizeSqft: td.sizeSqft,
          rentAmount: td.rentAmount,
          municipalityFee: 0,
          securityDeposit: td.rentAmount, // Always 1 month rent
          paymentMethod: td.paymentMethod,
          leaseStart: td.leaseStart,
          leaseEnd: td.leaseEnd,
          contractDuration: td.contractDuration,
          status: td.status,
          latePaymentCount: td.latePaymentCount,
          tenantScore: td.tenantScore,
          systemScore: td.tenantScore,
        },
      })
      tenants.push(tenant)
    }

    // ═══════════════════════════════════════════════════════════
    // TASK 2: 8+ months of payment history
    // ═══════════════════════════════════════════════════════════
    const methods = ['cash', 'bank_transfer', 'cheque']
    // Indices of tenants who are overdue for current month
    const currentOverdueIndices = [2, 5, 15, 20, 30] // Fatima, Omar, Kamal, Arjun, Imran
    // Indices of tenants who paid partial current month
    const currentPartialIndices = [
      { idx: 6, amount: 1500 },   // Youssef - partial
      { idx: 31, amount: 1000 },  // Sultan - partial
    ]
    // Indices who paid advance for next month
    const advancePayIndices = [4, 8, 16] // Priya, Hassan, Mohammed Salem
    // Previous month overdue
    const prevOverdueIndices = [5, 15, 20] // Omar, Kamal, Arjun
    // Two months ago overdue
    const prev2OverdueIndices = [2, 20] // Fatima, Arjun
    // Tenants with multiple payments in a month (partial payments)
    const multiPayIndices = [6, 31, 1] // Youssef, Sultan, Ahmed Khan

    let paymentCount = 0

    for (let monthOffset = 0; monthOffset < 8; monthOffset++) {
      let payMonth = currentMonth - monthOffset
      let payYear = currentYear
      if (payMonth <= 0) {
        payMonth += 12
        payYear -= 1
      }

      for (let i = 0; i < tenants.length; i++) {
        const tenant = tenants[i]
        if (!isFinanciallyActive(tenant.status)) continue

        // Current month: some haven't paid
        if (monthOffset === 0) {
          if (currentOverdueIndices.includes(i)) continue

          // Partial payments
          const partialInfo = currentPartialIndices.find(p => p.idx === i)
          if (partialInfo) {
            await prisma.payment.create({
              data: {
                companyId,
                tenantId: tenant.id,
                amount: partialInfo.amount,
                date: new Date(payYear, payMonth - 1, 3),
                month: payMonth,
                year: payYear,
                method: 'bank_transfer',
                reference: `RCP-${payMonth}${payYear}-${tenant.unitNumber}`,
                isLate: false,
                daysLate: 0,
              },
            })
            paymentCount++
            continue
          }

          // Advance payments for next month
          if (advancePayIndices.includes(i)) {
            // Pay current month + advance for next
            const nextMonth = payMonth === 12 ? 1 : payMonth + 1
            const nextYear = payMonth === 12 ? payYear + 1 : payYear
            await prisma.payment.create({
              data: {
                companyId,
                tenantId: tenant.id,
                amount: tenant.rentAmount,
                date: new Date(payYear, payMonth - 1, 1),
                month: payMonth,
                year: payYear,
                method: methods[Math.floor(Math.random() * methods.length)],
                reference: `RCP-${payMonth}${payYear}-${tenant.unitNumber}`,
                isLate: false,
                daysLate: 0,
              },
            })
            await prisma.payment.create({
              data: {
                companyId,
                tenantId: tenant.id,
                amount: tenant.rentAmount,
                date: new Date(payYear, payMonth - 1, 1),
                month: nextMonth,
                year: nextYear,
                method: methods[Math.floor(Math.random() * methods.length)],
                reference: `ADV-${nextMonth}${nextYear}-${tenant.unitNumber}`,
                isLate: false,
                daysLate: 0,
                notes: 'Advance payment',
              },
            })
            paymentCount += 2
            continue
          }
        }

        // Previous month: some missed
        if (monthOffset === 1) {
          if (prevOverdueIndices.includes(i)) continue
        }

        // Two months ago: some missed
        if (monthOffset === 2) {
          if (prev2OverdueIndices.includes(i)) continue
        }

        const isLate = monthOffset > 0 && Math.random() < 0.12
        const daysLate = isLate ? Math.floor(Math.random() * 15) + 1 : 0

        // Some tenants make multiple partial payments
        if (multiPayIndices.includes(i) && monthOffset > 0 && monthOffset < 5) {
          const halfRent = Math.round(tenant.rentAmount / 2)
          await prisma.payment.create({
            data: {
              companyId,
              tenantId: tenant.id,
              amount: halfRent,
              date: new Date(payYear, payMonth - 1, isLate ? 12 : 2),
              month: payMonth,
              year: payYear,
              method: 'cash',
              reference: `RCP-${payMonth}${payYear}-${tenant.unitNumber}-1`,
              isLate,
              daysLate: isLate ? daysLate : 0,
            },
          })
          await prisma.payment.create({
            data: {
              companyId,
              tenantId: tenant.id,
              amount: tenant.rentAmount - halfRent,
              date: new Date(payYear, payMonth - 1, isLate ? 18 : 5),
              month: payMonth,
              year: payYear,
              method: 'bank_transfer',
              reference: `RCP-${payMonth}${payYear}-${tenant.unitNumber}-2`,
              isLate,
              daysLate: isLate ? daysLate + 3 : 0,
            },
          })
          paymentCount += 2
          continue
        }

        await prisma.payment.create({
          data: {
            companyId,
            tenantId: tenant.id,
            amount: tenant.rentAmount,
            date: new Date(payYear, payMonth - 1, isLate ? Math.floor(Math.random() * 15) + 10 : Math.floor(Math.random() * 5) + 1),
            month: payMonth,
            year: payYear,
            method: methods[Math.floor(Math.random() * methods.length)],
            reference: `RCP-${payMonth}${payYear}-${tenant.unitNumber}`,
            isLate,
            daysLate,
          },
        })
        paymentCount++
      }
    }

    // ═══════════════════════════════════════════════════════════
    // TASK 2: More expense categories with realistic amounts
    // ═══════════════════════════════════════════════════════════
    const expensesData = [
      // Manpower - recurring monthly
      { category: 'manpower', description: 'Building security - monthly', amount: 12000, vendor: 'SafeGuard Security', invoiceNumber: 'INV-2001', recurring: true, building: 'All Buildings' },
      { category: 'manpower', description: 'Building cleaners - monthly', amount: 8000, vendor: 'CleanPro Services', invoiceNumber: 'INV-2002', recurring: true, building: 'All Buildings' },
      { category: 'manpower', description: 'Maintenance staff - monthly', amount: 15000, vendor: 'Al Reef Maintenance', invoiceNumber: 'INV-2003', recurring: true, building: 'All Buildings' },
      { category: 'manpower', description: 'Reception staff - monthly', amount: 6000, vendor: 'Al Reef Maintenance', invoiceNumber: 'INV-2005', recurring: true, building: 'All Buildings' },

      // Municipality
      { category: 'municipality', description: 'Q1 Municipality fees', amount: 8500, vendor: 'Abu Dhabi Municipality', invoiceNumber: 'MUN-0125', recurring: true, building: 'All Buildings' },
      { category: 'municipality', description: 'Q2 Municipality fees', amount: 8500, vendor: 'Abu Dhabi Municipality', invoiceNumber: 'MUN-0225', recurring: true, building: 'All Buildings' },

      // Utilities
      { category: 'utilities', description: 'Electricity - March', amount: 5500, vendor: 'ADDC', invoiceNumber: 'ADDC-3301', recurring: true, building: 'All Buildings' },
      { category: 'utilities', description: 'Water bill - March', amount: 3000, vendor: 'ADDC', invoiceNumber: 'ADDC-3302', recurring: true, building: 'All Buildings' },
      { category: 'utilities', description: 'Electricity - February', amount: 5200, vendor: 'ADDC', invoiceNumber: 'ADDC-3201', recurring: true, building: 'All Buildings' },
      { category: 'utilities', description: 'Chiller charges - March', amount: 4500, vendor: 'Tabreed', invoiceNumber: 'TAB-4401', recurring: true, building: 'All Buildings' },
      { category: 'utilities', description: 'Gas supply - March', amount: 1200, vendor: 'ADNOC Gas', invoiceNumber: 'GAS-5501', recurring: true, building: 'All Buildings' },

      // Maintenance - mix of recurring and one-time
      { category: 'maintenance', description: 'AC repair B-108', amount: 380, vendor: 'CoolTech Services', invoiceNumber: 'INV-2010', recurring: false, building: 'Al Reef Al Madeena - Building 2' },
      { category: 'maintenance', description: 'Elevator maintenance - Al Reef Building 1', amount: 1800, vendor: 'Schindler Elevators', invoiceNumber: 'INV-2030', recurring: true, building: 'Al Reef Al Madeena - Building 1' },
      { category: 'maintenance', description: 'Painting - Hallway Al Reef Building 1', amount: 3200, vendor: 'ColorPro Painters', invoiceNumber: 'INV-2031', recurring: false, building: 'Al Reef Al Madeena - Building 1' },
      { category: 'maintenance', description: 'Plumbing repair - Reef Madeena Bldg 1', amount: 750, vendor: 'Al Fix Plumbing', invoiceNumber: 'INV-2040', recurring: false, building: 'Reef Al Madeena - Building 1' },
      { category: 'maintenance', description: 'Elevator maintenance - Reef Madeena Bldg 1', amount: 1600, vendor: 'Schindler Elevators', invoiceNumber: 'INV-2032', recurring: true, building: 'Reef Al Madeena - Building 1' },
      { category: 'maintenance', description: 'Elevator maintenance - Reef Madeena Bldg 2', amount: 1500, vendor: 'Schindler Elevators', invoiceNumber: 'INV-2033', recurring: true, building: 'Reef Al Madeena - Building 2' },
      { category: 'maintenance', description: 'Elevator maintenance - Al Reef Building 2', amount: 1700, vendor: 'Schindler Elevators', invoiceNumber: 'INV-2034', recurring: true, building: 'Al Reef Al Madeena - Building 2' },

      // Leasing Commission
      { category: 'leasing', description: 'Leasing commission - 2 new tenants', amount: 4600, vendor: 'Al Reef Leasing', invoiceNumber: 'INV-2020', recurring: false, building: 'All Buildings' },

      // Insurance
      { category: 'insurance', description: 'Building insurance Q2', amount: 2800, vendor: 'Oman Insurance', invoiceNumber: 'POL-4455', recurring: true, building: 'All Buildings' },
      { category: 'insurance', description: 'Building insurance Q1', amount: 2800, vendor: 'Oman Insurance', invoiceNumber: 'POL-4450', recurring: true, building: 'All Buildings' },

      // Security
      { category: 'security', description: 'CCTV monitoring - March', amount: 6000, vendor: 'SafeGuard Security', invoiceNumber: 'INV-2004', recurring: true, building: 'All Buildings' },

      // Salary
      { category: 'salary', description: 'Office staff salaries - March', amount: 25000, vendor: 'Internal', invoiceNumber: 'SAL-0301', recurring: true, building: 'All Buildings' },
      { category: 'salary', description: 'Office staff salaries - February', amount: 25000, vendor: 'Internal', invoiceNumber: 'SAL-0201', recurring: true, building: 'All Buildings' },

      // One-time expenses
      { category: 'maintenance', description: 'Roof waterproofing - Reef Madeena Bldg 2', amount: 8500, vendor: 'WaterShield LLC', invoiceNumber: 'INV-2050', recurring: false, building: 'Reef Al Madeena - Building 2' },
      { category: 'maintenance', description: 'Parking lot repainting - Reef Madeena Bldg 2', amount: 2800, vendor: 'ColorPro Painters', invoiceNumber: 'INV-2051', recurring: false, building: 'Reef Al Madeena - Building 2' },
      { category: 'utilities', description: 'Emergency generator fuel - Feb', amount: 2200, vendor: 'ADNOC Distribution', invoiceNumber: 'ADNOC-G01', recurring: false, building: 'All Buildings' },
    ]

    let expenseCount = 0
    for (const exp of expensesData) {
      await prisma.expense.create({
        data: {
          companyId,
          category: exp.category,
          description: exp.description,
          amount: exp.amount,
          date: new Date(currentYear, currentMonth - 2, 15),
          vendor: exp.vendor,
          invoiceNumber: exp.invoiceNumber,
          recurring: exp.recurring,
          building: exp.building,
        },
      })
      expenseCount++
    }

    // ═══════════════════════════════════════════════════════════
    // TASK 2: More maintenance tasks with varied priorities
    // ═══════════════════════════════════════════════════════════
    const maintenanceData = [
      { title: 'AC Compressor Replacement - Unit 202', description: 'The AC compressor has completely failed. Tenant reporting no cooling for 3 days. Needs urgent replacement.', category: 'ac', vendor: 'CoolTech Services', priority: 'urgent', status: 'in-progress', estimatedCost: 3500, actualCost: null, propertyId: building1.id },
      { title: 'Water Leak - Unit 108', description: 'Water leaking from ceiling in unit 108. Possible roof damage from recent rain.', category: 'plumbing', vendor: 'Al Fix Plumbing', priority: 'high', status: 'pending', estimatedCost: 2000, actualCost: null, propertyId: building2.id },
      { title: 'Elevator Inspection - Al Reef Building 1', description: 'Annual elevator inspection and certification renewal due.', category: 'other', vendor: 'Schindler Elevators', priority: 'medium', status: 'pending', estimatedCost: 1500, actualCost: null, propertyId: building1.id },
      { title: 'Parking Lot Repainting - Reef Madeena Bldg 2', description: 'Parking lines faded in Reef Madeena Bldg 2 parking area. Needs repainting.', category: 'painting', vendor: 'ColorPro Painters', priority: 'low', status: 'completed', estimatedCost: 3000, actualCost: 2800, propertyId: building4.id },
      { title: 'Door Lock Replacement - Unit 204', description: 'Tenant requested new lock installation for security reasons.', category: 'lock_door', vendor: 'KeyMaster LLC', priority: 'medium', status: 'completed', estimatedCost: 150, actualCost: 180, propertyId: building3.id },
      { title: 'Intercom System Repair - Al Reef Building 2', description: 'Intercom system not working in Al Reef Building 2. Visitors cannot buzz apartments.', category: 'electrical', vendor: 'SafeWire Electric', priority: 'high', status: 'in-progress', estimatedCost: 1800, actualCost: null, propertyId: building2.id },
      { title: 'Fire Extinguisher Replacement - Al Reef Building 1', description: 'All fire extinguishers in Al Reef Building 1 need annual replacement.', category: 'other', vendor: 'FirePro Safety', priority: 'medium', status: 'pending', estimatedCost: 900, actualCost: null, propertyId: building1.id },
      { title: 'Kitchen Pipe Blockage - Unit 303', description: 'Kitchen drain completely blocked. Tenant reporting water backup.', category: 'plumbing', vendor: 'Al Fix Plumbing', priority: 'high', status: 'in-progress', estimatedCost: 500, actualCost: null, propertyId: building4.id },
      { title: 'AC Filter Cleaning - Reef Madeena Bldg 1', description: 'Scheduled quarterly AC filter cleaning for all units.', category: 'ac', vendor: 'CoolTech Services', priority: 'low', status: 'completed', estimatedCost: 800, actualCost: 750, propertyId: building3.id },
      { title: 'Staircase Lighting - Al Reef Building 2', description: 'Multiple staircase lights not working on floors 3-5.', category: 'electrical', vendor: 'SafeWire Electric', priority: 'medium', status: 'pending', estimatedCost: 400, actualCost: null, propertyId: building2.id },
      { title: 'Roof Waterproofing - Reef Madeena Bldg 2', description: 'Water seepage reported on top floor. Roof needs waterproofing treatment.', category: 'structural', vendor: 'WaterShield LLC', priority: 'high', status: 'pending', estimatedCost: 8000, actualCost: null, propertyId: building4.id },
      { title: 'Window Seal Replacement - Unit 101', description: 'Window seals cracked causing dust infiltration.', category: 'other', vendor: 'GlassPro Services', priority: 'low', status: 'pending', estimatedCost: 300, actualCost: null, propertyId: building3.id },
    ]

    let maintenanceCount = 0
    for (const mt of maintenanceData) {
      await prisma.maintenance.create({
        data: {
          companyId,
          propertyId: mt.propertyId,
          title: mt.title,
          description: mt.description,
          category: mt.category,
          vendor: mt.vendor,
          priority: mt.priority,
          status: mt.status,
          estimatedCost: mt.estimatedCost,
          actualCost: mt.actualCost,
          completedAt: mt.status === 'completed' ? new Date(currentYear, currentMonth - 2, 20) : null,
        },
      })
      maintenanceCount++
    }

    // Create audit log
    await createAuditLog({
      action: 'SEED',
      entity: 'Company',
      entityId: companyId,
      userId: user.id,
      companyId,
      details: {
        properties: 4,
        tenants: tenants.length,
        payments: paymentCount,
        expenses: expenseCount,
        maintenance: maintenanceCount,
      },
    })

    return successResponse({
      message: 'Demo data seeded successfully',
      summary: {
        properties: 4,
        tenants: tenants.length,
        payments: paymentCount,
        expenses: expenseCount,
        maintenance: maintenanceCount,
      },
    })
  } catch (error) {
    console.error('POST /api/seed error:', error)
    return errorResponse('Failed to seed demo data', 500)
  }
}
