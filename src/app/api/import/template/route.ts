import * as XLSX from 'xlsx'
import { getAuthUser, unauthorizedResponse, forbiddenResponse } from '@/lib/api-utils'

// GET /api/import/template — Download an XLSX import template
export async function GET(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    if (user.role !== 'owner' && user.role !== 'admin') {
      return forbiddenResponse('Only owners and admins can download templates')
    }

    const url = new URL(request.url)
    const type = url.searchParams.get('type') || 'all' // all, properties, tenants, expenses, maintenance

    const workbook = XLSX.utils.book_new()

    // Properties sheet
    if (type === 'all' || type === 'properties') {
      const propertiesData = [
        {
          name: 'Building A',
          name_ar: 'المبنى أ',
          type: 'apartment',
          address: '123 Main Street',
          total_units: 20,
          floors: 5,
        },
        {
          name: 'Villa 1',
          name_ar: 'فيلا ١',
          type: 'villa',
          address: '456 Palm Road',
          total_units: 1,
          floors: 2,
        },
      ]
      const ws = XLSX.utils.json_to_sheet(propertiesData)
      // Set column widths
      ws['!cols'] = [
        { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 12 }, { wch: 8 },
      ]
      XLSX.utils.book_append_sheet(workbook, ws, 'Properties')
    }

    // Tenants sheet
    if (type === 'all' || type === 'tenants') {
      const tenantsData = [
        {
          name: 'Ahmed Ali',
          name_ar: 'أحمد علي',
          phone: '+971501234567',
          whatsapp: '+971501234567',
          email: 'ahmed@example.com',
          emirates_id: '784-1990-1234567-1',
          nationality: 'UAE',
          employer: 'ABC Corp',
          emergency_contact: '+971509876543',
          unit_number: '101',
          unit_type: '1bedroom',
          floor: 1,
          size_sqft: 850,
          rent_amount: 45000,
          municipality_fee: 0,
          security_deposit: 4500,
          payment_method: 'bank_transfer',
          lease_start: '2024-01-01',
          lease_end: '2024-12-31',
          contract_duration: 12,
          property_name: 'Building A',
          status: 'active',
          notes: '',
        },
      ]
      const ws = XLSX.utils.json_to_sheet(tenantsData)
      ws['!cols'] = [
        { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 20 },
        { wch: 20 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 10 },
        { wch: 12 }, { wch: 6 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 8 },
        { wch: 15 }, { wch: 10 }, { wch: 15 },
      ]
      XLSX.utils.book_append_sheet(workbook, ws, 'Tenants')
    }

    // Expenses sheet
    if (type === 'all' || type === 'expenses') {
      const expensesData = [
        {
          category: 'utilities',
          description: 'Electricity bill - January',
          amount: 5000,
          date: '2024-01-15',
          vendor: 'DEWA',
          invoice_number: 'INV-2024-001',
          recurring: 'no',
          building: 'Building A',
        },
      ]
      const ws = XLSX.utils.json_to_sheet(expensesData)
      ws['!cols'] = [
        { wch: 15 }, { wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 15 },
        { wch: 18 }, { wch: 8 }, { wch: 15 },
      ]
      XLSX.utils.book_append_sheet(workbook, ws, 'Expenses')
    }

    // Maintenance sheet
    if (type === 'all' || type === 'maintenance') {
      const maintenanceData = [
        {
          title: 'AC not cooling',
          description: 'Tenant reports AC unit in unit 101 is not cooling properly',
          category: 'ac',
          vendor: 'CoolTech Services',
          priority: 'high',
          status: 'pending',
          estimated_cost: 500,
          actual_cost: '',
        },
      ]
      const ws = XLSX.utils.json_to_sheet(maintenanceData)
      ws['!cols'] = [
        { wch: 20 }, { wch: 50 }, { wch: 12 }, { wch: 18 }, { wch: 10 },
        { wch: 10 }, { wch: 14 }, { wch: 12 },
      ]
      XLSX.utils.book_append_sheet(workbook, ws, 'Maintenance')
    }

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="al-reef-import-template.xlsx"`,
      },
    })
  } catch (error) {
    console.error('Template generation error:', error)
    return Response.json({ error: 'Failed to generate template' }, { status: 500 })
  }
}
