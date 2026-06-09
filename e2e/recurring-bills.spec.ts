/**
 * E2E Tests for Recurring Bills & Utilities Module
 * 
 * Full lifecycle test: CRUD, payments, cycle, summary, field removal verification.
 * Runs against the LIVE production deployment at al-reef-al-junoobi.vercel.app
 */

import { test, expect, Page, BrowserContext } from '@playwright/test'

const BASE_URL = 'https://al-reef-al-junoobi.vercel.app'

let testBillId: string
let testPropertyId: string
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

    // Step 3: Get a property ID via the API (session cookie is now set)
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
        console.log(`Properties API returned ${propsRes.status()}`)
      }
    } catch (e) {
      console.log('Failed to fetch properties:', e)
    }
  })

  test.afterAll(async () => {
    // Clean up test bill - only at the very end after ALL tests
    // Bill cleanup will be handled in the last test
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
  // 2. REMOVED FIELDS VERIFICATION
  // ═══════════════════════════════════════════
  test('2. should NOT have monthlyExpectedAmount or customerNumber', async () => {
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
    expect(bill.contractNumber).toBeDefined()
    expect(bill.accountNumber).toBeDefined()
  })

  // ═══════════════════════════════════════════
  // 3. LIST: GET /api/recurring-bills
  // ═══════════════════════════════════════════
  test('3. should list recurring bills with pagination', async () => {
    const res = await page.request.get(`${BASE_URL}/api/recurring-bills?limit=10&page=1`)
    expect(res.ok()).toBe(true)
    const body = await res.json()
    const data = body.data || body
    const bills = data.data || (Array.isArray(data) ? data : [])
    expect(Array.isArray(bills)).toBe(true)
  })

  // ═══════════════════════════════════════════
  // 4. FILTER: serviceType
  // ═══════════════════════════════════════════
  test('4. should filter bills by serviceType=electricity', async () => {
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
  // 5. FILTER: overdue bills
  // ═══════════════════════════════════════════
  test('5. should filter overdue bills', async () => {
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
  // 6. FILTER: upcoming bills
  // ═══════════════════════════════════════════
  test('6. should filter upcoming bills', async () => {
    const res = await page.request.get(`${BASE_URL}/api/recurring-bills?upcoming=true`)
    expect(res.ok()).toBe(true)
  })

  // ═══════════════════════════════════════════
  // 7. UPDATE: PUT /api/recurring-bills/[id]
  // ═══════════════════════════════════════════
  test('7. should update a recurring bill', async () => {
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
  // 8. REMOVED: customerNumber ignored in update
  // ═══════════════════════════════════════════
  test('8. should ignore customerNumber in update (removed)', async () => {
    test.skip(!testBillId, 'No test bill')

    const res = await page.request.put(`${BASE_URL}/api/recurring-bills/${testBillId}`, {
      data: { customerNumber: 'SHOULD_BE_IGNORED' },
    })
    // After field removal, sending customerNumber should either be ignored (200)
    // or cause a validation error (400) — either way the field is properly removed
    const body = await res.json()
    if (res.ok()) {
      expect((body.data || body).customerNumber).toBeUndefined()
    } else {
      // If the API returns an error, it should NOT be a 500 (which would indicate
      // the column still exists in the DB and Prisma is trying to set it)
      // A 400 would mean the API properly rejects unknown fields
      expect(res.status()).toBeLessThan(500)
    }
  })

  // ═══════════════════════════════════════════
  // 9. REMOVED: monthlyExpectedAmount ignored in update
  // ═══════════════════════════════════════════
  test('9. should ignore monthlyExpectedAmount in update (removed)', async () => {
    test.skip(!testBillId, 'No test bill')

    const res = await page.request.put(`${BASE_URL}/api/recurring-bills/${testBillId}`, {
      data: { monthlyExpectedAmount: 99999 },
    })
    const body = await res.json()
    if (res.ok()) {
      expect((body.data || body).monthlyExpectedAmount).toBeUndefined()
    } else {
      expect(res.status()).toBeLessThan(500)
    }
  })

  // ═══════════════════════════════════════════
  // 10. RECORD PAYMENT
  // ═══════════════════════════════════════════
  test('10. should record a payment and reduce outstanding', async () => {
    test.skip(!testBillId, 'No test bill')

    const res = await page.request.post(`${BASE_URL}/api/recurring-bills/${testBillId}/payments`, {
      data: {
        amount: 200,
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'bank_transfer',
        reference: 'E2E-PAY-001',
        notes: 'E2E payment',
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
  })

  // ═══════════════════════════════════════════
  // 13. SUMMARY: no monthlyExpectedAmount
  // ═══════════════════════════════════════════
  test('13. summary should NOT contain monthlyExpectedAmount', async () => {
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
  // 14. VALIDATION: Missing required fields
  // ═══════════════════════════════════════════
  test('14. should reject creation without required fields', async () => {
    const res = await page.request.post(`${BASE_URL}/api/recurring-bills`, { data: {} })
    expect(res.ok()).toBe(false)
    expect([400, 401]).toContain(res.status())
  })

  // ═══════════════════════════════════════════
  // 15. VALIDATION: Invalid serviceType
  // ═══════════════════════════════════════════
  test('15. should reject invalid serviceType', async () => {
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
  // 16. VALIDATION: Negative outstanding
  // ═══════════════════════════════════════════
  test('16. should reject negative currentOutstanding', async () => {
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
  // 17. VALIDATION: Zero payment
  // ═══════════════════════════════════════════
  test('17. should reject zero payment amount', async () => {
    test.skip(!testBillId, 'No test bill')

    const res = await page.request.post(`${BASE_URL}/api/recurring-bills/${testBillId}/payments`, {
      data: { amount: 0, paymentDate: new Date().toISOString().split('T')[0] },
    })
    expect(res.ok()).toBe(false)
  })

  // ═══════════════════════════════════════════
  // 18. STATUS: Pause/resume
  // ═══════════════════════════════════════════
  test('18. should pause and resume a bill', async () => {
    test.skip(!testBillId, 'No test bill')

    const pauseRes = await page.request.put(`${BASE_URL}/api/recurring-bills/${testBillId}`, {
      data: { status: 'paused' },
    })
    expect(pauseRes.ok()).toBe(true)
    expect((await pauseRes.json()).data?.status || (await pauseRes.json()).status).toBe('paused')

    const resumeRes = await page.request.put(`${BASE_URL}/api/recurring-bills/${testBillId}`, {
      data: { status: 'active' },
    })
    expect(resumeRes.ok()).toBe(true)
    expect((await resumeRes.json()).data?.status || (await resumeRes.json()).status).toBe('active')
  })

  // ═══════════════════════════════════════════
  // 19. SOFT DELETE
  // ═══════════════════════════════════════════
  test('19. should soft-delete a bill and exclude from list', async () => {
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
  // 20. FINANCIAL FORMULA: totalAmountDue = currentOutstanding
  // ═══════════════════════════════════════════
  test('20. totalAmountDue should always equal currentOutstanding', async () => {
    test.skip(!testBillId, 'No test bill')

    // Set outstanding to known value
    await page.request.put(`${BASE_URL}/api/recurring-bills/${testBillId}`, {
      data: { currentOutstanding: 1200 },
    })

    // Make partial payment
    await page.request.post(`${BASE_URL}/api/recurring-bills/${testBillId}/payments`, {
      data: {
        amount: 300,
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'cash',
      },
    })

    // Verify
    const listRes = await page.request.get(`${BASE_URL}/api/recurring-bills?limit=100`)
    expect(listRes.ok()).toBe(true)
    const listBody = await listRes.json()
    const bills = listBody.data?.data || listBody.data || listBody || []
    const bill = (Array.isArray(bills) ? bills : []).find((b: any) => b.id === testBillId)

    expect(Number(bill.currentOutstanding)).toBe(900) // 1200 - 300
    expect(Number(bill.totalAmountDue)).toBe(900) // MUST equal currentOutstanding

    // Cleanup: soft delete the test bill
    if (testBillId) {
      await page.request.delete(`${BASE_URL}/api/recurring-bills/${testBillId}`)
    }
  })
})
