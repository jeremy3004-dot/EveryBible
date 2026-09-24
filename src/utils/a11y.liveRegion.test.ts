import assert from 'node:assert/strict';
import test, { before, beforeEach, mock } from 'node:test';
import { mockModule } from '../testing/mockModules';

const platform = { OS: 'ios' as 'ios' | 'android' };
const announced: string[] = [];
let announceFailure: Error | null = null;

mockModule(mock, 'react-native', {
  Platform: platform,
  AccessibilityInfo: {
    announceForAccessibility: (message: string) => {
      if (announceFailure) {
        throw announceFailure;
      }
      announced.push(message);
    },
  },
});

let a11y: typeof import('./a11y');

before(async () => {
  a11y = await import('./a11y');
});

beforeEach(() => {
  platform.OS = 'ios';
  announced.length = 0;
  announceFailure = null;
});

test('a status update is spoken on both platforms', () => {
  a11y.announceForAccessibility('Saved');
  platform.OS = 'android';
  a11y.announceForAccessibility('Saved');

  assert.deepEqual(announced, ['Saved', 'Saved']);
});

test('blank messages and a missing accessibility bridge never throw', () => {
  a11y.announceForAccessibility('   ');
  announceFailure = new Error('no bridge');
  a11y.announceForAccessibility('Saved');

  assert.deepEqual(announced, []);
});

test('text shown in a live region is announced for VoiceOver, which ignores live regions', () => {
  a11y.announceLiveRegionText('Wrong passcode');

  assert.deepEqual(announced, ['Wrong passcode']);
});

test('text shown in a live region is not announced again on Android, where TalkBack reads the region', () => {
  // TalkBack speaks an accessibilityLiveRegion when it appears or changes. An extra
  // announcement makes it say the same message twice.
  platform.OS = 'android';

  a11y.announceLiveRegionText('Wrong passcode');

  assert.deepEqual(announced, []);
});
