import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockModule } from '../testing/mockModules';
import { createReactNativeStub } from '../testing/reactNativeStub';

const announcements: string[] = [];
/** Set to make the native bridge throw, as it does on platforms without one. */
let bridgeThrows = false;

// The shared stub has no AccessibilityInfo, so add it locally before mocking.
mockModule(mock, 'react-native', {
  ...createReactNativeStub({ os: 'ios' }),
  AccessibilityInfo: {
    announceForAccessibility: (message: string) => {
      if (bridgeThrows) {
        throw new Error('no accessibility bridge');
      }
      announcements.push(message);
    },
  },
});

const loadA11y = () => import('./a11y');

beforeEach(() => {
  announcements.length = 0;
  bridgeThrows = false;
});

test('speaks the status message through the screen reader', async () => {
  const { announceForAccessibility } = await loadA11y();
  announceForAccessibility('Chapter 3 downloaded');

  assert.deepEqual(announcements, ['Chapter 3 downloaded']);
});

test('passes the message through unchanged, including surrounding whitespace', async () => {
  const { announceForAccessibility } = await loadA11y();
  announceForAccessibility('  John 3  ');

  assert.deepEqual(announcements, ['  John 3  ']);
});

test('stays silent for an empty or whitespace-only message', async () => {
  const { announceForAccessibility } = await loadA11y();
  announceForAccessibility('');
  announceForAccessibility('   \n\t');

  assert.deepEqual(announcements, []);
});

test('swallows a native bridge failure so the interaction is never broken', async () => {
  const { announceForAccessibility } = await loadA11y();
  bridgeThrows = true;

  assert.doesNotThrow(() => announceForAccessibility('Saved'));
  assert.deepEqual(announcements, []);
});
