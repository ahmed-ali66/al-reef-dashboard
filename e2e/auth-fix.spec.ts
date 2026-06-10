import { test, expect } from '@playwright/test';

const BASE_URL = 'https://al-reef-al-junoobi.vercel.app';

const accounts = [
  { email: 'owner@alreef.ae', password: 'Alreef@2025', role: 'owner' },
  { email: 'admin@alreef.ae', password: 'Alreef@2025', role: 'admin' },
  { email: 'accountant@alreef.ae', password: 'Alreef@2025', role: 'accountant' },
  { email: 'staff@alreef.ae', password: 'Alreef@2025', role: 'staff' },
];

for (const account of accounts) {
  test(`Login as ${account.role} (${account.email})`, async ({ page }) => {
    await page.goto(BASE_URL);
    
    // Wait for login form to be visible
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    
    // Fill credentials
    await page.fill('input[type="email"]', account.email);
    await page.fill('input[type="password"]', account.password);
    
    // Click sign in
    await page.click('button[type="submit"]');
    
    // Wait for navigation to dashboard (not /api/auth/error)
    await page.waitForURL('**/', { timeout: 20000 });
    
    // Should NOT be on error page
    const url = page.url();
    expect(url).not.toContain('/api/auth/error');
    
    // Should have dashboard content (sidebar or dashboard)
    await page.waitForSelector('[class*="sidebar"], [class*="dashboard"], nav', { timeout: 10000 });
    
    console.log(`✅ ${account.role} login successful - URL: ${url}`);
  });
}

test('Invalid password shows error (not crash)', async ({ page }) => {
  await page.goto(BASE_URL);
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  
  await page.fill('input[type="email"]', 'owner@alreef.ae');
  await page.fill('input[type="password"]', 'WrongPassword123');
  await page.click('button[type="submit"]');
  
  // Wait for error message
  await page.waitForSelector('.bg-red-50, .bg-amber-50, .bg-blue-50', { timeout: 10000 });
  
  // Should NOT redirect to /api/auth/error
  const url = page.url();
  expect(url).not.toContain('/api/auth/error');
  
  console.log('✅ Invalid password handled gracefully - URL:', url);
});

test('Session persists on page refresh', async ({ page }) => {
  await page.goto(BASE_URL);
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  
  await page.fill('input[type="email"]', 'owner@alreef.ae');
  await page.fill('input[type="password"]', 'Alreef@2025');
  await page.click('button[type="submit"]');
  
  await page.waitForURL('**/', { timeout: 20000 });
  await page.waitForSelector('[class*="sidebar"], [class*="dashboard"], nav', { timeout: 10000 });
  
  // Refresh the page
  await page.reload();
  
  // Should still be on dashboard (not redirected to login)
  await page.waitForSelector('[class*="sidebar"], [class*="dashboard"], nav', { timeout: 10000 });
  const url = page.url();
  expect(url).not.toContain('/api/auth/error');
  
  console.log('✅ Session persists on refresh - URL:', url);
});
