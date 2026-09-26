import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { hostComponent } from '../testing/reactNativeHost';
import { mockModule, sourcePath } from '../testing/mockModules';
import { installRenderHarness } from '../testing/render';
import { create } from 'zustand';

const harness = installRenderHarness(mock);

// The navigation tree as the container would report it after each change.
let rootState: unknown;
mockModule(mock, sourcePath('navigation/rootNavigation.ts'), {
  rootNavigationRef: { current: null, isReady: () => true, getRootState: () => rootState },
});
// Only the lock flag: the navigator unmounts behind the discreet-mode lock screen.
const privacyStore = create(() => ({ isLocked: false }));
mockModule(mock, sourcePath('stores/privacyStore.ts'), { usePrivacyStore: privacyStore });
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
  return { view, container };
}

// The player (and its way back to the playing chapter) lives in the tab bar now; the
// container holds the tab navigator alone, with no floating return tab beside it.
test('the tab navigator is the only thing mounted inside the navigation container', async () => {
  const { container } = await renderRoot();

  const types = container
    .findAll((node) => typeof node.type === 'string' && node !== container)
    .map((node) => String(node.type));
  assert.deepEqual(types, ['TabNavigator']);
});

test('the lock remembers the latest state the container reports, not only the first', async () => {
  rootState = readerState;
  const first = await renderRoot();
  await first.view.fire(first.container, 'onReady');
  rootState = homeState;
  await first.view.fire(first.container, 'onStateChange');

  privacyStore.setState({ isLocked: true });
  await first.view.unmount();
  privacyStore.setState({ isLocked: false });

  const unlocked = await renderRoot();
  assert.deepEqual(unlocked.container.props.initialState, homeState);
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

// --- Discreet-mode lock -------------------------------------------------------

test('after the discreet-mode lock, the remounted navigator reopens where the reader was', async () => {
  rootState = readerState;
  const locked = await renderRoot();
  assert.equal(locked.container.props.initialState, undefined, 'a first mount follows linking');
  // The container reports every state it reaches; the last one is what the lock holds.
  await locked.view.fire(locked.container, 'onReady');

  privacyStore.setState({ isLocked: true });
  await locked.view.unmount();
  privacyStore.setState({ isLocked: false });

  const unlocked = await renderRoot();
  assert.deepEqual(unlocked.container.props.initialState, readerState);

  // Handed back once: a later remount (not after a lock) starts fresh.
  await unlocked.view.unmount();
  const later = await renderRoot();
  assert.equal(later.container.props.initialState, undefined);
});

test('a navigator unmounted for any reason but the lock remounts fresh', async () => {
  rootState = readerState;
  const first = await renderRoot();
  await first.view.fire(first.container, 'onReady');
  await first.view.unmount();

  // Locking while no navigator is mounted (onboarding, say) holds nothing either.
  privacyStore.setState({ isLocked: true });
  privacyStore.setState({ isLocked: false });

  const second = await renderRoot();
  assert.equal(second.container.props.initialState, undefined);
});
