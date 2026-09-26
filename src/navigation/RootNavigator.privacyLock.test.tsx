/**
 * The discreet-mode lock unmounts the navigator, and unlocking must reopen it where the
 * reader was. The render harness batches every update inside act() on a concurrent root,
 * which hides how the app really runs: on the old architecture a store update from an
 * AppState event re-renders synchronously, so the screen that gates on the lock unmounts
 * the navigator before any later store listener runs. This file mirrors that with a
 * legacy root, the real NavigationContainer and a real (minimal) navigator tree, and
 * locks outside act().
 */
import test, { after, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { create } from 'zustand';
import { mockModule, mockPackage, sourcePath } from '../testing/mockModules';
import { createReactNativeStub } from '../testing/reactNativeStub';
import { hostComponent } from '../testing/reactNativeHost';

const globalFlags = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
globalFlags.IS_REACT_ACT_ENVIRONMENT = true;

const rn = createReactNativeStub({ os: 'ios' });
// What @react-navigation/native imports beyond the stub; nothing here renders them.
Object.assign(rn, {
  BackHandler: { addEventListener: () => ({ remove: () => {} }) },
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles, flatten: (style: unknown) => style },
});
mockPackage(mock, 'react-native', rn);

// Node resolves React Navigation's web hooks; Metro picks their .native files. Load
// those instead, so linking, the back button and the title behave as on a phone.
const requireFromHere = createRequire(import.meta.url);
const navigationLib = dirname(requireFromHere.resolve('@react-navigation/native'));
for (const hook of ['useLinking', 'useBackButton', 'useDocumentTitle']) {
  mockModule(
    mock,
    join(navigationLib, `${hook}.js`),
    requireFromHere(join(navigationLib, `${hook}.native.js`)) as Record<string, unknown>
  );
}

// Only the lock flag: the gate below and the navigator both read it.
const privacyStore = create(() => ({ isLocked: false }));
mockModule(mock, sourcePath('stores/privacyStore.ts'), { usePrivacyStore: privacyStore });
mockModule(mock, sourcePath('contexts/ThemeContext.tsx'), {
  useTheme: () => ({
    isDark: false,
    colors: {
      tabActive: '#000',
      background: '#fff',
      cardBackground: '#fff',
      primaryText: '#000',
      cardBorder: '#ccc',
      accentPrimary: '#f00',
    },
  }),
});
mockModule(mock, sourcePath('design/system.ts'), {
  navigationTypography: {
    regular: { fontFamily: 'System', fontWeight: '400' },
    medium: { fontFamily: 'System', fontWeight: '500' },
    bold: { fontFamily: 'System', fontWeight: '600' },
    heavy: { fontFamily: 'System', fontWeight: '700' },
  },
});
// Linking stays on, as in the app, with no launch URL and no incoming links.
mockModule(mock, sourcePath('navigation/linkingConfig.ts'), {
  linkingConfig: {
    prefixes: ['everybible://'],
    getInitialURL: () => null,
    subscribe: () => () => {},
  },
  flushParkedLink: () => {},
});

// A real navigator tree (tabs, with a stack in More) built on React Navigation's own
// routers, rendering only the focused route, as the app's navigators do.
type Descriptors = Record<string, { render: () => unknown }>;
let TabNavigatorStub: () => unknown = () => null;
mockModule(mock, sourcePath('navigation/TabNavigator.tsx'), {
  TabNavigator: () => TabNavigatorStub(),
});

let React: typeof import('react');
let TestRenderer: typeof import('react-test-renderer');
let RootNavigator: typeof import('./RootNavigator').RootNavigator;
let rootNavigationRef: typeof import('./rootNavigation').rootNavigationRef;
const Screen = hostComponent('Screen');

async function load() {
  React = await import('react');
  TestRenderer = (await import('react-test-renderer')).default;
  // The same module instances RootNavigator gets (tsx loads it through require), or the
  // navigators below would not see its NavigationContainer's contexts.
  const core = requireFromHere(
    '@react-navigation/native'
  ) as typeof import('@react-navigation/native');
  const routers = requireFromHere(
    '@react-navigation/routers'
  ) as typeof import('@react-navigation/routers');

  const makeNavigator = (router: typeof routers.TabRouter | typeof routers.StackRouter) =>
    core.createNavigatorFactory(function Navigator(props: {
      children: React.ReactNode;
      initialRouteName?: string;
    }) {
      const { state, descriptors, NavigationContent } = core.useNavigationBuilder(
        router as typeof routers.StackRouter,
        props
      );
      const focused = state.routes[state.index];
      return React.createElement(
        NavigationContent,
        null,
        focused ? ((descriptors as Descriptors)[focused.key].render() as React.ReactNode) : null
      );
    });

  const Tabs = makeNavigator(routers.TabRouter)();
  const MoreStack = makeNavigator(routers.StackRouter)();
  const leaf = (name: string) => {
    const Leaf = () => React.createElement(Screen, { name });
    Leaf.displayName = name;
    return Leaf;
  };
  const MoreStackScreens = () =>
    React.createElement(
      MoreStack.Navigator,
      { initialRouteName: 'MoreScreen' },
      React.createElement(MoreStack.Screen, { name: 'MoreScreen', component: leaf('MoreScreen') }),
      React.createElement(MoreStack.Screen, { name: 'Settings', component: leaf('Settings') })
    );
  TabNavigatorStub = function AppTabs() {
    return React.createElement(
      Tabs.Navigator,
      null,
      React.createElement(Tabs.Screen, { name: 'Home', component: leaf('Home') }),
      React.createElement(Tabs.Screen, { name: 'More', component: MoreStackScreens })
    );
  };

  ({ RootNavigator } = await import('./RootNavigator'));
  ({ rootNavigationRef } = await import('./rootNavigation'));
}

before(load);

after(() => {
  globalFlags.IS_REACT_ACT_ENVIRONMENT = false;
});

/**
 * Stands in for App.tsx's LoadingScreen, which renders the lock screen instead of the
 * navigator. It subscribed to the lock long before the navigator (loaded lazily) mounted,
 * so its store listener runs first. On the old architecture the app renders on a legacy
 * root (renderApplication uses a concurrent root only with Fabric), where an update from
 * outside a React batch, such as lock() from an AppState event, re-renders and commits
 * inside that listener, passive cleanups included. react-test-renderer 19 has no legacy
 * mode, so the listener here commits synchronously through act() itself.
 */
function renderApp() {
  function Gate({ locked, navigatorLoaded }: { locked: boolean; navigatorLoaded: boolean }) {
    if (locked || !navigatorLoaded) {
      return React.createElement(Screen, { name: 'LockOrBoot' });
    }
    return React.createElement(RootNavigator);
  }
  const gate = (navigatorLoaded: boolean) =>
    React.createElement(Gate, { locked: privacyStore.getState().isLocked, navigatorLoaded });
  let renderer!: import('react-test-renderer').ReactTestRenderer;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(gate(false));
  });
  const unsubscribe = privacyStore.subscribe(() => {
    TestRenderer.act(() => renderer.update(gate(true)));
  });
  TestRenderer.act(() => {
    renderer.update(gate(true));
  });
  const visibleScreens = () =>
    renderer.root.findAllByType(Screen).map((node) => String(node.props.name));
  const unmount = () => {
    unsubscribe();
    TestRenderer.act(() => renderer.unmount());
  };
  return { visibleScreens, unmount };
}

const settle = async () => {
  await TestRenderer.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

test('unlocking reopens the screen the reader was on, not Home', async () => {
  const app = renderApp();
  await settle();
  assert.deepEqual(app.visibleScreens(), ['Home']);

  TestRenderer.act(() => {
    rootNavigationRef.navigate('More', { screen: 'Settings' } as never);
  });
  assert.deepEqual(app.visibleScreens(), ['Settings']);

  // AppState 'inactive' -> usePrivacyLock -> lock(): outside any React batch.
  privacyStore.setState({ isLocked: true });
  assert.deepEqual(app.visibleScreens(), ['LockOrBoot'], 'nothing behind the lock is rendered');
  await settle();

  privacyStore.setState({ isLocked: false });
  await settle();

  assert.deepEqual(app.visibleScreens(), ['Settings']);
  app.unmount();
});

test('a navigator remounted for any other reason starts on Home', async () => {
  const app = renderApp();
  await settle();
  TestRenderer.act(() => {
    rootNavigationRef.navigate('More', { screen: 'Settings' } as never);
  });
  app.unmount();

  const again = renderApp();
  await settle();

  assert.deepEqual(again.visibleScreens(), ['Home']);
  again.unmount();
});
