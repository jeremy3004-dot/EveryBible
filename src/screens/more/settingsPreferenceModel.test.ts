import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatReminderTimeDisplay,
  isReminderTimeEditable,
  resolvePrivacyModeLabel,
} from './settingsPreferenceModel';

test('resolves the discreet privacy mode label when discreet mode is active', () => {
  assert.equal(
    resolvePrivacyModeLabel({
      mode: 'discreet',
      discreetLabel: 'Calculator',
      standardLabel: 'Standard',
    }),
    'Calculator'
  );
});

test('resolves the standard privacy mode label when standard mode is active', () => {
  assert.equal(
    resolvePrivacyModeLabel({
      mode: 'standard',
      discreetLabel: 'Calculator',
      standardLabel: 'Standard',
    }),
    'Standard'
  );
});

test('formats a morning reminder time in 12-hour AM format', () => {
  assert.equal(
    formatReminderTimeDisplay({ reminderTime: '09:00', notSetLabel: 'Not set' }),
    '9:00 AM'
  );
});

test('formats an afternoon reminder time in 12-hour PM format', () => {
  assert.equal(
    formatReminderTimeDisplay({ reminderTime: '14:30', notSetLabel: 'Not set' }),
    '2:30 PM'
  );
});

test('formats midnight as 12:00 AM', () => {
  assert.equal(
    formatReminderTimeDisplay({ reminderTime: '00:00', notSetLabel: 'Not set' }),
    '12:00 AM'
  );
});

test('formats noon as 12:00 PM', () => {
  assert.equal(
    formatReminderTimeDisplay({ reminderTime: '12:00', notSetLabel: 'Not set' }),
    '12:00 PM'
  );
});

test('returns the fallback label when no reminder time is set', () => {
  assert.equal(
    formatReminderTimeDisplay({ reminderTime: null, notSetLabel: 'Not set' }),
    'Not set'
  );
});

test('reminder time row is not editable when notifications are disabled', () => {
  assert.equal(isReminderTimeEditable(false), false);
});

test('reminder time row is editable when notifications are enabled', () => {
  assert.equal(isReminderTimeEditable(true), true);
});
