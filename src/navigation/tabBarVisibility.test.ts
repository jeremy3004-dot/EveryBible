import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldHideTabBarOnNestedRoute } from './tabBarVisibility';

test('shouldHideTabBarOnNestedRoute only hides the root tabs for Bible picker screens', () => {
  assert.equal(shouldHideTabBarOnNestedRoute(undefined), false);
  assert.equal(shouldHideTabBarOnNestedRoute('BibleBrowser'), false);
  assert.equal(shouldHideTabBarOnNestedRoute('ChapterSelector'), false);
  assert.equal(shouldHideTabBarOnNestedRoute('BibleReader'), false);
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

test('shouldHideTabBarOnNestedRoute hides BibleReader only when it is launched as a plan session', () => {
  assert.equal(shouldHideTabBarOnNestedRoute('BibleReader', { planId: 'plan-123' }), true);
  assert.equal(shouldHideTabBarOnNestedRoute('BibleReader', { planId: 123 }), false);
  assert.equal(shouldHideTabBarOnNestedRoute('BibleReader', { other: 'value' }), false);
});

test('shouldHideTabBarOnNestedRoute respects explicit tabBarVisible=false route params', () => {
  assert.equal(shouldHideTabBarOnNestedRoute('BibleReader', { tabBarVisible: false }), true);
  assert.equal(shouldHideTabBarOnNestedRoute('PlanDetail', { tabBarVisible: false }), true);
});

test('shouldHideTabBarOnNestedRoute hides the tab bar for the full-screen locale setup flow in More', () => {
  // LocalePreferences renders LocaleSetupFlow full-screen; the floating tab bar
  // would otherwise cover its sticky "Continue with …" footer.
  assert.equal(shouldHideTabBarOnNestedRoute('LocalePreferences'), true);
});

test('shouldHideTabBarOnNestedRoute keeps the tab bar visible for other More stack screens', () => {
  assert.equal(shouldHideTabBarOnNestedRoute('MoreScreen'), false);
  assert.equal(shouldHideTabBarOnNestedRoute('Settings'), false);
  assert.equal(shouldHideTabBarOnNestedRoute('PrivacyPreferences'), false);
  assert.equal(shouldHideTabBarOnNestedRoute('ReadingActivity'), false);
  assert.equal(shouldHideTabBarOnNestedRoute('TranslationBrowser'), false);
});
