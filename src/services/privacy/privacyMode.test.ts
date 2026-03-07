import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePrivacyPin,
  shouldLockForAppStateChange,
  validatePrivacyPin,
} from './privacyMode';

test('normalizes calculator-style symbols into a stable pin value', () => {
  assert.equal(normalizePrivacyPin(' 12x÷ '), '12*/');
  assert.equal(normalizePrivacyPin('9×-'), '9*-');
});

test('accepts pins that are 4 to 6 calculator characters long', () => {
  assert.deepEqual(validatePrivacyPin('12+4'), {
    isValid: true,
    normalized: '12+4',
    errorKey: null,
  });
});

test('rejects pins that are too short after normalization', () => {
  assert.deepEqual(validatePrivacyPin('1 x'), {
    isValid: false,
    normalized: '1*',
    errorKey: 'privacy.pinTooShort',
  });
});

test('rejects pins that contain unsupported characters', () => {
  assert.deepEqual(validatePrivacyPin('12a4'), {
    isValid: false,
    normalized: '12A4',
    errorKey: 'privacy.pinInvalidCharacters',
  });
});

test('locks when the app leaves the foreground', () => {
  assert.equal(shouldLockForAppStateChange('active', 'inactive'), true);
  assert.equal(shouldLockForAppStateChange('active', 'background'), true);
});

test('does not lock while returning to the foreground', () => {
  assert.equal(shouldLockForAppStateChange('background', 'active'), false);
  assert.equal(shouldLockForAppStateChange('inactive', 'active'), false);
});
