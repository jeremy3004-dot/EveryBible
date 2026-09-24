import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCESS_KEYPAD_ROWS,
  REMINDER_HOURS,
  REMINDER_MINUTES,
  applyAccessKeypadKey,
  buildReminderTimeString,
  formatReminderTimeLabel,
  getChapterFeedbackIdentitySummary,
  isAccessKeypadCommand,
  isLegacyCreoleContentLanguage,
} from './settingsScreenModel';

test('the reminder picker offers every hour and the four quarter hours', () => {
  assert.equal(REMINDER_HOURS.length, 24);
  assert.equal(REMINDER_HOURS[0], 0);
  assert.equal(REMINDER_HOURS[23], 23);
  assert.deepEqual(REMINDER_MINUTES, ['00', '15', '30', '45']);
});

test('a chosen reminder time is stored as zero-padded HH:MM', () => {
  assert.equal(buildReminderTimeString(7, '30'), '07:30');
  assert.equal(buildReminderTimeString(0, '00'), '00:00');
  assert.equal(buildReminderTimeString(23, '45'), '23:45');
});

test('a stored reminder time is written the way the app language writes clock times', () => {
  const expected = (locale: string, hour: number, minute: number) =>
    new Date(0, 0, 0, hour, minute).toLocaleTimeString(locale, {
      hour: 'numeric',
      minute: '2-digit',
    });
  assert.equal(formatReminderTimeLabel('07:30', 'en', 'Not set'), expected('en', 7, 30));
  assert.equal(formatReminderTimeLabel('18:45', 'de', 'Not set'), expected('de', 18, 45));
  assert.notEqual(
    formatReminderTimeLabel('18:45', 'en', 'Not set'),
    formatReminderTimeLabel('18:45', 'de', 'Not set'),
    'the locale decides 12- or 24-hour form'
  );
});

test('no reminder time reads as the not-set label', () => {
  assert.equal(formatReminderTimeLabel(null, 'en', 'Not set'), 'Not set');
  assert.equal(formatReminderTimeLabel('', 'en', 'Not set'), 'Not set');
});

test('only the retired "Creoles and pidgins" collective counts as the legacy content language', () => {
  assert.equal(
    isLegacyCreoleContentLanguage({
      code: 'cpe',
      name: 'Creoles and pidgins, English-based',
      nativeName: null,
    }),
    true
  );
  assert.equal(
    isLegacyCreoleContentLanguage({
      code: 'cpe',
      name: null,
      nativeName: 'Creoles and pidgins, English-based',
    }),
    true,
    'either name identifies it'
  );
  assert.equal(
    isLegacyCreoleContentLanguage({ code: 'cpe', name: 'Tok Pisin', nativeName: 'Tok Pisin' }),
    false,
    'a real language that happens to reuse the code is kept'
  );
  assert.equal(
    isLegacyCreoleContentLanguage({
      code: 'en',
      name: 'Creoles and pidgins, English-based',
      nativeName: null,
    }),
    false
  );
  assert.equal(isLegacyCreoleContentLanguage({}), false);
});

test('the feedback identity reads "Name • Role" once saved', () => {
  assert.equal(
    getChapterFeedbackIdentitySummary({ name: 'Lydia', role: 'Reviewer' }, 'Not set'),
    'Lydia • Reviewer'
  );
  assert.equal(getChapterFeedbackIdentitySummary(null, 'Not set'), 'Not set');
});

test('the keypad lays out ten digits, then clear and delete', () => {
  const keys = ACCESS_KEYPAD_ROWS.flat();
  assert.deepEqual(keys, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'clear', 'delete']);
  assert.deepEqual(
    keys.filter((key) => isAccessKeypadCommand(key)),
    ['clear', 'delete']
  );
});

test('keypad presses append through the shared digit rule, clear empties and delete drops one', () => {
  const appended: Array<[string, string]> = [];
  const appendDigit = (current: string, digit: string) => {
    appended.push([current, digit]);
    return current.length >= 4 ? current : `${current}${digit}`;
  };

  assert.equal(applyAccessKeypadKey('48', '1', appendDigit), '481');
  assert.equal(applyAccessKeypadKey('4815', '6', appendDigit), '4815', 'the rule caps length');
  assert.deepEqual(appended, [
    ['48', '1'],
    ['4815', '6'],
  ]);
  assert.equal(applyAccessKeypadKey('4815', 'clear', appendDigit), '');
  assert.equal(applyAccessKeypadKey('4815', 'delete', appendDigit), '481');
  assert.equal(applyAccessKeypadKey('', 'delete', appendDigit), '');
  assert.equal(appended.length, 2, 'commands never reach the digit rule');
});
