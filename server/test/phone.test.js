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
