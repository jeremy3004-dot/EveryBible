import test from 'node:test';
import assert from 'node:assert/strict';
import { getPrivacySettingsSavePlan } from './privacyPreferences';

test('switching from standard to discreet mode requires and returns a normalized matching pin', () => {
  assert.deepEqual(
    getPrivacySettingsSavePlan({
      currentMode: 'standard',
      hasExistingPin: false,
      selectedMode: 'discreet',
      pinInput: '12x4',
      pinConfirmation: '12*4',
    }),
    {
      type: 'save',
      input: {
        mode: 'discreet',
        pinInput: '12*4',
      },
    }
  );
});

test('rejects mismatched discreet-mode pin confirmation', () => {
  assert.deepEqual(
    getPrivacySettingsSavePlan({
      currentMode: 'standard',
      hasExistingPin: false,
      selectedMode: 'discreet',
      pinInput: '12+4',
      pinConfirmation: '12+5',
    }),
    {
      type: 'error',
      errorKey: 'privacy.pinMismatch',
    }
  );
});

test('allows a no-op save when discreet mode is already active and the pin is unchanged', () => {
  assert.deepEqual(
    getPrivacySettingsSavePlan({
      currentMode: 'discreet',
      hasExistingPin: true,
      selectedMode: 'discreet',
      pinInput: '',
      pinConfirmation: '',
    }),
    {
      type: 'noop',
    }
  );
});

test('switching back to standard mode produces a standard save action', () => {
  assert.deepEqual(
    getPrivacySettingsSavePlan({
      currentMode: 'discreet',
      hasExistingPin: true,
      selectedMode: 'standard',
      pinInput: '',
      pinConfirmation: '',
    }),
    {
      type: 'save',
      input: {
        mode: 'standard',
      },
    }
  );
});

test('keeping standard mode is a no-op even if pin fields were typed in', () => {
  assert.deepEqual(
    getPrivacySettingsSavePlan({
      currentMode: 'standard',
      hasExistingPin: false,
      selectedMode: 'standard',
      pinInput: '1234',
      pinConfirmation: '1234',
    }),
    { type: 'noop' }
  );
});

for (const [pin, errorKey] of [
  ['12', 'privacy.pinTooShort'],
  ['1234567', 'privacy.pinTooLong'],
  ['12a4', 'privacy.pinInvalidCharacters'],
] as const) {
  test(`a discreet-mode pin "${pin}" is rejected with ${errorKey}`, () => {
    assert.deepEqual(
      getPrivacySettingsSavePlan({
        currentMode: 'standard',
        hasExistingPin: false,
        selectedMode: 'discreet',
        pinInput: pin,
        pinConfirmation: pin,
      }),
      { type: 'error', errorKey }
    );
  });
}

test('discreet mode cannot be saved without an existing pin or a new one', () => {
  assert.deepEqual(
    getPrivacySettingsSavePlan({
      currentMode: 'discreet',
      hasExistingPin: false,
      selectedMode: 'discreet',
      pinInput: '',
      pinConfirmation: '',
    }),
    { type: 'error', errorKey: 'privacy.pinTooShort' }
  );
});

test('typing a new matching pin while discreet mode is active saves the new pin', () => {
  assert.deepEqual(
    getPrivacySettingsSavePlan({
      currentMode: 'discreet',
      hasExistingPin: true,
      selectedMode: 'discreet',
      pinInput: ' 9 876 ',
      pinConfirmation: '9876',
    }),
    { type: 'save', input: { mode: 'discreet', pinInput: '9876' } }
  );
});
