import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatIraqiMobile, normalizeIraqiMobile } from '@samouna/shared/phone';

test('normalizes every common way of typing an Iraqi mobile number', () => {
  for (const input of [
    '07501234567', '0750 123 4567', '750-123-4567', '7501234567',
    '+9647501234567', '+964 750 123 4567', '009647501234567', '9647501234567',
    '96407501234567', '(0750) 123-4567',
    '٠٧٥٠١٢٣٤٥٦٧', // Arabic-Indic digits
    '۰۷۵۰۱۲۳۴۵۶۷', // Persian/Kurdish digits
    '‎+964 750 123 4567', // with LTR mark from copy/paste
  ]) {
    assert.equal(normalizeIraqiMobile(input), '9647501234567', input);
  }
});

test('rejects non-mobile and malformed numbers', () => {
  for (const input of ['', null, undefined, '12345', '0660 123 4567', '+9617501234567',
    '075012345678', '0750123456', 'abc', '+964 750 123 456x']) {
    assert.equal(normalizeIraqiMobile(input), null, String(input));
  }
});

test('formats for display', () => {
  assert.equal(formatIraqiMobile('07501234567'), '+964 750 123 4567');
});

test('formats as you type next to the +964 prefix', async () => {
  const { formatLocalAsYouType } = await import('@samouna/shared/phone');
  assert.equal(formatLocalAsYouType('750'), '750');
  assert.equal(formatLocalAsYouType('7501'), '750 1');
  assert.equal(formatLocalAsYouType('7501234567'), '750 123 4567');
  assert.equal(formatLocalAsYouType('07501234567'), '0750 123 4567');
  assert.equal(formatLocalAsYouType('+964 750 123 4567'), '750 123 4567');
  assert.equal(formatLocalAsYouType('٠٧٧٠١٢٣٤٥٦٧'), '0770 123 4567');
  assert.equal(formatLocalAsYouType('75012345678999'), '750 123 4567', 'extra digits are dropped');
});

test('names the mobile operator from the prefix', async () => {
  const { carrierOf } = await import('@samouna/shared/phone');
  assert.equal(carrierOf('0750'), 'korek');
  assert.equal(carrierOf('771'), 'asiacell');
  assert.equal(carrierOf('+964 780'), 'zain');
  assert.equal(carrierOf('0790 000'), 'zain');
  assert.equal(carrierOf('7'), null);
  assert.equal(carrierOf('0740'), null);
});
