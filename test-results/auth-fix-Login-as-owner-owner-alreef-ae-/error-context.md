# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth-fix.spec.ts >> Login as owner (owner@alreef.ae)
- Location: e2e/auth-fix.spec.ts:13:7

# Error details

```
TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('[class*="sidebar"], [class*="dashboard"], nav') to be visible
    - waiting for" https://al-reef-al-junoobi.vercel.app/api/auth/error" navigation to finish...
    - navigated to "https://al-reef-al-junoobi.vercel.app/api/auth/error"

```

# Page snapshot

```yaml
- generic [ref=e2]: "{\"error\":\"Unauthorized\"}"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | const BASE_URL = 'https://al-reef-al-junoobi.vercel.app';
  4  | 
  5  | const accounts = [
  6  |   { email: 'owner@alreef.ae', password: 'Alreef@2025', role: 'owner' },
  7  |   { email: 'admin@alreef.ae', password: 'Alreef@2025', role: 'admin' },
  8  |   { email: 'accountant@alreef.ae', password: 'Alreef@2025', role: 'accountant' },
  9  |   { email: 'staff@alreef.ae', password: 'Alreef@2025', role: 'staff' },
  10 | ];
  11 | 
  12 | for (const account of accounts) {
  13 |   test(`Login as ${account.role} (${account.email})`, async ({ page }) => {
  14 |     await page.goto(BASE_URL);
  15 |     
  16 |     // Wait for login form to be visible
  17 |     await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  18 |     
  19 |     // Fill credentials
  20 |     await page.fill('input[type="email"]', account.email);
  21 |     await page.fill('input[type="password"]', account.password);
  22 |     
  23 |     // Click sign in
  24 |     await page.click('button[type="submit"]');
  25 |     
  26 |     // Wait for navigation to dashboard (not /api/auth/error)
  27 |     await page.waitForURL('**/', { timeout: 20000 });
  28 |     
  29 |     // Should NOT be on error page
  30 |     const url = page.url();
  31 |     expect(url).not.toContain('/api/auth/error');
  32 |     
  33 |     // Should have dashboard content (sidebar or dashboard)
> 34 |     await page.waitForSelector('[class*="sidebar"], [class*="dashboard"], nav', { timeout: 10000 });
     |                ^ TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
  35 |     
  36 |     console.log(`✅ ${account.role} login successful - URL: ${url}`);
  37 |   });
  38 | }
  39 | 
  40 | test('Invalid password shows error (not crash)', async ({ page }) => {
  41 |   await page.goto(BASE_URL);
  42 |   await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  43 |   
  44 |   await page.fill('input[type="email"]', 'owner@alreef.ae');
  45 |   await page.fill('input[type="password"]', 'WrongPassword123');
  46 |   await page.click('button[type="submit"]');
  47 |   
  48 |   // Wait for error message
  49 |   await page.waitForSelector('.bg-red-50, .bg-amber-50, .bg-blue-50', { timeout: 10000 });
  50 |   
  51 |   // Should NOT redirect to /api/auth/error
  52 |   const url = page.url();
  53 |   expect(url).not.toContain('/api/auth/error');
  54 |   
  55 |   console.log('✅ Invalid password handled gracefully - URL:', url);
  56 | });
  57 | 
  58 | test('Session persists on page refresh', async ({ page }) => {
  59 |   await page.goto(BASE_URL);
  60 |   await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  61 |   
  62 |   await page.fill('input[type="email"]', 'owner@alreef.ae');
  63 |   await page.fill('input[type="password"]', 'Alreef@2025');
  64 |   await page.click('button[type="submit"]');
  65 |   
  66 |   await page.waitForURL('**/', { timeout: 20000 });
  67 |   await page.waitForSelector('[class*="sidebar"], [class*="dashboard"], nav', { timeout: 10000 });
  68 |   
  69 |   // Refresh the page
  70 |   await page.reload();
  71 |   
  72 |   // Should still be on dashboard (not redirected to login)
  73 |   await page.waitForSelector('[class*="sidebar"], [class*="dashboard"], nav', { timeout: 10000 });
  74 |   const url = page.url();
  75 |   expect(url).not.toContain('/api/auth/error');
  76 |   
  77 |   console.log('✅ Session persists on refresh - URL:', url);
  78 | });
  79 | 
```