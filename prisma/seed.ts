import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Create or update company
  const company = await prisma.company.upsert({
    where: { id: 'company-1' },
    update: {
      name: 'Al Reef Al Madeena Real Estate Management and General Maintenance - L.L.C - S.P.C',
      nameAr: 'الريف المدينة لإدارة العقارات والصيانة العامة ذ.م.م - ش. ش. و',
      nameBn: 'আল রিফ আল মাদিনা রিয়েল এস্টেট ম্যানেজমেন্ট অ্যান্ড জেনারেল মেইনটেন্যান্স - এলএলসি - এসপিসি',
      nameUr: 'الریف المدینہ برائے املاک کا انتظام اور عام دیکھ بھال - ذ.م.م - ش. ش. و',
      phone: '+971504225590',
      email: 'alreef.junoobi@gmail.com',
      address: "Near LuLu Muraba'a, Al Ain City, Abu Dhabi Emirate, UAE",
    },
    create: {
      id: 'company-1',
      name: 'Al Reef Al Madeena Real Estate Management and General Maintenance - L.L.C - S.P.C',
      nameAr: 'الريف المدينة لإدارة العقارات والصيانة العامة ذ.م.م - ش. ش. و',
      nameBn: 'আল রিফ আল মাদিনা রিয়েল এস্টেট ম্যানেজমেন্ট অ্যান্ড জেনারেল মেইনটেন্যান্স - এলএলসি - এসপিসি',
      nameUr: 'الریف المدینہ برائے املاک کا انتظام اور عام دیکھ بھال - ذ.م.م - ش. ش. و',
      phone: '+971504225590',
      email: 'alreef.junoobi@gmail.com',
      address: "Near LuLu Muraba'a, Al Ain City, Abu Dhabi Emirate, UAE",
    },
  })

  console.log('Company created:', company.name)

  // Create default users with the standard password: Alreef@2025
  // All accounts use the same password for consistency
  const standardPassword = await bcrypt.hash('Alreef@2025', 12)

  const owner = await prisma.user.upsert({
    where: { email: 'owner@alreef.ae' },
    update: {
      // Always update the password to ensure it matches the expected value
      password: standardPassword,
      isActive: true,
      deletedAt: null,
    },
    create: {
      email: 'owner@alreef.ae',
      password: standardPassword,
      name: 'Shafiul Azam',
      nameAr: 'شفيول أعظم',
      nameBn: 'শাফিউল আযম',
      nameUr: 'شفیول اعظم',
      role: 'owner',
      companyId: company.id,
      mustChangePassword: false,
      isActive: true,
    },
  })

  const admin = await prisma.user.upsert({
    where: { email: 'admin@alreef.ae' },
    update: {
      password: standardPassword,
      isActive: true,
      deletedAt: null,
    },
    create: {
      email: 'admin@alreef.ae',
      password: standardPassword,
      name: 'Ahmed Mahmoud',
      nameAr: 'أحمد محمود',
      nameBn: 'আহমেদ মাহমুদ',
      nameUr: 'احمد محمود',
      role: 'admin',
      companyId: company.id,
      mustChangePassword: false,
      isActive: true,
    },
  })

  const accountant = await prisma.user.upsert({
    where: { email: 'accountant@alreef.ae' },
    update: {
      password: standardPassword,
      isActive: true,
      deletedAt: null,
    },
    create: {
      email: 'accountant@alreef.ae',
      password: standardPassword,
      name: 'Accountant User',
      nameAr: 'محاسب',
      nameBn: 'হিসাবরক্ষক',
      nameUr: 'اکاؤنٹنٹ',
      role: 'accountant',
      companyId: company.id,
      mustChangePassword: false,
      isActive: true,
    },
  })

  const staff = await prisma.user.upsert({
    where: { email: 'staff@alreef.ae' },
    update: {
      password: standardPassword,
      isActive: true,
      deletedAt: null,
    },
    create: {
      email: 'staff@alreef.ae',
      password: standardPassword,
      name: 'Karim Hossain',
      nameAr: 'كريم حسين',
      nameBn: 'করিম হোসেন',
      nameUr: 'کریم حسین',
      role: 'staff',
      companyId: company.id,
      mustChangePassword: false,
      isActive: true,
    },
  })

  console.log('Users created/verified:', owner.email, admin.email, accountant.email, staff.email)

  // Clear any stale rate limit entries (cleanup from previous failed attempts)
  const deletedEntries = await prisma.rateLimitEntry.deleteMany({
    where: {
      identifier: {
        in: [
          'owner@alreef.ae',
          'admin@alreef.ae',
          'accountant@alreef.ae',
          'staff@alreef.ae',
        ],
      },
    },
  })
  if (deletedEntries.count > 0) {
    console.log(`Cleared ${deletedEntries.count} stale rate limit entries`)
  }

  console.log('Seed completed successfully!')
}

main()
  .catch((e) => {
    console.error('Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
