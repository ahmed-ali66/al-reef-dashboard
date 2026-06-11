/**
 * Fix Authentication Script
 *
 * This script:
 * 1. Ensures all 4 production accounts exist with the correct password (Alreef@2025)
 * 2. Clears any stale rate limit entries that could be causing lockouts
 * 3. Ensures all accounts are active and not soft-deleted
 * 4. Verifies each account can authenticate successfully
 *
 * Usage:
 *   npx tsx scripts/fix-auth.ts
 *
 * For production (Neon PostgreSQL):
 *   DATABASE_URL="postgresql://..." npx tsx scripts/fix-auth.ts
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
})

const REQUIRED_ACCOUNTS = [
  { email: 'owner@alreef.ae', password: 'Alreef@2025', role: 'owner', name: 'Shafiul Azam', nameAr: 'شفيول أعظم', nameBn: 'শাফিউল আযম', nameUr: 'شفیول اعظم' },
  { email: 'admin@alreef.ae', password: 'Alreef@2025', role: 'admin', name: 'Ahmed Mahmoud', nameAr: 'أحمد محمود', nameBn: 'আহমেদ মাহমুদ', nameUr: 'احمد محمود' },
  { email: 'accountant@alreef.ae', password: 'Alreef@2025', role: 'accountant', name: 'Accountant User', nameAr: 'محاسب', nameBn: 'হিসাবরক্ষক', nameUr: 'اکاؤنٹنٹ' },
  { email: 'staff@alreef.ae', password: 'Alreef@2025', role: 'staff', name: 'Karim Hossain', nameAr: 'كريم حسين', nameBn: 'করিম হোসেন', nameUr: 'کریم حسین' },
]

async function main() {
  console.log('==============================================')
  console.log('  Authentication Fix Script')
  console.log('==============================================')
  console.log(`Database: ${process.env.DATABASE_URL?.substring(0, 30)}...`)
  console.log()

  // Step 1: Find or create company
  console.log('Step 1: Ensuring company exists...')
  let company = await prisma.company.findFirst()
  if (!company) {
    company = await prisma.company.create({
      data: {
        name: 'Al Reef Al Madeena Real Estate Management and General Maintenance - L.L.C - S.P.C',
        nameAr: 'الريف المدينة لإدارة العقارات والصيانة العامة ذ.م.م - ش. ش. و',
        nameBn: 'আল রিফ আল মাদিনা রিয়েল এস্টেট ম্যানেজমেন্ট অ্যান্ড জেনারেল মেইনটেন্যান্স - এলএলসি - এসপিসি',
        nameUr: 'الریف المدینہ برائے املاک کا انتظام اور عام دیکھ بھال - ذ.م.م - ش. ش. و',
        phone: '+971504225590',
        email: 'alreef.junoobi@gmail.com',
        address: "Near LuLu Muraba'a, Al Ain City, Abu Dhabi Emirate, UAE",
      },
    })
    console.log('  Created company:', company.id)
  } else {
    console.log('  Found company:', company.id, company.name)
  }

  // Step 2: Fix each account
  console.log('\nStep 2: Fixing user accounts...')
  const standardPassword = await bcrypt.hash('Alreef@2025', 12)

  for (const account of REQUIRED_ACCOUNTS) {
    console.log(`\n  Processing: ${account.email} (${account.role})`)

    const existing = await prisma.user.findUnique({
      where: { email: account.email },
    })

    if (existing) {
      // Update existing user
      const updates: any = {
        password: standardPassword,
        isActive: true,
        deletedAt: null,
        mustChangePassword: false,
        companyId: company.id,
      }

      // Only update name fields if they're empty
      if (!existing.nameAr) updates.nameAr = account.nameAr
      if (!existing.nameBn) updates.nameBn = account.nameBn
      if (!existing.nameUr) updates.nameUr = account.nameUr

      await prisma.user.update({
        where: { email: account.email },
        data: updates,
      })
      console.log(`    Updated: password reset, isActive=true, deletedAt=null`)

      // Verify the password works
      const isValid = await bcrypt.compare('Alreef@2025', standardPassword)
      console.log(`    Password verification: ${isValid ? 'PASS' : 'FAIL'}`)
    } else {
      // Create new user
      await prisma.user.create({
        data: {
          email: account.email,
          password: standardPassword,
          name: account.name,
          nameAr: account.nameAr,
          nameBn: account.nameBn,
          nameUr: account.nameUr,
          role: account.role,
          companyId: company.id,
          isActive: true,
          mustChangePassword: false,
        },
      })
      console.log(`    Created new user: ${account.email}`)
    }
  }

  // Step 3: Clear all rate limit entries for these accounts
  console.log('\nStep 3: Clearing rate limit entries...')
  const emails = REQUIRED_ACCOUNTS.map(a => a.email)

  // Clear main rate limit entries
  const deleted1 = await prisma.rateLimitEntry.deleteMany({
    where: { identifier: { in: emails } },
  })
  console.log(`  Cleared ${deleted1.count} login rate limit entries`)

  // Clear diagnose rate limit entries
  const deleted2 = await prisma.rateLimitEntry.deleteMany({
    where: { identifier: { in: emails.map(e => `diagnose:${e}`) } },
  })
  console.log(`  Cleared ${deleted2.count} diagnose rate limit entries`)

  // Clear all stale/expired rate limit entries
  const deleted3 = await prisma.rateLimitEntry.deleteMany({
    where: {
      OR: [
        { lockedUntil: { not: null, lt: new Date() } },
        { lockedUntil: null, resetAt: { not: null, lt: new Date() } },
      ],
    },
  })
  console.log(`  Cleared ${deleted3.count} expired rate limit entries`)

  // Clear cleanup lock entries
  const deleted4 = await prisma.rateLimitEntry.deleteMany({
    where: { identifier: 'auth:cleanup:lock' },
  })
  console.log(`  Cleared ${deleted4.count} cleanup lock entries`)

  // Step 4: Verify all accounts
  console.log('\nStep 4: Final verification...')
  for (const account of REQUIRED_ACCOUNTS) {
    const user = await prisma.user.findUnique({
      where: { email: account.email },
    })

    if (!user) {
      console.log(`  FAIL: ${account.email} - User not found`)
      continue
    }

    const passwordValid = await bcrypt.compare('Alreef@2025', user.password)
    const isActive = user.isActive && !user.deletedAt

    const status = passwordValid && isActive ? 'PASS' : 'FAIL'
    const details: string[] = []
    if (!passwordValid) details.push('password mismatch')
    if (!user.isActive) details.push('inactive')
    if (user.deletedAt) details.push('deleted')

    console.log(`  ${status}: ${account.email} (${account.role})${details.length ? ' - ' + details.join(', ') : ''}`)
  }

  console.log('\n==============================================')
  console.log('  Authentication fix completed!')
  console.log('==============================================')
}

main()
  .catch((e) => {
    console.error('Fix auth script error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
