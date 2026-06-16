/**
 * Script to create the restaurant tenant group for Neima New Property
 * Links Units 15, 16, 17 into a single "Restaurant Account" group
 * 
 * Usage: npx tsx scripts/create-restaurant-group.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🔍 Finding Neima New Property and Units 15-17 tenants...')

  // Find the property
  const property = await prisma.property.findFirst({
    where: {
      companyId: 'company-1',
      name: { contains: 'Neima', mode: 'insensitive' },
      deletedAt: null,
    },
  })

  if (!property) {
    console.error('❌ Neima New Property not found!')
    // List all properties for debugging
    const allProps = await prisma.property.findMany({
      where: { companyId: 'company-1', deletedAt: null },
      select: { id: true, name: true },
    })
    console.log('Available properties:', allProps)
    process.exit(1)
  }

  console.log(`✅ Found property: ${property.name} (${property.id})`)

  // Find tenants in Units 15, 16, 17
  const tenants = await prisma.tenant.findMany({
    where: {
      companyId: 'company-1',
      propertyId: property.id,
      unitNumber: { in: ['15', '16', '17'] },
      deletedAt: null,
      status: { in: ['active', 'notice'] },
    },
  })

  if (tenants.length === 0) {
    console.error('❌ No active tenants found in Units 15, 16, 17!')
    // List all tenants in this property for debugging
    const allTenants = await prisma.tenant.findMany({
      where: { propertyId: property.id, deletedAt: null },
      select: { id: true, name: true, unitNumber: true, status: true },
    })
    console.log('All tenants in this property:', allTenants)
    process.exit(1)
  }

  console.log(`✅ Found ${tenants.length} tenants:`)
  tenants.forEach(t => {
    console.log(`   - ${t.name} (Unit ${t.unitNumber}, Rent: AED ${t.rentAmount})`)
  })

  // Check if any are already in a group
  const alreadyGrouped = tenants.filter(t => t.groupId !== null)
  if (alreadyGrouped.length > 0) {
    console.error('❌ Some tenants are already in a group:')
    alreadyGrouped.forEach(t => console.log(`   - ${t.name} (groupId: ${t.groupId})`))
    process.exit(1)
  }

  // Create the group
  const group = await prisma.tenantGroup.create({
    data: {
      companyId: 'company-1',
      propertyId: property.id,
      name: tenants[0].name + ' Account',
      nameAr: null,
      nameBn: null,
      nameUr: null,
      billingMode: 'consolidated',
      status: 'active',
      notes: `Restaurant account linking Units ${tenants.map(t => t.unitNumber).join(', ')}`,
    },
  })

  console.log(`✅ Created group: ${group.name} (${group.id})`)

  // Link tenants to the group
  await prisma.tenant.updateMany({
    where: {
      id: { in: tenants.map(t => t.id) },
      companyId: 'company-1',
    },
    data: { groupId: group.id },
  })

  console.log(`✅ Linked ${tenants.length} tenants to the group`)

  // Verify
  const verifyGroup = await prisma.tenantGroup.findUnique({
    where: { id: group.id },
    include: {
      tenants: {
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          unitNumber: true,
          rentAmount: true,
          status: true,
        },
      },
    },
  })

  console.log('\n📊 Group Summary:')
  console.log(`   Name: ${verifyGroup?.name}`)
  console.log(`   Billing Mode: ${verifyGroup?.billingMode}`)
  console.log(`   Units: ${verifyGroup?.tenants.map(t => t.unitNumber).join(', ')}`)
  const totalRent = verifyGroup?.tenants.reduce((sum, t) => sum + Number(t.rentAmount), 0) || 0
  console.log(`   Total Monthly Rent: AED ${totalRent.toLocaleString()}`)
  console.log('\n✅ Restaurant group created successfully!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
