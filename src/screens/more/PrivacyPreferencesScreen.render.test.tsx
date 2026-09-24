import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act, type ReactTestInstance } from 'react-test-renderer';
import { create } from 'zustand';
import { flattenStyle, installRenderHarness } from '../../testing/render';
import { mockModule, sourcePath } from '../../testing/mockModules';

const harness = installRenderHarness(mock, { os: 'ios' });

type SaveInput = { mode: 'standard' } | { mode: 'discreet'; pinInput: string };
const events: string[] = [];
const saved: SaveInput[] = [];
const saveResult: {
  current: { success: true } | { success: false; errorKey: string } | Error;
} = {
  current: { success: true },
};
// Holds a save open (a slow keychain write) until the test releases it.
const saveGate: { current: Promise<void> | null } = { current: null };
const usePrivacyStore = create(() => ({
  mode: 'standard' as 'standard' | 'discreet',
  hasPin: false,
  saveConfiguration: async (input: SaveInput) => {
    saved.push(input);
    events.push(`save:${input.mode}`);
    if (saveGate.current) await saveGate.current;
    if (saveResult.current instanceof Error) {
      throw saveResult.current;
    }
    return saveResult.current;
  },
  lock: () => {
    const leftPreferences = harness.navigation.calls.some((call) => call.method === 'goBack');
    events.push(leftPreferences ? 'lock after goBack' : 'lock before goBack');
  },
}));
mockModule(mock, sourcePath('stores/privacyStore.ts'), { usePrivacyStore });

const reported: { source: string; error: unknown }[] = [];
let reportWaiters: (() => void)[] = [];
/** Resolves on the next report: the screen loads the crash queue lazily. */
const nextReport = () => new Promise<void>((resolve) => reportWaiters.push(resolve));
mockModule(mock, sourcePath('services/diagnostics/crashReportQueue.ts'), {
  reportHandledError: (source: string, error: unknown) => {
    reported.push({ source, error });
    const waiters = reportWaiters;
    reportWaiters = [];
    waiters.forEach((resolve) => resolve());
  },
});

// Whether this build can switch the launcher icon at all (the native module is present).
const iconSupport = { current: true };
mockModule(mock, sourcePath('services/privacy/appIcon.ts'), {
  supportsDynamicAppIcon: () => iconSupport.current,
});

const t = (key: string) => harness.i18n.t(key);

type AlertButton = { text: string; style?: string; onPress?: () => void };
type RecordedAlert = {
  title: string;
  message?: string;
  buttons?: AlertButton[];
  options?: { cancelable?: boolean; onDismiss?: () => void };
};
const recordedAlerts = () => harness.rn.__recorded.alerts as RecordedAlert[];

afterEach(() => {
  saveGate.current = null;
  events.length = 0;
  saved.length = 0;
  saveResult.current = { success: true };
  reported.length = 0;
  reportWaiters = [];
  usePrivacyStore.setState(usePrivacyStore.getInitialState(), true);
  harness.rn.Platform.OS = 'ios';
  iconSupport.current = true;
});

async function renderPrivacy() {
  const { PrivacyPreferencesScreen } = await import('./PrivacyPreferencesScreen');
  return harness.render(<PrivacyPreferencesScreen />);
}

function isInside(node: ReactTestInstance, ancestor: ReactTestInstance): boolean {
  for (let current: ReactTestInstance | null = node; current; current = current.parent) {
    if (current === ancestor) return true;
  }
  return false;
}

async function chooseDiscreetWithPin(view: Awaited<ReturnType<typeof renderPrivacy>>) {
  await view.press(view.getByRole('radio', { name: t('onboarding.discreetIconTitle') }));
  await view.changeText(view.getByLabelText(t('onboarding.pinPlaceholder')), '2468');
  await view.changeText(view.getByLabelText(t('onboarding.pinConfirmPlaceholder')), '2468');
}

test('the secure-code form sits in a keyboard-avoiding, tap-through scroll with room beneath it', async () => {
  const view = await renderPrivacy();
  await view.press(view.getByRole('radio', { name: t('onboarding.discreetIconTitle') }));

  const [avoider] = view.queryAllByType('KeyboardAvoidingView');
  assert.ok(avoider, 'the form area is wrapped in a KeyboardAvoidingView');
  assert.equal(avoider.props.behavior, 'padding', 'iOS pads above the keyboard');

  const [scroll] = view.queryAllByType('ScrollView');
  assert.equal(scroll.props.keyboardShouldPersistTaps, 'handled');
  assert.ok(isInside(scroll, avoider));
  for (const input of view.queryAllByType('TextInput')) {
    assert.ok(isInside(input, scroll), 'every code input scrolls inside the avoided area');
    assert.equal(input.props.keyboardType, 'number-pad');
    assert.equal(input.props.secureTextEntry, true);
  }
  const { spacing } = await import('../../design/system');
  const bottom = Number(flattenStyle(scroll.props.contentContainerStyle)?.paddingBottom);
  assert.ok(bottom >= spacing.xxl, `the code card can scroll fully clear (got ${bottom})`);
});

// Android runs edge to edge, so the window never resizes for the keyboard and the
// avoider's height math clipped the Confirm field under it. The screen measures how much
// of its scroll area the keyboard covers and pads the form by that instead.
test('on Android the code form pads by what the keyboard covers and scrolls Confirm into view', async () => {
  harness.rn.Platform.OS = 'android';
  const view = await renderPrivacy();
  await view.press(view.getByRole('radio', { name: t('onboarding.discreetIconTitle') }));

  assert.deepEqual(
    view.queryAllByType('KeyboardAvoidingView'),
    [],
    'no avoider height guess on top of the measured pad'
  );

  const confirm = view.getByLabelText(t('onboarding.pinConfirmPlaceholder'));
  await view.fire(confirm, 'onFocus');
  harness.refCalls.length = 0;
  await act(async () => {
    harness.rn.Keyboard.emit('keyboardDidShow', {
      endCoordinates: { height: 300, screenY: 500, screenX: 0, width: 390 },
    });
  });

  const measured = harness.refCalls.filter((call) => call.method === 'measureInWindow');
  assert.equal(measured.length, 1, 'the scroll area measures its own bottom edge');
  const [scroll] = view.queryAllByType('ScrollView');
  const surface = measured[0]!;
  assert.equal(surface.props.collapsable, false, 'Android must not collapse the measured view');
  // The scroll area runs to the bottom of an 844pt window; the keyboard covers 344pt of it.
  await act(async () => {
    (surface.args[0] as (x: number, y: number, w: number, h: number) => void)(0, 120, 390, 724);
  });

  const bottom = Number(flattenStyle(scroll!.props.contentContainerStyle)?.paddingBottom);
  assert.ok(bottom >= 344, `the form can scroll clear of the keyboard (got ${bottom})`);
  assert.ok(isInside(confirm, scroll!), 'Confirm sits inside the padded scroll content');
  assert.ok(
    harness.refCalls.some((call) => call.type === 'ScrollView' && call.method === 'scrollToEnd'),
    'the focused code field is scrolled above the keyboard'
  );

  await act(async () => {
    harness.rn.Keyboard.emit('keyboardDidHide', {});
  });
  const rested = Number(flattenStyle(scroll!.props.contentContainerStyle)?.paddingBottom);
  assert.ok(rested < 344, 'the pad goes when the keyboard does');
});

test('saving discreet mode goes back first and only then locks behind the calculator', async () => {
  const view = await renderPrivacy();
  await chooseDiscreetWithPin(view);

  await view.press(view.getByRole('button', { name: t('common.done') }));
  await view.flush();

  assert.deepEqual(saved, [{ mode: 'discreet', pinInput: '2468' }]);
  assert.deepEqual(events, ['save:discreet', 'lock after goBack']);
});

test('the calculator lock waits until the navigation away from preferences has settled', async () => {
  // Hold interaction-deferred work until the test releases it.
  const { InteractionManager } = harness.rn;
  const original = InteractionManager.runAfterInteractions;
  const held: Array<() => void> = [];
  InteractionManager.runAfterInteractions = ((task?: () => void) => {
    if (task) held.push(task);
    return { then: () => {}, done: () => {}, cancel: () => {} };
  }) as typeof original;
  try {
    const view = await renderPrivacy();
    await chooseDiscreetWithPin(view);

    await view.press(view.getByRole('button', { name: t('common.done') }));
    await view.flush();

    assert.deepEqual(events, ['save:discreet'], 'not locked while the screen is still leaving');
    assert.equal(held.length, 1);
    held.forEach((task) => task());
    assert.deepEqual(events, ['save:discreet', 'lock after goBack']);
  } finally {
    InteractionManager.runAfterInteractions = original;
  }
});

test('a failed discreet save shows its error and neither leaves nor locks', async () => {
  saveResult.current = { success: false, errorKey: 'privacy.pinMismatch' };
  const view = await renderPrivacy();
  await chooseDiscreetWithPin(view);

  await view.press(view.getByRole('button', { name: t('common.done') }));
  await view.flush();

  assert.deepEqual(events, ['save:discreet']);
  assert.deepEqual(harness.navigation.calls, []);
  assert.ok(view.getByText(harness.i18n.t('privacy.pinMismatch')));
});

test('switching back to the standard icon saves without locking the app', async () => {
  usePrivacyStore.setState({ mode: 'discreet', hasPin: true });
  const view = await renderPrivacy();

  await view.press(view.getByRole('radio', { name: t('onboarding.standardIconTitle') }));
  await view.press(view.getByRole('button', { name: t('common.done') }));
  await view.flush();

  assert.deepEqual(saved, [{ mode: 'standard' }]);
  assert.deepEqual(events, ['save:standard']);
  assert.deepEqual(
    harness.navigation.calls.map((call) => call.method),
    ['goBack']
  );
});

test('a discreet save that throws shows an error, is reported and leaves Done usable', async () => {
  const failure = new Error('keychain unavailable');
  saveResult.current = failure;
  const view = await renderPrivacy();
  await chooseDiscreetWithPin(view);
  const report = nextReport();

  await view.press(view.getByRole('button', { name: t('common.done') }));
  await view.flush();
  await report;

  assert.deepEqual(reported, [{ source: 'privacy.save', error: failure }]);
  assert.deepEqual(harness.navigation.calls, [], 'the reader stays to try again');
  assert.deepEqual(events, ['save:discreet'], 'nothing is locked after a failed save');
  assert.ok(view.getByText(t('common.unexpectedError')));
  assert.ok(view.getByText(t('common.done')), 'the spinner is gone so Done can be pressed again');
});

test('a standard-icon save that throws shows its error too', async () => {
  saveResult.current = new Error('keychain unavailable');
  usePrivacyStore.setState({ mode: 'discreet', hasPin: true });
  const view = await renderPrivacy();
  const report = nextReport();

  await view.press(view.getByRole('radio', { name: t('onboarding.standardIconTitle') }));
  await view.press(view.getByRole('button', { name: t('common.done') }));
  await view.flush();
  await report;

  assert.deepEqual(harness.navigation.calls, []);
  assert.ok(view.getByText(t('common.unexpectedError')));
});

test('while a save runs, Done is announced busy and a keyboard submit cannot start a second save', async () => {
  let release: () => void = () => {};
  saveGate.current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const view = await renderPrivacy();
  await chooseDiscreetWithPin(view);

  const done = view.getByRole('button', { name: t('common.done') });
  await act(async () => {
    void (done.props.onPress as () => unknown)();
  });

  assert.ok(view.getByRole('button', { name: t('common.done'), busy: true, disabled: true }));
  const confirmField = view.getByLabelText(t('onboarding.pinConfirmPlaceholder'));
  await act(async () => {
    void (confirmField.props.onSubmitEditing as () => unknown)();
  });
  assert.equal(saved.length, 1, 'one save for one confirmation');

  await act(async () => {
    release();
  });
  await view.flush();
  assert.deepEqual(events, ['save:discreet', 'lock after goBack']);
});

test('on Android a second Done while the close warning is up does not ask twice', async () => {
  harness.rn.Platform.OS = 'android';
  const view = await renderPrivacy();
  await chooseDiscreetWithPin(view);

  await view.press(view.getByRole('button', { name: t('common.done') }));
  await view.press(view.getByRole('button', { name: t('common.done') }));
  await view.flush();

  await answerIconSwitchAlert('continue');
  await view.flush();
  assert.deepEqual(saved, [{ mode: 'discreet', pinInput: '2468' }]);
});

// On Android the icon is a launcher alias, and switching aliases closes the app to the
// home screen (the task's launch component is disabled). Unwarned, that looks like a
// crash, so Android asks first and says which icon to reopen from.
async function answerIconSwitchAlert(choice: 'continue' | 'cancel' | 'dismiss') {
  const alerts = recordedAlerts();
  assert.equal(alerts.length, 1, 'one confirmation before the icon changes');
  const [alert] = alerts;
  await act(async () => {
    if (choice === 'dismiss') {
      alert!.options?.onDismiss?.();
      return;
    }
    const label = choice === 'continue' ? t('common.continue') : t('common.cancel');
    const button = alert!.buttons?.find((candidate) => candidate.text === label);
    assert.ok(button, `the confirmation offers ${label}`);
    button.onPress?.();
  });
}

test('on Android turning discreet on warns the app will close and switches only after Continue', async () => {
  harness.rn.Platform.OS = 'android';
  const view = await renderPrivacy();
  await chooseDiscreetWithPin(view);

  await view.press(view.getByRole('button', { name: t('common.done') }));
  await view.flush();

  const [alert] = recordedAlerts();
  assert.equal(alert?.title, t('privacy.iconSwitchCloseTitle'));
  assert.equal(alert?.message, t('privacy.iconSwitchCloseToCalculator'));
  assert.deepEqual(
    alert?.buttons?.map((button) => [button.text, button.style ?? null]),
    [
      [t('common.cancel'), 'cancel'],
      [t('common.continue'), null],
    ]
  );
  assert.equal(alert?.options?.cancelable, true);
  assert.deepEqual(saved, [], 'nothing is saved while the reader decides');
  assert.deepEqual(harness.navigation.calls, []);

  await answerIconSwitchAlert('continue');
  await view.flush();

  assert.deepEqual(saved, [{ mode: 'discreet', pinInput: '2468' }]);
  assert.deepEqual(events, ['save:discreet', 'lock after goBack']);
});

test('on Android turning discreet off names the standard icon to reopen from', async () => {
  harness.rn.Platform.OS = 'android';
  usePrivacyStore.setState({ mode: 'discreet', hasPin: true });
  const view = await renderPrivacy();

  await view.press(view.getByRole('radio', { name: t('onboarding.standardIconTitle') }));
  await view.press(view.getByRole('button', { name: t('common.done') }));
  await view.flush();

  const [alert] = recordedAlerts();
  assert.equal(alert?.title, t('privacy.iconSwitchCloseTitle'));
  assert.equal(alert?.message, t('privacy.iconSwitchCloseToStandard'));
  assert.deepEqual(saved, []);

  await answerIconSwitchAlert('continue');
  await view.flush();

  assert.deepEqual(saved, [{ mode: 'standard' }]);
  assert.deepEqual(
    harness.navigation.calls.map((call) => call.method),
    ['goBack']
  );
});

for (const choice of ['cancel', 'dismiss'] as const) {
  test(`on Android ${choice === 'cancel' ? 'Cancel' : 'dismissing'} the warning keeps the current icon and stays on the screen`, async () => {
    harness.rn.Platform.OS = 'android';
    const view = await renderPrivacy();
    await chooseDiscreetWithPin(view);

    await view.press(view.getByRole('button', { name: t('common.done') }));
    await view.flush();
    await answerIconSwitchAlert(choice);
    await view.flush();

    assert.deepEqual(saved, [], 'the mode is not saved, so the icon never switches');
    assert.deepEqual(events, [], 'nothing locks');
    assert.deepEqual(harness.navigation.calls, [], 'the reader stays on the screen');
    assert.ok(view.getByText(t('common.done')), 'Done can be pressed again');

    // A second Done asks again rather than switching silently.
    harness.rn.__recorded.alerts.length = 0;
    await view.press(view.getByRole('button', { name: t('common.done') }));
    await view.flush();
    assert.equal(recordedAlerts().length, 1);
    await answerIconSwitchAlert('continue');
    await view.flush();
    assert.deepEqual(saved, [{ mode: 'discreet', pinInput: '2468' }]);
  });
}

test('on Android changing only the secure code keeps the icon, so it saves without a warning', async () => {
  harness.rn.Platform.OS = 'android';
  usePrivacyStore.setState({ mode: 'discreet', hasPin: true });
  const view = await renderPrivacy();
  await view.changeText(view.getByLabelText(t('onboarding.pinPlaceholder')), '1357');
  await view.changeText(view.getByLabelText(t('onboarding.pinConfirmPlaceholder')), '1357');

  await view.press(view.getByRole('button', { name: t('common.done') }));
  await view.flush();

  assert.deepEqual(recordedAlerts(), []);
  assert.deepEqual(saved, [{ mode: 'discreet', pinInput: '1357' }]);
});

test('on an Android build that cannot switch icons nothing closes, so there is no warning', async () => {
  harness.rn.Platform.OS = 'android';
  iconSupport.current = false;
  const view = await renderPrivacy();
  await chooseDiscreetWithPin(view);

  await view.press(view.getByRole('button', { name: t('common.done') }));
  await view.flush();

  assert.deepEqual(recordedAlerts(), []);
  assert.deepEqual(saved, [{ mode: 'discreet', pinInput: '2468' }]);
});

test('on iOS the icon changes without an in-app warning (iOS keeps the app open)', async () => {
  const view = await renderPrivacy();
  await chooseDiscreetWithPin(view);

  await view.press(view.getByRole('button', { name: t('common.done') }));
  await view.flush();

  assert.deepEqual(recordedAlerts(), []);
  assert.deepEqual(saved, [{ mode: 'discreet', pinInput: '2468' }]);
});
