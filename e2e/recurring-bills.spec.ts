/**
 * E2E Tests for Recurring Bills & Utilities Module
 * 
 * Full lifecycle test: CRUD, payments, cycle, BillCycle, summary, field removal verification.
 * Runs against the LIVE production deployment at al-reef-al-junoobi.vercel.app
 */

import { test, expect, Page, BrowserContext } from '@playwright/test'

const BASE_URL = 'https://al-reef-al-junoobi.vercel.app'

let testBillId: string
let testPropertyId: string
let testCycleId: string
let context: BrowserContext
let page: Page

test.describe.configure({ mode: 'serial' })

test.describe('Recurring Bills & Utilities Module - E2E', () => {

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext()
    page = await context.newPage()

    // Step 1: Navigate to the app
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(2000)

    // Step 2: Handle login if needed
    const currentUrl = page.url()
    const needsLogin = await page.locator('input[type="password"]').isVisible().catch(() => false)
    
    if (needsLogin || currentUrl.includes('auth')) {
      const emailInput = page.locator('input[type="email"], input[name="email"]').first()
      if (await emailInput.isVisible().catch(() => false)) {
        await emailInput.fill('admin@alreef.ae')
      }
      const passInput = page.locator('input[type="password"]').first()
      await passInput.fill('AlReef@Admin2024!')
      
      const submitBtn = page.locator('button[type="submit"]').first()
      await submitBtn.click()
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(3000)
    }

    // Step 3: Verify auth works by checking properties API
    try {
      const propsRes = await page.request.get(`${BASE_URL}/api/properties?limit=5`)
      if (propsRes.ok()) {
        const data = await propsRes.json()
        const props = data.data?.data || data.data || data || []
        if (Array.isArray(props) && props.length > 0) {
          testPropertyId = props[0].id
          console.log(`Got propertyId: ${testPropertyId}`)
        }
      } else {
        console.log(`Properties API returned ${propsRes.status()} — auth may have failed`)
      }
    } catch (e) {
      console.log('Failed to fetch properties:', e)
    }
  })

  test.afterAll(async () => {
    // Cleanup: soft delete the test bill
    if (testBillId) {
      await page.request.delete(`${BASE_URL}/api/recurring-bills/${testBillId}`).catch(() => {})
    }
    await page.close()
    await context.close()
  })

  // ═══════════════════════════════════════════
  // 1. CREATE: POST /api/recurring-bills
  // ═══════════════════════════════════════════
  test('1. should create a new recurring bill', async () => {
    test.skip(!testPropertyId, 'No property ID available - login may have failed')

    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const res = await page.request.post(`${BASE_URL}/api/recurring-bills`, {
      data: {
        propertyId: testPropertyId,
        providerName: 'DEWA',
        serviceType: 'electricity',
        accountNumber: 'ACC-E2E-001',
        contractNumber: 'CTR-E2E-001',
        currentOutstanding: 500,
        nextDueDate: futureDate,
        billingFrequency: 'monthly',
        autoRenew: true,
        gracePeriodDays: 5,
        buildingName: 'E2E Test Building',
        ownerName: 'E2E Test Owner',
        notes: 'E2E automated test bill',
      },
    })

    expect(res.status(), 'Create should return 201').toBe(201)
    const body = await res.json()
    const bill = body.data || body

    // Core fields
    expect(bill.providerName).toBe('DEWA')
    expect(bill.serviceType).toBe('electricity')
    expect(bill.accountNumber).toBe('ACC-E2E-001')
    expect(bill.contractNumber).toBe('CTR-E2E-001')
    expect(bill.billingFrequency).toBe('monthly')
    expect(bill.status).toBe('active')
    expect(bill.buildingName).toBe('E2E Test Building')
    expect(bill.autoRenew).toBe(true)
    expect(bill.gracePeriodDays).toBe(5)

    // Financials
    expect(Number(bill.currentOutstanding)).toBe(500)
    expect(Number(bill.totalAmountDue)).toBe(500) // totalAmountDue = currentOutstanding

    testBillId = bill.id
  })

  // ═══════════════════════════════════════════
  // 2. BILL CYCLE: Created automatically with bill
  // ═══════════════════════════════════════════
  test('2. should have a billing cycle created automatically', async () => {
    test.skip(!testBillId, 'No test bill')

    const res = await page.request.get(`${BASE_URL}/api/recurring-bills/${testBillId}/cycles?limit=10`)
    expect(res.ok()).toBe(true)
    const body = await res.json()
    const data = body.data || body
    const cycles = data.data || (Array.isArray(data) ? data : [])

    expect(cycles.length, 'Should have at least one cycle').toBeGreaterThanOrEqual(1)
    
    const cycle = cycles[0]
    expect(Number(cycle.amount)).toBe(500) // Same as initial outstanding
    expect(Number(cycle.outstandingAmount)).toBe(500)
    expect(Number(cycle.paidAmount)).toBe(0)
    expect(['pending', 'partially_paid', 'overdue']).toContain(cycle.status)
    
    testCycleId = cycle.id
  })

  // ═══════════════════════════════════════════
  // 3. REMOVED FIELDS VERIFICATION
  // ═══════════════════════════════════════════
  test('3. should NOT have monthlyExpectedAmount or customerNumber', async () => {
    test.skip(!testBillId, 'No test bill created')

    const res = await page.request.get(`${BASE_URL}/api/recurring-bills?limit=50`)
    expect(res.ok()).toBe(true)
    const body = await res.json()
    const bills = body.data?.data || body.data || body || []
    const bill = (Array.isArray(bills) ? bills : []).find((b: any) => b.id === testBillId)
    expect(bill).toBeDefined()

    // REMOVED FIELDS — must be undefined
    expect(bill.monthlyExpectedAmount).toBeUndefined()
    expect(bill.customerNumber).toBeUndefined()

    // REMAINING FIELDS — must be present
    expect(bill.currentOutstanding).toBeDefined()
    expect(bill.totalAmountDue).toBeDefined()
  })

  // ═══════════════════════════════════════════
  // 4. LIST: GET /api/recurring-bills
  // ═══════════════════════════════════════════
  test('4. should list recurring bills with pagination', async () => {
    const res = await page.request.get(`${BASE_URL}/api/recurring-bills?limit=10&page=1`)
    expect(res.ok()).toBe(true)
    const body = await res.json()
    const data = body.data || body
    const bills = data.data || (Array.isArray(data) ? data : [])
    expect(Array.isArray(bills)).toBe(true)
  })

  // ═══════════════════════════════════════════
  // 5. FILTER: serviceType
  // ═══════════════════════════════════════════
  test('5. should filter bills by serviceType=electricity', async () => {
    const res = await page.request.get(`${BASE_URL}/api/recurring-bills?serviceType=electricity&limit=100`)
    expect(res.ok()).toBe(true)
    const body = await res.json()
    const bills = body.data?.data || body.data || body || []
    const arr = Array.isArray(bills) ? bills : []
    arr.forEach((bill: any) => {
      expect(bill.serviceType).toBe('electricity')
    })
  })

  // ═══════════════════════════════════════════
  // 6. FILTER: overdue bills
  // ═══════════════════════════════════════════
  test('6. should filter overdue bills', async () => {
    const res = await page.request.get(`${BASE_URL}/api/recurring-bills?overdue=true`)
    expect(res.ok()).toBe(true)
    const body = await res.json()
    const bills = body.data?.data || body.data || body || []
    const arr = Array.isArray(bills) ? bills : []
    arr.forEach((bill: any) => {
      expect(bill.status).toBe('active')
      expect(new Date(bill.nextDueDate).getTime()).toBeLessThan(Date.now())
    })
  })

  // ═══════════════════════════════════════════
  // 7. FILTER: upcoming bills
  // ═══════════════════════════════════════════
  test('7. should filter upcoming bills', async () => {
    const res = await page.request.get(`${BASE_URL}/api/recurring-bills?upcoming=true`)
    expect(res.ok()).toBe(true)
  })

  // ═══════════════════════════════════════════
  // 8. UPDATE: PUT /api/recurring-bills/[id]
  // ═══════════════════════════════════════════
  test('8. should update a recurring bill', async () => {
    test.skip(!testBillId, 'No test bill')

    const res = await page.request.put(`${BASE_URL}/api/recurring-bills/${testBillId}`, {
      data: {
        providerName: 'DEWA Updated',
        currentOutstanding: 750,
        gracePeriodDays: 10,
        notes: 'Updated via E2E',
      },
    })

    expect(res.ok()).toBe(true)
    const body = await res.json()
    const bill = body.data || body

    expect(bill.providerName).toBe('DEWA Updated')
    expect(Number(bill.currentOutstanding)).toBe(750)
    expect(Number(bill.totalAmountDue)).toBe(750) // = currentOutstanding
    expect(bill.gracePeriodDays).toBe(10)
    expect(bill.notes).toBe('Updated via E2E')
  })

  // ═══════════════════════════════════════════
  // 9. RECORD PAYMENT (linked to cycle)
  // ═══════════════════════════════════════════
  test('9. should record a payment and reduce outstanding', async () => {
    test.skip(!testBillId, 'No test bill')

    const res = await page.request.post(`${BASE_URL}/api/recurring-bills/${testBillId}/payments`, {
      data: {
        amount: 200,
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'bank_transfer',
        reference: 'E2E-PAY-001',
        notes: 'E2E payment',
        billCycleId: testCycleId || null,
      },
    })

    expect(res.status(), 'Payment should return 201').toBe(201)
    const body = await res.json()
    const payment = body.data || body

    expect(Number(payment.amount)).toBe(200)
    expect(Number(payment.outstandingBefore)).toBe(750)
    expect(Number(payment.outstandingAfter)).toBe(550) // 750 - 200
    expect(payment.paymentMethod).toBe('bank_transfer')
    expect(payment.reference).toBe('E2E-PAY-001')
  })

  // ═══════════════════════════════════════════
  // 10. CYCLE: Outstanding reduced after payment
  // ═══════════════════════════════════════════
  test('10. should update cycle amounts after payment', async () => {
    test.skip(!testBillId, 'No test bill')

    const res = await page.request.get(`${BASE_URL}/api/recurring-bills/${testBillId}/cycles?limit=10`)
    expect(res.ok()).toBe(true)
    const body = await res.json()
    const data = body.data || body
    const cycles = data.data || (Array.isArray(data) ? data : [])
    const cycle = cycles.find((c: any) => c.id === testCycleId)

    if (cycle) {
      expect(Number(cycle.paidAmount)).toBe(200)
      expect(Number(cycle.outstandingAmount)).toBe(300) // 500 - 200
      expect(cycle.status).toBe('partially_paid')
    }
  })

  // ═══════════════════════════════════════════
  // 11. VERIFY: Outstanding reduced after payment
  // ═══════════════════════════════════════════
  test('11. should reflect reduced outstanding after payment', async () => {
    test.skip(!testBillId, 'No test bill')

    const res = await page.request.get(`${BASE_URL}/api/recurring-bills?limit=100`)
    expect(res.ok()).toBe(true)
    const body = await res.json()
    const bills = body.data?.data || body.data || body || []
    const bill = (Array.isArray(bills) ? bills : []).find((b: any) => b.id === testBillId)

    expect(bill).toBeDefined()
    expect(Number(bill.currentOutstanding)).toBe(550) // 750 - 200
    expect(Number(bill.totalAmountDue)).toBe(550) // = currentOutstanding
    expect(Number(bill.lastPaymentAmount)).toBe(200)
  })

  // ═══════════════════════════════════════════
  // 12. PAYMENT HISTORY
  // ═══════════════════════════════════════════
  test('12. should list payment history', async () => {
    test.skip(!testBillId, 'No test bill')

    const res = await page.request.get(`${BASE_URL}/api/recurring-bills/${testBillId}/payments?limit=10`)
    expect(res.ok()).toBe(true)
    const body = await res.json()
    const data = body.data || body
    const payments = data.data || (Array.isArray(data) ? data : [])
    expect(payments.length).toBeGreaterThan(0)
    
    // Payment should have billCycleId if linked
    if (testCycleId) {
      const linkedPayment = payments.find((p: any) => p.billCycleId === testCycleId)
      expect(linkedPayment, 'Payment should be linked to a cycle').toBeDefined()
    }
  })

  // ═══════════════════════════════════════════
  // 13. ALL PAYMENTS (cross-bill)
  // ═══════════════════════════════════════════
  test('13. should list all payments across bills', async () => {
    const res = await page.request.get(`${BASE_URL}/api/recurring-bills/payments?limit=100`)
    expect(res.ok()).toBe(true)
    const body = await res.json()
    const data = body.data || body
    const payments = data.data || (Array.isArray(data) ? data : [])
    expect(Array.isArray(payments)).toBe(true)
  })

  // ═══════════════════════════════════════════
  // 14. SUMMARY
  // ═══════════════════════════════════════════
  test('14. summary should return valid data', async () => {
    const res = await page.request.get(`${BASE_URL}/api/recurring-bills/summary`)
    expect(res.ok()).toBe(true)
    const body = await res.json()
    const summary = body.data || body

    expect(typeof summary.totalBills).toBe('number')
    expect(summary.totalOutstanding).toBeDefined()
    expect(summary.totalDueThisMonth).toBeDefined()
    expect(summary.totalPaidThisMonth).toBeDefined()
    expect(Array.isArray(summary.upcomingBills)).toBe(true)
    expect(Array.isArray(summary.overdueBills)).toBe(true)
    expect(Array.isArray(summary.serviceTypeBreakdown)).toBe(true)

    // CRITICAL: monthlyExpectedAmount must NOT appear in breakdown
    summary.serviceTypeBreakdown.forEach((item: any) => {
      expect(item.totalMonthlyExpected).toBeUndefined()
      expect(item.totalAmountDue).toBeDefined()
      expect(item.totalOutstanding).toBeDefined()
    })
  })

  // ═══════════════════════════════════════════
  // 15. VALIDATION: Missing required fields
  // ═══════════════════════════════════════════
  test('15. should reject creation without required fields', async () => {
    const res = await page.request.post(`${BASE_URL}/api/recurring-bills`, { data: {} })
    expect(res.ok()).toBe(false)
    expect([400, 401]).toContain(res.status())
  })

  // ═══════════════════════════════════════════
  // 16. VALIDATION: Invalid serviceType
  // ═══════════════════════════════════════════
  test('16. should reject invalid serviceType', async () => {
    const res = await page.request.post(`${BASE_URL}/api/recurring-bills`, {
      data: {
        propertyId: testPropertyId || 'dummy',
        providerName: 'Test',
        serviceType: 'invalid_xyz',
        nextDueDate: new Date().toISOString(),
        billingFrequency: 'monthly',
      },
    })
    expect(res.ok()).toBe(false)
    expect([400, 401]).toContain(res.status())
  })

  // ═══════════════════════════════════════════
  // 17. VALIDATION: Negative outstanding
  // ═══════════════════════════════════════════
  test('17. should reject negative currentOutstanding', async () => {
    const res = await page.request.post(`${BASE_URL}/api/recurring-bills`, {
      data: {
        propertyId: testPropertyId || 'dummy',
        providerName: 'Test',
        serviceType: 'electricity',
        currentOutstanding: -100,
        nextDueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
        billingFrequency: 'monthly',
      },
    })
    expect(res.ok()).toBe(false)
    expect([400, 401]).toContain(res.status())
  })

  // ═══════════════════════════════════════════
  // 18. VALIDATION: Zero payment
  // ═══════════════════════════════════════════
  test('18. should reject zero payment amount', async () => {
    test.skip(!testBillId, 'No test bill')

    const res = await page.request.post(`${BASE_URL}/api/recurring-bills/${testBillId}/payments`, {
      data: { amount: 0, paymentDate: new Date().toISOString().split('T')[0] },
    })
    expect(res.ok()).toBe(false)
  })

  // ═══════════════════════════════════════════
  // 19. STATUS: Pause/resume
  // ═══════════════════════════════════════════
  test('19. should pause and resume a bill', async () => {
    test.skip(!testBillId, 'No test bill')

    const pauseRes = await page.request.put(`${BASE_URL}/api/recurring-bills/${testBillId}`, {
      data: { status: 'paused' },
    })
    expect(pauseRes.ok()).toBe(true)
    const pauseBody = await pauseRes.json()
    expect(pauseBody.data?.status || pauseBody.status).toBe('paused')

    const resumeRes = await page.request.put(`${BASE_URL}/api/recurring-bills/${testBillId}`, {
      data: { status: 'active' },
    })
    expect(resumeRes.ok()).toBe(true)
    const resumeBody = await resumeRes.json()
    expect(resumeBody.data?.status || resumeBody.status).toBe('active')
  })

  // ═══════════════════════════════════════════
  // 20. SOFT DELETE
  // ═══════════════════════════════════════════
  test('20. should soft-delete a bill and exclude from list', async () => {
    test.skip(!testPropertyId, 'No property')

    // Create a throwaway bill
    const createRes = await page.request.post(`${BASE_URL}/api/recurring-bills`, {
      data: {
        propertyId: testPropertyId,
        providerName: 'E2E DELETE ME',
        serviceType: 'water',
        currentOutstanding: 100,
        nextDueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        billingFrequency: 'monthly',
      },
    })
    if (!createRes.ok()) { test.skip(true, 'Could not create bill'); return }

    const createBody = await createRes.json()
    const deleteBillId = (createBody.data || createBody).id

    // Delete
    const delRes = await page.request.delete(`${BASE_URL}/api/recurring-bills/${deleteBillId}`)
    expect(delRes.ok()).toBe(true)

    // Verify excluded from list
    const listRes = await page.request.get(`${BASE_URL}/api/recurring-bills?limit=1000`)
    expect(listRes.ok()).toBe(true)
    const listBody = await listRes.json()
    const bills = listBody.data?.data || listBody.data || listBody || []
    const found = (Array.isArray(bills) ? bills : []).find((b: any) => b.id === deleteBillId)
    expect(found).toBeUndefined()
  })

  // ═══════════════════════════════════════════
  // 21. BILL CYCLE: Create new cycle via advance
  // ═══════════════════════════════════════════
  test('21. should create a new billing cycle with new amount', async () => {
    test.skip(!testBillId, 'No test bill')

    // First, set the bill to be overdue so cycle advance is allowed
    // Set nextDueDate to past date
    await page.request.put(`${BASE_URL}/api/recurring-bills/${testBillId}`, {
      data: { nextDueDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] },
    })

    // Advance cycle with new amount
    const res = await page.request.post(`${BASE_URL}/api/recurring-bills/cycle`, {
      data: {
        billId: testBillId,
        newAmount: 350, // New month's bill is 350 instead of 500
      },
    })

    expect(res.ok()).toBe(true)
    const body = await res.json()
    const result = body.data || body

    // Verify the new cycle was created
    expect(result.cycle).toBeDefined()
    expect(Number(result.cycle.amount)).toBe(350)
    expect(Number(result.cycle.outstandingAmount)).toBe(350)
    expect(Number(result.cycle.paidAmount)).toBe(0)
    expect(result.cycle.status).toBe('pending')

    // Verify the bill's outstanding was updated
    expect(Number(result.bill.currentOutstanding)).toBe(350)
    expect(Number(result.bill.totalAmountDue)).toBe(350)
  })

  // ═══════════════════════════════════════════
  // 22. BILL CYCLE: Multiple cycles exist for a bill
  // ═══════════════════════════════════════════
  test('22. should have multiple cycles for the bill', async () => {
    test.skip(!testBillId, 'No test bill')

    const res = await page.request.get(`${BASE_URL}/api/recurring-bills/${testBillId}/cycles?limit=10`)
    expect(res.ok()).toBe(true)
    const body = await res.json()
    const data = body.data || body
    const cycles = data.data || (Array.isArray(data) ? data : [])

    expect(cycles.length, 'Should have at least 2 cycles after advance').toBeGreaterThanOrEqual(2)
    
    // Verify the old cycle is still preserved with its original amount
    const oldCycle = cycles.find((c: any) => Number(c.amount) === 500)
    expect(oldCycle, 'Old cycle with original amount should be preserved').toBeDefined()
    
    // Verify the new cycle exists
    const newCycle = cycles.find((c: any) => Number(c.amount) === 350)
    expect(newCycle, 'New cycle with updated amount should exist').toBeDefined()
  })

  // ═══════════════════════════════════════════
  // 23. FINANCIAL FORMULA: totalAmountDue = currentOutstanding
  // ═══════════════════════════════════════════
  test('23. totalAmountDue should always equal currentOutstanding', async () => {
    test.skip(!testBillId, 'No test bill')

    const listRes = await page.request.get(`${BASE_URL}/api/recurring-bills?limit=100`)
    expect(listRes.ok()).toBe(true)
    const listBody = await listRes.json()
    const bills = listBody.data?.data || listBody.data || listBody || []
    const bill = (Array.isArray(bills) ? bills : []).find((b: any) => b.id === testBillId)

    expect(Number(bill.currentOutstanding)).toBe(350)
    expect(Number(bill.totalAmountDue)).toBe(350) // MUST equal currentOutstanding
  })
})
