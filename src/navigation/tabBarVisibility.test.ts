import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldHideTabBarOnNestedRoute } from './tabBarVisibility';

test('shouldHideTabBarOnNestedRoute only hides the root tabs for the active Bible reader session', () => {
  assert.equal(shouldHideTabBarOnNestedRoute(undefined), false);
  assert.equal(shouldHideTabBarOnNestedRoute('BibleBrowser'), false);
  assert.equal(shouldHideTabBarOnNestedRoute('ChapterSelector'), false);
  assert.equal(shouldHideTabBarOnNestedRoute('BibleReader'), true);
});
