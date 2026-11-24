// End-to-end test across both PWAs (API + both dev servers running, DB freshly seeded).
// Usage: node tools/e2e-smoke.cjs [screenshotDir]
const { chromium } = require('playwright');
const assert = require('assert');
const out = process.argv[2] || '.';

async function pickLanguage(page, label) {
  await page.locator('.lang-menu-button').first().click();
  await page.getByRole('option', { name: label }).click();
}

async function enterCode(page) {
  const hint = await page.locator('.dev-hint').textContent();
  await page.locator('.otp-input').fill(hint.match(/\d{6}/)[0]);
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const tablet = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2 });
  const c = await phone.newPage();
  const b = await tablet.newPage();
  for (const p of [c, b]) {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('dialog', () => errors.push('native dialog shown'));
  }
  const shot = (p, name) => p.screenshot({ path: `${out}/${name}.png` });

  // --- Login screen opens first (default Badini, RTL), switch to English
  await c.goto('http://localhost:5173/');
  await c.locator('.auth-screen').waitFor();
  assert.equal(await c.evaluate(() => document.documentElement.dir), 'rtl');
  await pickLanguage(c, 'English');
  assert.equal(await c.evaluate(() => document.documentElement.dir), 'ltr');
  await c.getByText('Enter your phone number to continue').waitFor();
  await shot(c, '01-login');

  // Login with an unknown number is refused with a pointer to Register
  await c.getByLabel('Phone number').fill('0751 234 5678');
  await c.getByRole('button', { name: 'Login', exact: true }).click();
  await c.getByText(/Please register first/).waitFor();

  // --- Browse as guest, fill a cart
  await c.getByRole('button', { name: 'Browse the app' }).click();
  await c.getByText('Bakeries in Sharya').waitFor();
  await shot(c, '02-bakeries');
  await c.getByText('Furn Al-Noor').click();
  await c.locator('.menu-item').first().getByRole('button', { name: /Add/ }).click();
  await c.locator('.menu-item').first().getByRole('button', { name: '+' }).click();
  await c.locator('.menu-item').nth(2).getByRole('button', { name: /Add/ }).click();
  await shot(c, '03-menu');
  await c.getByRole('link', { name: /View cart/ }).click();
  await c.getByText('Shopping Cart', { exact: true }).first().waitFor();
  assert.equal(await c.locator('.tab-badge').textContent(), '3');
  await shot(c, '04-cart');

  // --- Checkout as guest -> Login Required dialog -> Register -> back to cart
  await c.getByRole('button', { name: 'Proceed to Checkout' }).click();
  await c.getByRole('alertdialog').getByText('Login Required').waitFor();
  await shot(c, '05-login-required');
  await c.getByRole('alertdialog').getByRole('button', { name: 'Login' }).click();
  await c.getByRole('link', { name: 'Register now' }).click();
  await c.getByLabel('Name').fill('Hozan Ali');
  await c.getByLabel('Phone number').fill('0751 234 5678');
  await c.getByLabel('Email (Optional)').fill('hozan@example.com');
  await shot(c, '06-register');
  await c.getByRole('button', { name: 'Register now' }).click();
  await enterCode(c);
  await c.getByRole('button', { name: 'Proceed to Checkout' }).waitFor();

  // --- Schedule the order
  await c.getByRole('radio', { name: 'Schedule Order' }).click();
  await c.locator('#sched-day').selectOption({ index: 1 });
  await c.locator('#sched-time').selectOption('09:30');
  await shot(c, '07-cart-schedule');
  await c.getByRole('button', { name: 'Proceed to Checkout' }).click();
  await c.getByText(/Scheduled for Tomorrow · 09:30/).waitFor();
  await c.locator('#co-address').fill('Sharya, street 4, next to the green pharmacy');
  await shot(c, '08-checkout');
  await c.getByRole('button', { name: /Place order/ }).click();
  await c.getByText('Active orders').waitFor();
  await c.getByText(/Scheduled for Tomorrow · 09:30/).waitFor();
  await shot(c, '09-tracking');

  // --- Bakery tablet: login, see the ringing scheduled ticket, accept
  await b.goto('http://localhost:5174/');
  await pickLanguage(b, 'English');
  await b.getByLabel('Phone number').fill('07500000001');
  await b.getByRole('button', { name: 'Login', exact: true }).click();
  await enterCode(b);
  await b.locator('.ticket.status-pending .ticket-flag').waitFor();
  await b.locator('.ticket-sched', { hasText: 'Tomorrow · 09:30' }).waitFor();
  await shot(b, '10-bakery-new-order');
  await b.getByRole('button', { name: 'Accept & Start Baking' }).click();
  await c.getByText(/can no longer be cancelled/).waitFor();

  // Sold-out toggle reaches the storefront live
  await b.getByRole('button', { name: 'Menu' }).click();
  await b.getByRole('switch', { name: 'Date Klecha' }).click();
  await c.getByRole('link', { name: 'Bakeries' }).click();
  await c.getByText('Furn Al-Noor').click();
  await c.locator('.menu-item.sold-out', { hasText: 'Date Klecha' }).waitFor();
  await b.getByRole('switch', { name: 'Date Klecha' }).click();

  // --- Second order, Order Now, cancelled within 5 min via in-app dialog
  await c.locator('.menu-item').nth(1).getByRole('button', { name: /Add/ }).click();
  await c.getByRole('link', { name: /View cart/ }).click();
  await c.getByRole('radio', { name: 'Order Now' }).click();
  await c.getByRole('button', { name: 'Proceed to Checkout' }).click();
  await c.getByRole('button', { name: /Place order/ }).click();
  await c.getByRole('button', { name: 'Cancel order' }).click();
  await c.getByRole('alertdialog').getByRole('button', { name: 'Cancel order' }).click();
  await b.getByRole('button', { name: 'Orders' }).click();
  await b.getByText('Cancelled by customer').waitFor();
  await shot(b, '11-bakery-cancelled');

  // --- Empty cart + settings + Arabic RTL
  await c.getByRole('link', { name: 'Shopping Cart' }).click();
  await c.getByText('Your Cart is Empty').waitFor();
  await shot(c, '12-cart-empty');
  await c.getByRole('link', { name: 'Settings' }).click();
  await c.getByText('hozan@example.com').waitFor();
  await shot(c, '13-settings');
  await c.getByRole('radio', { name: 'العربية' }).click();
  assert.equal(await c.evaluate(() => document.documentElement.dir), 'rtl');
  await c.getByText('الإعدادات').first().waitFor();
  await shot(c, '14-settings-ar');

  assert.deepEqual(errors, [], 'no page errors or native dialogs');
  await browser.close();
  console.log('E2E passed');
})().catch((e) => { console.error(e); process.exit(1); });
