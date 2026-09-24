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

// Whether the OS has blocked notifications while the in-app reminder is on.
let notificationsBlocked = false;
const harness = installRenderHarness(mock, {
  hooks: {
    useNotificationsBlockedBySystem: (enabled: boolean) => enabled && notificationsBlocked,
    useFontSize: () => ({
      label: 'Medium',
      increase: () => {},
      decrease: () => {},
      canIncrease: true,
      canDecrease: true,
    }),
    useI18n: () => {
      const { t } = useTranslation();
      return {
        t,
        currentLanguage: 'en',
        setLanguage: async () => {},
        availableLanguages: { en: { nativeName: 'English' } },
      };
    },
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
mockModule(mock, sourcePath('services/account/index.ts'), {
  deleteCurrentAccount: async () => ({ success: true }),
});
mockModule(mock, sourcePath('services/onboarding/localeSelection.ts'), {
  localeSearchEngine: { getCountryDisplayName: (code: string) => `Country ${code}` },
});
mockModule(mock, sourcePath('services/notifications/index.ts'), {
  scheduleDailyReminder: async () => {},
  cancelDailyReminder: async () => {},
  requestNotificationPermissionOutcome: async () => 'granted',
});
mockModule(mock, sourcePath('components/feedback/TranslationNotCoveredNotice.tsx'), {
  TranslationNotCoveredNotice: () => null,
});

afterEach(async () => {
  notificationsBlocked = false;
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
  notificationsBlocked = true;
  const view = await renderSettings();

  assert.ok(view.getByText(t('settings.notificationsBlockedNotice')));
  await view.press(view.getByRole('button', { name: t('settings.openDeviceSettings') }));
  assert.deepEqual(harness.rn.__recorded.openedUrls, ['app-settings:']);
});

test('no blocked-reminder notice while the reminder is off or the system allows it', async () => {
  notificationsBlocked = true;
  const reminderOff = await renderSettings();
  assert.equal(reminderOff.queryByText(t('settings.notificationsBlockedNotice')), null);
  await reminderOff.unmount();

  harness.authStore.getState().setPreferences({ notificationsEnabled: true });
  notificationsBlocked = false;
  const allowed = await renderSettings();
  assert.equal(allowed.queryByText(t('settings.notificationsBlockedNotice')), null);
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
  assert.ok(view.getByRole('button', { name: t('feedback.community') }));
  assert.ok(view.getByRole('button', { name: t('feedback.council') }));

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

  await view.press(view.getByRole('button', { name: t('settings.translatorAccess') }));
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
});

test('a rejected translator passcode shows the incorrect-code message and stays locked', async () => {
  access.translator = { success: false, error: 'Translator access denied' };
  const store = await reviewStore();
  const view = await renderSettings();

  await view.press(view.getByRole('button', { name: t('settings.translatorAccess') }));
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

  assert.ok(view.getByRole('button', { name: t('feedback.community') }));
  await view.press(view.getByRole('button', { name: t('feedback.council') }));

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
    await view.press(view.getByRole('button', { name: 'Consejo XX' }));
    assert.ok(view.getByRole('header', { name: 'Consejo XX' }));
    assert.ok(view.getByText('Cuerpo del consejo XX'));
  } finally {
    await harness.i18n.changeLanguage('en');
  }
});
