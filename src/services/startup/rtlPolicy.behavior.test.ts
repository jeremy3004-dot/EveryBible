import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockReactNative } from '../../testing/mockModules';

// The stub records every I18nManager call, which is the whole observable
// surface of this policy.
const rn = mockReactNative(mock, { os: 'ios', isRTL: false });

beforeEach(() => {
  rn.__recorded.rtlCalls.length = 0;
  rn.I18nManager.isRTL = false;
});

test('a device already flipped to RTL is forced back to LTR', async () => {
  const { enforceLtrLayoutPolicy } = await import('./rtlPolicy');
  rn.I18nManager.isRTL = true;

  enforceLtrLayoutPolicy();

  assert.deepEqual(rn.__recorded.rtlCalls, [
    { method: 'forceRTL', value: false },
    { method: 'allowRTL', value: false },
  ]);
  assert.equal(rn.I18nManager.isRTL, false);
});

test('a device already in LTR is not forced, only disallowed from flipping later', async () => {
  const { enforceLtrLayoutPolicy } = await import('./rtlPolicy');

  enforceLtrLayoutPolicy();

  assert.deepEqual(rn.__recorded.rtlCalls, [{ method: 'allowRTL', value: false }]);
});

test('RTL is disallowed on every path, whichever direction the device started in', async () => {
  const { enforceLtrLayoutPolicy } = await import('./rtlPolicy');
  rn.I18nManager.isRTL = true;

  enforceLtrLayoutPolicy();
  rn.__recorded.rtlCalls.length = 0;
  enforceLtrLayoutPolicy();

  assert.deepEqual(rn.__recorded.rtlCalls, [{ method: 'allowRTL', value: false }]);
});

test('the policy never swaps left and right, which would mirror layouts it cannot mirror', async () => {
  const { enforceLtrLayoutPolicy } = await import('./rtlPolicy');
  rn.I18nManager.isRTL = true;

  enforceLtrLayoutPolicy();

  assert.equal(
    rn.__recorded.rtlCalls.some((call) => call.method === 'swapLeftAndRightInRTL'),
    false
  );
});

test('calling the policy twice is idempotent and leaves layout in LTR', async () => {
  const { enforceLtrLayoutPolicy } = await import('./rtlPolicy');
  rn.I18nManager.isRTL = true;

  enforceLtrLayoutPolicy();
  enforceLtrLayoutPolicy();

  assert.equal(rn.I18nManager.isRTL, false);
  assert.equal(
    rn.__recorded.rtlCalls.filter((call) => call.method === 'forceRTL').length,
    1,
    'forceRTL should not be called again once layout is already LTR'
  );
});

test('the policy returns nothing so startup callers cannot await it by mistake', async () => {
  const { enforceLtrLayoutPolicy } = await import('./rtlPolicy');

  assert.equal(enforceLtrLayoutPolicy(), undefined);
});
