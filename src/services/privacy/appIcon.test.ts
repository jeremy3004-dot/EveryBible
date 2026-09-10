import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule } from '../../testing/mockModules';
import { createReactNativeStub } from '../../testing/reactNativeStub';
import type { PrivacyAppIconMode } from '../../types';

// appIcon.ts captures NativeModules.EveryBiblePrivacyModule at import time, so
// the "module is installed" scenario needs its own file. The opposite scenario
// lives in appIconUnsupported.test.ts.
const setCalls: PrivacyAppIconMode[] = [];
let setAppIconResult: (mode: PrivacyAppIconMode) => Promise<boolean> = async () => true;
let getCurrentAppIconResult: () => Promise<PrivacyAppIconMode> = async () => 'standard';

mockModule(
  mock,
  'react-native',
  createReactNativeStub({
    nativeModules: {
      EveryBiblePrivacyModule: {
        setAppIcon: (mode: PrivacyAppIconMode) => {
          setCalls.push(mode);
          return setAppIconResult(mode);
        },
        getCurrentAppIcon: () => getCurrentAppIconResult(),
      },
    },
  })
);

let appIcon: typeof import('./appIcon');

before(async () => {
  appIcon = await import('./appIcon');
});

beforeEach(() => {
  setCalls.length = 0;
  setAppIconResult = async () => true;
  getCurrentAppIconResult = async () => 'standard';
});

test('a device with the native privacy module reports dynamic icon support', () => {
  assert.equal(appIcon.supportsDynamicAppIcon(), true);
});

test('switching to the discreet icon forwards the mode and reports success', async () => {
  assert.equal(await appIcon.setPrivacyAppIcon('discreet'), true);
  assert.deepEqual(setCalls, ['discreet']);
});

test('a native refusal is surfaced as false rather than an exception', async () => {
  setAppIconResult = async () => false;

  assert.equal(await appIcon.setPrivacyAppIcon('standard'), false);
  assert.deepEqual(setCalls, ['standard']);
});

test('a native icon failure is logged and reported as false so callers can recover', async () => {
  const consoleError = mock.method(console, 'error', () => {});
  setAppIconResult = async () => {
    throw new Error('alternate icon not in the bundle');
  };

  try {
    assert.equal(await appIcon.setPrivacyAppIcon('discreet'), false);
  } finally {
    consoleError.mock.restore();
  }

  assert.equal(consoleError.mock.callCount(), 1);
  assert.match(String(consoleError.mock.calls[0].arguments[0]), /Failed to update app icon/);
});

test('the current icon is read back from the native module', async () => {
  getCurrentAppIconResult = async () => 'discreet';

  assert.equal(await appIcon.getCurrentPrivacyAppIcon(), 'discreet');
});

test('a failed icon read is logged and reported as unknown', async () => {
  const consoleError = mock.method(console, 'error', () => {});
  getCurrentAppIconResult = async () => {
    throw new Error('bridge unavailable');
  };

  try {
    assert.equal(await appIcon.getCurrentPrivacyAppIcon(), null);
  } finally {
    consoleError.mock.restore();
  }

  assert.match(String(consoleError.mock.calls[0].arguments[0]), /Failed to read app icon state/);
});
