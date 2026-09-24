import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, Fragment, type ReactNode } from 'react';
import type { ReactTestInstance } from 'react-test-renderer';
import { create } from 'zustand';
import { hostComponent } from '../testing/reactNativeHost';
import { mockModule, mockPackage, sourcePath } from '../testing/mockModules';
import { flattenStyle, hostAncestors, installRenderHarness, within } from '../testing/render';
import { buildTabBarCapsuleStyle, getTabBarCapsuleFill } from './tabBarCapsuleStyle';
import { getReaderTabBarTranslation } from './readerTabBarMotion';
import { hexWithAlpha } from '../utils/color';

const harness = installRenderHarness(mock, { os: 'ios' });
const styleOf = (style: unknown) => flattenStyle(style) ?? {};

// ---------------------------------------------------------------------------
// A bottom-tabs double. The navigator renders its screens as host `TabScreen`
// elements (so a test reads each tab's listeners) and hands the `tabBar`
// renderer the tab state the test sets, with each route's options resolved
// through the real `screenOptions`. The tab bar mirrors BottomTabBar: the
// focused route's style, background and tints, then one `tabBarButton` per
// route holding that route's icon and label.
// ---------------------------------------------------------------------------
type FakeRoute = {
  key: string;
  name: string;
  state?: { index?: number; routes: Array<{ name: string; params?: Record<string, unknown> }> };
  params?: Record<string, unknown>;
};
type TabOptions = Record<string, unknown> & {
  tabBarStyle?: unknown;
  tabBarBackground?: () => ReactNode;
  tabBarButton?: (props: Record<string, unknown>) => ReactNode;
  tabBarIcon?: (props: { focused: boolean; color: string; size: number }) => ReactNode;
  tabBarLabel?: (props: { focused: boolean; color: string; children: string }) => ReactNode;
  tabBarActiveTintColor?: string;
  tabBarInactiveTintColor?: string;
  tabBarAccessibilityLabel?: string;
  tabBarItemStyle?: unknown;
};
type Descriptor = { route: FakeRoute; options: TabOptions };

const TAB_NAMES = ['Home', 'Bible', 'Learn', 'Plans', 'More'];
let tabState: { index: number; routes: FakeRoute[] };
const tabBarPresses: string[] = [];

function focusTab(name: string, nested: Pick<FakeRoute, 'state' | 'params'> = {}) {
  tabState = {
    index: TAB_NAMES.indexOf(name),
    routes: TAB_NAMES.map((tab) => ({
      key: `${tab}-key`,
      name: tab,
      ...(tab === name ? nested : {}),
    })),
  };
}

function FakeTabNavigator({
  children,
  id,
  screenOptions,
  tabBar,
}: {
  children: ReactNode;
  id: string;
  screenOptions: (args: { route: FakeRoute }) => TabOptions;
  tabBar: (props: Record<string, unknown>) => ReactNode;
}) {
  const descriptors = Object.fromEntries(
    tabState.routes.map((route) => [route.key, { route, options: screenOptions({ route }) }])
  );
  return createElement(
    'TabNavigatorHost',
    { id },
    children,
    tabBar({ state: tabState, descriptors, navigation: {} })
  );
}

function FakeBottomTabBar({
  state,
  descriptors,
}: {
  state: typeof tabState;
  descriptors: Record<string, Descriptor>;
}) {
  const focused = descriptors[state.routes[state.index].key].options;
  return createElement(
    'BottomTabBar',
    { style: focused.tabBarStyle, descriptors },
    createElement('TabBarBackgroundSlot', null, focused.tabBarBackground?.()),
    state.routes.map((route, index) => {
      const options = descriptors[route.key].options;
      const isFocused = index === state.index;
      // Like BottomTabBar, every item takes its tints from the focused route.
      const color = (
        isFocused ? focused.tabBarActiveTintColor : focused.tabBarInactiveTintColor
      ) as string;
      return createElement(
        Fragment,
        { key: route.key },
        options.tabBarButton?.({
          accessibilityRole: 'tab',
          accessibilityState: { selected: isFocused },
          accessibilityLabel: options.tabBarAccessibilityLabel,
          testID: `tab-${route.name}`,
          onPress: () => tabBarPresses.push(route.name),
          style: options.tabBarItemStyle,
          children: createElement(
            Fragment,
            null,
            options.tabBarIcon?.({ focused: isFocused, color, size: 25 }),
            options.tabBarLabel?.({ focused: isFocused, color, children: route.name })
          ),
        })
      );
    })
  );
}

mockPackage(mock, '@react-navigation/bottom-tabs', {
  createBottomTabNavigator: () => ({
    Navigator: FakeTabNavigator,
    Screen: (props: Record<string, unknown>) => createElement('TabScreen', props),
  }),
  BottomTabBar: FakeBottomTabBar,
});
mockPackage(mock, '@react-navigation/elements', {
  PlatformPressable: hostComponent('PlatformPressable'),
});

const glass = { available: true };
mockPackage(mock, 'expo-glass-effect', {
  GlassView: hostComponent('GlassView'),
  isLiquidGlassAvailable: () => glass.available,
  isGlassEffectAPIAvailable: () => true,
});

// The reader drives this shared value from its scroll position.
const readerProgress = { value: 0 };
mockModule(mock, sourcePath('stores/readerChromeStore.ts'), {
  useReaderChromeProgress: () => readerProgress,
});

// Loaded by TabNavigator with require() only when the Bible tab is pressed.
const initialBibleState = {
  hasReaderHistory: true,
  currentBook: 'JHN',
  currentChapter: 3,
  preferredChapterLaunchMode: 'listen',
};
const useBibleStore = create(() => ({ ...initialBibleState }));
mockModule(mock, sourcePath('stores/bibleStore.ts'), { useBibleStore });

const STACKS: Record<string, string> = {
  Home: 'HomeStack',
  Bible: 'BibleStack',
  Learn: 'LearnStack',
  Plans: 'PlansStack',
  More: 'MoreStack',
};
for (const stack of Object.values(STACKS)) {
  mockModule(mock, sourcePath(`navigation/${stack}.tsx`), { [stack]: hostComponent(stack) });
}

// The real palettes give the reader the same ink and paper as the app, which
// would let a wrong branch pass unseen; this theme makes every scope distinct.
const colors = {
  primaryText: '#101010',
  biblePrimaryText: '#202020',
  cardBackground: '#F0F0F0',
  bibleSurface: '#E0E0E0',
  cardBorder: '#C0C0C0',
  bibleDivider: '#B0B0B0',
  accentPrimary: '#AA3300',
};
const theme = { colors, isDark: false };
mockModule(mock, sourcePath('contexts/ThemeContext.tsx'), {
  useTheme: () => theme,
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
});

beforeEach(() => {
  theme.isDark = false;
  focusTab('Home');
  tabBarPresses.length = 0;
  readerProgress.value = 0;
  glass.available = true;
  useBibleStore.setState({ ...initialBibleState });
});

async function renderTabs() {
  const { TabNavigator } = await import('./TabNavigator');
  const view = await harness.render(<TabNavigator />);
  const bar = view.queryAllByType('BottomTabBar')[0];
  const wrapper = hostAncestors(bar)[0];
  const descriptors = bar.props.descriptors as Record<string, Descriptor>;
  const optionsFor = (name: string) => descriptors[`${name}-key`].options;
  const screen = (name: string) =>
    view.queryAllByType('TabScreen').find((node) => node.props.name === name) as ReactTestInstance;
  const background = () => view.queryAllByType('TabBarBackgroundSlot')[0];
  return { view, bar, wrapper, optionsFor, screen, background };
}

const EXPECTED_CAPSULE = { sideInset: 16, bottomPadding: 22, barHeight: 64 };

function expectInteractive(wrapper: ReactTestInstance) {
  assert.equal(wrapper.props.pointerEvents, 'box-none');
  assert.equal(wrapper.props.accessibilityElementsHidden, false);
  assert.equal(wrapper.props.importantForAccessibility, 'auto');
}

function expectCollapsed(wrapper: ReactTestInstance) {
  assert.equal(wrapper.props.pointerEvents, 'none', 'a collapsed bar must not take touches');
  assert.equal(wrapper.props.accessibilityElementsHidden, true);
  assert.equal(wrapper.props.importantForAccessibility, 'no-hide-descendants');
  // The capsule slides away; it never fades (fading would dim native glass).
  assert.equal('opacity' in styleOf(wrapper.props.style), false);
}

// --- Registration and tab presses ------------------------------------------

test('registers the five root tabs over their stacks and freezes the tabs that are not showing', async () => {
  const { view, optionsFor, screen } = await renderTabs();

  assert.equal(view.queryAllByType('TabNavigatorHost')[0].props.id, 'RootTab');
  const screens = view.queryAllByType('TabScreen');
  assert.deepEqual(
    screens.map((node) => node.props.name),
    TAB_NAMES
  );
  for (const name of TAB_NAMES) {
    assert.equal(screen(name).props.component, (await stackComponent(STACKS[name])) as unknown);
    assert.equal(optionsFor(name).freezeOnBlur, true, `${name} stops repainting off-screen`);
    assert.equal(optionsFor(name).headerShown, false);
  }
});

async function stackComponent(stack: string) {
  const module = (await import(`./${stack}`)) as Record<string, unknown>;
  return module[stack];
}

function pressEvent() {
  const event = { prevented: 0, preventDefault: () => (event.prevented += 1) };
  return event;
}

function tabListeners(screen: ReactTestInstance, route: FakeRoute) {
  const calls: unknown[][] = [];
  const navigation = { calls, navigate: (...args: unknown[]) => calls.push(args) };
  const listeners = screen.props.listeners;
  const resolved = typeof listeners === 'function' ? listeners({ navigation, route }) : listeners;
  return { tabPress: resolved.tabPress as (event: unknown) => void, navigation };
}

test('pressing Bible from the book list reopens the last chapter read', async () => {
  const { screen } = await renderTabs();
  const { tabPress, navigation } = tabListeners(screen('Bible'), {
    key: 'Bible-key',
    name: 'Bible',
    state: { index: 0, routes: [{ name: 'BibleBrowser' }] },
  });

  const event = pressEvent();
  tabPress(event);

  assert.equal(event.prevented, 1, 'the default tab switch is replaced by the resume');
  assert.deepEqual(navigation.calls, [
    [
      'Bible',
      {
        screen: 'BibleReader',
        params: {
          bookId: 'JHN',
          chapter: 3,
          preferredMode: 'listen',
          planId: undefined,
          planDayNumber: undefined,
          returnToPlanOnComplete: undefined,
          sessionContext: undefined,
        },
      },
    ],
  ]);
  assert.deepEqual(harness.haptics, [{ kind: 'impact', style: 'light' }]);
});

test('pressing Bible from a plan-session reader drops the plan session and resumes free reading', async () => {
  const { screen } = await renderTabs();
  for (const route of [
    {
      key: 'Bible-key',
      name: 'Bible',
      state: {
        index: 1,
        routes: [
          { name: 'BibleBrowser' },
          {
            name: 'BibleReader',
            params: { bookId: 'PSA', chapter: 1, planId: 'plan-1', planDayNumber: 4 },
          },
        ],
      },
    },
    // Before the nested stack has state, the plan session is only in the tab params.
    {
      key: 'Bible-key',
      name: 'Bible',
      params: { screen: 'BibleReader', params: { planId: 'plan-1', planDayNumber: 4 } },
    },
  ]) {
    const { tabPress, navigation } = tabListeners(screen('Bible'), route);
    const event = pressEvent();
    tabPress(event);

    assert.equal(event.prevented, 1);
    const [, target] = navigation.calls[0] as [string, { params: Record<string, unknown> }];
    assert.deepEqual(target.params, {
      bookId: 'JHN',
      chapter: 3,
      preferredMode: 'listen',
      planId: undefined,
      planDayNumber: undefined,
      returnToPlanOnComplete: undefined,
      sessionContext: undefined,
    });
  }
});

test('pressing Bible leaves the default behaviour alone when there is nothing to resume', async () => {
  const { screen } = await renderTabs();
  const freeReader: FakeRoute = {
    key: 'Bible-key',
    name: 'Bible',
    state: { index: 0, routes: [{ name: 'BibleReader', params: { bookId: 'GEN', chapter: 1 } }] },
  };

  // Already reading freely: the ordinary tab press (pop to top / stay) applies.
  let { tabPress, navigation } = tabListeners(screen('Bible'), freeReader);
  let event = pressEvent();
  tabPress(event);
  assert.equal(event.prevented, 0);
  assert.deepEqual(navigation.calls, []);

  // A reader who has never opened a chapter lands on the book list.
  useBibleStore.setState({ hasReaderHistory: false });
  ({ tabPress, navigation } = tabListeners(screen('Bible'), {
    key: 'Bible-key',
    name: 'Bible',
    state: { index: 0, routes: [{ name: 'BibleBrowser' }] },
  }));
  event = pressEvent();
  tabPress(event);
  assert.equal(event.prevented, 0);
  assert.deepEqual(navigation.calls, []);
});

test('pressing Plans always returns to the plans list instead of the last plan opened', async () => {
  const { screen } = await renderTabs();
  const { tabPress, navigation } = tabListeners(screen('Plans'), {
    key: 'Plans-key',
    name: 'Plans',
    state: { index: 1, routes: [{ name: 'PlansHome' }, { name: 'RhythmDetail' }] },
  });

  const event = pressEvent();
  tabPress(event);

  assert.equal(event.prevented, 1);
  assert.deepEqual(navigation.calls, [['Plans', { screen: 'PlansHome' }]]);
  assert.deepEqual(harness.haptics, [{ kind: 'impact', style: 'light' }]);
});

test('Home, Gather and More tab presses give a light haptic and keep the default switch', async () => {
  const { screen } = await renderTabs();
  for (const name of ['Home', 'Learn', 'More']) {
    const { tabPress, navigation } = tabListeners(screen(name), { key: `${name}-key`, name });
    const event = pressEvent();
    tabPress(event);
    assert.equal(event.prevented, 0);
    assert.deepEqual(navigation.calls, []);
  }
  assert.equal(harness.haptics.length, 3);
});

// --- Tab items ---------------------------------------------------------------

test('each tab is a button announcing its label and position, with a Lucide glyph from the manifest', async () => {
  const { view } = await renderTabs();
  const expected = [
    ['Home', 'House'],
    ['Bible', 'BookOpen'],
    ['Gather', 'Users'],
    ['Plans', 'Calendar'],
    ['More', 'Ellipsis'],
  ];

  const tabs = view.getAllByRole('tab');
  assert.equal(tabs.length, 5);
  expected.forEach(([label, glyph], index) => {
    const tab = view.getByRole('tab', { name: `${label}, tab, ${index + 1} of 5` });
    assert.equal(tab.type, 'PlatformPressable');
    assert.deepEqual(tab.props.accessibilityState, { selected: index === 0 });

    const icons = within(tab).queryAllByType('LucideIcon');
    assert.equal(icons.length, 1);
    assert.equal(icons[0].props.name, glyph);
    assert.equal(icons[0].props.size, 22);
    assert.equal(icons[0].props.strokeWidth, 2);

    const text = within(tab).getByText(label);
    assert.equal(text.props.numberOfLines, 1);
    assert.equal(text.props.maxFontSizeMultiplier, 1.6, 'the 64pt capsule caps label scaling');
    const style = styleOf(text.props.style);
    assert.equal(style.fontSize, 11);
    assert.equal(style.lineHeight, 14);
    assert.equal(style.fontWeight, '600');
  });
});

// Release QA in Arabic: the Bible tab read "الكتاب المـ…". Each tab owns a fifth of
// the capsule, (375 − 2 × 16) / 5 ≈ 69pt on a 375pt phone, and "الكتاب المقدس" is
// the conventional name (a bare "الكتاب", "the book", is ambiguous), so the label
// keeps its translation and shrinks to its slot instead of truncating. The
// harness does not lay text out, so this pins the mechanism rather than a width.
test('a tab label too long for its fifth of the capsule shrinks to fit instead of truncating', async () => {
  const { ar } = await import('../i18n/locales/ar');
  const { CONTROL_LABEL_MAX_FONT_SCALE } = await import('../design/largeTextLayout');
  const { TAB_BAR_CAPSULE_SIDE_INSET } = await import('../hooks/useTabBarHeight');
  harness.i18n.addResourceBundle('ar', 'translation', ar, true, true);
  await harness.i18n.changeLanguage('ar');
  try {
    const { view } = await renderTabs();
    const slot = (375 - 2 * TAB_BAR_CAPSULE_SIDE_INSET) / TAB_NAMES.length;
    assert.ok(slot < 70, 'the narrowest supported phone leaves under 70pt per tab');

    const label = within(view.getByTestId('tab-Bible')).getByText(ar.tabs.bible);
    assert.equal(label.props.numberOfLines, 1);
    assert.equal(label.props.adjustsFontSizeToFit, true);
    assert.equal(label.props.minimumFontScale, 0.7);
    assert.equal(label.props.maxFontSizeMultiplier, CONTROL_LABEL_MAX_FONT_SCALE);
    assert.equal(label.props.ellipsizeMode, undefined);
  } finally {
    await harness.i18n.changeLanguage('en');
  }
});

test('the tab button keeps the navigator press, test ID and item style while filling the capsule', async () => {
  const { view } = await renderTabs();
  const tab = view.getByRole('tab', { name: 'Plans, tab, 4 of 5' });

  assert.equal(tab.props.testID, 'tab-Plans');
  await view.press(tab);
  assert.deepEqual(tabBarPresses, ['Plans']);

  const style = styleOf(tab.props.style);
  // Item style: fills the capsule height and adds no padding of its own.
  assert.equal(style.height, '100%');
  assert.equal(style.paddingTop, 0);
  assert.equal(style.paddingBottom, 0);
  assert.equal(style.flex, 1);
});

// --- Colours and material ------------------------------------------------------

test('outside the reader the tabs use primary ink on the card-surface glass', async () => {
  focusTab('Bible', { state: { index: 0, routes: [{ name: 'BibleBrowser' }] } });
  const { view, optionsFor, background } = await renderTabs();

  assert.equal(optionsFor('Bible').tabBarActiveTintColor, colors.primaryText);
  assert.equal(optionsFor('Bible').tabBarInactiveTintColor, colors.primaryText);
  for (const icon of view.queryAllByType('LucideIcon')) {
    assert.equal(icon.props.color, colors.primaryText, 'the pill alone carries selection');
  }

  const [paper] = within(background())
    .queryAllByType('View')
    .filter((node) => styleOf(node.props.style).backgroundColor !== undefined);
  assert.equal(
    styleOf(paper.props.style).backgroundColor,
    getTabBarCapsuleFill(colors.cardBackground)
  );
});

test('while the reader is focused the tabs take the reader ink, surface and divider', async () => {
  glass.available = false;
  focusTab('Bible', {
    state: { index: 1, routes: [{ name: 'BibleBrowser' }, { name: 'BibleReader' }] },
  });
  const { view, optionsFor, background } = await renderTabs();

  assert.equal(optionsFor('Bible').tabBarActiveTintColor, colors.biblePrimaryText);
  assert.equal(optionsFor('Bible').tabBarInactiveTintColor, colors.biblePrimaryText);
  for (const icon of view.queryAllByType('LucideIcon')) {
    assert.equal(icon.props.color, colors.biblePrimaryText);
  }

  const styles = within(background())
    .queryAllByType('View')
    .map((node) => styleOf(node.props.style));
  assert.ok(
    styles.some((style) => style.backgroundColor === getTabBarCapsuleFill(colors.bibleSurface)),
    'the capsule is backed by the reading surface'
  );
  assert.ok(
    styles.some((style) => style.borderColor === colors.bibleDivider),
    'the capsule edge follows the reader divider'
  );
});

test('native glass sits in front of the paper backing, clipped to the rounded capsule', async () => {
  const { background } = await renderTabs();
  const slot = within(background());

  const glassView = slot.queryAllByType('GlassView')[0];
  assert.ok(glassView, 'iOS 26 draws native liquid glass');
  assert.equal(glassView.props.glassEffectStyle, 'regular', 'frosted, not clear lensing glass');
  assert.equal(glassView.props.colorScheme, 'light');
  assert.equal(slot.queryAllByType('BlurView').length, 0);

  const capsule = hostAncestors(glassView)[0];
  const capsuleStyle = styleOf(capsule.props.style);
  assert.equal(capsuleStyle.borderRadius, 32);
  assert.equal(capsuleStyle.overflow, 'hidden');
  assert.equal(capsule.props.pointerEvents, 'none');

  // Host elements in paint order: earlier siblings draw behind later ones.
  const painted = capsule.findAll((node) => typeof node.type === 'string' && node !== capsule);
  const paperIndex = painted.findIndex(
    (node) =>
      styleOf(node.props.style).backgroundColor === getTabBarCapsuleFill(colors.cardBackground)
  );
  assert.ok(paperIndex >= 0, 'a paper backing is drawn');
  assert.ok(paperIndex < painted.indexOf(glassView), 'the paper backing sits behind the glass');
});

test('without native glass the capsule is a tinted blur under the same paper and a hairline edge', async () => {
  glass.available = false;
  theme.isDark = true;
  const { background } = await renderTabs();
  const slot = within(background());

  assert.equal(slot.queryAllByType('GlassView').length, 0);
  const blur = slot.queryAllByType('BlurView')[0];
  assert.equal(blur.props.tint, 'dark');
  assert.equal(blur.props.intensity, 40);
  const capsuleStyle = styleOf(hostAncestors(blur)[0].props.style);
  assert.equal(capsuleStyle.borderRadius, 32);
  assert.equal(capsuleStyle.overflow, 'hidden');
});

test('the selection pill is a neutral wash of the scope ink, never the accent', async () => {
  focusTab('Plans');
  const first = await renderTabs();
  const selection = first
    .background()
    .findAll((node) => (node.type as { name?: string }).name === 'TabBarSelection')[0];
  assert.deepEqual(selection.props, {
    selectedIndex: 3,
    count: 5,
    color: hexWithAlpha(colors.primaryText, 0.1),
  });
  assert.notEqual(selection.props.color, colors.accentPrimary);
  await first.view.unmount();

  focusTab('Bible', { state: { index: 0, routes: [{ name: 'BibleReader' }] } });
  const reader = await renderTabs();
  const pill = reader
    .background()
    .findAll((node) => (node.type as { name?: string }).name === 'TabBarSelection');
  assert.equal(pill[0].props.color, hexWithAlpha(colors.biblePrimaryText, 0.1));
  assert.equal(pill[0].props.selectedIndex, 1);
});

// --- Shape, collapse and hiding ----------------------------------------------------

test('the bar is the shared flat-edged floating capsule, not a full-width strip padded by the inset', async () => {
  const { bar, wrapper } = await renderTabs();
  const style = styleOf(bar.props.style);

  assert.deepEqual(style, styleOf(buildTabBarCapsuleStyle(EXPECTED_CAPSULE)));
  assert.equal(style.bottom, 22, 'lifted off the home indicator, not padded by it');
  assert.equal(style.paddingBottom, 0);
  assert.equal(style.paddingTop, 0);
  for (const key of ['borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius']) {
    assert.equal(key in style, false, `the bar itself carries no ${key}`);
  }
  expectInteractive(wrapper);
});

test('Home keeps the standard capsule even if its params ask for a collapse', async () => {
  focusTab('Home', { params: { screen: 'Home', params: { tabBarCollapseProgress: 1 } } });
  const { bar, wrapper, view } = await renderTabs();

  assert.deepEqual(styleOf(bar.props.style), styleOf(buildTabBarCapsuleStyle(EXPECTED_CAPSULE)));
  expectInteractive(wrapper);
  assert.equal(view.getAllByRole('tab').length, 5);
});

test('a route collapse progress slides the capsule partway, clamped to fully off-screen', async () => {
  focusTab('Bible', {
    state: {
      index: 0,
      routes: [{ name: 'BibleBrowser', params: { tabBarCollapseProgress: 0.5 } }],
    },
  });
  let tabs = await renderTabs();
  assert.deepEqual(styleOf(tabs.bar.props.style).transform, [
    { translateY: getReaderTabBarTranslation(0.5) },
  ]);
  expectInteractive(tabs.wrapper);
  await tabs.view.unmount();

  focusTab('Bible', {
    state: { index: 0, routes: [{ name: 'BibleBrowser', params: { tabBarCollapseProgress: 4 } }] },
  });
  tabs = await renderTabs();
  assert.deepEqual(styleOf(tabs.bar.props.style).transform, [
    { translateY: getReaderTabBarTranslation(1) },
  ]);
  expectCollapsed(tabs.wrapper);
});

const HIDDEN_NESTED_ROUTES: Array<[string, FakeRoute['state'], string]> = [
  [
    'Bible',
    {
      index: 1,
      routes: [{ name: 'BibleBrowser' }, { name: 'BibleReader', params: { planId: 'plan-1' } }],
    },
    'a plan-session reader',
  ],
  ['Bible', { index: 1, routes: [{ name: 'BibleReader' }, { name: 'BiblePicker' }] }, 'the picker'],
  ['Learn', { index: 1, routes: [{ name: 'GatherHome' }, { name: 'LessonDetail' }] }, 'a lesson'],
  ['Plans', { index: 1, routes: [{ name: 'PlansHome' }, { name: 'PlanDetail' }] }, 'a plan'],
  [
    'More',
    { index: 1, routes: [{ name: 'MoreHome' }, { name: 'LocalePreferences' }] },
    'the locale flow with its own footer',
  ],
];

for (const [tab, state, what] of HIDDEN_NESTED_ROUTES) {
  test(`the tab bar slides away and leaves touch and VoiceOver on ${what} (${tab} tab)`, async () => {
    focusTab(tab, { state });
    const { bar, wrapper, view } = await renderTabs();

    assert.deepEqual(styleOf(bar.props.style).transform, [
      { translateY: getReaderTabBarTranslation(1) },
    ]);
    expectCollapsed(wrapper);
    assert.equal(view.queryAllByRole('tab').length, 0, 'no tab reachable by a screen reader');
    assert.equal(view.queryAllByRole('tab', { includeHidden: true }).length, 5);
  });
}

test('the tab bar also hides for a plan-session reader opened before the Bible stack has state', async () => {
  focusTab('Bible', {
    params: { screen: 'BibleReader', params: { planId: 'plan-1', planDayNumber: 2 } },
  });
  const { bar, wrapper } = await renderTabs();

  assert.deepEqual(styleOf(bar.props.style).transform, [
    { translateY: getReaderTabBarTranslation(1) },
  ]);
  expectCollapsed(wrapper);
});

test('a free reader keeps the tab bar, which slides with reader scroll without fading', async () => {
  focusTab('Bible', { state: { index: 0, routes: [{ name: 'BibleReader' }] } });
  readerProgress.value = 0.5;
  let tabs = await renderTabs();

  assert.deepEqual(styleOf(tabs.bar.props.style).transform, [{ translateY: 0 }]);
  assert.deepEqual(styleOf(tabs.wrapper.props.style).transform, [
    { translateY: getReaderTabBarTranslation(0.5) },
  ]);
  expectInteractive(tabs.wrapper);
  assert.equal('opacity' in styleOf(tabs.wrapper.props.style), false);
  await tabs.view.unmount();

  // Scrolled all the way: the bar is off-screen, so it gives up touch and VoiceOver.
  readerProgress.value = 1;
  tabs = await renderTabs();
  assert.deepEqual(styleOf(tabs.wrapper.props.style).transform, [
    { translateY: getReaderTabBarTranslation(1) },
  ]);
  expectCollapsed(tabs.wrapper);
});

test('reader scroll never moves the bar on another tab', async () => {
  readerProgress.value = 1;
  focusTab('Home');
  const { wrapper } = await renderTabs();

  assert.deepEqual(styleOf(wrapper.props.style).transform, [{ translateY: 0 }]);
  expectInteractive(wrapper);
});

test('a reader that collapses the bar itself is not also slid by reader scroll', async () => {
  readerProgress.value = 1;
  focusTab('Bible', {
    state: { index: 0, routes: [{ name: 'BibleReader', params: { tabBarCollapseProgress: 0.5 } }] },
  });
  let tabs = await renderTabs();

  assert.deepEqual(styleOf(tabs.bar.props.style).transform, [
    { translateY: getReaderTabBarTranslation(0.5) },
  ]);
  assert.deepEqual(styleOf(tabs.wrapper.props.style).transform, [{ translateY: 0 }]);
  expectInteractive(tabs.wrapper);
  await tabs.view.unmount();

  // Collapsed all the way by the reader: off-screen, so no touch or VoiceOver.
  readerProgress.value = 0;
  focusTab('Bible', {
    state: { index: 0, routes: [{ name: 'BibleReader', params: { tabBarCollapseProgress: 1 } }] },
  });
  tabs = await renderTabs();
  assert.deepEqual(styleOf(tabs.wrapper.props.style).transform, [{ translateY: 0 }]);
  expectCollapsed(tabs.wrapper);
});

test('a tab bar hidden by a screen with tabBarVisible false leaves touch and VoiceOver', async () => {
  focusTab('More', {
    state: {
      index: 1,
      routes: [{ name: 'MoreHome' }, { name: 'About', params: { tabBarVisible: false } }],
    },
  });
  const { wrapper } = await renderTabs();

  expectCollapsed(wrapper);
});
