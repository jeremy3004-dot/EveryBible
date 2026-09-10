import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockModule, mockReactNative } from '../testing/mockModules';

// `isHapticsSupported` is an import-time constant derived from Platform.OS, so
// the unsupported branch needs its own file with its own module cache
// (utils/haptics.test.ts covers the iOS/Android branch).
mockReactNative(mock, { os: 'web' });

const hapticCalls: string[] = [];

mockModule(mock, 'expo-haptics', {
  ImpactFeedbackStyle: { Light: 'impact-light', Medium: 'impact-medium' },
  NotificationFeedbackType: {
    Success: 'notify-success',
    Warning: 'notify-warning',
    Error: 'notify-error',
  },
  impactAsync: async (style: string) => {
    hapticCalls.push(`impactAsync:${style}`);
  },
  notificationAsync: async (style: string) => {
    hapticCalls.push(`notificationAsync:${style}`);
  },
  selectionAsync: async () => {
    hapticCalls.push('selectionAsync');
  },
});

test('no helper touches the native haptics API on a platform without haptics', async () => {
  const haptics = await import('./haptics');

  haptics.lightHaptic();
  haptics.mediumHaptic();
  haptics.successHaptic();
  haptics.warningHaptic();
  haptics.errorHaptic();
  haptics.selectionHaptic();

  assert.deepEqual(hapticCalls, []);
});

test('helpers stay callable no-ops on an unsupported platform', async () => {
  const { mediumHaptic } = await import('./haptics');

  assert.doesNotThrow(() => mediumHaptic());
  assert.equal(mediumHaptic(), undefined);
});
