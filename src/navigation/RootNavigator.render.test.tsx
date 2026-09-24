import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { hostComponent } from '../testing/reactNativeHost';
import { mockModule, sourcePath } from '../testing/mockModules';
import { installRenderHarness } from '../testing/render';

const harness = installRenderHarness(mock);

// The navigation tree as the container would report it after each change.
let rootState: unknown;
mockModule(mock, sourcePath('navigation/rootNavigation.ts'), {
  rootNavigationRef: { current: null, getRootState: () => rootState },
});
let parkedLinkFlushes = 0;
mockModule(mock, sourcePath('navigation/linkingConfig.ts'), {
  linkingConfig: {},
  flushParkedLink: () => {
    parkedLinkFlushes += 1;
  },
});
mockModule(mock, sourcePath('navigation/TabNavigator.tsx'), {
  TabNavigator: hostComponent('TabNavigator'),
});
mockModule(mock, sourcePath('components/audio/AudioReturnTab.tsx'), {
  AudioReturnTab: hostComponent('AudioReturnTab'),
});

const readerState = {
  index: 1,
  routes: [
    { name: 'Home' },
    {
      name: 'Bible',
      state: { index: 1, routes: [{ name: 'BibleBrowser' }, { name: 'BibleReader' }] },
    },
  ],
};
const homeState = { index: 0, routes: [{ name: 'Home' }, { name: 'Bible' }] };

async function renderRoot() {
  const { RootNavigator } = await import('./RootNavigator');
  const view = await harness.render(<RootNavigator />);
  const container = view.queryAllByType('NavigationContainer')[0];
  const returnTab = () => view.queryAllByType('AudioReturnTab')[0];
  return { view, container, returnTab };
}

test('the audio return tab learns the nested route name once navigation is ready', async () => {
  rootState = readerState;
  const { view, container, returnTab } = await renderRoot();
  assert.equal(returnTab().props.currentRouteName, null, 'no route before the container is ready');

  await view.fire(container, 'onReady');
  assert.equal(returnTab().props.currentRouteName, 'BibleReader');
});

test('the audio return tab follows later navigation changes', async () => {
  rootState = readerState;
  const { view, container, returnTab } = await renderRoot();
  await view.fire(container, 'onReady');

  rootState = homeState;
  await view.fire(container, 'onStateChange');
  assert.equal(returnTab().props.currentRouteName, 'Home');
});

test('the tab navigator and the audio return tab both mount inside the navigation container', async () => {
  const { container } = await renderRoot();

  const children = container.findAll((node) => typeof node.type === 'string');
  const types = children.map((node) => String(node.type));
  assert.ok(types.includes('TabNavigator'));
  assert.ok(types.includes('AudioReturnTab'));
});

// A link that arrived while the navigator was unmounted (discreet-mode lock) or not yet
// ready waits in linkingConfig until the container reports ready.
test('the container hands over a parked link as soon as it is ready', async () => {
  parkedLinkFlushes = 0;
  const { view, container } = await renderRoot();
  assert.equal(parkedLinkFlushes, 0);
  await view.fire(container, 'onReady');
  assert.equal(parkedLinkFlushes, 1);
});
