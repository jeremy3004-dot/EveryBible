import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getTabScreenBottomInset } from './tabScreenLayoutModel';

const source = (file: string) =>
  readFileSync(fileURLToPath(new URL(file, import.meta.url).href), 'utf8');

test('every root tab stack protects its screens by default, including future routes', () => {
  const stacks = [...source('./TabNavigator.tsx').matchAll(/from '\.\/(\w+Stack)'/g)];
  assert.equal(stacks.length, 5);
  for (const [, stack] of stacks) {
    assert.match(source(`./${stack}.tsx`), /screenLayout=\{renderTabScreenLayout\}/, stack);
  }
  assert.equal(getTabScreenBottomInset('FutureScreen', undefined, undefined, 82), 82);
});

test('all ordinary routes reserve the complete floating capsule footprint', () => {
  const routes = [
    'BibleBrowser',
    'ChapterSelector',
    'TranslatorQueue',
    'GatherHome',
    'FoundationDetail',
    'PrayerWall',
    'GroupList',
    'GroupDetail',
    'GroupSession',
    'PlansHome',
    'RhythmDetail',
    'RhythmComposer',
    'MoreScreen',
    'LocalePreferences',
    'PrivacyPreferences',
    'Profile',
    'ReadingActivity',
    'Annotations',
    'MyFeedback',
    'TranslationBrowser',
    'About',
    'Diagnostics',
  ];
  // iOS home-indicator and Android/older iPhone geometry.
  for (const height of [82, 80]) {
    for (const route of routes) {
      assert.equal(getTabScreenBottomInset(route, undefined, undefined, height), height, route);
    }
  }
});

test('hidden tabs, modal screens and existing custom chrome do not get double clearance', () => {
  for (const route of [
    'HomeScreen',
    'Settings',
    'BibleReader',
    'BiblePicker',
    'LessonDetail',
    'PlanDetail',
  ]) {
    assert.equal(getTabScreenBottomInset(route, undefined, undefined, 82), 0, route);
  }
  assert.equal(getTabScreenBottomInset('AnyScreen', { tabBarVisible: false }, undefined, 82), 0);
  for (const presentation of ['modal', 'fullScreenModal', 'formSheet', 'transparentModal']) {
    assert.equal(getTabScreenBottomInset('Auth', undefined, presentation, 82), 0);
  }
  assert.equal(getTabScreenBottomInset('AnyScreen', undefined, 'card', 82), 82);
});

test('clearance shrinks the screen bounds so absolute footers and scroll viewports both clear tabs', () => {
  assert.match(source('./TabScreenLayout.tsx'), /marginBottom: bottomInset/);
  assert.match(source('./TabScreenLayout.tsx'), /useTabBarHeight\(\)/);
  assert.match(source('./TabScreenLayout.tsx'), /\{children\}/);
  assert.doesNotMatch(source('../screens/onboarding/LocaleSetupFlow.tsx'), /useTabBarHeight/);
  assert.match(
    source('../screens/home/HomeScreen.tsx'),
    /height: bottomTabBarHeight.*useTabBarHeight\(\)/
  );
});
