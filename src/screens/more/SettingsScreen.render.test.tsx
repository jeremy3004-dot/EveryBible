import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ReactTestInstance } from 'react-test-renderer';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { flattenStyle, hostAncestors, installRenderHarness, within } from '../../testing/render';
import {
  mockBarrel,
  mockMmkvStorage,
  mockModule,
  mockPackage,
  mockSecureStore,
  sourcePath,
} from '../../testing/mockModules';
import { isPrivacyLockGraceActive } from '../../services/privacy/privacyLockGrace';

// Why the OS keeps the in-app reminder from appearing, if it does.
let reminderBlock: 'needs-permission' | 'blocked' | null = null;
const languageCalls: string[] = [];
const harness = installRenderHarness(mock);
// Settings and its sections import each hook from its own module, not the hooks barrel.
mockModule(mock, sourcePath('hooks/useNotificationsBlockedBySystem.ts'), {
  useNotificationsBlockedBySystem: (enabled: boolean) => (enabled ? reminderBlock : null),
});
mockModule(mock, sourcePath('hooks/useFontSize.ts'), {
  useFontSize: () => ({
    label: 'Medium',
    increase: () => {},
    decrease: () => {},
    canIncrease: true,
    canDecrease: true,
  }),
});
mockModule(mock, sourcePath('hooks/useI18n.ts'), {
  useI18n: () => {
    const { t } = useTranslation();
    return {
      t,
      currentLanguage: 'en',
      setLanguage: async (code: string) => {
        languageCalls.push(code);
      },
      availableLanguages: { en: { nativeName: 'English' } },
    };
  },
});

// The real translator-review store runs against in-memory secure storage and MMKV.
mockMmkvStorage(mock);
mockSecureStore(mock);

const syncCalls: number[] = [];
mockModule(mock, sourcePath('services/sync/index.ts'), {
  syncPreferences: async () => {
    syncCalls.push(1);
    return { success: true };
  },
});

type AccessResult = { success: boolean; error?: string; coversTranslation?: boolean };
const access: { translator: AccessResult; council: AccessResult; checked: string[] } = {
  translator: { success: true, coversTranslation: true },
  council: { success: true },
  checked: [],
};
mockBarrel(mock, 'services/feedback/index.ts', {
  provide: {
    validateTranslatorReviewPasscode: async (passcode: string, translationId: string) => {
      access.checked.push(`translator:${passcode}:${translationId}`);
      return access.translator;
    },
    validateScriptureCouncilPasscode: async (passcode: string) => {
      access.checked.push(`council:${passcode}`);
      return access.council;
    },
  },
  real: ['appendAccessPasscodeDigit'],
});

const useBibleStore = create(() => ({ currentTranslation: 'bsb' }));
mockModule(mock, sourcePath('stores/bibleStore.ts'), { useBibleStore });
mockPackage(mock, '@react-native-async-storage/async-storage', {
  default: { getAllKeys: async () => [], multiRemove: async () => {}, clear: async () => {} },
});
const account: { result: { success: boolean }; calls: number } = {
  result: { success: true },
  calls: 0,
};
mockModule(mock, sourcePath('services/account/index.ts'), {
  deleteCurrentAccount: async () => ({ success: true }),
  deleteAccountAndLocalData: async () => {
    account.calls += 1;
    return account.result;
  },
});
const cacheClears: number[] = [];
mockModule(mock, sourcePath('stores/deviceCaches.ts'), {
  clearDeviceCaches: () => {
    cacheClears.push(1);
  },
});
mockModule(mock, sourcePath('services/onboarding/localeSelection.ts'), {
  localeSearchEngine: { getCountryDisplayName: (code: string) => `Country ${code}` },
});
const reminders: {
  permission: 'granted' | 'denied' | 'blocked';
  calls: string[];
  requests: number;
  /** Whether discreet mode's lock was holding off for each permission prompt. */
  promptsUnderLockGrace: boolean[];
  /** Thrown by scheduleDailyReminder, as when the OS refuses to schedule. */
  scheduleError: Error | null;
} = {
  permission: 'granted',
  calls: [],
  requests: 0,
  promptsUnderLockGrace: [],
  scheduleError: null,
};
mockModule(mock, sourcePath('services/notifications/index.ts'), {
  scheduleDailyReminder: async (hour: number, minute: number) => {
    reminders.calls.push(`schedule:${hour}:${minute}`);
    if (reminders.scheduleError) throw reminders.scheduleError;
  },
  cancelDailyReminder: async () => {
    reminders.calls.push('cancel');
  },
  requestNotificationPermissionOutcome: async () => {
    reminders.requests += 1;
    reminders.promptsUnderLockGrace.push(isPrivacyLockGraceActive());
    return reminders.permission;
  },
});
const reported: { source: string; error: unknown }[] = [];
let reportWaiters: (() => void)[] = [];
/** Resolves on the next report: the reminder flow loads the crash queue lazily. */
const nextReport = () => new Promise<void>((resolve) => reportWaiters.push(resolve));
mockModule(mock, sourcePath('services/diagnostics/crashReportQueue.ts'), {
  reportHandledError: (source: string, error: unknown) => {
    reported.push({ source, error });
    const waiters = reportWaiters;
    reportWaiters = [];
    waiters.forEach((resolve) => resolve());
  },
});
mockModule(mock, sourcePath('components/feedback/TranslationNotCoveredNotice.tsx'), {
  TranslationNotCoveredNotice: () => null,
});

afterEach(async () => {
  reminderBlock = null;
  languageCalls.length = 0;
  account.result = { success: true };
  account.calls = 0;
  cacheClears.length = 0;
  reminders.permission = 'granted';
  reminders.calls.length = 0;
  reminders.requests = 0;
  reminders.promptsUnderLockGrace.length = 0;
  reminders.scheduleError = null;
  reported.length = 0;
  reportWaiters = [];
  harness.rn.__recorded.alerts.length = 0;
  harness.rn.__recorded.openedUrls.length = 0;
  syncCalls.length = 0;
  access.translator = { success: true, coversTranslation: true };
  access.council = { success: true };
  access.checked.length = 0;
  const { useTranslatorReviewStore } = await import('../../stores/translatorReviewStore');
  useTranslatorReviewStore.setState(useTranslatorReviewStore.getInitialState(), true);
});

const t = (key: string) => harness.i18n.t(key);
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A row's accessibility name starts with its title and may add its value after a comma. */
const rowNamed = (title: string) => new RegExp(`^${escapeRegExp(title)}(,|$)`);

async function renderSettings() {
  const { SettingsScreen } = await import('./SettingsScreen');
  return harness.render(<SettingsScreen />);
}

async function reviewStore() {
  const { useTranslatorReviewStore } = await import('../../stores/translatorReviewStore');
  return useTranslatorReviewStore;
}

type View = Awaited<ReturnType<typeof renderSettings>>;

/** The ListRow content box that holds a row's title. */
function rowOf(view: View, title: string): ReactTestInstance {
  let node: ReactTestInstance | null = view.getByText(title);
  while (node && flattenStyle(node.props.style)?.flexDirection !== 'row') node = node.parent;
  assert.ok(node, `row for ${title}`);
  return node;
}

function switchNamed(view: View, label: string): ReactTestInstance {
  const found = view.queryAllByType('Switch').find((s) => s.props.accessibilityLabel === label);
  assert.ok(found, `switch ${label}`);
  return found;
}

// --- Reminders blocked by the system ------------------------------------------

test('a reminder blocked by the system shows a translated notice that opens system settings', async () => {
  harness.authStore.getState().setPreferences({ notificationsEnabled: true });
  reminderBlock = 'blocked';
  const view = await renderSettings();

  assert.ok(view.getByText(t('settings.notificationsBlockedNotice')));
  assert.equal(view.queryByText(t('settings.notificationsNotAllowedNotice')), null);
  await view.press(view.getByRole('button', { name: t('settings.openDeviceSettings') }));
  assert.deepEqual(harness.rn.__recorded.openedUrls, ['app-settings:']);
});

test('no blocked-reminder notice while the reminder is off or the system allows it', async () => {
  reminderBlock = 'blocked';
  const reminderOff = await renderSettings();
  assert.equal(reminderOff.queryByText(t('settings.notificationsBlockedNotice')), null);
  await reminderOff.unmount();

  harness.authStore.getState().setPreferences({ notificationsEnabled: true });
  reminderBlock = null;
  const allowed = await renderSettings();
  assert.equal(allowed.queryByText(t('settings.notificationsBlockedNotice')), null);
});

test('a reminder synced on without permission here offers one tap that asks and schedules it', async () => {
  // Turned on on another device: this one was never asked, so nothing is scheduled.
  harness.authStore
    .getState()
    .setPreferences({ notificationsEnabled: true, reminderTime: '07:30' });
  reminderBlock = 'needs-permission';
  const view = await renderSettings();

  assert.ok(view.getByText(t('settings.notificationsNotAllowedNotice')));
  assert.equal(view.queryByText(t('settings.notificationsBlockedNotice')), null);
  assert.equal(reminders.requests, 0, 'Settings does not prompt until asked');

  await view.press(view.getByRole('button', { name: t('settings.allowNotifications') }));

  assert.deepEqual([reminders.requests, reminders.calls], [1, ['schedule:7:30']]);
  assert.equal(harness.authStore.getState().preferences.notificationsEnabled, true);
  assert.equal(syncCalls.length, 0, 'the synced preference itself did not change');
  assert.deepEqual(harness.rn.__recorded.openedUrls, []);
});

test('a synced reminder with no saved time asks for one once permission is allowed', async () => {
  harness.authStore.getState().setPreferences({ notificationsEnabled: true, reminderTime: null });
  reminderBlock = 'needs-permission';
  const view = await renderSettings();

  await view.press(view.getByRole('button', { name: t('settings.allowNotifications') }));

  assert.ok(view.getByRole('header', { name: t('settings.setReminderTime') }));
  assert.deepEqual(reminders.calls, []);
  // iOS turns the app inactive under the prompt; discreet mode must not lock for it.
  assert.deepEqual(reminders.promptsUnderLockGrace, [true]);
});

test('refusing the permission from the notice explains itself and schedules nothing', async () => {
  harness.authStore
    .getState()
    .setPreferences({ notificationsEnabled: true, reminderTime: '07:30' });
  reminderBlock = 'needs-permission';
  reminders.permission = 'blocked';
  const view = await renderSettings();

  await view.press(view.getByRole('button', { name: t('settings.allowNotifications') }));

  const [alert] = harness.rn.__recorded.alerts;
  assert.equal(alert.title, t('settings.permissionRequired'));
  assert.deepEqual(
    (alert.buttons as Array<{ text: string }>).map((button) => button.text),
    [t('common.cancel'), t('common.settings')]
  );
  assert.deepEqual(reminders.calls, []);
  assert.equal(harness.authStore.getState().preferences.notificationsEnabled, true);
});

// --- Reminder time picker ---------------------------------------------------

/** The picker option for `label` (e.g. "09") in the column that lists it. */
function pickerOption(view: View, label: string): ReactTestInstance {
  const option = hostAncestors(view.getByText(label)).find(
    (node) => node.props.accessibilityRole === 'button'
  );
  assert.ok(option, `picker option ${label}`);
  return option;
}

/** Lays out one picker option; rows are 52pt tall under 60pt of column padding. */
async function layOutOption(view: View, label: string, index: number) {
  await view.fire(pickerOption(view, label), 'onLayout', {
    nativeEvent: { layout: { x: 0, y: 60 + index * 52, width: 80, height: 52 } },
  });
}

test('turning the reminder on opens the picker scrolled to the 9:00 it will save, highlighted', async () => {
  harness.authStore.getState().setPreferences({ notificationsEnabled: false, reminderTime: null });
  const view = await renderSettings();

  await view.fire(switchNamed(view, t('settings.dailyReminder')), 'onValueChange', true);
  assert.ok(view.getByRole('header', { name: t('settings.setReminderTime') }));

  // Hours and minutes both list "00"; the hour column comes first.
  const [hourZero, minuteZero] = view.getAllByText('00');
  const selected = (node: ReactTestInstance | undefined) =>
    hostAncestors(node!).find((n) => n.props.accessibilityRole === 'button')?.props
      .accessibilityState?.selected;
  assert.deepEqual(
    [selected(hourZero), pickerOption(view, '09').props.accessibilityState, selected(minuteZero)],
    [false, { selected: true }, true]
  );

  harness.refCalls.length = 0;
  await layOutOption(view, '09', 9);
  await view.fire(minuteZero!, 'onLayout', {
    nativeEvent: { layout: { x: 0, y: 60, width: 80, height: 52 } },
  });
  // The 200pt hour column centres the 9 o'clock row instead of opening at midnight; the
  // minute "00" already sits in view, so its column clamps to the top.
  const scrolls = harness.refCalls.filter((call) => call.method === 'scrollTo');
  assert.deepEqual(
    scrolls.map((call) => call.args[0]),
    [
      { y: 60 + 9 * 52 + 26 - 100, animated: false },
      { y: 0, animated: false },
    ]
  );

  await view.press(view.getByRole('button', { name: t('settings.setTime') }));
  assert.deepEqual(reminders.calls, ['schedule:9:0']);
  assert.equal(harness.authStore.getState().preferences.reminderTime, '09:00');
});

test('the picker opens on the saved reminder time and a later tap does not jump the column', async () => {
  harness.authStore
    .getState()
    .setPreferences({ notificationsEnabled: true, reminderTime: '18:45' });
  const view = await renderSettings();

  await view.press(view.getByRole('button', { name: rowNamed(t('settings.reminderTime')) }));
  assert.deepEqual(
    [
      pickerOption(view, '18').props.accessibilityState,
      pickerOption(view, '45').props.accessibilityState,
    ],
    [{ selected: true }, { selected: true }]
  );

  harness.refCalls.length = 0;
  await layOutOption(view, '18', 18);
  await layOutOption(view, '45', 3);
  assert.deepEqual(
    harness.refCalls.filter((call) => call.method === 'scrollTo').map((call) => call.args[0]),
    [
      { y: 60 + 18 * 52 + 26 - 100, animated: false },
      { y: 60 + 3 * 52 + 26 - 100, animated: false },
    ]
  );

  await view.press(pickerOption(view, '07'));
  harness.refCalls.length = 0;
  await layOutOption(view, '07', 7);
  assert.deepEqual(harness.refCalls, [], 'only the row the picker opened on scrolls the column');
  assert.deepEqual(pickerOption(view, '07').props.accessibilityState, { selected: true });
});

// --- Reminder scheduling failures -------------------------------------------

test('a reminder the system fails to schedule from its saved time stays off, explains and is reported', async () => {
  harness.authStore
    .getState()
    .setPreferences({ notificationsEnabled: false, reminderTime: '07:30' });
  const failure = new Error('scheduling refused');
  reminders.scheduleError = failure;
  const view = await renderSettings();

  const reported$ = nextReport();
  await view.fire(switchNamed(view, t('settings.dailyReminder')), 'onValueChange', true);
  await reported$;

  assert.deepEqual(reminders.calls, ['schedule:7:30']);
  assert.deepEqual(
    harness.rn.__recorded.alerts.map((alert) => [alert.title, alert.message]),
    [[t('common.error'), t('common.unexpectedError')]]
  );
  assert.equal(harness.authStore.getState().preferences.notificationsEnabled, false);
  assert.equal(switchNamed(view, t('settings.dailyReminder')).props.value, false);
  assert.equal(syncCalls.length, 0);
  assert.deepEqual(reported, [{ source: 'settings.reminderSchedule', error: failure }]);
});

test('a reminder time the system fails to schedule closes the picker, stays off and is reported', async () => {
  harness.authStore.getState().setPreferences({ notificationsEnabled: false, reminderTime: null });
  const view = await renderSettings();

  await view.fire(switchNamed(view, t('settings.dailyReminder')), 'onValueChange', true);
  assert.ok(view.getByRole('header', { name: t('settings.setReminderTime') }));

  const failure = new Error('scheduling refused');
  reminders.scheduleError = failure;
  const reported$ = nextReport();
  await view.press(view.getByRole('button', { name: t('settings.setTime') }));
  await reported$;

  assert.deepEqual(reminders.calls, ['schedule:9:0']);
  assert.equal(view.queryByRole('header', { name: t('settings.setReminderTime') }), null);
  assert.deepEqual(
    harness.rn.__recorded.alerts.map((alert) => [alert.title, alert.message]),
    [[t('common.error'), t('common.unexpectedError')]]
  );
  const { notificationsEnabled, reminderTime } = harness.authStore.getState().preferences;
  assert.deepEqual(
    { notificationsEnabled, reminderTime },
    {
      notificationsEnabled: false,
      reminderTime: null,
    }
  );
  assert.equal(syncCalls.length, 0);
  assert.deepEqual(reported, [{ source: 'settings.reminderSchedule', error: failure }]);
});

// --- Privacy shortcut -------------------------------------------------------

test('the calculator disguise shortcut is a chevron row that opens Privacy preferences', async () => {
  const view = await renderSettings();

  const shortcut = view.getByRole('button', { name: t('onboarding.privacyTitle') });
  assert.equal(
    shortcut.props.accessibilityLabel,
    t('onboarding.privacyTitle'),
    'no value or mode text is read'
  );
  const glyphs = within(shortcut)
    .queryAllByType('LucideIcon')
    .map((icon) => icon.props.name);
  assert.deepEqual(glyphs, ['Calculator', 'ChevronRight']);
  assert.equal(within(shortcut).queryAllByType('Text').length, 1, 'only the title is shown');
  assert.equal(view.queryByText(t('onboarding.discreetIconTitle')), null);

  await view.press(shortcut);
  assert.deepEqual(harness.navigation.calls.at(-1), {
    method: 'navigate',
    args: ['PrivacyPreferences'],
  });
});

test('Settings draws only Lucide glyphs, none from the retired Ionicons set', async () => {
  const view = await renderSettings();

  assert.equal(view.queryAllByType('Icon').length, 0);
  assert.ok(view.queryAllByType('LucideIcon').length > 0);
});

// --- Chapter feedback ------------------------------------------------------

test('the chapter feedback switch opts in immediately as community and syncs preferences', async () => {
  const store = await reviewStore();
  const view = await renderSettings();

  const feedbackSwitch = switchNamed(view, t('settings.chapterFeedback'));
  assert.equal(feedbackSwitch.props.value, false);
  assert.equal(view.queryByRole('button', { name: t('feedback.community') }), null);

  await view.fire(feedbackSwitch, 'onValueChange', true);

  assert.equal(harness.authStore.getState().preferences.chapterFeedbackEnabled, true);
  assert.equal(store.getState().mode, 'community');
  assert.equal(syncCalls.length, 1);
  assert.equal(switchNamed(view, t('settings.chapterFeedback')).props.value, true);
  assert.equal(
    view.queryByRole('header', { name: t('settings.translatorAccessTitle') }),
    null,
    'no code asked'
  );
  assert.ok(view.getByRole('button', { name: t('feedback.community'), selected: true }));
  assert.ok(
    view.getByRole('button', {
      name: `${t('feedback.council')}, ${t('feedback.councilCodeRequired')}`,
      selected: false,
    })
  );

  await view.fire(switchNamed(view, t('settings.chapterFeedback')), 'onValueChange', false);
  assert.equal(harness.authStore.getState().preferences.chapterFeedbackEnabled, false);
  assert.equal(store.getState().mode, 'reader');
  assert.equal(syncCalls.length, 2);
});

test('the feedback identity row edits a name and role only, saves them and syncs', async () => {
  harness.authStore.setState({ user: { uid: 'u1', displayName: 'Lydia' } });
  const view = await renderSettings();

  await view.press(
    view.getByRole('button', { name: rowNamed(t('settings.chapterFeedbackIdentity')) })
  );
  assert.ok(view.getByRole('header', { name: t('settings.chapterFeedbackIdentityTitle') }));
  assert.deepEqual(
    view.queryAllByType('TextInput').map((input) => input.props.accessibilityLabel),
    [t('auth.name'), t('settings.chapterFeedbackIdentityRole')],
    'no manual ID number is asked for'
  );
  assert.equal(
    view.getByLabelText(t('auth.name')).props.value,
    'Lydia',
    'prefilled from the account'
  );

  await view.changeText(view.getByLabelText(t('auth.name')), '  ');
  await view.press(view.getByRole('button', { name: t('common.save') }));
  assert.equal(syncCalls.length, 0);
  assert.equal(view.getAllByText(t('settings.chapterFeedbackIdentityRequired')).length, 2);

  await view.changeText(view.getByLabelText(t('auth.name')), 'Lydia of Thyatira');
  await view.changeText(view.getByLabelText(t('settings.chapterFeedbackIdentityRole')), 'Reviewer');
  await view.press(view.getByRole('button', { name: t('common.save') }));

  const { preferences } = harness.authStore.getState();
  assert.equal(preferences.chapterFeedbackName, 'Lydia of Thyatira');
  assert.equal(preferences.chapterFeedbackRole, 'Reviewer');
  assert.equal('chapterFeedbackIdNumber' in preferences, false, 'no manual ID is stored');
  assert.equal(syncCalls.length, 1);
  assert.equal(
    view.queryByRole('header', { name: t('settings.chapterFeedbackIdentityTitle') }),
    null
  );
  assert.ok(view.getByRole('button', { name: /Lydia of Thyatira • Reviewer/ }));
});

// --- Locale row ------------------------------------------------------------

test('the locale row is labelled Nation and Bible and opens locale preferences', async () => {
  harness.authStore.getState().setPreferences({ contentLanguageNativeName: 'Kiswahili' });
  const view = await renderSettings();

  assert.equal(t('settings.nationAndLanguage'), 'Nation and Bible', 'the English row copy');
  const row = view.getByRole('button', { name: `${t('settings.nationAndLanguage')}, Kiswahili` });
  await view.press(row);
  assert.deepEqual(harness.navigation.calls.at(-1), {
    method: 'navigate',
    args: ['LocalePreferences'],
  });
});

test('a long locale summary is truncated to one line inside a bounded, stable-height row', async () => {
  const longName = 'Bahasa Indonesia dengan nama yang sangat panjang sekali untuk baris ini';
  harness.authStore.getState().setPreferences({
    countryCode: 'ID',
    contentLanguageNativeName: longName,
  });
  const view = await renderSettings();

  const row = rowOf(view, t('settings.nationAndLanguage'));
  const value = within(row).getByText(`Country ID • ${longName}`);
  assert.equal(value.props.numberOfLines, 1);
  const title = within(row).getByText(t('settings.nationAndLanguage'));
  let column = title.parent;
  while (column && (column.type as unknown) !== 'View') column = column.parent;
  assert.equal(flattenStyle(column?.props.style)?.flex, 1, 'the text column flexes');
  assert.equal(flattenStyle(row.props.style)?.minHeight, 52, 'a stable row height');
});

// --- Large text ---------------------------------------------------------------

test('at large text the font-size stepper and the offline status sit under their row titles', async () => {
  harness.setFontScale(2);
  const view = await renderSettings();

  const fontTitle = view.getByText(t('settings.fontSize'));
  assert.ok(
    within(hostAncestors(fontTitle)[0]).getByRole('button', { name: t('learn.increaseTextSize') }),
    'the stepper left the title a word per line beside it'
  );
  const fontValue = within(hostAncestors(fontTitle)[0])
    .queryAllByType('Text')
    .find((node) => flattenStyle(node.props.style)?.minWidth !== undefined);
  assert.ok(fontValue, 'the size name');
  assert.equal(fontValue.props.numberOfLines, 2);
  // Release QA at AX5 broke "Med/ium" between the A-/A+ buttons: the size name
  // is a control value and caps like a segmented-control label.
  const { CONTROL_LABEL_MAX_FONT_SCALE } = await import('../../design/largeTextLayout');
  assert.equal(fontValue.props.maxFontSizeMultiplier, CONTROL_LABEL_MAX_FONT_SCALE);

  const offlineTitle = view.getByText(t('settings.downloadForOffline'));
  const available = within(hostAncestors(offlineTitle)[0]).getByText(t('common.available'));
  assert.equal(available.props.numberOfLines, undefined);
});

// --- Translator access -----------------------------------------------------

test('Translator Access sits between Chapter feedback and the feedback identity row', async () => {
  const view = await renderSettings();

  const titles = view
    .queryAllByType('Text')
    .map((node) => node.props.children)
    .filter((text) => typeof text === 'string');
  const at = (title: string) => titles.indexOf(title);
  assert.ok(at(t('settings.chapterFeedback')) >= 0);
  assert.equal(
    at(t('settings.translatorAccess')),
    at(t('settings.chapterFeedback')) + 2,
    'after its summary line'
  );
  assert.equal(at(t('settings.chapterFeedbackIdentity')), at(t('settings.translatorAccess')) + 2);
});

test('Translator Access unlocks through a numeric keypad passcode modal', async () => {
  const store = await reviewStore();
  const view = await renderSettings();

  // The row is one switch stop: the Switch inside a pressable row is unreachable.
  await view.press(
    view.getByRole('switch', { name: t('settings.translatorAccess'), checked: false })
  );
  assert.ok(view.getByRole('header', { name: t('settings.translatorAccessTitle') }));
  const passcode = view.getByLabelText(t('settings.translatorAccessPlaceholder'));
  assert.equal(passcode.props.keyboardType, 'number-pad');
  assert.equal(passcode.props.secureTextEntry, true);
  assert.equal(passcode.props.editable, false, 'digits come from the keypad');
  assert.ok(
    view.getByRole('button', { name: t('settings.translatorAccessUnlock'), disabled: true })
  );

  for (const digit of ['4', '8', '1', '5']) {
    await view.press(view.getByRole('button', { name: digit }));
  }
  assert.equal(view.getByLabelText(t('settings.translatorAccessPlaceholder')).props.value, '4815');
  await view.press(view.getByRole('button', { name: t('settings.translatorAccessUnlock') }));

  assert.deepEqual(access.checked, ['translator:4815:bsb']);
  assert.equal(store.getState().enabled, true);
  assert.equal(view.queryByRole('header', { name: t('settings.translatorAccessTitle') }), null);
  assert.equal(switchNamed(view, t('settings.translatorAccess')).props.value, true);
  assert.ok(view.getByRole('switch', { name: t('settings.translatorAccess'), checked: true }));
});

test('a rejected translator passcode shows the incorrect-code message and stays locked', async () => {
  access.translator = { success: false, error: 'Translator access denied' };
  const store = await reviewStore();
  const view = await renderSettings();

  await view.press(view.getByRole('switch', { name: t('settings.translatorAccess') }));
  await view.press(view.getByRole('button', { name: '7' }));
  await view.press(view.getByRole('button', { name: t('settings.translatorAccessUnlock') }));

  assert.ok(view.getByText(t('feedback.incorrectCode')));
  assert.equal(store.getState().enabled, false);
});

test('translators can switch review mode off, and switching it back on asks for the passcode', async () => {
  const store = await reviewStore();
  store.getState().enableWithPasscode('4815');
  const view = await renderSettings();

  assert.equal(switchNamed(view, t('settings.translatorAccess')).props.value, true);
  await view.fire(switchNamed(view, t('settings.translatorAccess')), 'onValueChange', false);
  assert.equal(store.getState().enabled, false);
  assert.equal(switchNamed(view, t('settings.translatorAccess')).props.value, false);
  assert.equal(view.queryByRole('header', { name: t('settings.translatorAccessTitle') }), null);

  await view.fire(switchNamed(view, t('settings.translatorAccess')), 'onValueChange', true);
  assert.equal(store.getState().enabled, false, 'not re-enabled without a code');
  assert.ok(view.getByRole('header', { name: t('settings.translatorAccessTitle') }));
  assert.equal(view.getByLabelText(t('settings.translatorAccessPlaceholder')).props.value, '');
});

test('every Settings switch uses the shared higher-contrast track colours', async () => {
  const view = await renderSettings();

  const switches = view.queryAllByType('Switch');
  assert.ok(switches.length >= 3);
  const [first] = switches;
  assert.ok(first.props.trackColor.true && first.props.trackColor.false);
  assert.notEqual(first.props.trackColor.true, first.props.trackColor.false);
  assert.equal(first.props.ios_backgroundColor, first.props.trackColor.false);
  for (const control of switches) {
    assert.deepEqual(control.props.trackColor, first.props.trackColor, 'same track colours');
    assert.equal(control.props.ios_backgroundColor, first.props.ios_backgroundColor);
  }
  assert.ok(
    switches.some((control) => control.props.accessibilityLabel === t('settings.translatorAccess'))
  );
});

test('the community and Scripture Council choices carry their own labels and council asks for its code', async () => {
  harness.authStore.getState().setPreferences({ chapterFeedbackEnabled: true });
  const store = await reviewStore();
  store.getState().enableCommunityFeedback();
  const view = await renderSettings();

  // The current choice is otherwise only a drawn ✓.
  assert.ok(view.getByRole('button', { name: t('feedback.community'), selected: true }));
  const council = `${t('feedback.council')}, ${t('feedback.councilCodeRequired')}`;
  assert.ok(view.getByRole('button', { name: council, selected: false }));
  await view.press(view.getByRole('button', { name: council }));

  assert.ok(view.getByRole('header', { name: t('feedback.council') }));
  assert.ok(view.getByText(t('feedback.councilAccessBody')));
  assert.equal(store.getState().mode, 'community', 'unchanged until a code is accepted');
});

test('the community and council labels come from the active locale, not an English fallback', async () => {
  harness.i18n.addResourceBundle(
    'xx',
    'translation',
    {
      feedback: {
        community: 'Comunidad XX',
        council: 'Consejo XX',
        councilAccessBody: 'Cuerpo del consejo XX',
      },
    },
    true,
    true
  );
  await harness.i18n.changeLanguage('xx');
  try {
    harness.authStore.getState().setPreferences({ chapterFeedbackEnabled: true });
    const store = await reviewStore();
    store.getState().enableCommunityFeedback();
    const view = await renderSettings();

    assert.ok(view.getByRole('button', { name: 'Comunidad XX' }));
    assert.ok(view.getByText('Comunidad XX'), 'the row title is localized too');
    assert.ok(view.getByText('Consejo XX'));
    assert.equal(view.queryByText(/^(Community|Scripture Council)$/), null);
    await view.press(view.getByRole('button', { name: /^Consejo XX, / }));
    assert.ok(view.getByRole('header', { name: 'Consejo XX' }));
    assert.ok(view.getByText('Cuerpo del consejo XX'));
  } finally {
    await harness.i18n.changeLanguage('en');
  }
});

// --- Daily reminder ----------------------------------------------------------

test('turning the reminder on without a saved time asks for one, then schedules and saves it', async () => {
  const view = await renderSettings();

  const inert = view.getByRole('button', { name: t('settings.reminderTime'), disabled: true });
  assert.ok(inert, 'the reminder time is inert while the reminder is off');

  await view.fire(switchNamed(view, t('settings.dailyReminder')), 'onValueChange', true);
  assert.ok(view.getByRole('header', { name: t('settings.setReminderTime') }));
  assert.deepEqual(reminders.calls, [], 'nothing scheduled before a time is chosen');
  assert.ok(view.getByRole('button', { name: '09', selected: true }), 'defaults to 9:00');

  await view.press(view.getByRole('button', { name: '07' }));
  await view.press(view.getByRole('button', { name: '30' }));
  assert.ok(view.getByRole('button', { name: '07', selected: true }));
  await view.press(view.getByRole('button', { name: t('settings.setTime') }));

  assert.deepEqual(reminders.calls, ['schedule:7:30']);
  const { preferences } = harness.authStore.getState();
  assert.equal(preferences.notificationsEnabled, true);
  assert.equal(preferences.reminderTime, '07:30');
  assert.equal(syncCalls.length, 1);
  assert.equal(view.queryByRole('header', { name: t('settings.setReminderTime') }), null);
  const expectedLabel = new Date(0, 0, 0, 7, 30).toLocaleTimeString('en', {
    hour: 'numeric',
    minute: '2-digit',
  });
  assert.ok(
    view.getByRole('button', { name: `${t('settings.reminderTime')}, ${expectedLabel}` }),
    'the row shows the chosen time in the app language'
  );
});

test('turning the reminder on with a saved time schedules it straight away', async () => {
  harness.authStore.getState().setPreferences({ reminderTime: '20:15' });
  const view = await renderSettings();

  await view.fire(switchNamed(view, t('settings.dailyReminder')), 'onValueChange', true);

  assert.deepEqual(reminders.calls, ['schedule:20:15']);
  assert.equal(harness.authStore.getState().preferences.notificationsEnabled, true);
  assert.equal(syncCalls.length, 1);
  assert.equal(view.queryByRole('header', { name: t('settings.setReminderTime') }), null);
});

test('reopening the reminder time starts the picker on the saved time', async () => {
  harness.authStore
    .getState()
    .setPreferences({ notificationsEnabled: true, reminderTime: '18:45' });
  const view = await renderSettings();

  await view.press(view.getByRole('button', { name: rowNamed(t('settings.reminderTime')) }));
  assert.ok(view.getByRole('button', { name: '18', selected: true }));
  assert.ok(view.getByRole('button', { name: '45', selected: true }));

  await view.press(view.getByRole('button', { name: t('common.cancel') }));
  assert.equal(view.queryByRole('header', { name: t('settings.setReminderTime') }), null);
  assert.deepEqual(reminders.calls, []);
});

test('turning the reminder off cancels it and syncs', async () => {
  harness.authStore
    .getState()
    .setPreferences({ notificationsEnabled: true, reminderTime: '06:00' });
  const view = await renderSettings();

  await view.fire(switchNamed(view, t('settings.dailyReminder')), 'onValueChange', false);

  assert.deepEqual(reminders.calls, ['cancel']);
  assert.equal(harness.authStore.getState().preferences.notificationsEnabled, false);
  assert.equal(syncCalls.length, 1);
});

test('a refused notification permission explains itself, and a blocked one offers system settings', async () => {
  reminders.permission = 'denied';
  const view = await renderSettings();

  await view.fire(switchNamed(view, t('settings.dailyReminder')), 'onValueChange', true);
  const [denied] = harness.rn.__recorded.alerts;
  assert.equal(denied.title, t('settings.permissionRequired'));
  assert.deepEqual(
    (denied.buttons as Array<{ text: string }>).map((button) => button.text),
    [t('common.ok')]
  );

  reminders.permission = 'blocked';
  await view.fire(switchNamed(view, t('settings.dailyReminder')), 'onValueChange', true);
  const blocked = harness.rn.__recorded.alerts[1];
  const buttons = blocked.buttons as Array<{ text: string; onPress?: () => void }>;
  assert.deepEqual(
    buttons.map((button) => button.text),
    [t('common.cancel'), t('common.settings')]
  );
  buttons[1].onPress?.();
  assert.deepEqual(harness.rn.__recorded.openedUrls, ['app-settings:']);
  assert.equal(harness.authStore.getState().preferences.notificationsEnabled, false);
  assert.deepEqual(reminders.calls, []);
});

// --- Appearance and language --------------------------------------------------

test('choosing the dark appearance stores the theme and syncs', async () => {
  const view = await renderSettings();

  await view.press(view.getByRole('tab', { name: t('settings.themeDark') }));

  assert.equal(harness.authStore.getState().preferences.theme, 'dark');
  assert.equal(syncCalls.length, 1);
});

test('the language row opens the interface language list and a choice switches and closes it', async () => {
  const view = await renderSettings();

  await view.press(view.getByRole('button', { name: `${t('settings.language')}, English` }));
  assert.ok(view.getByRole('header', { name: t('settings.selectLanguage') }));
  assert.ok(view.getByRole('button', { name: /^English/, selected: true }));

  await view.press(view.getByRole('button', { name: /^Español/ }));
  assert.deepEqual(languageCalls, ['es']);
  assert.equal(view.queryByRole('header', { name: t('settings.selectLanguage') }), null);
});

test("VoiceOver's escape gesture closes the interface language list without choosing", async () => {
  const view = await renderSettings();

  await view.press(view.getByRole('button', { name: `${t('settings.language')}, English` }));
  await view.fire(
    view.getByRole('header', { name: t('settings.selectLanguage') }),
    'onAccessibilityEscape'
  );

  assert.equal(view.queryByRole('header', { name: t('settings.selectLanguage') }), null);
  assert.deepEqual(languageCalls, []);
});

// --- Data --------------------------------------------------------------------

test('clearing the cache asks first, then clears only device caches', async () => {
  const view = await renderSettings();

  await view.press(view.getByRole('button', { name: t('settings.clearCache') }));
  const [confirm] = harness.rn.__recorded.alerts;
  assert.equal(confirm.title, t('settings.clearCache'));
  assert.deepEqual(cacheClears, [], 'nothing cleared before confirming');

  const buttons = confirm.buttons as Array<{ text: string; style?: string; onPress?: () => void }>;
  assert.equal(buttons[1].style, 'destructive');
  buttons[1].onPress?.();
  assert.deepEqual(cacheClears, [1]);
  assert.equal(harness.rn.__recorded.alerts.at(-1)?.message, t('settings.cacheClearedSuccess'));
});

test('Delete Account is offered only when signed in and confirms before deleting', async () => {
  const signedOut = await renderSettings();
  assert.equal(signedOut.queryByRole('button', { name: t('settings.deleteAccount') }), null);
  await signedOut.unmount();

  harness.authStore.setState({ user: { uid: 'u1', displayName: 'Lydia' } });
  const view = await renderSettings();
  await view.press(view.getByRole('button', { name: t('settings.deleteAccount') }));
  assert.ok(view.getByRole('header', { name: t('settings.deleteAccount') }));
  assert.ok(view.getByText(t('settings.deleteAccountWarning')));
  assert.equal(account.calls, 0);

  account.result = { success: false };
  await view.press(view.getByRole('button', { name: t('settings.delete') }));
  assert.equal(account.calls, 1);
  assert.equal(harness.rn.__recorded.alerts.at(-1)?.message, t('settings.deleteAccountError'));
  assert.ok(view.getByText(t('settings.deleteAccountWarning')), 'stays open after a failure');

  account.result = { success: true };
  await view.press(view.getByRole('button', { name: t('settings.delete') }));
  assert.equal(account.calls, 2);
  assert.equal(harness.rn.__recorded.alerts.at(-1)?.title, t('settings.accountDeleted'));
  assert.equal(view.queryByText(t('settings.deleteAccountWarning')), null);
});

test("the delete-account dialog closes on VoiceOver's escape gesture without deleting", async () => {
  harness.authStore.setState({ user: { uid: 'u1', displayName: 'Lydia' } });
  const view = await renderSettings();
  await view.press(view.getByRole('button', { name: t('settings.deleteAccount') }));
  await view.fire(view.getByText(t('settings.deleteAccountWarning')), 'onAccessibilityEscape');
  assert.equal(view.queryByText(t('settings.deleteAccountWarning')), null);
  assert.equal(account.calls, 0);
});

// --- Legacy content language ---------------------------------------------------

test('a stored "Creoles and pidgins" content language is reset to English and synced', async () => {
  harness.authStore.getState().setPreferences({
    contentLanguageCode: 'cpe',
    contentLanguageName: 'Creoles and pidgins, English-based',
    contentLanguageNativeName: 'Creoles and pidgins, English-based',
  });
  await renderSettings();

  const { preferences } = harness.authStore.getState();
  assert.equal(preferences.contentLanguageCode, 'en');
  assert.equal(preferences.contentLanguageName, 'English');
  assert.equal(preferences.contentLanguageNativeName, 'English');
  assert.equal(syncCalls.length, 1);
});
