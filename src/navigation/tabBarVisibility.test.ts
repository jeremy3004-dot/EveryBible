import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldHideTabBarOnNestedRoute } from './tabBarVisibility';

test('shouldHideTabBarOnNestedRoute only hides the root tabs for the active Bible reader session', () => {
  assert.equal(shouldHideTabBarOnNestedRoute(undefined), false);
  assert.equal(shouldHideTabBarOnNestedRoute('BibleBrowser'), false);
  assert.equal(shouldHideTabBarOnNestedRoute('ChapterSelector'), false);
  assert.equal(shouldHideTabBarOnNestedRoute('BibleReader'), true);
  assert.equal(shouldHideTabBarOnNestedRoute('BiblePicker'), true);
});

test('shouldHideTabBarOnNestedRoute hides the tab bar for the Learn lesson detail view', () => {
  assert.equal(shouldHideTabBarOnNestedRoute('LessonDetail'), true);
});

test('shouldHideTabBarOnNestedRoute keeps the tab bar visible for other Learn stack screens', () => {
  assert.equal(shouldHideTabBarOnNestedRoute('GatherHome'), false);
  assert.equal(shouldHideTabBarOnNestedRoute('GroupList'), false);
  assert.equal(shouldHideTabBarOnNestedRoute('GroupDetail'), false);
  assert.equal(shouldHideTabBarOnNestedRoute('ReadingPlanList'), false);
});
