// End-to-end smoke test across both PWAs (API + both dev servers must be running).
// Usage: node tools/e2e-smoke.cjs [screenshotDir]
const { chromium } = require('playwright');
const assert = require('assert');
const out = process.argv[2] || '.';

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const tablet = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2 });
  const c = await phone.newPage();
  const b = await tablet.newPage();
  for (const p of [c, b]) p.on('pageerror', (e) => errors.push(e.message));
  c.on('dialog', (d) => d.accept());
  b.on('dialog', (d) => d.accept());

  // --- Customer: language, browse, cart (Badini Kurdish, RTL)
  await c.goto('http://localhost:5173/');
  await c.getByRole('button', { name: 'بادینی' }).click();
  assert.equal(await c.evaluate(() => document.documentElement.dir), 'rtl');
  await c.getByText('Furn Al-Noor').waitFor();
  await c.screenshot({ path: `${out}/1-customer-home-ku.png` });
  await c.getByText('Furn Al-Noor').click();
  await c.locator('.menu-item').first().getByRole('button').click();
  await c.locator('.menu-item').first().getByRole('button', { name: '+' }).click();
  await c.locator('.menu-item').nth(2).getByRole('button').click();
  await c.screenshot({ path: `${out}/2-customer-menu-ku.png` });

  // --- Checkout with WhatsApp OTP gate (English)
  await c.getByRole('button', { name: 'English' }).click();
  assert.equal(await c.evaluate(() => document.documentElement.dir), 'ltr');
  await c.getByRole('button', { name: 'Proceed to Checkout' }).click();
  await c.getByLabel('Full name').fill('Hozan Ali');
  await c.getByLabel('WhatsApp number').fill('0751 234 5678');
  await c.getByLabel(/Delivery address/).fill('Malta, street 12, next to the green pharmacy');
  await c.getByRole('button', { name: /Place order/ }).click();
  const hint = await c.locator('.dev-hint').textContent();
  await c.screenshot({ path: `${out}/3-customer-otp.png` });
  await c.locator('.otp-input').fill(hint.match(/\d{6}/)[0]);
  await c.getByText('Active orders').waitFor();
  await c.getByText('Pending', { exact: true }).first().waitFor();
  await c.getByRole('button', { name: 'Cancel order' }).waitFor();
  await c.screenshot({ path: `${out}/4-customer-tracking.png` });

  // --- Bakery: login on a tablet, see the ringing ticket
  await b.goto('http://localhost:5174/');
  await b.getByRole('button', { name: 'English' }).click();
  await b.getByLabel('WhatsApp number').fill('07500000001');
  await b.getByRole('button', { name: 'Send code' }).click();
  const bhint = await b.locator('.dev-hint').textContent();
  await b.locator('.otp-input').fill(bhint.match(/\d{6}/)[0]);
  await b.locator('.ticket.status-pending .ticket-flag').waitFor();
  assert.match(await b.title(), /\(1\)/);
  await b.screenshot({ path: `${out}/5-bakery-new-order.png` });

  // Accept -> customer timeline moves live and cancel locks
  await b.getByRole('button', { name: 'Accept & Start Baking' }).click();
  await c.getByText('Confirmed · baking').first().waitFor();
  await c.getByText(/can no longer be cancelled/).waitFor();
  await b.getByRole('button', { name: 'Mark Ready' }).click();
  await c.locator('.timeline li.current', { hasText: 'Ready' }).waitFor();
  await c.screenshot({ path: `${out}/6-customer-live-ready.png` });
  await b.screenshot({ path: `${out}/7-bakery-ready.png` });

  // Sold-out toggle reaches the storefront instantly
  await c.goto('http://localhost:5173/#/store/1');
  await c.locator('.menu-item').first().waitFor();
  await b.getByRole('button', { name: 'Menu' }).click();
  await b.getByRole('switch', { name: 'Stone-oven Samoun' }).click();
  await c.locator('.menu-item.sold-out', { hasText: 'Stone-oven Samoun' }).waitFor();
  await c.screenshot({ path: `${out}/8-customer-sold-out.png` });
  await b.getByRole('switch', { name: 'Stone-oven Samoun' }).click();

  // Finish pipeline -> cash counter
  await b.getByRole('button', { name: 'Orders' }).click();
  await b.getByRole('button', { name: 'Hand to Runner' }).click();
  await b.getByRole('button', { name: 'Confirm Cash Collected' }).click();
  await b.getByText(/No active orders/).waitFor();
  await b.getByRole('button', { name: 'Shop' }).click();
  await b.locator('.cash-amount', { hasText: '3,000' }).waitFor();
  await b.screenshot({ path: `${out}/9-bakery-cash.png` });

  // Customer cancels a second order within 5 minutes -> red ticket on the bakery
  await c.goto('http://localhost:5173/#/store/1');
  await c.locator('.menu-item').nth(1).getByRole('button').click();
  await c.getByRole('button', { name: 'Proceed to Checkout' }).click();
  await c.getByRole('button', { name: /Place order/ }).click();
  await c.getByRole('button', { name: 'Cancel order' }).click();
  await b.getByRole('button', { name: 'Orders' }).click();
  await b.getByText('Cancelled by customer').waitFor();
  await b.screenshot({ path: `${out}/10-bakery-cancelled.png` });

  // Arabic RTL on the bakery side
  await b.getByRole('button', { name: 'العربية' }).click();
  assert.equal(await b.evaluate(() => document.documentElement.dir), 'rtl');
  await b.getByText('ألغاه الزبون').waitFor();

  assert.deepEqual(errors, [], 'no uncaught page errors');
  await browser.close();
  console.log('E2E smoke passed');
})().catch((e) => { console.error(e); process.exit(1); });
