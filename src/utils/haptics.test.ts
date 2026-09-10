import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockModule, mockReactNative } from '../testing/mockModules';

// One mock configuration per file (ESM caches modules). This file covers a
// platform where haptics are supported; utils/haptics.web.test.ts covers the
// unsupported branch, which is decided by an import-time constant.
mockReactNative(mock, { os: 'ios' });

interface HapticCall {
  api: 'impactAsync' | 'notificationAsync' | 'selectionAsync';
  style?: string;
}

const hapticCalls: HapticCall[] = [];
/** Set to throw synchronously or reject, to drive the failure branches. */
let hapticBehaviour: 'resolve' | 'reject' | 'throw' = 'resolve';

const respond = (): Promise<void> => {
  if (hapticBehaviour === 'throw') {
    throw new Error('native haptics module missing');
  }
  if (hapticBehaviour === 'reject') {
    return Promise.reject(new Error('haptic engine busy'));
  }
  return Promise.resolve();
};

mockModule(mock, 'expo-haptics', {
  ImpactFeedbackStyle: { Light: 'impact-light', Medium: 'impact-medium' },
  NotificationFeedbackType: {
    Success: 'notify-success',
    Warning: 'notify-warning',
    Error: 'notify-error',
  },
  impactAsync: (style: string) => {
    hapticCalls.push({ api: 'impactAsync', style });
    return respond();
  },
  notificationAsync: (style: string) => {
    hapticCalls.push({ api: 'notificationAsync', style });
    return respond();
  },
  selectionAsync: () => {
    hapticCalls.push({ api: 'selectionAsync' });
    return respond();
  },
});

const loadHaptics = () => import('./haptics');

beforeEach(() => {
  hapticCalls.length = 0;
  hapticBehaviour = 'resolve';
});

test('lightHaptic asks for the light impact style', async () => {
  const { lightHaptic } = await loadHaptics();

  lightHaptic();

  assert.deepEqual(hapticCalls, [{ api: 'impactAsync', style: 'impact-light' }]);
});

test('mediumHaptic asks for the medium impact style', async () => {
  const { mediumHaptic } = await loadHaptics();

  mediumHaptic();

  assert.deepEqual(hapticCalls, [{ api: 'impactAsync', style: 'impact-medium' }]);
});

test('successHaptic asks for the success notification style', async () => {
  const { successHaptic } = await loadHaptics();

  successHaptic();

  assert.deepEqual(hapticCalls, [{ api: 'notificationAsync', style: 'notify-success' }]);
});

test('warningHaptic asks for the warning notification style', async () => {
  const { warningHaptic } = await loadHaptics();

  warningHaptic();

  assert.deepEqual(hapticCalls, [{ api: 'notificationAsync', style: 'notify-warning' }]);
});

test('errorHaptic asks for the error notification style', async () => {
  const { errorHaptic } = await loadHaptics();

  errorHaptic();

  assert.deepEqual(hapticCalls, [{ api: 'notificationAsync', style: 'notify-error' }]);
});

test('selectionHaptic asks for the selection feedback, which takes no style', async () => {
  const { selectionHaptic } = await loadHaptics();

  selectionHaptic();

  assert.deepEqual(hapticCalls, [{ api: 'selectionAsync' }]);
});

test('every helper returns undefined so callers never await feedback', async () => {
  const haptics = await loadHaptics();

  const returned = [
    haptics.lightHaptic(),
    haptics.mediumHaptic(),
    haptics.successHaptic(),
    haptics.warningHaptic(),
    haptics.errorHaptic(),
    haptics.selectionHaptic(),
  ];

  assert.deepEqual(returned, new Array(6).fill(undefined));
  assert.equal(hapticCalls.length, 6);
});

test('a rejected haptic promise is swallowed instead of becoming an unhandled rejection', async () => {
  const { successHaptic } = await loadHaptics();
  hapticBehaviour = 'reject';

  assert.doesNotThrow(() => successHaptic());

  // Let the rejection settle: an unattached .catch() would crash the run here.
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(hapticCalls, [{ api: 'notificationAsync', style: 'notify-success' }]);
});

test('a haptic call that throws synchronously does not propagate to the caller', async () => {
  const { selectionHaptic } = await loadHaptics();
  hapticBehaviour = 'throw';

  assert.doesNotThrow(() => selectionHaptic());

  assert.deepEqual(hapticCalls, [{ api: 'selectionAsync' }]);
});
