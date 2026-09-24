import test from 'node:test';
import assert from 'node:assert/strict';
import { getReaderTabBarTranslation } from '../readerTabBarMotion';
import {
  getBibleTabResumeParams,
  getTabBarCollapseProgress,
  getTabBarMotion,
  resolveActiveNestedRoute,
  type BibleTabResumeState,
} from './tabNavigatorModel';

test('the active nested route is the deepest focused one, with its params', () => {
  const route = {
    state: {
      index: 1,
      routes: [
        { name: 'BibleBrowser' },
        { name: 'BibleReader', params: { bookId: 'JHN', chapter: 3 } },
      ],
    },
  };

  assert.deepEqual(resolveActiveNestedRoute(route, undefined), {
    nestedRouteName: 'BibleReader',
    nestedRouteParams: { bookId: 'JHN', chapter: 3 },
  });
});

test('without an index the last nested route is the focused one', () => {
  const route = { state: { routes: [{ name: 'PlansHome' }, { name: 'PlanDetail' }] } };

  assert.equal(resolveActiveNestedRoute(route, undefined).nestedRouteName, 'PlanDetail');
});

test('React Navigation’s own focused name wins over the walked state', () => {
  const route = { state: { index: 0, routes: [{ name: 'BibleBrowser' }] } };

  assert.equal(resolveActiveNestedRoute(route, 'BibleReader').nestedRouteName, 'BibleReader');
});

test('before the nested stack has state, the tab params name the screen and hold its params', () => {
  const route = { params: { screen: 'BibleReader', params: { planId: 'plan-1' } } };

  assert.deepEqual(resolveActiveNestedRoute(route, undefined), {
    nestedRouteName: 'BibleReader',
    nestedRouteParams: { planId: 'plan-1' },
  });
});

test('a nested route without params falls back to the tab params', () => {
  const route = {
    state: { index: 0, routes: [{ name: 'BibleReader' }] },
    params: { screen: 'BibleReader', params: { focusVerse: 16 } },
  };

  assert.deepEqual(resolveActiveNestedRoute(route, undefined).nestedRouteParams, {
    focusVerse: 16,
  });
});

test('Home never collapses the bar, whatever its params ask', () => {
  assert.equal(
    getTabBarCollapseProgress('Home', {
      nestedRouteName: 'LessonDetail',
      nestedRouteParams: { tabBarCollapseProgress: 1 },
    }),
    0
  );
});

test('a route collapse progress is clamped to 0..1', () => {
  const progress = (value: unknown) =>
    getTabBarCollapseProgress('Bible', {
      nestedRouteName: 'BibleBrowser',
      nestedRouteParams: { tabBarCollapseProgress: value },
    });

  assert.equal(progress(0.4), 0.4);
  assert.equal(progress(4), 1);
  assert.equal(progress(-2), 0);
  assert.equal(progress('1'), 0, 'only numbers count');
});

test('screens that hide the bar collapse it fully on every stack but Home', () => {
  for (const [tab, screen] of [
    ['Bible', 'BiblePicker'],
    ['Learn', 'LessonDetail'],
    ['Plans', 'PlanDetail'],
    ['More', 'LocalePreferences'],
  ]) {
    assert.equal(getTabBarCollapseProgress(tab, { nestedRouteName: screen }), 1, screen);
  }
  assert.equal(getTabBarCollapseProgress('Bible', { nestedRouteName: 'BibleReader' }), 0);
});

const shown = { nestedRouteName: 'BibleReader' };

test('the bar follows reader scroll unless its style already carries a translation', () => {
  assert.deepEqual(
    getTabBarMotion({ followsReader: true, nestedRoute: shown, tabBarStyle: undefined }),
    { followsScroll: true, forcedHidden: false }
  );
  assert.deepEqual(
    getTabBarMotion({
      followsReader: true,
      nestedRoute: shown,
      tabBarStyle: { transform: [{ translateY: 0 }] },
    }),
    { followsScroll: true, forcedHidden: false },
    'a zero translation is no translation'
  );
  assert.deepEqual(
    getTabBarMotion({
      followsReader: true,
      nestedRoute: shown,
      tabBarStyle: { transform: [{ translateY: 40 }] },
    }),
    { followsScroll: false, forcedHidden: false },
    'an explicit translation from setOptions is not doubled'
  );
  assert.equal(
    getTabBarMotion({ followsReader: false, nestedRoute: shown, tabBarStyle: undefined })
      .followsScroll,
    false
  );
});

test('the bar is hidden when a screen hides it, sets display none, or slides it nearly off', () => {
  const hidden = (nestedRoute: typeof shown, tabBarStyle?: object) =>
    getTabBarMotion({ followsReader: false, nestedRoute, tabBarStyle }).forcedHidden;

  assert.equal(hidden({ nestedRouteName: 'BiblePicker' }), true);
  assert.equal(hidden(shown, { display: 'none' }), true);
  assert.equal(
    hidden(shown, { transform: [{ translateY: getReaderTabBarTranslation(0.98) }] }),
    true
  );
  assert.equal(
    hidden(shown, { transform: [{ translateY: getReaderTabBarTranslation(0.9) }] }),
    false
  );
  assert.equal(hidden(shown, { transform: [{ scale: 2 }] }), false);
  assert.equal(hidden(shown), false);
});

const resume: BibleTabResumeState = {
  hasReaderHistory: true,
  currentBibleBook: 'JHN',
  currentBibleChapter: 3,
  preferredBibleMode: 'listen',
};
const freeReaderParams = {
  bookId: 'JHN',
  chapter: 3,
  preferredMode: 'listen',
  planId: undefined,
  planDayNumber: undefined,
  returnToPlanOnComplete: undefined,
  sessionContext: undefined,
};

test('the Bible tab reopens the last chapter from anywhere but a free reader', () => {
  assert.deepEqual(
    getBibleTabResumeParams({ state: { index: 0, routes: [{ name: 'BibleBrowser' }] } }, resume),
    freeReaderParams
  );
  assert.deepEqual(getBibleTabResumeParams({}, resume), freeReaderParams, 'a fresh Bible tab');
  assert.equal(
    getBibleTabResumeParams({ state: { index: 0, routes: [{ name: 'BibleReader' }] } }, resume),
    null
  );
});

test('the Bible tab leaves a plan-session reader for free reading', () => {
  const planReader = { name: 'BibleReader', params: { planId: 'plan-1' } };

  assert.deepEqual(
    getBibleTabResumeParams({ state: { index: 0, routes: [planReader] } }, resume),
    freeReaderParams
  );
  assert.deepEqual(
    getBibleTabResumeParams({ params: { screen: 'BibleReader', params: { planId: 'p' } } }, resume),
    freeReaderParams
  );
});

test('the Bible tab keeps its default press when no chapter has been read', () => {
  assert.equal(
    getBibleTabResumeParams(
      { state: { index: 0, routes: [{ name: 'BibleBrowser' }] } },
      { ...resume, hasReaderHistory: false }
    ),
    null
  );
});
