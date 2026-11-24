import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startTestServer } from './helpers.js';

let t;
before(async () => { t = await startTestServer(); });
after(async () => { await t.stop(); });

test('OTP login creates a customer account with a normalized number', async () => {
  const req = await t.api('POST', '/auth/otp/request', { phone: '0751 222 3333', app: 'customer' });
  assert.equal(req.status, 200);
  assert.equal(req.body.phone, '+9647512223333');
  assert.match(req.body.devCode, /^\d{6}$/);

  const missingName = await t.api('POST', '/auth/otp/verify', { phone: '07512223333', code: req.body.devCode });
  assert.equal(missingName.status, 400);
  assert.equal(missingName.body.error.code, 'name_required');

  // The code was not consumed by the name check, so the retry works.
  const ok = await t.api('POST', '/auth/otp/verify', {
    phone: '+964 751 222 3333', code: req.body.devCode, fullName: 'Hozan Ali',
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.phone, '+9647512223333');
  assert.equal(ok.body.user.fullName, 'Hozan Ali');
  assert.equal(ok.body.user.role, 'customer');

  const reused = await t.api('POST', '/auth/otp/verify', { phone: '07512223333', code: req.body.devCode });
  assert.equal(reused.body.error.code, 'otp_expired', 'a code works only once');
});

test('rejects invalid phone numbers', async () => {
  const r = await t.api('POST', '/auth/otp/request', { phone: '12345' });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'invalid_phone');
});

test('limits each number to 3 code requests per hour', async () => {
  const phone = '07709998877';
  for (let i = 0; i < 3; i++) assert.equal((await t.api('POST', '/auth/otp/request', { phone })).status, 200);
  const fourth = await t.api('POST', '/auth/otp/request', { phone: '+9647709998877' });
  assert.equal(fourth.status, 429);
  assert.equal(fourth.body.error.code, 'otp_rate_limited');
  assert.ok(fourth.body.error.details.minutes >= 59);
});

test('locks a code after 5 wrong attempts', async () => {
  const phone = '07801112222';
  const req = await t.api('POST', '/auth/otp/request', { phone });
  const wrong = req.body.devCode === '000000' ? '111111' : '000000';
  const codes = [];
  for (let i = 0; i < 5; i++) {
    codes.push((await t.api('POST', '/auth/otp/verify', { phone, code: wrong, fullName: 'X Y' })).body.error.code);
  }
  assert.deepEqual(codes, ['otp_invalid', 'otp_invalid', 'otp_invalid', 'otp_invalid', 'otp_locked']);
  const right = await t.api('POST', '/auth/otp/verify', { phone, code: req.body.devCode, fullName: 'X Y' });
  assert.equal(right.body.error.code, 'otp_locked', 'correct code is refused once locked');
});

test('bakery login is limited to registered bakery numbers', async () => {
  const stranger = await t.api('POST', '/auth/otp/request', { phone: '07903334444', app: 'bakery' });
  assert.equal(stranger.status, 403);
  assert.equal(stranger.body.error.code, 'not_bakery');

  const { storeId } = await t.seedBakery();
  const session = await t.login('0750 111 0001', 'bakery');
  assert.equal(session.store.id, storeId);

  // A customer-app token can't call bakery endpoints, even for the same person.
  const asCustomer = await t.login('0750 111 0001', 'customer');
  const r = await t.api('GET', '/bakery/orders', undefined, asCustomer.token);
  assert.equal(r.status, 401);
});

test('separate login and register flows for the customer app', async () => {
  const phone = '0772 555 1212';
  const login = await t.api('POST', '/auth/otp/request', { phone, app: 'customer', intent: 'login' });
  assert.equal(login.status, 404);
  assert.equal(login.body.error.code, 'no_account');

  const reg = await t.api('POST', '/auth/otp/request', { phone, app: 'customer', intent: 'register' });
  assert.equal(reg.status, 200);

  const badEmail = await t.api('POST', '/auth/otp/verify', {
    phone, app: 'customer', intent: 'register', code: reg.body.devCode, fullName: 'Rojan Saleh', email: 'not-an-email',
  });
  assert.equal(badEmail.body.error.code, 'invalid_email');

  const ok = await t.api('POST', '/auth/otp/verify', {
    phone, app: 'customer', intent: 'register', code: reg.body.devCode, fullName: 'Rojan Saleh', email: 'Rojan@Example.com',
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.user.email, 'rojan@example.com');

  const again = await t.api('POST', '/auth/otp/request', { phone, app: 'customer', intent: 'register' });
  assert.equal(again.body.error.code, 'account_exists');

  const relog = await t.api('POST', '/auth/otp/request', { phone, app: 'customer', intent: 'login' });
  assert.equal(relog.status, 200);
  const in2 = await t.api('POST', '/auth/otp/verify', { phone, app: 'customer', intent: 'login', code: relog.body.devCode });
  assert.equal(in2.body.user.fullName, 'Rojan Saleh');

  const upd = await t.api('PATCH', '/auth/me', { fullName: 'Rojan S.', email: '' }, in2.body.token);
  assert.equal(upd.body.user.fullName, 'Rojan S.');
  assert.equal(upd.body.user.email, null);
});
