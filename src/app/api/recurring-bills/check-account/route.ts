import prisma from '@/lib/db'
import {
  getAuthUser,
  errorResponse,
  successResponse,
  unauthorizedResponse,
} from '@/lib/api-utils'

// GET /api/recurring-bills/check-account?accountNumber=X
// Check if an account number already exists in the company
export async function GET(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const { searchParams } = new URL(request.url)
    const accountNumber = searchParams.get('accountNumber')?.trim()

    if (!accountNumber) {
      return successResponse({ exists: false, bills: [] })
    }

    // Search for existing bills with same account number in same company (not deleted)
    const existingBills = await prisma.recurringBill.findMany({
      where: {
        companyId: user.companyId,
        accountNumber: accountNumber,
        deletedAt: null,
      },
      select: {
        id: true,
        providerName: true,
        serviceType: true,
        accountNumber: true,
        buildingName: true,
        ownerName: true,
        currentOutstanding: true,
        property: {
          select: { name: true },
        },
      },
    })

    if (existingBills.length === 0) {
      return successResponse({ exists: false, bills: [] })
    }

    // Return matching bills with relevant info
    const bills = existingBills.map(bill => ({
      id: bill.id,
      providerName: bill.providerName,
      serviceType: bill.serviceType,
      accountNumber: bill.accountNumber,
      propertyName: bill.property?.name || null,
      buildingName: bill.buildingName || null,
      ownerName: bill.ownerName || null,
      currentOutstanding: Number(bill.currentOutstanding),
    }))

    return successResponse({ exists: true, bills })
  } catch (error) {
    console.error('Error checking account number:', error)
    return errorResponse('Failed to check account number', 500)
  }
}
