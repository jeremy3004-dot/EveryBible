import test from 'node:test';
import assert from 'node:assert/strict';
import { rootTabManifest } from './tabManifest';

test('root tab manifest exposes all 5 tabs in the correct order', () => {
  assert.deepEqual(
    rootTabManifest.map((tab) => tab.name),
    ['Home', 'Bible', 'Learn', 'Plans', 'More']
  );
});

test('learn tab uses the gather localization key', () => {
  const learnTab = rootTabManifest.find((tab) => tab.name === 'Learn');

  assert.ok(learnTab);
  assert.equal(learnTab.labelKey, 'tabs.gather');
});
