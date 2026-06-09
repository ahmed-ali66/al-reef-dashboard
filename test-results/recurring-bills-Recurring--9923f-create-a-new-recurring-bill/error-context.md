# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: recurring-bills.spec.ts >> Recurring Bills & Utilities Module - E2E >> 1. should create a new recurring bill
- Location: e2e/recurring-bills.spec.ts:80:7

# Error details

```
Error: Create should return 201

expect(received).toBe(expected) // Object.is equality

Expected: 201
Received: 500
```

# Test source

```ts
  2   |  * E2E Tests for Recurring Bills & Utilities Module
  3   |  * 
  4   |  * Full lifecycle test: CRUD, payments, cycle, summary, field removal verification.
  5   |  * Runs against the LIVE production deployment at al-reef-al-junoobi.vercel.app
  6   |  */
  7   | 
  8   | import { test, expect, Page, BrowserContext } from '@playwright/test'
  9   | 
  10  | const BASE_URL = 'https://al-reef-al-junoobi.vercel.app'
  11  | 
  12  | let testBillId: string
  13  | let testPropertyId: string
  14  | let context: BrowserContext
  15  | let page: Page
  16  | 
  17  | test.describe('Recurring Bills & Utilities Module - E2E', () => {
  18  | 
  19  |   test.beforeAll(async ({ browser }) => {
  20  |     context = await browser.newContext()
  21  |     page = await context.newPage()
  22  | 
  23  |     // Step 1: Navigate to the app
  24  |     await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 })
  25  |     await page.waitForTimeout(2000)
  26  | 
  27  |     // Step 2: Handle login if needed
  28  |     const currentUrl = page.url()
  29  |     const needsLogin = await page.locator('input[type="password"]').isVisible().catch(() => false)
  30  |     
  31  |     if (needsLogin || currentUrl.includes('auth')) {
  32  |       const emailInput = page.locator('input[type="email"], input[name="email"]').first()
  33  |       if (await emailInput.isVisible().catch(() => false)) {
  34  |         await emailInput.fill('admin@alreef.ae')
  35  |       }
  36  |       const passInput = page.locator('input[type="password"]').first()
  37  |       await passInput.fill('AlReef@Admin2024!')
  38  |       
  39  |       const submitBtn = page.locator('button[type="submit"]').first()
  40  |       await submitBtn.click()
  41  |       await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  42  |       await page.waitForTimeout(3000)
  43  |     }
  44  | 
  45  |     // Step 3: Get a property ID via the API (session cookie is now set)
  46  |     try {
  47  |       const propsRes = await page.request.get(`${BASE_URL}/api/properties?limit=5`)
  48  |       if (propsRes.ok()) {
  49  |         const data = await propsRes.json()
  50  |         const props = data.data?.data || data.data || data || []
  51  |         if (Array.isArray(props) && props.length > 0) {
  52  |           testPropertyId = props[0].id
  53  |           console.log(`Got propertyId: ${testPropertyId}`)
  54  |         }
  55  |       } else {
  56  |         console.log(`Properties API returned ${propsRes.status()}`)
  57  |       }
  58  |     } catch (e) {
  59  |       console.log('Failed to fetch properties:', e)
  60  |     }
  61  |   })
  62  | 
  63  |   test.afterAll(async () => {
  64  |     // Clean up test bill
  65  |     if (testBillId) {
  66  |       try {
  67  |         await page.request.delete(`${BASE_URL}/api/recurring-bills/${testBillId}`)
  68  |         console.log(`Cleaned up test bill: ${testBillId}`)
  69  |       } catch (e) {
  70  |         console.log('Cleanup failed:', e)
  71  |       }
  72  |     }
  73  |     await page.close()
  74  |     await context.close()
  75  |   })
  76  | 
  77  |   // ═══════════════════════════════════════════
  78  |   // 1. CREATE: POST /api/recurring-bills
  79  |   // ═══════════════════════════════════════════
  80  |   test('1. should create a new recurring bill', async () => {
  81  |     test.skip(!testPropertyId, 'No property ID available - login may have failed')
  82  | 
  83  |     const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  84  |     const res = await page.request.post(`${BASE_URL}/api/recurring-bills`, {
  85  |       data: {
  86  |         propertyId: testPropertyId,
  87  |         providerName: 'DEWA',
  88  |         serviceType: 'electricity',
  89  |         accountNumber: 'ACC-E2E-001',
  90  |         contractNumber: 'CTR-E2E-001',
  91  |         currentOutstanding: 500,
  92  |         nextDueDate: futureDate,
  93  |         billingFrequency: 'monthly',
  94  |         autoRenew: true,
  95  |         gracePeriodDays: 5,
  96  |         buildingName: 'E2E Test Building',
  97  |         ownerName: 'E2E Test Owner',
  98  |         notes: 'E2E automated test bill',
  99  |       },
  100 |     })
  101 | 
> 102 |     expect(res.status(), 'Create should return 201').toBe(201)
      |                                                      ^ Error: Create should return 201
  103 |     const body = await res.json()
  104 |     const bill = body.data || body
  105 | 
  106 |     // Core fields
  107 |     expect(bill.providerName).toBe('DEWA')
  108 |     expect(bill.serviceType).toBe('electricity')
  109 |     expect(bill.accountNumber).toBe('ACC-E2E-001')
  110 |     expect(bill.contractNumber).toBe('CTR-E2E-001')
  111 |     expect(bill.billingFrequency).toBe('monthly')
  112 |     expect(bill.status).toBe('active')
  113 |     expect(bill.buildingName).toBe('E2E Test Building')
  114 |     expect(bill.autoRenew).toBe(true)
  115 |     expect(bill.gracePeriodDays).toBe(5)
  116 | 
  117 |     // Financials
  118 |     expect(Number(bill.currentOutstanding)).toBe(500)
  119 |     expect(Number(bill.totalAmountDue)).toBe(500) // totalAmountDue = currentOutstanding
  120 | 
  121 |     testBillId = bill.id
  122 |   })
  123 | 
  124 |   // ═══════════════════════════════════════════
  125 |   // 2. REMOVED FIELDS VERIFICATION
  126 |   // ═══════════════════════════════════════════
  127 |   test('2. should NOT have monthlyExpectedAmount or customerNumber', async () => {
  128 |     test.skip(!testBillId, 'No test bill created')
  129 | 
  130 |     const res = await page.request.get(`${BASE_URL}/api/recurring-bills?limit=50`)
  131 |     expect(res.ok()).toBe(true)
  132 |     const body = await res.json()
  133 |     const bills = body.data?.data || body.data || body || []
  134 |     const bill = (Array.isArray(bills) ? bills : []).find((b: any) => b.id === testBillId)
  135 |     expect(bill).toBeDefined()
  136 | 
  137 |     // REMOVED FIELDS — must be undefined
  138 |     expect(bill.monthlyExpectedAmount).toBeUndefined()
  139 |     expect(bill.customerNumber).toBeUndefined()
  140 | 
  141 |     // REMAINING FIELDS — must be present
  142 |     expect(bill.currentOutstanding).toBeDefined()
  143 |     expect(bill.totalAmountDue).toBeDefined()
  144 |     expect(bill.contractNumber).toBeDefined()
  145 |     expect(bill.accountNumber).toBeDefined()
  146 |   })
  147 | 
  148 |   // ═══════════════════════════════════════════
  149 |   // 3. LIST: GET /api/recurring-bills
  150 |   // ═══════════════════════════════════════════
  151 |   test('3. should list recurring bills with pagination', async () => {
  152 |     const res = await page.request.get(`${BASE_URL}/api/recurring-bills?limit=10&page=1`)
  153 |     expect(res.ok()).toBe(true)
  154 |     const body = await res.json()
  155 |     const data = body.data || body
  156 |     const bills = data.data || (Array.isArray(data) ? data : [])
  157 |     expect(Array.isArray(bills)).toBe(true)
  158 |   })
  159 | 
  160 |   // ═══════════════════════════════════════════
  161 |   // 4. FILTER: serviceType
  162 |   // ═══════════════════════════════════════════
  163 |   test('4. should filter bills by serviceType=electricity', async () => {
  164 |     const res = await page.request.get(`${BASE_URL}/api/recurring-bills?serviceType=electricity&limit=100`)
  165 |     expect(res.ok()).toBe(true)
  166 |     const body = await res.json()
  167 |     const bills = body.data?.data || body.data || body || []
  168 |     const arr = Array.isArray(bills) ? bills : []
  169 |     arr.forEach((bill: any) => {
  170 |       expect(bill.serviceType).toBe('electricity')
  171 |     })
  172 |   })
  173 | 
  174 |   // ═══════════════════════════════════════════
  175 |   // 5. FILTER: overdue bills
  176 |   // ═══════════════════════════════════════════
  177 |   test('5. should filter overdue bills', async () => {
  178 |     const res = await page.request.get(`${BASE_URL}/api/recurring-bills?overdue=true`)
  179 |     expect(res.ok()).toBe(true)
  180 |     const body = await res.json()
  181 |     const bills = body.data?.data || body.data || body || []
  182 |     const arr = Array.isArray(bills) ? bills : []
  183 |     arr.forEach((bill: any) => {
  184 |       expect(bill.status).toBe('active')
  185 |       expect(new Date(bill.nextDueDate).getTime()).toBeLessThan(Date.now())
  186 |     })
  187 |   })
  188 | 
  189 |   // ═══════════════════════════════════════════
  190 |   // 6. FILTER: upcoming bills
  191 |   // ═══════════════════════════════════════════
  192 |   test('6. should filter upcoming bills', async () => {
  193 |     const res = await page.request.get(`${BASE_URL}/api/recurring-bills?upcoming=true`)
  194 |     expect(res.ok()).toBe(true)
  195 |   })
  196 | 
  197 |   // ═══════════════════════════════════════════
  198 |   // 7. UPDATE: PUT /api/recurring-bills/[id]
  199 |   // ═══════════════════════════════════════════
  200 |   test('7. should update a recurring bill', async () => {
  201 |     test.skip(!testBillId, 'No test bill')
  202 | 
```