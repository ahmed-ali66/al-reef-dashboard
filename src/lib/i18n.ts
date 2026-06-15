// Al Reef Al Madeena Real Estate - 4-Language i18n System
// EN = English, AR = Arabic, BN = Bengali, UR = Urdu
// Academic/professional translations, NOT literal

export type Language = 'en' | 'ar' | 'bn' | 'ur'

// WhatsApp language type includes Hindi for message sending only (not UI language)
export type WhatsAppLanguage = Language | 'hi'

export const languageNames: Record<Language, { native: string; en: string }> = {
  en: { native: 'English', en: 'English' },
  ar: { native: 'العربية', en: 'Arabic' },
  bn: { native: 'বাংলা', en: 'Bengali' },
  ur: { native: 'اردو', en: 'Urdu' },
}

export const rtlLanguages: Language[] = ['ar', 'ur']

type TranslationKeys = typeof translations

export const translations = {
  // Auth
  login: { en: 'Sign In', ar: 'تسجيل الدخول', bn: 'সাইন ইন', ur: 'داخل ہوں' },
  loginTitle: { en: 'Property Dashboard', ar: 'لوحة التحكم العقارية', bn: 'সম্পত্তি ড্যাশবোর্ড', ur: 'املاک کا ڈیش بورڈ' },
  loginSubtitle: { en: 'Al Reef Al Madeena Real Estate Management and General Maintenance - L.L.C - S.P.C', ar: 'الريف المدينة لإدارة العقارات والصيانة العامة ذ.م.م - ش. ش. و', bn: 'আল রিফ আল মাদিনা রিয়েল এস্টেট ম্যানেজমেন্ট অ্যান্ড জেনারেল মেইনটেন্যান্স - এলএলসি - এসপিসি', ur: 'الریف المدینہ برائے املاک کا انتظام اور عام دیکھ بھال - ذ.م.م - ش. ش. و' },
  email: { en: 'Email Address', ar: 'البريد الإلكتروني', bn: 'ইমেইল ঠিকানা', ur: 'ای میل ایڈریس' },
  password: { en: 'Password', ar: 'كلمة المرور', bn: 'পাসওয়ার্ড', ur: 'پاس ورڈ' },
  signInButton: { en: 'Sign In', ar: 'دخول', bn: 'সাইন ইন', ur: 'داخل ہوں' },
  loginError: { en: 'Invalid email or password', ar: 'بريد إلكتروني أو كلمة مرور غير صحيحة', bn: 'অবৈধ ইমেইল বা পাসওয়ার্ড', ur: 'غلط ای میل یا پاس ورڈ' },
  logout: { en: 'Sign Out', ar: 'تسجيل الخروج', bn: 'সাইন আউট', ur: 'خروج' },
  ownerRole: { en: 'Owner', ar: 'المالك', bn: 'মালিক', ur: 'مالک' },
  adminRole: { en: 'Admin', ar: 'المدير', bn: 'প্রশাসক', ur: 'ناظم' },
  accountantRole: { en: 'Accountant', ar: 'المحاسب', bn: 'হিসাবরক্ষক', ur: 'اکاؤنٹنٹ' },
  staffRole: { en: 'Staff', ar: 'الموظف', bn: 'কর্মচারী', ur: 'ملازم' },

  // Navigation
  dashboard: { en: 'Dashboard', ar: 'لوحة التحكم', bn: 'ড্যাশবোর্ড', ur: 'ڈیش بورڈ' },
  properties: { en: 'Properties', ar: 'العقارات', bn: 'সম্পত্তি', ur: 'املاک' },
  tenants: { en: 'Tenants', ar: 'المستأجرون', bn: 'ভাড়াটিয়া', ur: 'کرایہ دار' },
  rentCollection: { en: 'Rent Collection', ar: 'تحصيل الإيجار', bn: 'ভাড়া আদায়', ur: 'کرایہ کی وصولی' },
  maintenance: { en: 'Maintenance', ar: 'الصيانة', bn: 'রক্ষণাবেক্ষণ', ur: 'دیكھ بھال کا شعبہ' },
  expenses: { en: 'Expenses', ar: 'المصروفات', bn: 'ব্যয়', ur: 'اخراجات' },
  reports: { en: 'Reports', ar: 'التقارير', bn: 'প্রতিবেদন', ur: 'رپورٹیں' },
  contracts: { en: 'Contracts', ar: 'العقود', bn: 'চুক্তি', ur: 'معاہدے' },

  // Dashboard
  monthlyOverview: { en: 'Monthly Overview', ar: 'نظرة شهرية', bn: 'মাসিক পরিদর্শন', ur: 'ماہانہ جائزہ' },
  collectedRevenue: { en: 'Collected Revenue', ar: 'الإيرادات المحصّلة', bn: 'আদায়কৃত রাজস্ব', ur: 'وصول شدہ آمدنی' },
  overdue: { en: 'Overdue', ar: 'متأخر', bn: 'বকেয়া', ur: 'تاخیری ادائیگی' },
  activeTenants: { en: 'Active Tenants', ar: 'المستأجرون النشطون', bn: 'সক্রিয় ভাড়াটিয়া', ur: 'فعال کرایہ دار' },
  occupancyRate: { en: 'Occupancy Rate', ar: 'نسبة الإشغال', bn: 'অধিভুক্তির হার', ur: 'قبضے کی شرح' },
  expected: { en: 'Expected', ar: 'متوقع', bn: 'প্রত্যাশিত', ur: 'متوقع' },
  collected: { en: 'Collected', ar: 'محصّل', bn: 'আদায়কৃত', ur: 'وصول شدہ' },
  monthly: { en: 'Monthly', ar: 'شهري', bn: 'মাসিক', ur: 'ماہانہ' },
  ofExpected: { en: 'of', ar: 'من', bn: 'এর মধ্যে', ur: 'میں سے' },
  total: { en: 'Total', ar: 'إجمالي', bn: 'মোট', ur: 'کل' },
  totalUnits: { en: 'Total Units', ar: 'إجمالي الوحدات', bn: 'মোট ইউনিট', ur: 'کل یونٹیں' },
  occupiedUnits: { en: 'Occupied Units', ar: 'الوحدات المشغولة', bn: 'অধিভুক্ত ইউনিট', ur: 'قابض یونٹیں' },
  vacantUnits: { en: 'Vacant Units', ar: 'الوحدات الشاغرة', bn: 'শূন্য ইউনিট', ur: 'خالی یونٹیں' },
  netProfit: { en: 'Net Profit', ar: 'صافي الربح', bn: 'নিট মুনাফা', ur: 'خالص منافع' },
  paymentStatusBoard: { en: 'Payment Status Board', ar: 'لوحة حالة الدفع', bn: 'পেমেন্ট স্ট্যাটাস বোর্ড', ur: 'ادائیگی کی صورتحال' },
  revenueTrend: { en: 'Revenue Trend (6 Months)', ar: 'اتجاه الإيرادات (6 أشهر)', bn: 'রাজস্ব প্রবণতা (6 মাস)', ur: 'آمدنی کا رجحان (6 ماہ)' },
  recentPayments: { en: 'Recent Payments', ar: 'المدفوعات الأخيرة', bn: 'সাম্প্রতিক পেমেন্ট', ur: 'حالیہ ادائیگیاں' },
  noData: { en: 'No data found', ar: 'لا توجد بيانات', bn: 'কোনো তথ্য পাওয়া যায়নি', ur: 'کوئی ڈیٹا نہیں ملا' },
  loadSampleData: { en: 'Load Sample Data', ar: 'تحميل البيانات التجريبية', bn: 'নমুনা ডেটা লোড করুন', ur: 'نمونہ ڈیٹا لوڈ کریں' },
  overdueAlert: { en: 'TENANT(S) OVERDUE', ar: 'مستأجر متأخر', bn: 'জন ভাড়াটিয়া বকেয়াদার', ur: 'تاخیری ادائیگی والے کرایہ دار' },
  uncollected: { en: 'UNCOLLECTED', ar: 'غير محصّل', bn: 'অনাদায়কৃত', ur: 'غیر وصول شدہ' },
  viewDetails: { en: 'View Details', ar: 'عرض التفاصيل', bn: 'বিস্তারিত দেখুন', ur: 'تفصیلات دیکھیں' },
  paid: { en: 'PAID', ar: 'مدفوع', bn: 'পরিশোধিত', ur: 'ادا شدہ' },
  partial: { en: 'PARTIAL', ar: 'جزئي', bn: 'আংশিক', ur: 'جزوی' },
  partiallyPaid: { en: 'Partially Paid', ar: 'مدفوع جزئياً', bn: 'আংশিক পরিশোধিত', ur: 'جزوی ادائیگی' },
  movedOut: { en: 'Moved Out', ar: 'مغادر', bn: 'প্রস্থানকৃত', ur: 'منتقل ہو گیا' },
  inactive: { en: 'INACTIVE', ar: 'غير نشط', bn: 'নিষ্ক্রিয়', ur: 'غیر فعال' },
  dueSoon: { en: 'DUE SOON', ar: 'مستحق قريباً', bn: 'শীঘ্রই দেয়', ur: 'جلد ادائیگی' },
  remind: { en: 'Remind', ar: 'تذكير', bn: 'স্মরণ', ur: 'یاد دہانی' },
  remindAllUnpaid: { en: 'Remind All Unpaid', ar: 'تذكير الكل', bn: 'সকল অবৈতনিকে স্মরণ করুন', ur: 'تمام غیر ادا شدہ کو یاد دہانی' },
  noRecentPayments: { en: 'No recent payments', ar: 'لا توجد مدفوعات حديثة', bn: 'কোনো সাম্প্রতিক পেমেন্ট নেই', ur: 'کوئی حالیہ ادائیگی نہیں' },

  // Properties
  addProperty: { en: 'Add Property', ar: 'إضافة عقار', bn: 'সম্পত্তি যোগ করুন', ur: 'نئی ملکیت شامل کریں' },
  editProperty: { en: 'Edit Property', ar: 'تعديل العقار', bn: 'সম্পত্তি সম্পাদনা', ur: 'ملکیت میں ترمیم' },
  propertyName: { en: 'Property Name', ar: 'اسم العقار', bn: 'সম্পত্তির নাম', ur: 'ملکیت کا نام' },
  allUnits: { en: 'All Units', ar: 'جميع الوحدات', bn: 'সব ইউনিট', ur: 'تمام یونٹس' },
  propertyType: { en: 'Property Type', ar: 'نوع العقار', bn: 'সম্পত্তির ধরন', ur: 'ملکیت کی قسم' },
  address: { en: 'Address', ar: 'العنوان', bn: 'ঠিকানা', ur: 'پتہ' },
  totalUnitsCount: { en: 'Total Units', ar: 'إجمالي الوحدات', bn: 'মোট ইউনিট', ur: 'کل یونٹیں' },
  floors: { en: 'Floors', ar: 'الطوابق', bn: 'তলা', ur: 'منزلیں' },
  units: { en: 'Units', ar: 'وحدات', bn: 'ইউনিট', ur: 'یونٹیں' },
  tenantsCount: { en: 'Tenants', ar: 'مستأجرون', bn: 'ভাড়াটিয়া', ur: 'کرایہ دار' },
  occupancy: { en: 'Occupancy', ar: 'إشغال', bn: 'অধিভুক্তি', ur: 'قبضہ' },
  monthlyRevenue: { en: 'Monthly Revenue', ar: 'الإيراد الشهري', bn: 'মাসিক রাজস্ব', ur: 'ماہانہ آمدنی' },
  outstanding: { en: 'Outstanding', ar: 'المستحق', bn: 'বকেয়', ur: 'واجب الادا' },
  moveOutTenant: { en: 'Move Out', ar: 'مغادرة', bn: 'প্রস্থান', ur: 'منتقل ہوں' },
  moveOutConfirm: { en: 'Mark this tenant as moved out? The unit will become available for new tenants. All historical records will be preserved.', ar: 'تحديد هذا المستأجر كمغادر؟ ستصبح الوحدة متاحة لمستأجرين جدد. سيتم الاحتفاظ بجميع السجلات التاريخية.', bn: 'এই ভাড়াটিয়াকে প্রস্থানকৃত হিসেবে চিহ্নিত করবেন? ইউনিটটি নতুন ভাড়াটিয়াদের জন্য উপলব্ধ হবে। সমস্ত ঐতিহাসিক রেকর্ড সংরক্ষিত থাকবে।', ur: 'کیا اس کرایہ دار کو منتقل شدہ نشان زد کریں؟ یونٹ نئے کرایہ داروں کے لیے دستیاب ہوگا۔ تمام تاریخی ریکارڈز محفوظ رہیں گے۔' },
  noVacantUnits: { en: 'No vacant units available in this property', ar: 'لا توجد وحدات شاغرة في هذا العقار', bn: 'এই সম্পত্তিতে কোনো শূন্য ইউনিট নেই', ur: 'اس ملکیت میں کوئی خالی یونٹ نہیں' },
  propertyFull: { en: 'Property is fully occupied', ar: 'العقار مشغول بالكامل', bn: 'সম্পত্তি সম্পূর্ণ অধিভুক্ত', ur: 'ملکیت مکمل طور پر قبضے میں ہے' },
  propertyFullWarning: { en: 'Cannot add tenant — this property has no vacant units.', ar: 'لا يمكن إضافة مستأجر — هذا العقار ليس لديه وحدات شاغرة.', bn: 'ভাড়াটে যোগ করা যাবে না — এই সম্পত্তিতে কোনো শূন্য ইউনিট নেই।', ur: 'کرایہ دار شامل نہیں کیا جا سکتا — اس ملکیت میں کوئی خالی یونٹ نہیں ہے۔' },
  availableUnits: { en: 'Available Units', ar: 'الوحدات المتاحة', bn: 'উপলব্ধ ইউনিট', ur: 'دستیاب یونٹیں' },
  occupiedUnits2: { en: 'Occupied', ar: 'مشغول', bn: 'অধিভুক্ত', ur: 'قابض' },
  vacant: { en: 'Vacant', ar: 'شاغر', bn: 'শূন্য', ur: 'خالی' },
  propertiesManaged: { en: 'properties managed', ar: 'عقارات مُدارة', bn: 'টি পরিচালিত সম্পত্তি', ur: 'ممبریت کی گئی املاک' },
  deleteProperty: { en: 'Delete this property?', ar: 'حذف هذا العقار؟', bn: 'এই সম্পত্তি মুছে ফেলবেন?', ur: 'کیا یہ ملکیت حذف کریں؟' },
  archiveProperty: { en: 'Archive Property', ar: 'أرشفة العقار', bn: 'সম্পত্তি সংরক্ষণাগার', ur: 'ملکیت محفوظ کریں' },
  sellProperty: { en: 'Property Sold / Removed', ar: 'عقار مباع / مزال', bn: 'সম্পত্তি বিক্রয়/অপসারিত', ur: 'ملکیت فروخت/ہٹا دی گئی' },
  apartment: { en: 'Apartment', ar: 'شقة', bn: 'অ্যাপার্টমেন্ট', ur: 'اپارٹمنٹ' },
  villa: { en: 'Villa', ar: 'فيلا', bn: 'ভিলা', ur: 'ولا' },
  office: { en: 'Office', ar: 'مكتب', bn: 'অফিস', ur: 'دفتر' },
  shop: { en: 'Shop', ar: 'محل', bn: 'দোকান', ur: 'دکان' },
  studio: { en: 'Studio', ar: 'استوديو', bn: 'স্টুডিও', ur: 'اسٹوڈیو' },
  mixedUse: { en: 'Mixed Use', ar: 'استخدام متعدد', bn: 'মিশ্র ব্যবহার', ur: 'مخلوط استعمال' },

  // Tenants
  addTenant: { en: 'Add Tenant', ar: 'إضافة مستأجر', bn: 'ভাড়াটিয়া যোগ করুন', ur: 'نیا کرایہ دار شامل کریں' },
  editTenant: { en: 'Edit Tenant', ar: 'تعديل المستأجر', bn: 'ভাড়াটিয়া সম্পাদনা', ur: 'کرایہ دار میں ترمیم' },
  tenantName: { en: 'Tenant Name', ar: 'اسم المستأجر', bn: 'ভাড়াটিয়ার নাম', ur: 'کرایہ دار کا نام' },
  phone: { en: 'Phone', ar: 'الهاتف', bn: 'ফোন', ur: 'فون' },
  whatsapp: { en: 'WhatsApp', ar: 'واتساب', bn: 'হোয়াটসঅ্যাপ', ur: 'واٹس ایپ' },
  emiratesId: { en: 'Emirates ID', ar: 'الهوية الإماراتية', bn: 'আমিরাতি পরিচয়পত্র', ur: 'اماراتی شناختی کارڈ' },
  nationality: { en: 'Nationality', ar: 'الجنسية', bn: 'জাতীয়তা', ur: 'قومیت' },
  employer2: { en: 'Employer', ar: 'جهة العمل', bn: 'নিয়োগকর্তা', ur: 'آجر' },
  emergencyContact: { en: 'Emergency Contact', ar: 'جهة اتصال الطوارئ', bn: 'জরুরি যোগাযোগ', ur: 'ہنگامی رابطہ' },
  unitNumber: { en: 'Unit Number', ar: 'رقم الوحدة', bn: 'ইউনিট নম্বর', ur: 'یونٹ نمبر' },
  unitType: { en: 'Unit Type', ar: 'نوع الوحدة', bn: 'ইউনিটের ধরন', ur: 'یونٹ کی قسم' },
  floor2: { en: 'Floor', ar: 'الطابق', bn: 'তলা', ur: 'منزل' },
  sizeSqft: { en: 'Size (sqft)', ar: 'المساحة (قدم مربع)', bn: 'আকার (বর্গফুট)', ur: 'رقبہ (مربع فٹ)' },
  monthlyRent: { en: 'Monthly Rent (AED)', ar: 'الإيجار الشهري (درهم)', bn: 'মাসিক ভাড়া (দিরহাম)', ur: 'ماہانہ کرایہ (درہم)' },
  municipalityFee: { en: 'Municipality Fee (5%)', ar: 'رسوم البلدية (5%)', bn: 'পৌরসভা ফি (5%)', ur: 'بلدیہ فیس (5%)' },
  securityDeposit: { en: 'Security Deposit', ar: 'التأمين', bn: 'নিরাপত্তা জমা', ur: 'سیکیورٹی ڈپازٹ' },
  paymentMethod: { en: 'Payment Method', ar: 'طريقة الدفع', bn: 'পেমেন্ট পদ্ধতি', ur: 'ادائیگی کا طریقہ' },
  leaseStart: { en: 'Lease Start', ar: 'بداية العقد', bn: 'লিজ শুরু', ur: 'اجارے کی شروعات' },
  leaseEnd: { en: 'Lease End', ar: 'نهاية العقد', bn: 'লিজ শেষ', ur: 'اجارے کا اختتام' },
  contractDuration: { en: 'Contract Duration (months)', ar: 'مدة العقد (أشهر)', bn: 'চুক্তির মেয়াদ (মাস)', ur: 'معاہدے کی مدت (مہینے)' },
  status: { en: 'Status', ar: 'الحالة', bn: 'অবস্থা', ur: 'حالت' },
  active: { en: 'Active', ar: 'نشط', bn: 'সক্রিয়', ur: 'فعال' },
  inactive2: { en: 'Inactive', ar: 'غير نشط', bn: 'নিষ্ক্রিয়', ur: 'غیر فعال' },
  evicted: { en: 'Evicted', ar: 'مُخلَى', bn: 'উচ্ছেদিত', ur: 'بے دخل' },
  notice: { en: 'Notice Period', ar: 'فترة الإشعار', bn: 'নোটিশ পিরিয়ড', ur: 'نوٹس کی مدت' },
  noticePeriod: { en: 'Notice Period', ar: 'فترة الإشعار', bn: 'নোটিশ পিরিয়ড', ur: 'نوٹس کی مدت' },
  tenantScore: { en: 'Tenant Score', ar: 'تقييم المستأجر', bn: 'ভাড়াটিয়া স্কোর', ur: 'کرایہ دار کا اسکور' },
  latePayments: { en: 'Late Payments', ar: 'مدفوعات متأخرة', bn: 'বিলম্বিত পেমেন্ট', ur: 'تاخیری ادائیگیاں' },
  paymentHistory: { en: 'Payment History', ar: 'سجل المدفوعات', bn: 'পেমেন্ট ইতিহাস', ur: 'ادائیگی کا ریکارڈ' },
  searchTenants: { en: 'Search tenants...', ar: 'بحث المستأجرين...', bn: 'ভাড়াটিয়া খুঁজুন...', ur: 'کرایہ دار تلاش کریں...' },
  searchByProperty: { en: 'Search by property...', ar: 'البحث بالعقار...', bn: 'সম্পত্তি দিয়ে খুঁজুন...', ur: 'ملکیت سے تلاش کریں...' },
  allStatus: { en: 'All Status', ar: 'كل الحالات', bn: 'সকল অবস্থা', ur: 'تمام حالتیں' },
  deleteTenant: { en: 'Delete this tenant and all their payments?', ar: 'حذف هذا المستأجر وجميع مدفوعاته؟', bn: 'এই ভাড়াটিয়া এবং তাদের সকল পেমেন্ট মুছে ফেলবেন?', ur: 'کیا یہ کرایہ دار اور اس کی تمام ادائیگیاں حذف کریں؟' },
  noPayments: { en: 'No payments recorded', ar: 'لا توجد مدفوعات', bn: 'কোনো পেমেন্ট রেকর্ড নেই', ur: 'کوئی ادائیگی ریکارڈ نہیں' },
  noTenantsFound: { en: 'No tenants found', ar: 'لم يتم العثور على مستأجرين', bn: 'কোনো ভাড়াটিয়া পাওয়া যায়নি', ur: 'کوئی کرایہ دار نہیں ملا' },
  scoreExcellent: { en: 'Excellent', ar: 'ممتاز', bn: 'চমৎকার', ur: 'بہترین' },
  scoreGood: { en: 'Good', ar: 'جيد', bn: 'ভালো', ur: 'اچھا' },
  scoreWarning: { en: 'Warning', ar: 'تحذير', bn: 'সতর্কতা', ur: 'انتباہ' },
  scorePoor: { en: 'Poor', ar: 'ضعيف', bn: 'দুর্বল', ur: 'کمزور' },
  manualOverride: { en: 'Manual Override', ar: 'تجاوز يدوي', bn: 'ম্যানুয়াল ওভাররাইড', ur: 'مینوئل اووررائڈ' },
  overrideScore: { en: 'Override Score', ar: 'تجاوز التقييم', bn: 'স্কোর ওভাররাইড করুন', ur: 'اسکور اووررائڈ کریں' },
  resetToSystemScore: { en: 'Reset to System Score', ar: 'إعادة للتقييم التلقائي', bn: 'সিস্টেম স্কোরে রিসেট করুন', ur: 'سسٹم اسکور پر ری سیٹ کریں' },
  systemScore: { en: 'System Score', ar: 'التقييم التلقائي', bn: 'সিস্টেম স্কোর', ur: 'سسٹم اسکور' },
  displayedScore: { en: 'Displayed Score', ar: 'التقييم المعروض', bn: 'প্রদর্শিত স্কোর', ur: 'دکھایا گیا اسکور' },
  overrideReason: { en: 'Override Reason', ar: 'سبب التجاوز', bn: 'ওভাররাইডের কারণ', ur: 'اووررائڈ کی وجہ' },
  overrideReasonPlaceholder: { en: 'Enter reason for score adjustment (required)', ar: 'أدخل سبب تعديل التقييم (مطلوب)', bn: 'স্কোর সমন্বয়ের কারণ লিখুন (প্রয়োজনীয়)', ur: 'اسکور ایڈجسٹمنٹ کی وجہ درج کریں (ضروری)' },
  newScore: { en: 'New Score', ar: 'التقييم الجديد', bn: 'নতুন স্কোর', ur: 'نیا اسکور' },
  scoreOverrideApplied: { en: 'Score override applied successfully', ar: 'تم تطبيق تجاوز التقييم بنجاح', bn: 'স্কোর ওভাররাইড সফলভাবে প্রয়োগ হয়েছে', ur: 'اسکور اووررائڈ کامیابی سے لاگو ہو گیا' },
  scoreResetSuccess: { en: 'Score reset to system-calculated value', ar: 'تم إعادة التقييم للقيمة المحسوبة تلقائياً', bn: 'স্কোর সিস্টেম-গণনাকৃত মানে রিসেট হয়েছে', ur: 'اسکور سسٹم کے حساب کتاب والی قیمت پر ری سیٹ ہو گیا' },
  overriddenBy: { en: 'Overridden by', ar: 'تم التجاوز بواسطة', bn: 'ওভাররাইড করেছেন', ur: 'اووررائڈ کرنے والے' },
  overrideDate: { en: 'Override Date', ar: 'تاريخ التجاوز', bn: 'ওভাররাইড তারিখ', ur: 'اووررائڈ کی تاریخ' },
  scoreAuditTrail: { en: 'Score Audit Trail', ar: 'سجل تتبع التقييم', bn: 'স্কোর অডিট ট্রেইল', ur: 'اسکور آڈٹ ٹریل' },
  manualOverrideAction: { en: 'Manual Override', ar: 'تجاوز يدوي', bn: 'ম্যানুয়াল ওভাররাইড', ur: 'مینوئل اووررائڈ' },
  systemCalculated: { en: 'System Calculated', ar: 'محسوب تلقائياً', bn: 'সিস্টেম গণনাকৃত', ur: 'سسٹم کا حساب' },
  resetToSystem: { en: 'Reset to System', ar: 'إعادة للتلقائي', bn: 'সিস্টেমে রিসেট', ur: 'سسٹم پر ری سیٹ' },
  scoreMustBeBetween: { en: 'Score must be between 0 and 100', ar: 'يجب أن يكون التقييم بين 0 و 100', bn: 'স্কোর ০ থেকে ১০০ এর মধ্যে হতে হবে', ur: 'اسکور 0 اور 100 کے درمیان ہونا چاہیے' },
  reasonRequired: { en: 'Reason is required for score override', ar: 'السبب مطلوب لتجاوز التقييم', bn: 'স্কোর ওভাররাইডের জন্য কারণ প্রয়োজন', ur: 'اسکور اووررائڈ کے لیے وجہ ضروری ہے' },
  noOverrideExists: { en: 'No manual override applied', ar: 'لا يوجد تجاوز يدوي', bn: 'কোনো ম্যানুয়াল ওভাররাইড নেই', ur: 'کوئی مینوئل اووررائڈ نہیں' },
  viewAuditTrail: { en: 'View Audit Trail', ar: 'عرض سجل التتبع', bn: 'অডিট ট্রেইল দেখুন', ur: 'آڈٹ ٹریل دیکھیں' },
  changeType: { en: 'Change Type', ar: 'نوع التغيير', bn: 'পরিবর্তনের ধরন', ur: 'تبدیلی کی قسم' },
  previousScore: { en: 'Previous Score', ar: 'التقييم السابق', bn: 'পূর্ববর্তী স্কোর', ur: 'پچھلا اسکور' },
  changedBy: { en: 'Changed By', ar: 'تم التغيير بواسطة', bn: 'পরিবর্তন করেছেন', ur: 'تبدیلی کرنے والے' },
  noScoreHistory: { en: 'No score change history', ar: 'لا يوجد سجل تغييرات التقييم', bn: 'কোনো স্কোর পরিবর্তনের ইতিহাস নেই', ur: 'اسکور تبدیلی کی تاریخ نہیں' },
  scoreOverridePermission: { en: 'Only owners and admins can override scores', ar: 'فقط المالكون والمسؤولون يمكنهم تجاوز التقييم', bn: 'শুধুমাত্র মালিক এবং অ্যাডমিনরা স্কোর ওভাররাইড করতে পারেন', ur: 'صرف مالک اور ایڈمن اسکور اووررائڈ کر سکتے ہیں' },
  latePaymentCountDesc: { en: 'Number of late rent payments recorded', ar: 'عدد مدفوعات الإيجار المتأخرة المسجلة', bn: 'রেকর্ড করা বিলম্বিত ভাড়া পেমেন্টের সংখ্যা', ur: 'ریکارڈ شدہ تاخیری کرایہ ادائیگیوں کی تعداد' },
  cash: { en: 'Cash', ar: 'نقدي', bn: 'নগদ', ur: 'نقد' },
  bankTransfer: { en: 'Bank Transfer', ar: 'تحويل بنكي', bn: 'ব্যাংক ট্রান্সফার', ur: 'بینک ٹرانسفر' },
  cheque: { en: 'Cheque', ar: 'شيك', bn: 'চেক', ur: 'چیک' },
  nameEnglish: { en: 'Name (English)', ar: 'الاسم (إنجليزي)', bn: 'নাম (ইংরেজি)', ur: 'نام (انگریزی)' },
  nameArabic: { en: 'Arabic Name', ar: 'الاسم بالعربية', bn: 'আরবি নাম', ur: 'عربی نام' },
  nameBengali: { en: 'Bengali Name', ar: 'الاسم بالبنغالية', bn: 'বাংলা নাম', ur: 'بنگالی نام' },
  nameUrdu: { en: 'Urdu Name', ar: 'الاسم بالأردية', bn: 'উর্দু নাম', ur: 'اردو نام' },
  oneBedroom: { en: '1 Bedroom', ar: 'غرفة واحدة', bn: '১ বেডরুম', ur: 'ایک بیڈ روم' },
  twoBedroom: { en: '2 Bedroom', ar: 'غرفتان', bn: '২ বেডরুম', ur: 'دو بیڈ روم' },
  threeBedroom: { en: '3 Bedroom', ar: '3 غرف', bn: '৩ বেডরুম', ur: 'تین بیڈ روم' },
  selectProperty: { en: 'Select Property', ar: 'اختر العقار', bn: 'সম্পত্তি নির্বাচন', ur: 'ملکیت منتخب کریں' },
  tenantProfile: { en: 'Tenant Profile', ar: 'ملف المستأجر', bn: 'ভাড়াটিয়া প্রোফাইল', ur: 'کرایہ دار کی پروفائل' },
  personalInfo: { en: 'Personal Information', ar: 'المعلومات الشخصية', bn: 'ব্যক্তিগত তথ্য', ur: 'ذاتی معلومات' },
  contactInfo: { en: 'Contact Information', ar: 'معلومات الاتصال', bn: 'যোগাযোগ তথ্য', ur: 'رابطے کی معلومات' },
  leaseInfo: { en: 'Lease Information', ar: 'معلومات العقد', bn: 'লিজ তথ্য', ur: 'اجارے کی معلومات' },
  financialInfo: { en: 'Financial Information', ar: 'المعلومات المالية', bn: 'আর্থিক তথ্য', ur: 'مالی معلومات' },
  months: { en: 'months', ar: 'أشهر', bn: 'মাস', ur: 'مہینے' },
  late: { en: 'Late', ar: 'متأخر', bn: 'বিলম্বিত', ur: 'تاخیر سے' },
  onTime: { en: 'On Time', ar: 'في الوقت', bn: 'সময়মতো', ur: 'بوقت' },
  building: { en: 'Building', ar: 'المبنى', bn: 'ভবন', ur: 'عمارت' },
  autoCalc: { en: 'Auto-calculated (5% of rent)', ar: 'حساب تلقائي (5% من الإيجار)', bn: 'স্বয়ংক্রিয় গণনা (ভাড়ার 5%)', ur: 'خودکار حساب (کرایے کا 5%)' },

  // Rent Collection
  rent: { en: 'Rent', ar: 'الإيجار', bn: 'ভাড়া', ur: 'کرایہ' },
  remaining: { en: 'Remaining', ar: 'المتبقي', bn: 'বাকি', ur: 'باقی' },
  markPaid: { en: 'Mark Paid', ar: 'تسجيل دفع', bn: 'পরিশোধিত চিহ্ন', ur: 'ادا شدہ نشان زد کریں' },
  recordPayment: { en: 'Record Payment', ar: 'تسجيل دفعة', bn: 'পেমেন্ট রেকর্ড করুন', ur: 'ادائیگی درج کریں' },
  amount: { en: 'Amount (AED)', ar: 'المبلغ (درهم)', bn: 'পরিমাণ (দিরহাম)', ur: 'رقم (درہم)' },
  reference: { en: 'Reference / Receipt No.', ar: 'المرجع / رقم الإيصال', bn: 'রেফারেন্স / রশিদ নম্বর', ur: 'حوالہ / رسید نمبر' },
  notes: { en: 'Notes', ar: 'ملاحظات', bn: 'নোট', ur: 'نوٹ' },
  confirmPayment: { en: 'Confirm Payment', ar: 'تأكيد الدفع', bn: 'পেমেন্ট নিশ্চিত করুন', ur: 'ادائیگی کی توثیق' },
  processingPayment: { en: 'Processing Payment...', ar: 'جاري معالجة الدفع...', bn: 'পেমেন্ট প্রক্রিয়াকরণ হচ্ছে...', ur: 'ادائیگی پروسیسنگ...' },
  savingExpense: { en: 'Saving Expense...', ar: 'جاري حفظ المصروف...', bn: 'ব্যয় সংরক্ষণ হচ্ছে...', ur: 'اخراجات محفوظ ہو رہی ہیں...' },
  cancel: { en: 'Cancel', ar: 'إلغاء', bn: 'বাতিল', ur: 'منسوخ' },
  save: { en: 'Save', ar: 'حفظ', bn: 'সংরক্ষণ', ur: 'محفوظ کریں' },
  all: { en: 'All', ar: 'الكل', bn: 'সব', ur: 'تمام' },
  unpaid: { en: 'Unpaid', ar: 'غير مدفوع', bn: 'অবৈতনিক', ur: 'غیر ادا شدہ' },
  collectionProgress: { en: 'Collection Progress', ar: 'تقدم التحصيل', bn: 'আদায় অগ্রগতি', ur: 'وصولی کی پیش رفت' },
  noTenantsMatchFilter: { en: 'No tenants match the filter', ar: 'لا يوجد مستأجرون مطابقون للفلتر', bn: 'কোনো ভাড়াটিয়া ফিল্টারে মেলেনি', ur: 'فلٹر سے کوئی کرایہ دار مطابق نہیں' },
  sendWhatsAppReminder: { en: 'Send WhatsApp Reminder', ar: 'إرسال تذكير واتساب', bn: 'হোয়াটসঅ্যাপ রিমাইন্ডার পাঠান', ur: 'واٹس ایپ یاد دہانی بھیجیں' },

  // Maintenance
  addTask: { en: 'Add Task', ar: 'إضافة مهمة', bn: 'কাজ যোগ করুন', ur: 'نیا کام شامل کریں' },
  editTask: { en: 'Edit Task', ar: 'تعديل المهمة', bn: 'কাজ সম্পাদনা', ur: 'کام میں ترمیم' },
  pending: { en: 'Pending', ar: 'قيد الانتظار', bn: 'অপেক্ষমাণ', ur: 'زیر انتظار' },
  inProgress: { en: 'In Progress', ar: 'قيد التنفيذ', bn: 'চলমান', ur: 'جاری ہے' },
  completed: { en: 'Completed', ar: 'مكتمل', bn: 'সম্পন্ন', ur: 'مکمل' },
  urgent: { en: 'Urgent', ar: 'عاجل', bn: 'জরুরি', ur: 'فوری' },
  high: { en: 'High', ar: 'مرتفع', bn: 'উচ্চ', ur: 'زیادہ' },
  medium: { en: 'Medium', ar: 'متوسط', bn: 'মাঝারি', ur: 'درمیانہ' },
  low: { en: 'Low', ar: 'منخفض', bn: 'নিম্ন', ur: 'کم' },
  title: { en: 'Title', ar: 'العنوان', bn: 'শিরোনাম', ur: 'عنوان' },
  description: { en: 'Description', ar: 'الوصف', bn: 'বিবরণ', ur: 'تفصیل' },
  priority: { en: 'Priority', ar: 'الأولوية', bn: 'অগ্রাধিকার', ur: 'ترجیح' },
  estimatedCost: { en: 'Estimated Cost (AED)', ar: 'التكلفة المقدرة (درهم)', bn: 'আনুমানিক খরচ (দিরহাম)', ur: 'تخمینی لاگت (درہم)' },
  actualCost: { en: 'Actual Cost (AED)', ar: 'التكلفة الفعلية (درهم)', bn: 'প্রকৃত খরচ (দিরহাম)', ur: 'اصل لاگت (درہم)' },
  vendor: { en: 'Vendor/Technician', ar: 'المورد/الفني', bn: 'বিক্রেতা/প্রযুক্তিবিদ', ur: 'فراہم کنندہ / تکنیکی ماہر' },
  category: { en: 'Category', ar: 'الفئة', bn: 'বিভাগ', ur: 'زمرہ' },
  noTasks: { en: 'No tasks', ar: 'لا مهام', bn: 'কোনো কাজ নেই', ur: 'کوئی کام نہیں' },
  deleteTask: { en: 'Delete this task?', ar: 'حذف هذه المهمة؟', bn: 'এই কাজ মুছে ফেলবেন?', ur: 'کیا یہ کام حذف کریں؟' },
  start: { en: 'Start', ar: 'بدء', bn: 'শুরু', ur: 'شروع کریں' },
  complete: { en: 'Complete', ar: 'إكمال', bn: 'সম্পূর্ণ', ur: 'مکمل کریں' },
  ac: { en: 'AC', ar: 'تكييف', bn: 'এসি', ur: 'ایئر کنڈیشنر' },
  plumbing: { en: 'Plumbing', ar: 'سباكة', bn: 'প্লাম্বিং', ur: 'پلمبنگ' },
  electrical: { en: 'Electrical', ar: 'كهرباء', bn: 'বৈদ্যুতিক', ur: 'بجلی' },
  lockDoor: { en: 'Lock/Door', ar: 'قفل/باب', bn: 'তালা/দরজা', ur: 'تالا / دروازہ' },
  painting: { en: 'Painting', ar: 'دهان', bn: 'রং', ur: 'پینٹنگ' },
  structural: { en: 'Structural', ar: 'هيكلي', bn: 'কাঠামোগত', ur: 'ساختی' },
  other: { en: 'Other', ar: 'أخرى', bn: 'অন্যান্য', ur: 'دیگر' },

  // Expenses
  addExpense: { en: 'Add Expense', ar: 'إضافة مصروف', bn: 'ব্যয় যোগ করুন', ur: 'نیا خراج شامل کریں' },
  editExpense: { en: 'Edit Expense', ar: 'تعديل المصروف', bn: 'ব্যয় সম্পাদনা', ur: 'خراج میں ترمیم' },
  expenseCategory: { en: 'Category', ar: 'الفئة', bn: 'বিভাগ', ur: 'زمرہ' },
  totalExpenses: { en: 'Total Expenses', ar: 'إجمالي المصروفات', bn: 'মোট ব্যয়', ur: 'کل اخراجات' },
  thisMonth: { en: 'This Month', ar: 'هذا الشهر', bn: 'এই মাস', ur: 'اس مہینے' },
  recurring: { en: 'Recurring', ar: 'متكرر', bn: 'পুনরাবৃত্তি', ur: 'بار بار آنے والا' },
  oneTime: { en: 'One-time', ar: 'مرة واحدة', bn: 'এককালীন', ur: 'ایک بار' },
  manpower: { en: 'Manpower/Staff', ar: 'القوى العاملة/الموظفين', bn: 'শ্রমিক/কর্মী', ur: 'انسانی وسائل / عملہ' },
  municipalityFees: { en: 'Municipality Fees', ar: 'رسوم البلدية', bn: 'পৌরসভা ফি', ur: 'بلدیہ فیس' },
  maintenance2: { en: 'Maintenance', ar: 'الصيانة', bn: 'রক্ষণাবেক্ষণ', ur: 'دیکھ بھال' },
  utilities: { en: 'Utilities', ar: 'المرافق', bn: 'ইউটিলিটি', ur: 'سہولیات' },
  leasingCommission: { en: 'Leasing Commission', ar: 'عمولة التأجير', bn: 'লিজিং কমিশন', ur: 'اجارے کا کمیشن' },
  insurance: { en: 'Insurance', ar: 'التأمين', bn: 'বীমা', ur: 'بیمہ' },
  security: { en: 'Security', ar: 'الأمن', bn: 'নিরাপত্তা', ur: 'سیکیورٹی' },
  deleteExpense: { en: 'Delete this expense?', ar: 'حذف هذا المصروف؟', bn: 'এই ব্যয় মুছে ফেলবেন?', ur: 'کیا یہ خراج حذف کریں؟' },

  // Reports (Owner/Admin only)
  monthlyReport: { en: 'Monthly Report', ar: 'التقرير الشهري', bn: 'মাসিক প্রতিবেদন', ur: 'ماہانہ رپورٹ' },
  revenueAnalysis: { en: 'Revenue Analysis', ar: 'تحليل الإيرادات', bn: 'রাজস্ব বিশ্লেষণ', ur: 'آمدنی کا تجزیہ' },
  profitAndLoss: { en: 'Profit & Loss', ar: 'الأرباح والخسائر', bn: 'লাভ ও ক্ষতি', ur: 'منافع اور نقصان' },
  rentalIncome: { en: 'Rental Income', ar: 'دخل الإيجارات', bn: 'ভাড়া আয়', ur: 'کرایے کی آمدنی' },
  otherIncome: { en: 'Other Income', ar: 'دخل آخر', bn: 'অন্যান্য আয়', ur: 'دیگر آمدنی' },
  grossRevenue: { en: 'Gross Revenue', ar: 'الإيرادات الإجمالية', bn: 'সমষ্টিগত রাজস্ব', ur: 'کل آمدنی' },
  netRevenue: { en: 'Net Revenue', ar: 'الإيرادات الصافية', bn: 'নিট রাজস্ব', ur: 'خالص آمدنی' },
  vacancyLoss: { en: 'Vacancy Loss', ar: 'خسارة الشغور', bn: 'শূন্যতা ক্ষতি', ur: 'خالی جگہ کا نقصان' },
  badDebt: { en: 'Bad Debt / Unpaid', ar: 'ديون معدومة / غير مدفوعة', bn: 'খেলাপি ঋণ / অবৈতনিক', ur: 'خراب قرضہ / غیر ادا شدہ' },
  costOfOperations: { en: 'Cost of Operations', ar: 'تكلفة العمليات', bn: 'পরিচালন ব্যয়', ur: 'آپریشن کی لاگت' },
  collectionRate: { en: 'Collection Rate', ar: 'نسبة التحصيل', bn: 'আদায় হার', ur: 'وصولی کی شرح' },

  // Contracts
  contractTracker: { en: 'Contract Tracker', ar: 'متتبع العقود', bn: 'চুক্তি ট্র্যাকার', ur: 'معاہدہ ٹریکر' },
  expiringSoon: { en: 'Expiring Soon', ar: 'ينتهي قريباً', bn: 'শীঘ্রই মেয়াদ শেষ', ur: 'جلد ختم ہو رہا' },
  expired: { en: 'Expired', ar: 'منتهي', bn: 'মেয়াদোত্তীর্ণ', ur: 'ختم شدہ' },
  renewed: { en: 'Renewed', ar: 'مجدّد', bn: 'নবায়নকৃত', ur: 'تجدید شدہ' },
  terminated: { en: 'Terminated', ar: 'ملغى', bn: 'বাতিল', ur: 'ختم شدہ' },
  daysUntilExpiry: { en: 'Days Until Expiry', ar: 'أيام حتى الانتهاء', bn: 'মেয়াদ শেষ পর্যন্ত দিন', ur: 'اختتام تک دن' },
  renewalStatus: { en: 'Renewal Status', ar: 'حالة التجديد', bn: 'নবায়ন অবস্থা', ur: 'تجدید کی صورتحال' },
  newRent: { en: 'New Rent (AED)', ar: 'الإيجار الجديد (درهم)', bn: 'নতুন ভাড়া (দিরহাম)', ur: 'نیا کرایہ (درہم)' },
  noContracts: { en: 'No contracts found', ar: 'لا توجد عقود', bn: 'কোনো চুক্তি পাওয়া যায়নি', ur: 'کوئی معاہدہ نہیں ملا' },

  // Forgot Password
  forgotPassword: { en: 'Forgot Password?', ar: 'نسيت كلمة المرور؟', bn: 'পাসওয়ার্ড ভুলে গেছেন?', ur: 'پاس ورڈ بھول گئے؟' },
  forgotPasswordTitle: { en: 'Reset Your Password', ar: 'إعادة تعيين كلمة المرور', bn: 'পাসওয়ার্ড রিসেট করুন', ur: 'پاس ورڈ ری سیٹ کریں' },
  forgotPasswordDesc: { en: 'Submit a reset request and the system administrator will provide you with new credentials.', ar: 'قدّم طلب إعادة تعيين وسيوفر لك مسؤول النظام بيانات اعتماد جديدة.', bn: 'একটি রিসেট অনুরোধ জমা দিন এবং সিস্টেম প্রশাসক আপনাকে নতুন পরিচয়পত্র দেবেন।', ur: 'ری سیٹ کی درخواست جمع کرائیں اور سسٹم ناظم آپ کو نئی اسناد فراہم کرے گا۔' },
  sendResetRequest: { en: 'Send Reset Request', ar: 'إرسال طلب إعادة التعيين', bn: 'রিসেট অনুরোধ পাঠান', ur: 'ری سیٹ کی درخواست بھیجیں' },
  resetRequestSent: { en: 'Reset request sent! The administrator will contact you with new credentials.', ar: 'تم إرسال طلب إعادة التعيين! سيتواصل معك المسؤول ببيانات اعتماد جديدة.', bn: 'রিসেট অনুরোধ পাঠানো হয়েছে! প্রশাসক নতুন পরিচয়পত্র দিয়ে আপনার সাথে যোগাযোগ করবেন।', ur: 'ری سیٹ کی درخواست بھیج دی گئی! ناظم آپ کو نئی اسناد کے ساتھ رابطہ کرے گا۔' },
  backToLogin: { en: 'Back to Login', ar: 'العودة لتسجيل الدخول', bn: 'লগইনে ফিরুন', ur: 'لاگ ان پر واپس' },
  yourEmail: { en: 'Your Email Address', ar: 'بريدك الإلكتروني', bn: 'আপনার ইমেইল ঠিকানা', ur: 'آپ کا ای میل ایڈریس' },
  resetSubject: { en: 'Password Reset Request - Al Reef Al Madeena Dashboard', ar: 'طلب إعادة تعيين كلمة المرور - لوحة الريف المدينة', bn: 'পাসওয়ার্ড রিসেট অনুরোধ - আল রিফ আল মাদিনা ড্যাশবোর্ড', ur: 'پاس ورڈ ری سیٹ کی درخواست - الريف المدینہ ڈیش بورڈ' },
  resetEmailBody: { en: 'Password Reset Request', ar: 'طلب إعادة تعيين كلمة المرور', bn: 'পাসওয়ার্ড রিসেট অনুরোধ', ur: 'پاس ورڈ ری سیٹ کی درخواست' },

  // User Management
  userManagement: { en: 'User Management', ar: 'إدارة المستخدمين', bn: 'ব্যবহারকারী ব্যবস্থাপনা', ur: 'صارفین کا انتظام' },
  settings: { en: 'Settings', ar: 'الإعدادات', bn: 'সেটিংস', ur: 'ترتیبات' },
  addNewUser: { en: 'Add New User', ar: 'إضافة مستخدم جديد', bn: 'নতুন ব্যবহারকারী যোগ করুন', ur: 'نیا صارف شامل کریں' },
  editUser: { en: 'Edit User', ar: 'تعديل المستخدم', bn: 'ব্যবহারকারী সম্পাদনা', ur: 'صارف میں ترمیم' },
  deleteUser: { en: 'Delete User', ar: 'حذف المستخدم', bn: 'ব্যবহারকারী মুছুন', ur: 'صارف حذف کریں' },
  deleteConfirm: { en: 'Are you sure you want to delete this user? This action cannot be undone.', ar: 'هل أنت متأكد من حذف هذا المستخدم؟ لا يمكن التراجع عن هذا الإجراء.', bn: 'আপনি কি নিশ্চিত যে আপনি এই ব্যবহারকারী মুছতে চান? এই কাজটি পূর্বাবস্থায় ফেরানো যাবে না।', ur: 'کیا آپ واقعی اس صارف کو حذف کرنا چاہتے ہیں؟ یہ عمل واپس نہیں کیا جا سکتا۔' },
  username: { en: 'Username / Email', ar: 'اسم المستخدم / البريد الإلكتروني', bn: 'ব্যবহারকারীর নাম / ইমেইল', ur: 'صارف نام / ای میل' },
  newPassword: { en: 'New Password', ar: 'كلمة المرور الجديدة', bn: 'নতুন পাসওয়ার্ড', ur: 'نیا پاس ورڈ' },
  confirmPassword: { en: 'Confirm Password', ar: 'تأكيد كلمة المرور', bn: 'পাসওয়ার্ড নিশ্চিত করুন', ur: 'پاس ورڈ کی توثیق' },
  resetPassword: { en: 'Reset Password', ar: 'إعادة تعيين كلمة المرور', bn: 'পাসওয়ার্ড রিসেট করুন', ur: 'پاس ورڈ ری سیٹ کریں' },
  generatePassword: { en: 'Generate Password', ar: 'إنشاء كلمة مرور', bn: 'পাসওয়ার্ড তৈরি করুন', ur: 'پاس ورڈ بنائیں' },
  passwordGenerated: { en: 'New password generated! Make sure to share it securely with the user.', ar: 'تم إنشاء كلمة مرور جديدة! تأكد من مشاركتها بأمان مع المستخدم.', bn: 'নতুন পাসওয়ার্ড তৈরি হয়েছে! ব্যবহারকারীর সাথে নিরাপদে শেয়ার করতে ভুলবেন না।', ur: 'نیا پاس ورڈ بن گیا ہے! صارف کے ساتھ محفوظ طریقے سے شیئر کرنا یقینی بنائیں۔' },
  roleName: { en: 'Full Name', ar: 'الاسم الكامل', bn: 'পুরো নাম', ur: 'پورا نام' },
  roleNameAr: { en: 'Arabic Name', ar: 'الاسم بالعربية', bn: 'আরবি নاম', ur: 'عربی نام' },
  roleNameBn: { en: 'Bengali Name', ar: 'الاسم بالبنغالية', bn: 'বাংলা নাম', ur: 'بنگالی نام' },
  roleNameUr: { en: 'Urdu Name', ar: 'الاسم بالأردية', bn: 'উর্দু নাম', ur: 'اردو نام' },
  role: { en: 'Role', ar: 'الدور', bn: 'ভূমিকা', ur: 'کردار' },
  usersCount: { en: 'users', ar: 'مستخدمين', bn: 'জন ব্যবহারকারী', ur: 'صارفین' },
  passwordCopied: { en: 'Password copied to clipboard!', ar: 'تم نسخ كلمة المرور!', bn: 'পাসওয়ার্ড ক্লিপবোর্ডে কপি হয়েছে!', ur: 'پاس ورڈ کلپ بورڈ پر کاپی ہو گیا!' },
  copyPassword: { en: 'Copy Password', ar: 'نسخ كلمة المرور', bn: 'পাসওয়ার্ড কপি করুন', ur: 'پاس ورڈ کاپی کریں' },
  showPassword: { en: 'Show Password', ar: 'إظهار كلمة المرور', bn: 'পাসওয়ার্ড দেখান', ur: 'پاس ورڈ دکھائیں' },
  hidePassword: { en: 'Hide Password', ar: 'إخفاء كلمة المرور', bn: 'পাসওয়ার্ড লুকান', ur: 'پاس ورڈ چھپائیں' },
  ownerCannotBeDeleted: { en: 'Owner account cannot be deleted', ar: 'لا يمكن حذف حساب المالك', bn: 'মালিকের অ্যাকাউন্ট মুছে ফেলা যাবে না', ur: 'مالک کا اکاؤنٹ حذف نہیں کیا جا سکتا' },
  emailAlreadyExists: { en: 'A user with this email already exists', ar: 'يوجد مستخدم بهذا البريد الإلكتروني بالفعل', bn: 'এই ইমেইল দিয়ে একজন ব্যবহারকারী ইতিমধ্যেই আছেন', ur: 'اس ای میل کے ساتھ صارف پہلے سے موجود ہے' },
  credentialsInfo: { en: 'User Credentials', ar: 'بيانات اعتماد المستخدم', bn: 'ব্যবহারকারীর পরিচয়পত্র', ur: 'صارف کی اسناد' },
  shareCredentials: { en: 'Share these credentials with the user securely. Passwords are stored locally and cannot be recovered if lost — only reset.', ar: 'شارك بيانات الاعتماد هذه مع المستخدم بشكل آمن. يتم تخزين كلمات المرور محليًا ولا يمكن استردادها إذا فُقدت — فقط إعادة تعيين.', bn: 'এই পরিচয়পত্রগুলো ব্যবহারকারীর সাথে নিরাপদে শেয়ার করুন। পাসওয়ার্ড স্থানীয়ভাবে সংরক্ষিত এবং হারিয়ে গেলে পুনরুদ্ধার করা যাবে না — শুধুমাত্র রিসেট করা যাবে।', ur: 'یہ اسناد صارف کے ساتھ محفوظ طریقے سے شیئر کریں۔ پاس ورڈ مقامی طور پر محفوظ ہیں اور کھو جانے کی صورت میں بازیافت نہیں کیے جا سکتے — صرف ری سیٹ کیا جا سکتا ہے۔' },

  // General
  actions: { en: 'Actions', ar: 'إجراءات', bn: 'কার্যক্রম', ur: 'اقدامات' },
  select: { en: 'Select', ar: 'اختر', bn: 'নির্বাচন', ur: 'منتخب کریں' },
  none: { en: 'None', ar: 'بدون', bn: 'কোনোটিই নয়', ur: 'کوئی نہیں' },
  language: { en: 'Language', ar: 'اللغة', bn: 'ভাষা', ur: 'زبان' },
  lastPayment: { en: 'Last Payment', ar: 'آخر دفعة', bn: 'শেষ পেমেন্ট', ur: 'آخری ادائیگی' },
  propertyUnit: { en: 'Property / Unit', ar: 'العقار / الوحدة', bn: 'সম্পত্তি / ইউনিট', ur: 'ملکیت / یونٹ' },
  loading: { en: 'Loading...', ar: 'جارٍ التحميل...', bn: 'লোড হচ্ছে...', ur: 'لوڈ ہو رہا ہے...' },
  noResults: { en: 'No results found', ar: 'لم يتم العثور على نتائج', bn: 'কোনো ফলাফল পাওয়া যায়নি', ur: 'کوئی نتیجہ نہیں ملا' },
  vacateUnit: { en: 'Vacate Unit', ar: 'إخلاء الوحدة', bn: 'ইউনিট খালি করুন', ur: 'یونٹ خالی کریں' },
  addBuilding: { en: 'Add Building', ar: 'إضافة مبنى', bn: 'ভবন যোগ করুন', ur: 'عمارت شامل کریں' },
  propertySoldInfo: { en: 'When a building is sold or removed, it can be archived. Data is preserved for historical reports.', ar: 'عند بيع أو إزالة مبنى، يمكن أرشفته. يتم حفظ البيانات للتقارير التاريخية.', bn: 'কোনো ভবন বিক্রি বা অপসারিত হলে, এটি সংরক্ষণাগারে রাখা যায়। ঐতিহাসিক প্রতিবেদনের জন্য ডেটা সংরক্ষিত থাকে।', ur: 'جب عمارت فروخت یا ہٹا دی جاتی ہے، تو اسے محفوظ کیا جا سکتا ہے۔ تاریخی رپورٹس کے لیے ڈیٹا برقرار رہتا ہے۔' },
  accessDenied: { en: 'Access Denied - Financial data is only visible to Owner/Admin', ar: 'تم رفض الوصول - البيانات المالية مرئية فقط للمالك/المدير', bn: 'অ্যাক্সেস অস্বীকৃত - আর্থিক তথ্য শুধুমাত্র মালিক/প্রশাসকের দৃশ্যমান', ur: 'رسائی مسترد - مالی معلومات صرف مالک اور ناظم کو دکھائی دیتی ہے' },
  adminDataProtected: { en: 'User Management is only accessible by the System Administrator. Please contact the Administrator for user-related changes.', ar: 'إدارة المستخدمين يمكن الوصول إليها فقط من قبل مسؤول النظام. يرجى التواصل مع المسؤول للتغييرات المتعلقة بالمستخدمين.', bn: 'ব্যবহারকারী ব্যবস্থাপনা শুধুমাত্র সিস্টেম প্রশাসক অ্যাক্সেস করতে পারেন। ব্যবহারকারী সম্পর্কিত পরিবর্তনের জন্য অনুগ্রহ করে প্রশাসকের সাথে যোগাযোগ করুন।', ur: 'صارفین کا انتظام صرف سسٹم ناظم تک رسائی کے لیے دستیاب ہے۔ صارف سے متعلق تبدیلیوں کے لیے براہ کرم ناظم سے رابطہ کریں۔' },
  financialDataProtected: { en: 'Financial data is protected and only visible to the business owner and admin.', ar: 'البيانات المالية محمية ومرئية فقط لصاحب العمل والمدير.', bn: 'আর্থিক তথ্য সুরক্ষিত এবং শুধুমাত্র ব্যবসার মালিক এবং প্রশাসকের দৃশ্যমান।', ur: 'مالی معلومات محفوظ ہیں اور صرف کاروبار کے مالک اور ناظم کو دکھائی دیتی ہیں۔' },

  // Additional keys for Maintenance, Expenses, Reports
  invoiceNumber: { en: 'Invoice Number', ar: 'رقم الفاتورة', bn: 'চালান নম্বর', ur: 'انوائس نمبر' },
  searchInvoice: { en: 'Search Invoice #', ar: 'بحث رقم الفاتورة', bn: 'চালান নম্বর খুঁজুন', ur: 'انوائس نمبر تلاش کریں' },
  searchTenant: { en: 'Search Tenant / Property', ar: 'بحث المستأجر / العقار', bn: 'ভাড়াটিয়া / সম্পত্তি খুঁজুন', ur: 'کرایہ دار / ملکیت تلاش کریں' },
  searchTenantName: { en: 'Search Tenant Name', ar: 'بحث اسم المستأجر', bn: 'ভাড়াটিয়ার নাম খুঁজুন', ur: 'کرایہ دار کا نام تلاش کریں' },
  totalCashPayments: { en: 'Total Cash Payments', ar: 'إجمالي المدفوعات النقدية', bn: 'মোট নগদ পেমেন্ট', ur: 'کل نقد ادائیگیاں' },
  totalBankTransferPayments: { en: 'Total Bank Transfer', ar: 'إجمالي التحويل البنكي', bn: 'মোট ব্যাংক ট্রান্সফার', ur: 'کل بینک ٹرانسفر' },
  totalChequePayments: { en: 'Total Cheque Payments', ar: 'إجمالي مدفوعات الشيكات', bn: 'মোট চেক পেমেন্ট', ur: 'کل چیک ادائیگیاں' },
  paymentMethodSummary: { en: 'Payment Method Summary', ar: 'ملخص طرق الدفع', bn: 'পেমেন্ট পদ্ধতির সারাংশ', ur: 'ادائیگی کے طریقے کا خلاصہ' },
  noInvoiceFound: { en: 'No invoice found', ar: 'لم يتم العثور على فاتورة', bn: 'কোনো চালান পাওয়া যায়নি', ur: 'کوئی انوائس نہیں ملا' },
  tryDifferentSearch: { en: 'Try a different invoice number (e.g. INV-202606-101)', ar: 'جرّب رقم فاتورة مختلف (مثال: INV-202606-101)', bn: 'ভিন্ন চালান নম্বর চেষ্টা করুন (যেমন: INV-202606-101)', ur: 'مختلف انوائس نمبر آزمائیں (مثلاً: INV-202606-101)' },
  printReport: { en: 'Print Report', ar: 'طباعة التقرير', bn: 'প্রতিবেদন মুদ্রণ', ur: 'رپورٹ پرنٹ کریں' },
  thisMonthTotal: { en: 'This Month Total', ar: 'إجمالي هذا الشهر', bn: 'এই মাসের মোট', ur: 'اس مہینے کا کل' },
  expenseDetails: { en: 'Expense Details', ar: 'تفاصيل المصروفات', bn: 'ব্যয়ের বিস্তারিত', ur: 'اخراجات کی تفصیلات' },
  noExpensesMonth: { en: 'No expenses this month', ar: 'لا مصروفات هذا الشهر', bn: 'এই মাসে কোনো ব্যয় নেই', ur: 'اس مہینے کوئی اخراجات نہیں' },
  revenue: { en: 'Revenue', ar: 'الإيرادات', bn: 'রাজস্ব', ur: 'آمدنی' },
  profitOrLoss: { en: 'Profit / Loss', ar: 'الربح / الخسارة', bn: 'লাভ / ক্ষতি', ur: 'منافع / نقصان' },
  sixMonthTrend: { en: '6-Month Trend', ar: 'اتجاه 6 أشهر', bn: '6-মাস প্রবণতা', ur: '6 ماہ کا رجحان' },
  date: { en: 'Date', ar: 'التاريخ', bn: 'তারিখ', ur: 'تاریخ' },
  noExpensesFound: { en: 'No expenses found', ar: 'لم يتم العثور على مصروفات', bn: 'কোনো ব্যয় পাওয়া যায়নি', ur: 'کوئی اخراجات نہیں ملا' },
  expenseBreakdown: { en: 'Expense Breakdown', ar: 'توزيع المصروفات', bn: 'ব্যয় বিশ্লেষণ', ur: 'اخراجات کی تقسیم' },
  monthlyTrend: { en: 'Monthly Trend', ar: 'الاتجاه الشهري', bn: 'মাসিক প্রবণতা', ur: 'ماہانہ رجحان' },
  tasksCount: { en: 'tasks', ar: 'مهام', bn: 'টি কাজ', ur: 'کام' },
  expensesCount: { en: 'expenses tracked', ar: 'مصروفات مسجلة', bn: 'টি ব্যয় ট্র্যাক করা', ur: 'درج اخراجات' },
  property: { en: 'Property', ar: 'العقار', bn: 'সম্পত্তি', ur: 'ملکیت' },
  totalRevenue: { en: 'Total Revenue', ar: 'إجمالي الإيرادات', bn: 'মোট রাজস্ব', ur: 'کل آمدنی' },
  operatingExpenses: { en: 'Operating Expenses', ar: 'المصروفات التشغيلية', bn: 'পরিচালন ব্যয়', ur: 'آپریٹنگ اخراجات' },
  grossProfit: { en: 'Gross Profit', ar: 'الربح الإجمالي', bn: 'সমষ্টিগত মুনাফা', ur: 'کل منافع' },
  netIncome: { en: 'Net Income', ar: 'صافي الدخل', bn: 'নিট আয়', ur: 'خالص آمدنی' },
  salary: { en: 'Salary / Wages', ar: 'الرواتب / الأجور', bn: 'বেতন / মজুরি', ur: 'تنخواہ / اجرت' },
  yes: { en: 'Yes', ar: 'نعم', bn: 'হ্যাঁ', ur: 'ہاں' },
  no: { en: 'No', ar: 'لا', bn: 'না', ur: 'نہیں' },

  // Payment Date
  paymentDate: { en: 'Payment Date', ar: 'تاريخ الدفع', bn: 'পেমেন্ট তারিখ', ur: 'ادائیگی کی تاریخ' },

  // Rent Adjustments
  rentAdjustments: { en: 'Rent Adjustments', ar: 'تعديلات الإيجار', bn: 'ভাড়া সমন্বয়', ur: 'کرایہ کی ایڈجسٹمنٹ' },
  adjustments: { en: 'Adjustments', ar: 'التعديلات', bn: 'সমন্বয়', ur: 'ایڈجسٹمنٹ' },
  createAdjustment: { en: 'Add Adjustment', ar: 'إضافة تعديل', bn: 'সমন্বয় যোগ করুন', ur: 'ایڈجسٹمنٹ شامل کریں' },
  editAdjustment: { en: 'Edit Adjustment', ar: 'تعديل التسوية', bn: 'সমন্বয় সম্পাদনা', ur: 'ایڈجسٹمنٹ میں ترمیم' },
  cancelAdjustment: { en: 'Cancel Adjustment', ar: 'إلغاء التعديل', bn: 'সমন্বয় বাতিল', ur: 'ایڈجسٹمنٹ منسوخ کریں' },
  adjustmentType: { en: 'Adjustment Type', ar: 'نوع التعديل', bn: 'সমন্বয়ের ধরন', ur: 'ایڈجسٹمنٹ کی قسم' },
  adjustmentAmount: { en: 'Adjustment Amount (AED)', ar: 'مبلغ التعديل (درهم)', bn: 'সমন্বয় পরিমাণ (দিরহাম)', ur: 'ایڈجسٹمنٹ کی رقم (درہم)' },
  adjustmentReason: { en: 'Reason', ar: 'السبب', bn: 'কারণ', ur: 'وجہ' },
  maintenance_delay: { en: 'Maintenance Delay', ar: 'تأخير الصيانة', bn: 'রক্ষণাবেক্ষণ বিলম্ব', ur: 'دیكھ بھال میں تاخیر' },
  flood_damage: { en: 'Flood Damage', ar: 'أضرار الفيضانات', bn: 'বন্যা ক্ষতি', ur: 'سیل کا نقصان' },
  utility_failure: { en: 'Utility Failure', ar: 'تعطل المرافق', bn: 'ইউটিলিটি বিভ্রাট', ur: 'سہولیات کی ناکامی' },
  goodwill: { en: 'Goodwill', ar: 'حسن نية', bn: 'সদিচ্ছা', ur: 'خیر خواہی' },
  contract_amendment: { en: 'Contract Amendment', ar: 'تعديل العقد', bn: 'চুক্তি সংশোধন', ur: 'معاہدے میں ترمیم' },
  owner_discount: { en: 'Owner Discount', ar: 'خصم المالك', bn: 'মালিক ছাড়', ur: 'مالک کی رعایت' },
  effectiveMonth: { en: 'Effective Month', ar: 'شهر السريان', bn: 'কার্যকর মাস', ur: 'نافذ مہینہ' },
  effectiveYear: { en: 'Effective Year', ar: 'سنة السريان', bn: 'কার্যকর বছর', ur: 'نافذ سال' },
  durationMonths: { en: 'Duration (months)', ar: 'المدة (أشهر)', bn: 'মেয়াদ (মাস)', ur: 'مدت (مہینے)' },
  cashCollected: { en: 'Cash Collected', ar: 'النقد المحصّل', bn: 'নগদ আদায়', ur: 'نقد وصول شدہ' },
  adjustmentsTotal: { en: 'Adjustments Total', ar: 'إجمالي التعديلات', bn: 'সমন্বয় মোট', ur: 'ایڈجسٹمنٹ کا کل' },
  originalRent: { en: 'Original Rent', ar: 'الإيجار الأصلي', bn: 'মূল ভাড়া', ur: 'اصل کرایہ' },
  paymentsReceived: { en: 'Payments Received', ar: 'المدفوعات المستلمة', bn: 'প্রাপ্ত পেমেন্ট', ur: 'وصول شدہ ادائیگیاں' },
  approvedAdjustments: { en: 'Approved Adjustments', ar: 'التعديلات المعتمدة', bn: 'অনুমোদিত সমন্বয়', ur: 'منظور شدہ ایڈجسٹمنٹ' },
  remainingBalance: { en: 'Remaining Balance', ar: 'الرصيد المتبقي', bn: 'বাকি ব্যালেন্স', ur: 'باقی بیلنس' },
  availableCredit: { en: 'Available Credit', ar: 'الرصيد الدائن المتاح', bn: 'উপলব্ধ ক্রেডিট', ur: 'دستیاب کریڈٹ' },
  accountSettled: { en: 'Settled', ar: 'م settled', bn: 'নিষ্পন্ন', ur: 'تصفیہ شدہ' },
  totalEffectiveCollection: { en: 'Total Effective Collection', ar: 'إجمالي التحصيل الفعلي', bn: 'মোট কার্যকর আদায়', ur: 'کل موثر وصولی' },
  adjustmentCancelled: { en: 'Adjustment cancelled successfully', ar: 'تم إلغاء التعديل بنجاح', bn: 'সমন্বয় সফলভাবে বাতিল হয়েছে', ur: 'ایڈجسٹمنٹ کامیابی سے منسوخ ہو گیا' },
  cancellationReason: { en: 'Cancellation Reason', ar: 'سبب الإلغاء', bn: 'বাতিলের কারণ', ur: 'منسوخ کرنے کی وجہ' },
  adjustmentsTab: { en: 'Adjustments', ar: 'التعديلات', bn: 'সমন্বয়', ur: 'ترتیبات' },
  adjustmentTypeFilter: { en: 'Adjustment Type', ar: 'نوع التعديل', bn: 'সমন্বয়ের ধরন', ur: 'ترتیبات کی قسم' },
  allAdjustmentTypes: { en: 'All Types', ar: 'جميع الأنواع', bn: 'সব ধরন', ur: 'تمام اقسام' },
  reservationPaymentDate: { en: 'Payment Date', ar: 'تاريخ الدفع', bn: 'পেমেন্ট তারিখ', ur: 'ادائیگی کی تاریخ' },
  emiratesIdNumber: { en: 'Emirates ID', ar: 'رقم الهوية الإماراتية', bn: 'আমিরাতি আইডি', ur: 'اماراتی شناختی کارڈ' },
  createdBy: { en: 'Created By', ar: 'أنشئ بواسطة', bn: 'তৈরি করেছেন', ur: 'بنایا گیا بذریعہ' },
  createdDate: { en: 'Created Date', ar: 'تاريخ الإنشاء', bn: 'তৈরির তারিখ', ur: 'تخلیق کی تاریخ' },
  approved: { en: 'Approved', ar: 'معتمد', bn: 'অনুমোদিত', ur: 'منظور' },
  allProperties: { en: 'All Properties', ar: 'جميع العقارات', bn: 'সব সম্পত্তি', ur: 'تمام املاک' },
  duration: { en: 'Duration', ar: 'المدة', bn: 'মেয়াদ', ur: 'مدت' },
  month: { en: 'mo', ar: 'شهر', bn: 'মাস', ur: 'ماہ' },

  // WhatsApp Language Selection
  selectReminderLanguage: { en: 'Select Reminder Language', ar: 'اختر لغة التذكير', bn: 'রিমাইন্ডারের ভাষা নির্বাচন করুন', ur: 'یاد دہانی کی زبان منتخب کریں' },
  reminderLanguageDesc: { en: 'Choose the language for the WhatsApp reminder message', ar: 'اختر لغة رسالة التذكير عبر واتساب', bn: 'হোয়াটসঅ্যাপ রিমাইন্ডার বার্তার জন্য ভাষা নির্বাচন করুন', ur: 'واٹس ایپ یاد دہانی پیغام کے لیے زبان منتخب کریں' },
  sendArabic: { en: 'Arabic (العربية)', ar: 'العربية', bn: 'আরবি (العربية)', ur: 'عربی (العربية)' },
  sendEnglish: { en: 'English', ar: 'الإنجليزية', bn: 'ইংরেজি', ur: 'انگریزی' },
  sendUrdu: { en: 'Urdu (اردو)', ar: 'الأردية (اردو)', bn: 'উর্দু (اردو)', ur: 'اردو' },
  sendHindi: { en: 'Hindi (हिन्दी)', ar: 'الهندية (हिन्दी)', bn: 'হিন্দি (हिन्दी)', ur: 'ہندی (हिन्दी)' },
  sendBengali: { en: 'Bengali (বাংলা)', ar: 'البنغالية (বাংলা)', bn: 'বাংলা', ur: 'بنگالی (বাংলা)' },

  // Export
  exportData: { en: 'Export Data', ar: 'تصدير البيانات', bn: 'ডেটা রপ্তানি', ur: 'ڈیٹا برآمد کریں' },
  exportSuccess: { en: 'Data exported successfully!', ar: 'تم تصدير البيانات بنجاح!', bn: 'ডেটা সফলভাবে রপ্তানি হয়েছে!', ur: 'ڈیٹا کامیابی سے برآمد ہو گیا!' },
  exportFailed: { en: 'Export failed. Please try again.', ar: 'فشل التصدير. يرجى المحاولة مرة أخرى.', bn: 'রপ্তানি ব্যর্থ। আবার চেষ্টা করুন।', ur: 'برآمد ناکام ہوا۔ دوبارہ کوشش کریں۔' },

  // Bill / Invoice (Task 1)
  viewBill: { en: 'View Bill', ar: 'عرض الفاتورة', bn: 'বিল দেখুন', ur: 'بل دیکھیں' },
  downloadBill: { en: 'Download PDF', ar: 'تحميل PDF', bn: 'PDF ডাউনলোড', ur: 'PDF ڈاؤنلوڈ' },
  invoice: { en: 'Invoice', ar: 'فاتورة', bn: 'চালান', ur: 'انوائس' },
  billTo: { en: 'Bill To', ar: 'فاتورة إلى', bn: 'বিল প্রাপক', ur: 'بل بنام' },
  subtotal: { en: 'Subtotal', ar: 'المجموع الفرعي', bn: 'উপমোট', ur: 'ذیلی مجموع' },
  totalDue: { en: 'Total Due', ar: 'الإجمالي المستحق', bn: 'মোট বকেয়া', ur: 'کل واجب الادا' },
  paymentStatus: { en: 'Payment Status', ar: 'حالة الدفع', bn: 'পেমেন্ট স্ট্যাটাস', ur: 'ادائیگی کی حالت' },
  dueDate: { en: 'Due Date', ar: 'تاريخ الاستحقاق', bn: 'দেয়ার তারিখ', ur: 'ادائیگی کی تاریخ' },
  invoiceDate: { en: 'Invoice Date', ar: 'تاريخ الفاتورة', bn: 'চালানের তারিখ', ur: 'انوائس کی تاریخ' },
  taxId: { en: 'Tax Registration No.', ar: 'الرقم الضريبي', bn: 'কর নিবন্ধন নম্বর', ur: 'ٹیکس رجسٹریشن نمبر' },
  commercialLicense: { en: 'Commercial License', ar: 'الرخصة التجارية', bn: 'বাণিজ্যিক লাইসেন্স', ur: 'کمرشل لائسنس' },

  // PDF Report Export (Task 4)
  exportPDF: { en: 'Export PDF', ar: 'تصدير PDF', bn: 'PDF রপ্তানি', ur: 'PDF ایکسپورٹ' },
  financialSummary: { en: 'Financial Summary', ar: 'ملخص مالي', bn: 'আর্থিক সারাংশ', ur: 'مالی خلاصہ' },
  generatedOn: { en: 'Generated on', ar: 'تم الإنشاء في', bn: 'তৈরির তারিখ', ur: 'بنایا گیا' },

  // Bill Invoice - Municipality Fee Toggle
  includeMunicipalityFee: { en: 'Include Municipality Fee', ar: 'تضمين رسوم البلدية', bn: 'পৌরসভা ফি অন্তর্ভুক্ত করুন', ur: 'بلدیہ فیس شامل کریں' },

  // Daily Expenses Report
  dailyReport: { en: 'Daily Report', ar: 'التقرير اليومي', bn: 'দৈনিক প্রতিবেদন', ur: 'روزانہ رپورٹ' },
  dailyExpensesReport: { en: 'Daily Expenses Report', ar: 'تقرير المصروفات اليومي', bn: 'দৈনিক ব্যয় প্রতিবেদন', ur: 'روزانہ اخراجات کی رپورٹ' },
  income: { en: 'Income (Credits)', ar: 'الدخل (ائتمانات)', bn: 'আয় (ক্রেডিট)', ur: 'آمدنی (کریڈٹ)' },
  credits: { en: 'Credits', ar: 'ائتمانات', bn: 'ক্রেডিট', ur: 'کریڈٹ' },
  debits: { en: 'Expenses (Debits)', ar: 'المصروفات (مديونيات)', bn: 'ব্যয় (ডেবিট)', ur: 'اخراجات (ڈیبٹ)' },
  netProfitLoss: { en: 'Net Profit / Loss', ar: 'صافي الربح / الخسارة', bn: 'নিট লাভ / ক্ষতি', ur: 'خالص منافع / نقصان' },
  rentCollected: { en: 'Rent Collected', ar: 'الإيجار المحصّل', bn: 'আদায়কৃত ভাড়া', ur: 'وصول شدہ کرایہ' },
  noTransactionsToday: { en: 'No transactions found for this date', ar: 'لا توجد معاملات في هذا التاريخ', bn: 'এই তারিখে কোনো লেনদেন পাওয়া যায়নি', ur: 'اس تاریخ پر کوئی لین دین نہیں ملا' },
  tenantPayment: { en: 'Tenant Payment', ar: 'دفعة المستأجر', bn: 'ভাড়াটিয়া পেমেন্ট', ur: 'کرایہ دار کی ادائیگی' },
  paymentTime: { en: 'Time', ar: 'الوقت', bn: 'সময়', ur: 'وقت' },
  fuel: { en: 'Fuel', ar: 'وقود', bn: 'জ্বালানি', ur: 'ایندهن' },
  waterSupply: { en: 'Water Supply', ar: 'إمدادات المياه', bn: 'পানি সরবরাহ', ur: 'پانی کی فراہمی' },
  operationalExpense: { en: 'Operational Expense', ar: 'مصروفات تشغيلية', bn: 'পরিচালন ব্যয়', ur: 'آپریشنل اخراجات' },
  incomeVsExpenses: { en: 'Income vs Expenses', ar: 'الدخل مقابل المصروفات', bn: 'আয় বনাম ব্যয়', ur: 'آمدنی بمقابلہ اخراجات' },
  expenseDistribution: { en: 'Expense Distribution', ar: 'توزيع المصروفات', bn: 'ব্যয় বণ্টন', ur: 'اخراجات کی تقسیم' },
  selectDate: { en: 'Select Date', ar: 'اختر التاريخ', bn: 'তারিখ নির্বাচন করুন', ur: 'تاریخ منتخب کریں' },
  today: { en: 'Today', ar: 'اليوم', bn: 'আজ', ur: 'آج' },
  yesterday: { en: 'Yesterday', ar: 'أمس', bn: 'গতকাল', ur: 'کل' },
  dailyView: { en: 'Daily', ar: 'يومي', bn: 'দৈনিক', ur: 'روزانہ' },
  monthlyView: { en: 'Monthly', ar: 'شهري', bn: 'মাসিক', ur: 'ماہانہ' },
  previousDay: { en: 'Previous Day', ar: 'اليوم السابق', bn: 'পূর্বের দিন', ur: 'پچھلا دن' },
  nextDay: { en: 'Next Day', ar: 'اليوم التالي', bn: 'পরের দিন', ur: 'اگلا دن' },
  dayTotal: { en: 'Day Total', ar: 'إجمالي اليوم', bn: 'দিনের মোট', ur: 'دن کا کل' },
  monthTotal: { en: 'Month Total', ar: 'إجمالي الشهر', bn: 'মাসের মোট', ur: 'مہینہ کا کل' },
  noExpensesDay: { en: 'No expenses for this day', ar: 'لا مصروفات في هذا اليوم', bn: 'এই দিনে কোনো ব্যয় নেই', ur: 'اس دن کوئی اخراجات نہیں' },
  noExpensesMonth2: { en: 'No expenses for this month', ar: 'لا مصروفات في هذا الشهر', bn: 'এই মাসে কোনো ব্যয় নেই', ur: 'اس مہینے کوئی اخراجات نہیں' },
  cashInflow: { en: 'Cash Inflow', ar: 'التدفق النقدي الداخل', bn: 'নগদ অন্তর্প্রবাহ', ur: 'نقد داخل' },
  cashOutflow: { en: 'Cash Outflow', ar: 'التدفق النقدي الخارج', bn: 'নগদ বহির্প্রবাহ', ur: 'نقد خارج' },
  dailySummary: { en: 'Daily Summary', ar: 'ملخص يومي', bn: 'দৈনিক সারাংশ', ur: 'روزانہ خلاصہ' },
  totalIncome: { en: 'Total Income', ar: 'إجمالي الدخل', bn: 'মোট আয়', ur: 'کل آمدنی' },
  totalExpense: { en: 'Total Expense', ar: 'إجمالي المصروفات', bn: 'মোট ব্যয়', ur: 'کل خراج' },

  // Reservations
  reservation: { en: 'Reservation', ar: 'حجز', bn: 'রিজার্ভেশন', ur: 'ریزرویشن' },
  reservations: { en: 'Reservations', ar: 'الحجوزات', bn: 'রিজার্ভেশন', ur: 'ریزرویشنز' },
  addReservation: { en: 'Add Reservation', ar: 'إضافة حجز', bn: 'রিজার্ভেশন যোগ করুন', ur: 'ریزرویشن شامل کریں' },
  editReservation: { en: 'Edit Reservation', ar: 'تعديل الحجز', bn: 'রিজার্ভেশন সম্পাদনা', ur: 'ریزرویشن میں ترمیم' },
  searchReservations: { en: 'Search reservations...', ar: 'بحث الحجوزات...', bn: 'রিজার্ভেশন খুঁজুন...', ur: 'ریزرویشن تلاش کریں...' },
  prospectName: { en: 'Prospect Name', ar: 'اسم المستفيد', bn: 'প্রস্পেক্টের নাম', ur: 'مستفید کا نام' },
  reservationDate: { en: 'Reservation Date', ar: 'تاريخ الحجز', bn: 'রিজার্ভেশন তারিখ', ur: 'ریزرویشن کی تاریخ' },
  expectedMoveInDate: { en: 'Expected Move-in Date', ar: 'تاريخ الدخول المتوقعة', bn: 'প্রত্যাশিত প্রবেশ তারিখ', ur: 'متوقع داخلے کی تاریخ' },
  expiryDate: { en: 'Expiry Date', ar: 'تاريخ الانتهاء', bn: 'মেয়াদ শেষের তারিখ', ur: 'میعاد ختم' },
  depositAmount: { en: 'Deposit Amount', ar: 'مبلغ التأمين', bn: 'জমার পরিমাণ', ur: 'ڈپازٹ کی رقم' },
  depositStatus: { en: 'Deposit Status', ar: 'حالة التأمين', bn: 'জমার অবস্থা', ur: 'ڈپازٹ کی حالت' },
  depositPaymentMethod: { en: 'Deposit Payment Method', ar: 'طريقة دفع التأمين', bn: 'জমার পেমেন্ট পদ্ধতি', ur: 'ڈپازٹ ادائیگی کا طریقہ' },
  depositReference: { en: 'Deposit Reference', ar: 'مرجع التأمين', bn: 'জমার রেফারেন্স', ur: 'ڈپازٹ حوالہ' },
  confirmed: { en: 'Confirmed', ar: 'مؤكد', bn: 'নিশ্চিত', ur: 'تصدیق شدہ' },
  converted: { en: 'Converted', ar: 'تم التحويل', bn: 'রূপান্তরিত', ur: 'تبدیل شدہ' },
  cancelled: { en: 'Cancelled', ar: 'ملغى', bn: 'বাতিল', ur: 'منسوخ' },
  convertToTenant: { en: 'Convert to Tenant', ar: 'تحويل إلى مستأجر', bn: 'ভাড়াটিয়ায় রূপান্তর', ur: 'کرایہ دار میں تبدیل کریں' },
  depositAppliedTo: { en: 'Apply Deposit To', ar: 'تطبيق التأمين على', bn: 'জমা প্রয়োগ করুন', ur: 'ڈپازٹ لاگو کریں' },
  firstRent: { en: 'First Rent', ar: 'الإيجار الأول', bn: 'প্রথম ভাড়া', ur: 'پہلا کرایہ' },
  advanceRent: { en: 'Advance Rent', ar: 'إيجار مقدم', bn: 'অগ্রিম ভাড়া', ur: 'ادائیگی کرایہ' },
  unitReserved: { en: 'UNIT RESERVED', ar: 'وحدة محجوزة', bn: 'ইউনিট রিজার্ভকৃত', ur: 'یونٹ ریزروڈ' },
  noReservationsFound: { en: 'No reservations found', ar: 'لم يتم العثور على حجوزات', bn: 'কোনো রিজার্ভেশন পাওয়া যায়নি', ur: 'کوئی ریزرویشن نہیں ملا' },
  reservationsCount: { en: 'reservations', ar: 'حجوزات', bn: 'টি রিজার্ভেশন', ur: 'ریزرویشنز' },
  confirmReservation: { en: 'Confirm Reservation', ar: 'تأكيد الحجز', bn: 'রিজার্ভেশন নিশ্চিত করুন', ur: 'ریزرویشن کی توثیق' },
  cancelReservation: { en: 'Cancel Reservation', ar: 'إلغاء الحجز', bn: 'রিজার্ভেশন বাতিল করুন', ur: 'ریزرویشن منسوخ کریں' },
  deleteReservation: { en: 'Delete this reservation?', ar: 'حذف هذا الحجز؟', bn: 'এই রিজার্ভেশন মুছে ফেলবেন?', ur: 'کیا یہ ریزرویشن حذف کریں؟' },
  expiryWarning: { en: 'Expiring Soon', ar: 'ينتهي قريباً', bn: 'শীঘ্রই মেয়াদ শেষ', ur: 'جلد ختم ہو رہا' },
  refunded: { en: 'Refunded', ar: 'مسترد', bn: 'ফেরত', ur: 'واپس' },
  upcomingMoveIns: { en: 'Upcoming Move-ins', ar: 'دخول قادمة', bn: 'আসন্ন প্রবেশ', ur: 'آنے والے داخلے' },
  depositCollected: { en: 'Reservation Deposits Collected', ar: 'ودائع الحجز المحصّلة', bn: 'সংগৃহীত রিজার্ভেশন জমা', ur: 'وصول شدہ ریزرویشن جمع' },
  reservationInvoice: { en: 'Reservation Deposit Invoice', ar: 'فاتورة وديعة الحجز', bn: 'রিজার্ভেশন জমা চালান', ur: 'ریزرویشن جمع انوائس' },
  reservationReceipt: { en: 'Reservation Deposit Receipt', ar: 'إيصال وديعة الحجز', bn: 'রিজার্ভেশন জমা রশিদ', ur: 'ریزرویشن جمع رسید' },
  convertConfirm: { en: 'Convert this reservation to an active tenancy?', ar: 'تحويل هذا الحجز إلى إيجار نشط؟', bn: 'এই রিজার্ভেশনটি সক্রিয় ভাড়ায় রূপান্তর করবেন?', ur: 'کیا یہ ریزرویشن فعال کرایہ داری میں تبدیل کریں؟' },
  depositAppliedToLabel: { en: 'Apply Deposit To', ar: 'تطبيق الوديعة على', bn: 'জমা প্রয়োগ করুন', ur: 'جمع لاگو کریں' },

  // Phase 1 Rental Accounting
  openingBalance: { en: 'Opening Balance (AED)', ar: 'الرصيد الافتتاحي (درهم)', bn: 'প্রারম্ভিক ব্যালেন্স (দিরহাম)', ur: 'ابتدائی بیلنس (درہم)' },
  creditBalance: { en: 'Credit Balance (AED)', ar: 'الرصيد الدائن (درهم)', bn: 'ক্রেডিট ব্যালেন্স (দিরহাম)', ur: 'کریڈٹ بیلنس (درہم)' },
  legalCase: { en: 'Legal Case', ar: 'قضية قانونية', bn: 'আইনি মামলা', ur: 'قانونی کیس' },
  legalCaseNumber: { en: 'Case Number', ar: 'رقم القضية', bn: 'মামলার নম্বর', ur: 'کیس نمبر' },
  legalCaseNotes: { en: 'Case Notes', ar: 'ملاحظات القضية', bn: 'মামলার নোট', ur: 'کیس نوٹ' },
  legalInfo: { en: 'Legal Information', ar: 'المعلومات القانونية', bn: 'আইনি তথ্য', ur: 'قانونی معلومات' },
  allocationType: { en: 'Payment Allocation', ar: 'تخصيص الدفع', bn: 'পেমেন্ট বণ্টন', ur: 'ادائیگی کی تقسیم' },
  currentRent: { en: 'Current Rent', ar: 'الإيجار الحالي', bn: 'বর্তমান ভাড়া', ur: 'موجودہ کرایہ' },
  historicalDebt: { en: 'Historical Debt', ar: 'الديون التاريخية', bn: 'ঐতিহাসিক ঋণ', ur: 'تاریخی قرضہ' },
  advancePayment: { en: 'Advance Payment', ar: 'دفعة مقدمة', bn: 'অগ্রিম পেমেন্ট', ur: 'پیشگی ادائیگی' },
  totalOutstanding: { en: 'Total Outstanding', ar: 'إجمالي المستحق', bn: 'মোট বকেয়', ur: 'کل واجب الادا' },
  creditApplied: { en: 'Credit Applied', ar: 'ائتمان مطبق', bn: 'ক্রেডিট প্রয়োগ', ur: 'کریڈٹ لاگو' },
  currentCharges: { en: 'Current Charges', ar: 'الرسوم الحالية', bn: 'বর্তমান চার্জ', ur: 'موجودہ چارجز' },
  adminOnly: { en: 'Admin Only', ar: 'المسؤول فقط', bn: 'শুধুমাত্র অ্যাডমিন', ur: 'صرف ایڈمن' },

  // System Management
  systemManagement: { en: 'System', ar: 'النظام', bn: 'সিস্টেম', ur: 'سسٹم' },
  auditLogs: { en: 'Audit Logs', ar: 'سجل التدقيق', bn: 'অডিট লগ', ur: 'آڈٹ لاگز' },
  auditLogTitle: { en: 'Audit Logs', ar: 'سجل التدقيق', bn: 'অডিট লগ', ur: 'آڈٹ لاگز' },
  auditLogDesc: { en: 'Track all actions performed by users across the system', ar: 'تتبع جميع الإجراءات التي يقوم بها المستخدمون عبر النظام', bn: 'সিস্টেম জুড়ে ব্যবহারকারীদের দ্বারা সম্পাদিত সমস্ত কর্ম ট্র্যাক করুন', ur: 'سسٹم میں صارفین کے تمام اقدامات کی نگرانی کریں' },
  actionType: { en: 'Action Type', ar: 'نوع الإجراء', bn: 'কর্মের ধরন', ur: 'عمل کی قسم' },
  module: { en: 'Module', ar: 'الوحدة', bn: 'মডিউল', ur: 'ماڈیول' },
  previousValue: { en: 'Previous', ar: 'السابق', bn: 'পূর্ববর্তী', ur: 'پچھلا' },
  newValue: { en: 'New', ar: 'الجديد', bn: 'নতুন', ur: 'نیا' },
  noResults: { en: 'No results found', ar: 'لم يتم العثور على نتائج', bn: 'কোনো ফলাফল পাওয়া যায়নি', ur: 'کوئی نتائج نہیں ملے' },
  loadMore: { en: 'Load More', ar: 'تحميل المزيد', bn: 'আরও লোড করুন', ur: 'مزید لوڈ کریں' },
  dataProtection: { en: 'Data Protection', ar: 'حماية البيانات', bn: 'ডেটা সুরক্ষা', ur: 'ڈیٹا کی حفاظت' },
  backupHistory: { en: 'Backup History', ar: 'سجل النسخ الاحتياطي', bn: 'ব্যাকআপ ইতিহাস', ur: 'بیک اپ کی تاریخ' },
  dataIntegrity: { en: 'Data Integrity', ar: 'سلامة البيانات', bn: 'ডেটা অখণ্ডতা', ur: 'ڈیٹا کی یکسانیت' },
  systemHealth: { en: 'System Health', ar: 'صحة النظام', bn: 'সিস্টেম স্বাস্থ্য', ur: 'سسٹم کی صحت' },
  createBackup: { en: 'Create Backup', ar: 'إنشاء نسخة احتياطية', bn: 'ব্যাকআপ তৈরি করুন', ur: 'بیک اپ بنائیں' },
  restoreBackup: { en: 'Restore from Backup', ar: 'استعادة من النسخة الاحتياطية', bn: 'ব্যাকআপ থেকে পুনরুদ্ধার', ur: 'بیک اپ سے بحال کریں' },
  restoreWarning: { en: 'This will overwrite existing data with the backup. This action cannot be undone. Are you sure?', ar: 'سيؤدي هذا إلى استبدال البيانات الحالية بالنسخة الاحتياطية. لا يمكن التراجع عن هذا الإجراء. هل أنت متأكد؟', bn: 'এটি বিদ্যমান ডেটা ব্যাকআপ দিয়ে প্রতিস্থাপন করবে। এই কাজটি পূর্বাবস্থায় ফেরানো যাবে না। আপনি কি নিশ্চিত?', ur: 'یہ موجودہ ڈیٹا کو بیک اپ سے تبدیل کر دے گا۔ یہ عمل واپس نہیں کیا جا سکتا۔ کیا آپ یقینی ہیں؟' },
  lastBackup: { en: 'Last Backup', ar: 'آخر نسخة احتياطية', bn: 'সর্বশেষ ব্যাকআপ', ur: 'آخری بیک اپ' },
  backupSize: { en: 'Backup Size', ar: 'حجم النسخة الاحتياطية', bn: 'ব্যাকআপ আকার', ur: 'بیک اپ کا سائز' },
  recordCount: { en: 'Records', ar: 'السجلات', bn: 'রেকর্ড', ur: 'ریکارڈز' },
  completed: { en: 'Completed', ar: 'مكتمل', bn: 'সম্পন্ন', ur: 'مکمل' },
  failed: { en: 'Failed', ar: 'فشل', bn: 'ব্যর্থ', ur: 'ناکام' },
  auto: { en: 'Automatic', ar: 'تلقائي', bn: 'স্বয়ংক্রিয়', ur: 'خودکار' },
  manual: { en: 'Manual', ar: 'يدوي', bn: 'ম্যানুয়াল', ur: 'مینوئل' },
  noBackups: { en: 'No backups found', ar: 'لا توجد نسخ احتياطية', bn: 'কোনো ব্যাকআপ পাওয়া যায়নি', ur: 'کوئی بیک اپ نہیں ملا' },
  runIntegrityCheck: { en: 'Run Integrity Check', ar: 'فحص سلامة البيانات', bn: 'অখণ্ডতা পরীক্ষা চালান', ur: 'یکسانیت کی جانچ کریں' },
  integrityPassed: { en: 'All checks passed', ar: 'جميع الفحوصات نجحت', bn: 'সকল পরীক্ষা উত্তীর্ণ', ur: 'تمام جانچ کامیاب' },
  orphanRecords: { en: 'Orphan Records Found', ar: 'سجلات يتيمة موجودة', bn: 'অনাথ রেকর্ড পাওয়া গেছে', ur: 'یتیم ریکارڈز ملے' },
  totalRent: { en: 'Total Rent', ar: 'إجمالي الإيجار', bn: 'মোট ভাড়া', ur: 'کل کرایہ' },
  totalPayments2: { en: 'Total Payments', ar: 'إجمالي المدفوعات', bn: 'মোট পেমেন্ট', ur: 'کل ادائیگیاں' },
  totalExpenses2: { en: 'Total Expenses', ar: 'إجمالي المصروفات', bn: 'মোট ব্যয়', ur: 'کل اخراجات' },
  databaseStatus: { en: 'Database Status', ar: 'حالة قاعدة البيانات', bn: 'ডাটাবেজ স্ট্যাটাস', ur: 'ڈیٹا بیس کی حالت' },
  activeUsers: { en: 'Active Users', ar: 'المستخدمون النشطون', bn: 'সক্রিয় ব্যবহারকারী', ur: 'فعال صارفین' },
  recentLogins: { en: 'Recent Logins (24h)', ar: 'تسجيلات الدخول الأخيرة (24 ساعة)', bn: 'সাম্প্রতিক লগইন (২৪ ঘণ্টা)', ur: 'حالیہ لاگ ان (24 گھنٹے)' },
  uptime: { en: 'Uptime', ar: 'وقت التشغيل', bn: 'আপটাইম', ur: 'اپ ٹائم' },
  healthy: { en: 'Healthy', ar: 'سليم', bn: 'সুস্থ', ur: 'صحت مند' },
  degraded: { en: 'Degraded', ar: 'متدهور', bn: 'ক্ষয়প্রাপ্ত', ur: 'خراب' },
  unhealthy: { en: 'Unhealthy', ar: 'غير سليم', bn: 'অসুস্থ', ur: 'غیر صحت مند' },
  selectBackupFile: { en: 'Select backup file (.json)', ar: 'اختر ملف النسخة الاحتياطية (.json)', bn: 'ব্যাকআপ ফাইল নির্বাচন করুন (.json)', ur: 'بیک اپ فائل منتخب کریں (.json)' },
  restoring: { en: 'Restoring backup...', ar: 'جاري الاستعادة...', bn: 'পুনরুদ্ধার চলছে...', ur: 'بحال ہو رہا ہے...' },
  creatingBackup: { en: 'Creating backup...', ar: 'جاري إنشاء النسخة الاحتياطية...', bn: 'ব্যাকআপ তৈরি হচ্ছে...', ur: 'بیک اپ بن رہا ہے...' },
  restoreSuccess: { en: 'Backup restored successfully', ar: 'تم استعادة النسخة الاحتياطية بنجاح', bn: 'ব্যাকআপ সফলভাবে পুনরুদ্ধার হয়েছে', ur: 'بیک اپ کامیابی سے بحال ہو گیا' },
  restoreFailed: { en: 'Failed to restore backup', ar: 'فشل في استعادة النسخة الاحتياطية', bn: 'ব্যাকআপ পুনরুদ্ধার ব্যর্থ', ur: 'بیک اپ بحال کرنے میں ناکام' },
  backupCreated: { en: 'Backup created and downloaded successfully', ar: 'تم إنشاء النسخة الاحتياطية وتحميلها بنجاح', bn: 'ব্যাকআপ তৈরি এবং ডাউনলোড সফল', ur: 'بیک اپ بن گیا اور کامیابی سے ڈاؤن لوڈ ہو گیا' },
  backupFailed: { en: 'Failed to create backup', ar: 'فشل في إنشاء النسخة الاحتياطية', bn: 'ব্যাকআপ তৈরি ব্যর্থ', ur: 'بیک اپ بنانے میں ناکام' },
  softDeletedRecords: { en: 'Soft-deleted Records', ar: 'السجلات المحذوفة مؤقتاً', bn: 'সফট-ডিলিটেড রেকর্ড', ur: 'نرم حذف شدہ ریکارڈز' },

  // Recurring Bills & Utilities
  currentMonth: { en: 'Current Month', ar: 'الشهر الحالي', bn: 'বর্তমান মাস', ur: 'موجودہ مہینہ' },
  recurringBills: { en: 'Recurring Bills', ar: 'الفواتير المتكررة', bn: 'পুনরাবৃত্তি বিল', ur: 'بار بار آنے والے بل' },
  recurringBillsAndUtilities: { en: 'Recurring Bills & Utilities', ar: 'الفواتير المتكررة والمرافق', bn: 'পুনরাবৃত্তি বিল ও ইউটিলিটি', ur: 'بار بار آنے والے بل اور سہولیات' },
  addRecurringBill: { en: 'Add Recurring Bill', ar: 'إضافة فاتورة متكررة', bn: 'পুনরাবৃত্তি বিল যোগ করুন', ur: 'بار بار آنے والا بل شامل کریں' },
  editRecurringBill: { en: 'Edit Recurring Bill', ar: 'تعديل فاتورة متكررة', bn: 'পুনরাবৃত্তি বিল সম্পাদনা', ur: 'بار بار آنے والا بل ترمیم کریں' },
  providerName: { en: 'Provider Name', ar: 'اسم المزود', bn: 'সরবরাহকারীর নাম', ur: 'فراہم کنندہ کا نام' },
  serviceType: { en: 'Service Type', ar: 'نوع الخدمة', bn: 'সেবার ধরন', ur: 'سروس کی قسم' },
  accountNumber: { en: 'Account Number', ar: 'رقم الحساب', bn: 'অ্যাকাউন্ট নম্বর', ur: 'اکاؤنٹ نمبر' },
  contractNumber: { en: 'Contract Number', ar: 'رقم العقد', bn: 'চুক্তি সংখ্যা', ur: 'معاہدہ نمبر' },
  currentOutstanding: { en: 'Current Outstanding', ar: 'المعلق الحالي', bn: 'বর্তমান বকেয়া', ur: 'موجودہ بقایا' },
  previousOutstanding: { en: 'Previous Outstanding', ar: 'المعلق السابق', bn: 'পূর্ববর্তী বকেয়া', ur: 'پچھلا بقایا' },
  totalAmountDue: { en: 'Total Amount Due', ar: 'إجمالي المبلغ المستحق', bn: 'মোট বকেয়া পরিমাণ', ur: 'کل واجب الادا رقم' },
  lastPaymentAmount: { en: 'Last Payment Amount', ar: 'مبلغ آخر دفعة', bn: 'সর্বশেষ পেমেন্ট পরিমাণ', ur: 'آخری ادائیگی کی رقم' },
  lastPaymentDate: { en: 'Last Payment Date', ar: 'تاريخ آخر دفعة', bn: 'সর্বশেষ পেমেন্ট তারিখ', ur: 'آخری ادائیگی کی تاریخ' },
  nextDueDate: { en: 'Next Due Date', ar: 'تاريخ الاستحقاق التالي', bn: 'পরবর্তী বকেয়া তারিখ', ur: 'اگلی واجب الادا تاریخ' },
  billingFrequency: { en: 'Billing Frequency', ar: 'تكرار الفوترة', bn: 'বিলিং ফ্রিকোয়েন্সি', ur: 'بلنگ کی فریکوئنسی' },
  autoRenew: { en: 'Auto Renew', ar: 'تجديد تلقائي', bn: 'স্বয়ংক্রিয় নবায়ন', ur: 'خود بخود تجدید' },
  gracePeriod: { en: 'Grace Period (Days)', ar: 'فترة السماح (أيام)', bn: 'অনুগ্রহ সময়কাল (দিন)', ur: 'مہلت کی مدت (دن)' },
  buildingName: { en: 'Building Name', ar: 'اسم المبنى', bn: 'বিল্ডিংয়ের নাম', ur: 'عمارت کا نام' },
  ownerName: { en: 'Owner Name', ar: 'اسم المالك', bn: 'মালিকের নাম', ur: 'مالک کا نام' },
  propertyManager: { en: 'Property Manager', ar: 'مدير الممتلكات', bn: 'সম্পত্তি ব্যবস্থাপক', ur: 'پراپرٹی مینیجر' },
  recordPayment: { en: 'Record Payment', ar: 'تسجيل دفعة', bn: 'পেমেন্ট রেকর্ড করুন', ur: 'ادائیگی درج کریں' },
  paymentAmount: { en: 'Payment Amount', ar: 'مبلغ الدفعة', bn: 'পেমেন্ট পরিমাণ', ur: 'ادائیگی کی رقم' },
  paymentDate: { en: 'Payment Date', ar: 'تاريخ الدفعة', bn: 'পেমেন্ট তারিখ', ur: 'ادائیگی کی تاریخ' },
  paymentMethod: { en: 'Payment Method', ar: 'طريقة الدفع', bn: 'পেমেন্ট পদ্ধতি', ur: 'ادائیگی کا طریقہ' },
  reference: { en: 'Reference', ar: 'المرجع', bn: 'রেফারেন্স', ur: 'حوالہ' },
  upcomingBills: { en: 'Upcoming Bills', ar: 'الفواتير القادمة', bn: 'আসন্ন বিল', ur: 'آنے والے بل' },
  overdueBills: { en: 'Overdue Bills', ar: 'الفواتير المتأخرة', bn: 'বকেয়া বিল', ur: 'تاخیر سے آنے والے بل' },
  monthlyUtilitySummary: { en: 'Monthly Utility Summary', ar: 'ملخص المرافق الشهري', bn: 'মাসিক ইউটিলিটি সারাংশ', ur: 'ماہانہ یوٹیلیٹی خلاصہ' },
  totalDue: { en: 'Total Due', ar: 'إجمالي المستحق', bn: 'মোট বকেয়া', ur: 'کل واجب الادا' },
  totalPaid: { en: 'Total Paid', ar: 'إجمالي المدفوع', bn: 'মোট পরিশোধিত', ur: 'کل ادا شدہ' },
  totalOutstanding: { en: 'Total Outstanding', ar: 'إجمالي المعلق', bn: 'মোট বকেয়া', ur: 'کل بقایا' },
  daysOverdue: { en: 'Days Overdue', ar: 'أيام التأخير', bn: 'বিলম্বিত দিন', ur: 'تاخیر کے دن' },
  advanceCycle: { en: 'Advance Billing Cycle', ar: 'تقديم دورة الفوترة', bn: 'বিলিং সাইকেল এগিয়ে নিন', ur: 'بلنگ سائیکل آگے بڑھائیں' },
  billingCycle: { en: 'Billing Cycle', ar: 'دورة الفوترة', bn: 'বিলিং সাইকেল', ur: 'بلنگ سائیکل' },
  billingCycles: { en: 'Billing Cycles', ar: 'دورات الفوترة', bn: 'বিলিং সাইকেল', ur: 'بلنگ سائیکلز' },
  cycleAmount: { en: 'Cycle Amount', ar: 'مبلغ الدورة', bn: 'সাইকেল পরিমাণ', ur: 'سائیکل کی رقم' },
  newCycleAmount: { en: 'New Cycle Amount (AED)', ar: 'مبلغ الدورة الجديدة (درهم)', bn: 'নতুন সাইকেল পরিমাণ (AED)', ur: 'نئی سائیکل رقم (درہم)' },
  createCycle: { en: 'Create New Cycle', ar: 'إنشاء دورة جديدة', bn: 'নতুন সাইকেল তৈরি করুন', ur: 'نئی سائیکل بنائیں' },
  selectCycle: { en: 'Select Billing Cycle', ar: 'اختر دورة الفوترة', bn: 'বিলিং সাইকেল নির্বাচন করুন', ur: 'بلنگ سائیکل منتخب کریں' },
  cyclePeriod: { en: 'Period', ar: 'الفترة', bn: 'সময়কাল', ur: 'مدت' },
  cyclePaid: { en: 'Paid', ar: 'مدفوع', bn: 'পরিশোধিত', ur: 'اداؤ شدہ' },
  cycleOutstanding: { en: 'Outstanding', ar: 'معلق', bn: 'বকেয়া', ur: 'بقایا' },
  viewCycles: { en: 'View Cycles', ar: 'عرض الدورات', bn: 'সাইকেল দেখুন', ur: 'سائیکلز دیکھیں' },
  noCycles: { en: 'No billing cycles yet', ar: 'لا توجد دورات فوترة بعد', bn: 'এখনো কোনো বিলিং সাইকেল নেই', ur: 'ابھی تک کوئی بلنگ سائیکل نہیں' },
  currentCycle: { en: 'Current Cycle', ar: 'الدورة الحالية', bn: 'বর্তমান সাইকেল', ur: 'موجودہ سائیکل' },
  previousCycles: { en: 'Previous Cycles', ar: 'الدورات السابقة', bn: 'পূর্ববর্তী সাইকেল', ur: 'پچھلی سائیکلز' },
  payAgainstCycle: { en: 'Pay against cycle', ar: 'الدفع مقابل الدورة', bn: 'সাইকেলের বিপরীতে পরিশোধ করুন', ur: 'سائیکل کے خلاف ادائیگی' },
  cycleStatus: { en: 'Cycle Status', ar: 'حالة الدورة', bn: 'সাইকেল অবস্থা', ur: 'سائیکل کی حالت' },
  totalCycles: { en: 'Total Cycles', ar: 'إجمالي الدورات', bn: 'মোট সাইকেল', ur: 'کل سائیکلز' },
  outstandingBefore: { en: 'Outstanding Before', ar: 'المعلق قبل الدفعة', bn: 'পূর্বের বকেয়া', ur: 'ادائیگی سے پہلے بقایا' },
  outstandingAfter: { en: 'Outstanding After', ar: 'المعلق بعد الدفعة', bn: 'পরবর্তী বকেয়া', ur: 'ادائیگی کے بعد بقایا' },
  carryForward: { en: 'Carry Forward', ar: 'نقل إلى الأمام', bn: 'সামনে নিয়ে যান', ur: 'آگے لے جائیں' },

  // Recurring Bills - Search & Filters
  searchBills: { en: 'Search Bills, Providers, Properties...', ar: 'بحث الفواتير، المزودين، العقارات...', bn: 'বিল, সরবরাহকারী, সম্পত্তি খুঁজুন...', ur: 'بل، فراہم کنندہ، املاک تلاش کریں...' },
  paidBills: { en: 'Paid Bills', ar: 'الفواتير المدفوعة', bn: 'পরিশোধিত বিল', ur: 'ادا شدہ بل' },
  partiallyPaidBills: { en: 'Partially Paid', ar: 'مدفوعة جزئياً', bn: 'আংশিক পরিশোধিত', ur: 'جزوی ادائیگی' },
  outstandingBills: { en: 'Outstanding', ar: 'معلق', bn: 'বকেয়', ur: 'بقایا' },
  dueSoonBills: { en: 'Due Soon', ar: 'مستحق قريباً', bn: 'শীঘ্রই দেয়', ur: 'جلد ادائیگی' },
  customDateRange: { en: 'Custom Range', ar: 'نطاق مخصص', bn: 'কাস্টম পরিসর', ur: 'حسب ضرورت تاریخ' },
  dateFrom: { en: 'From', ar: 'من', bn: 'থেকে', ur: 'سے' },
  dateTo: { en: 'To', ar: 'إلى', bn: 'পর্যন্ত', ur: 'تک' },
  applyFilter: { en: 'Apply', ar: 'تطبيق', bn: 'প্রয়োগ', ur: 'لاگو کریں' },
  clearFilter: { en: 'Clear', ar: 'مسح', bn: 'মুছুন', ur: 'صاف کریں' },
  last7Days: { en: 'Last 7 Days', ar: 'آخر 7 أيام', bn: 'শেষ ৭ দিন', ur: 'پچھلے 7 دن' },
  last30Days: { en: 'Last 30 Days', ar: 'آخر 30 يوماً', bn: 'শেষ ৩০ দিন', ur: 'پچھلے 30 دن' },
  thisQuarter: { en: 'This Quarter', ar: 'هذا الربع', bn: 'এই ত্রৈমাসিক', ur: 'یہ سہ ماہی' },
  thisYear: { en: 'This Year', ar: 'هذا العام', bn: 'এই বছর', ur: 'یہ سال' },
  daysRemaining: { en: 'Days Remaining', ar: 'الأيام المتبقية', bn: 'অবশিষ্ট দিন', ur: 'باقی دن' },
  originalAmount: { en: 'Original Amount', ar: 'المبلغ الأصلي', bn: 'মূল পরিমাণ', ur: 'اصل رقم' },
  amountPaid: { en: 'Amount Paid', ar: 'المبلغ المدفوع', bn: 'পরিশোধিত পরিমাণ', ur: 'ادا شدہ رقم' },
  remainingBalance: { en: 'Remaining Balance', ar: 'الرصيد المتبقي', bn: 'অবশিষ্ট ব্যালেন্স', ur: 'بقیہ بیلنس' },
  previousBalance: { en: 'Previous Balance', ar: 'الرصيد السابق', bn: 'পূর্ববর্তী ব্যালেন্স', ur: 'پچھلا بیلنس' },
  currentBalance: { en: 'Current Balance', ar: 'الرصيد الحالي', bn: 'বর্তমান ব্যালেন্স', ur: 'موجودہ بیلنس' },
  totalLiability: { en: 'Total Liability', ar: 'إجمالي الالتزام', bn: 'মোট দায়বদ্ধতা', ur: 'کل ذمہ داری' },
  paymentReference: { en: 'Payment Ref', ar: 'مرجع الدفع', bn: 'পেমেন্ট রেফারেন্স', ur: 'ادائیگی کا حوالہ' },

  // Recurring Bills - Payment Management
  allPayments: { en: 'All Payments', ar: 'جميع المدفوعات', bn: 'সকল পেমেন্ট', ur: 'تمام ادائیگیاں' },
  editPayment: { en: 'Edit Payment', ar: 'تعديل الدفعة', bn: 'পেমেন্ট সম্পাদনা', ur: 'ادائیگی میں ترمیم' },
  deletePayment: { en: 'Delete Payment', ar: 'حذف الدفعة', bn: 'পেমেন্ট মুছুন', ur: 'ادائیگی حذف کریں' },
  deletePaymentConfirm: { en: 'Are you sure you want to delete this payment? The bill outstanding balance will be adjusted accordingly.', ar: 'هل أنت متأكد من حذف هذه الدفعة؟ سيتم تعديل الرصيد المعلق للفاتورة وفقاً لذلك.', bn: 'আপনি কি নিশ্চিত যে আপনি এই পেমেন্টটি মুছে ফেলতে চান? বিলের বকেয়া ব্যালেন্স সেই অনুযায়ী সামঞ্জস্য করা হবে।', ur: 'کیا آپ یقینی طور پر اس ادائیگی کو حذف کرنا چاہتے ہیں؟ بل کا بقایا بیلنس اس کے مطابق ایڈجسٹ کیا جائے گا۔' },
  paymentAmount: { en: 'Payment Amount', ar: 'مبلغ الدفعة', bn: 'পেমেন্ট পরিমাণ', ur: 'ادائیگی کی رقم' },
  paymentDate: { en: 'Payment Date', ar: 'تاريخ الدفع', bn: 'পেমেন্ট তারিখ', ur: 'ادائیگی کی تاریخ' },
  billProvider: { en: 'Bill Provider', ar: 'مزود الفاتورة', bn: 'বিল সরবরাহকারী', ur: 'بل فراہم کنندہ' },
  searchPayments: { en: 'Search Payments...', ar: 'بحث المدفوعات...', bn: 'পেমেন্ট খুঁজুন...', ur: 'ادائیگیاں تلاش کریں...' },

  // Recurring Bills - Export
  exportPDF: { en: 'Export PDF', ar: 'تصدير PDF', bn: 'PDF রপ্তানি', ur: 'PDF ایکسپورٹ' },
  exportXLSX: { en: 'Export Excel', ar: 'تصدير Excel', bn: 'Excel রপ্তানি', ur: 'Excel ایکسپورٹ' },
  exportReport: { en: 'Export Report', ar: 'تصدير التقرير', bn: 'রপ্তানি রিপোর্ট', ur: 'رپورٹ ایکسپورٹ' },
  reportGenerated: { en: 'Report Generated', ar: 'تم إنشاء التقرير', bn: 'রিপোর্ট তৈরি হয়েছে', ur: 'رپورٹ بن گئی' },
  reportTitle: { en: 'Recurring Bills Report', ar: 'تقرير الفواتير المتكررة', bn: 'পুনরাবৃত্তি বিল রিপোর্ট', ur: 'بار بار آنے والے بل کی رپورٹ' },
  dateGenerated: { en: 'Date Generated', ar: 'تاريخ الإنشاء', bn: 'তৈরির তারিখ', ur: 'تخلیق کی تاریخ' },
  summaryStatistics: { en: 'Summary Statistics', ar: 'إحصائيات ملخصة', bn: 'সারাংশ পরিসংখ্যান', ur: 'خلاصہ اعداد و شمار' },
  noBillsToExport: { en: 'No bills to export', ar: 'لا توجد فواتير للتصدير', bn: 'রপ্তানি করার মতো বিল নেই', ur: 'ایکسپورٹ کے لیے کوئی بل نہیں' },
  exporting: { en: 'Exporting...', ar: 'جاري التصدير...', bn: 'রপ্তানি হচ্ছে...', ur: 'ایکسپورٹ ہو رہا ہے...' },
} as const

export type TranslationKey = keyof typeof translations

export function t(key: TranslationKey, lang: Language): string {
  return translations[key]?.[lang] || translations[key]?.en || key
}

export function getNameByLang(obj: { name: string; nameAr?: string | null; nameBn?: string | null; nameUr?: string | null }, lang: Language): string {
  if (lang === 'ar' && obj.nameAr) return obj.nameAr
  if (lang === 'bn' && obj.nameBn) return obj.nameBn
  if (lang === 'ur' && obj.nameUr) return obj.nameUr
  return obj.name
}

export function getMonthName(month: number, lang: Language = 'en'): string {
  const months: Record<Language, string[]> = {
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
    bn: ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'],
    ur: ['جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'],
  }
  return months[lang]?.[month - 1] || months.en[month - 1]
}

// Hindi month names (for WhatsApp messages only, not a UI language)
const hindiMonths = ['जनवरी', 'फरवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर']

function getMonthNameForWhatsApp(month: number, lang: WhatsAppLanguage): string {
  if (lang === 'hi') return hindiMonths[month - 1] || getMonthName(month, 'en')
  return getMonthName(month, lang)
}

function cleanPhoneNumber(phone: string): string {
  let cleanPhone = phone.replace(/[^0-9]/g, '')
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '971' + cleanPhone.substring(1)
  }
  if (cleanPhone.startsWith('00')) {
    cleanPhone = cleanPhone.substring(2)
  }
  if (!cleanPhone.startsWith('971') && !cleanPhone.startsWith('1') && !cleanPhone.startsWith('44') && !cleanPhone.startsWith('91') && !cleanPhone.startsWith('92') && !cleanPhone.startsWith('880')) {
    cleanPhone = '971' + cleanPhone
  }
  return cleanPhone
}

export function getWhatsAppLink(phone: string, name: string, amount: number, month: number, year: number, lang: WhatsAppLanguage = 'en'): string {
  const cleanPhone = cleanPhoneNumber(phone)
  const monthName = getMonthNameForWhatsApp(month, lang)
  const amountStr = new Intl.NumberFormat('en-AE').format(amount) + ' AED'

  const messages: Record<WhatsAppLanguage, string> = {
    en: `Subject: Rent Payment Reminder\nDear ${name},\nThis is a reminder that your monthly rent for ${monthName} ${year} in the amount of AED ${amountStr} is currently outstanding.\nKindly arrange for payment at your earliest convenience.\nBest regards,\nAl Reef Al Madeena Real Estate Management and General Maintenance - L.L.C - S.P.C`,
    ar: `موضوع: تذكير بدفع الإيجار\nالسيد/ة ${name} المحترم/ة،\nنود تذكيركم بأن إيجاركم الشهري عن شهر ${monthName} ${year} بمبلغ ${amountStr} درهم إماراتي لم يتم سداده بعد.\nنرجو التفضل بسداد المبلغ في أقرب وقت ممكن.\nمع خالص التقدير،\nالريف المدينة لإدارة العقارات والصيانة العامة ذ.م.م - ش. ش. و`,
    bn: `বিষয়: ভাড়া প্রদানের স্মারক\nশ্রদ্ধেয় ${name},\nএটি একটি স্মারক যে ${monthName} ${year} মাসের আপনার মাসিক ভাড়া ${amountStr} দিরহাম এখনও পরিশোধিত হয়নি।\nঅনুগ্রহ করে শীঘ্রই প্রদানের ব্যবস্থা করুন।\nশুভেচ্ছান্তে,\nআল রিফ আল মাদিনা রিয়েল এস্টেট ম্যানেজমেন্ট অ্যান্ড জেনারেল মেইনটেন্যান্স - এলএলসি - এসপিসি`,
    ur: `موضوع: کرایے کی ادائیگی کی یاد دہانی\nمحترم ${name}،\nہم آپ کو یاد دہانی دے رہے ہیں کہ ${monthName} ${year} کے ماہانہ کرایے کی رقم ${amountStr} درہم ابھی تک ادا نہیں ہوئی ہے۔\nبرائے مہربانی جلد از جلد ادائیگی کا انتظام کریں۔\nبااحترام،\nالریف المدینہ برائے املاک کا انتظام اور عام دیکھ بھال - ذ.م.م - ش. ش. و`,
    hi: `विषय: किराया भुगतान अनुस्मारक\nप्रिय ${name},\nयह अनुस्मारक है कि ${monthName} ${year} का आपका मासिक किराया ${amountStr} दिरहम अभी तक अदाय नहीं हुआ है।\nकृपया शीघ्रातिशीघ्र भुगतान की व्यवस्था करें।\nसादर,\nअल रीफ अल मदीना रियल एस्टेट मैनेजमेंट एंड जनरल मेंटेनेंस - एलएलसी - एसपीसी`,
  }

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messages[lang] || messages.en)}`
}

export function getTenantScoreLabel(score: number, lang: Language): string {
  if (score >= 80) return t('scoreExcellent', lang)
  if (score >= 60) return t('scoreGood', lang)
  if (score >= 40) return t('scoreWarning', lang)
  return t('scorePoor', lang)
}

export function getTenantScoreColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500 text-white'
  if (score >= 60) return 'bg-blue-500 text-white'
  if (score >= 40) return 'bg-amber-500 text-white'
  return 'bg-red-500 text-white'
}

export function calculateTenantScore(latePaymentCount: number, totalPayments: number): number {
  if (totalPayments === 0) return 100
  const onTimeRate = (totalPayments - latePaymentCount) / totalPayments
  return Math.round(onTimeRate * 100)
}

export function getPropertyTypeLabel(type: string, lang: Language): string {
  switch (type) {
    case 'apartment': return t('apartment', lang)
    case 'villa': return t('villa', lang)
    case 'office': return t('office', lang)
    case 'shop': return t('shop', lang)
    case 'studio': return t('studio', lang)
    case 'mixed_use': return t('mixedUse', lang)
    default: return type
  }
}

export function getMaintenanceCategoryLabel(category: string, lang: Language): string {
  switch (category) {
    case 'ac': return t('ac', lang)
    case 'plumbing': return t('plumbing', lang)
    case 'electrical': return t('electrical', lang)
    case 'lock_door': return t('lockDoor', lang)
    case 'painting': return t('painting', lang)
    case 'structural': return t('structural', lang)
    case 'other': return t('other', lang)
    default: return category
  }
}

export function getExpenseCategoryLabel(category: string, lang: Language): string {
  switch (category) {
    case 'manpower': return t('manpower', lang)
    case 'salary': return t('salary', lang)
    case 'municipality': return t('municipalityFees', lang)
    case 'maintenance': return t('maintenance2', lang)
    case 'utility': case 'utilities': return t('utilities', lang)
    case 'leasing': return t('leasingCommission', lang)
    case 'insurance': return t('insurance', lang)
    case 'security': return t('security', lang)
    case 'other': return t('other', lang)
    default: return category
  }
}

export function getServiceTypeLabel(type: string, lang: Language): string {
  const labels: Record<string, Record<Language, string>> = {
    electricity: { en: 'Electricity', ar: 'كهرباء', bn: 'বিদ্যুৎ', ur: 'بجلی' },
    water: { en: 'Water', ar: 'مياه', bn: 'পানি', ur: 'پانی' },
    etisalat: { en: 'Etisalat', ar: 'اتصالات', bn: 'এটিসালাত', ur: 'عتیسالات' },
    du: { en: 'Du', ar: 'دو', bn: 'ডু', ur: 'ڈو' },
    internet: { en: 'Internet', ar: 'إنترنت', bn: 'ইন্টারনেট', ur: 'انٹرنیٹ' },
    municipality: { en: 'Municipality Fee', ar: 'رسوم البلدية', bn: 'পৌরসভা ফি', ur: 'بلدیہ فیس' },
    service_charge: { en: 'Service Charge', ar: 'رسوم الخدمة', bn: 'সার্ভিস চার্জ', ur: 'سروس چارج' },
    waste: { en: 'Waste Management', ar: 'إدارة النفايات', bn: 'বর্জ্য ব্যবস্থাপনা', ur: 'فضلات کا انتظام' },
    maintenance_contract: { en: 'Maintenance Contract', ar: 'عقد الصيانة', bn: 'রক্ষণাবেক্ষণ চুক্তি', ur: 'دیكھ بھال کا معاہدہ' },
    security_contract: { en: 'Security Contract', ar: 'عقد الأمن', bn: 'নিরাপত্তা চুক্তি', ur: 'سیکیورٹی معاہدہ' },
    cleaning_contract: { en: 'Cleaning Contract', ar: 'عقد التنظيف', bn: 'পরিষ্কার চুক্তি', ur: 'صفائی کا معاہدہ' },
    custom: { en: 'Custom', ar: 'مخصص', bn: 'কাস্টম', ur: 'حسب ضرورت' },
  }
  return labels[type]?.[lang] || type
}

export function getFrequencyLabel(freq: string, lang: Language): string {
  const labels: Record<string, Record<Language, string>> = {
    monthly: { en: 'Monthly', ar: 'شهري', bn: 'মাসিক', ur: 'ماہانہ' },
    quarterly: { en: 'Quarterly', ar: 'ربع سنوي', bn: 'ত্রৈমাসিক', ur: 'سہ ماہی' },
    semi_annual: { en: 'Semi-Annual', ar: 'نصف سنوي', bn: 'অর্ধ-বার্ষিক', ur: 'چھ ماہی' },
    annual: { en: 'Annual', ar: 'سنوي', bn: 'বার্ষিক', ur: 'سالانہ' },
  }
  return labels[freq]?.[lang] || freq
}
