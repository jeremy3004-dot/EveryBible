import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement, type ReactNode } from 'react';
import { mockModule, sourcePath } from '../testing/mockModules';
import { installRenderHarness } from '../testing/render';

const harness = installRenderHarness(mock);

// A native-stack double: the navigator renders as a host `Navigator` carrying its
// props, and its screens as host `Screen` elements, so a test reads the registered
// routes, their options and the navigator-wide layout.
mockModule(mock, '@react-navigation/native-stack', {
  createNativeStackNavigator: () => ({
    Navigator: (props: { children: ReactNode }) => createElement('Navigator', props),
    Screen: (props: Record<string, unknown>) => createElement('Screen', props),
  }),
});

// The error-boundary screen layout pulls in the app's storage; it has its own tests
// (screenErrorLayout.test.ts). Here it only needs an identity to look for.
const renderScreenWithErrorBoundary = ({ children }: { children: ReactNode }) => children;
mockModule(mock, sourcePath('navigation/screenErrorLayout.ts'), {
  renderScreenWithErrorBoundary,
});

const BrowserScreen = () => null;
const AuthScreen = () => null;
const ResetPasswordScreen = () => null;
mockModule(mock, sourcePath('screens/bible/BibleBrowserScreen.tsx'), {
  BibleBrowserScreen: BrowserScreen,
});
mockModule(mock, sourcePath('screens/auth/AuthScreen.tsx'), { AuthScreen });
mockModule(mock, sourcePath('screens/auth/ResetPasswordScreen.tsx'), { ResetPasswordScreen });

type ScreenProps = { name: string; options?: Record<string, unknown>; getComponent: () => unknown };
const routes = (screens: { props: unknown }[]) => screens.map((node) => node.props as ScreenProps);

test('AuthStack registers one shared auth route plus password reset, not split sign-in/sign-up screens', async () => {
  const { AuthStack } = await import('./AuthStack');
  const view = await harness.render(<AuthStack />);

  const screens = routes(view.queryAllByType('Screen'));
  assert.deepEqual(
    screens.map((screen) => screen.name),
    ['AuthScreen', 'ResetPassword']
  );
  assert.equal(screens[0].getComponent(), AuthScreen);
  assert.equal(screens[1].getComponent(), ResetPasswordScreen);
});

test('BibleStack presents the reader chapter picker as a modal that reuses the browser screen', async () => {
  const { BibleStack } = await import('./BibleStack');
  const view = await harness.render(<BibleStack />);

  const screens = routes(view.queryAllByType('Screen'));
  const picker = screens.find((screen) => screen.name === 'BiblePicker');
  assert.ok(picker, 'the reader pushes BiblePicker from its chapter pill');
  assert.deepEqual(picker.options, { presentation: 'modal' });
  assert.equal(picker.getComponent(), BrowserScreen);

  const browser = screens.find((screen) => screen.name === 'BibleBrowser');
  assert.equal(
    browser?.options?.presentation,
    undefined,
    'the browser tab itself is a normal page'
  );
});

// Without the per-screen boundary, one screen's render error blanks the whole app
// instead of showing that screen's recovery view.
test('every stack navigator wraps each of its screens in the per-screen error boundary', async () => {
  const stacks: Record<string, () => Promise<Record<string, () => ReactNode>>> = {
    AuthStack: () => import('./AuthStack'),
    BibleStack: () => import('./BibleStack'),
    HomeStack: () => import('./HomeStack'),
    LearnStack: () => import('./LearnStack'),
    MoreStack: () => import('./MoreStack'),
    PlansStack: () => import('./PlansStack'),
  };
  const onDisk = readdirSync(fileURLToPath(new URL('.', import.meta.url).href))
    .filter((file) => /Stack\.tsx$/.test(file))
    .map((file) => file.replace(/\.tsx$/, ''))
    .sort();
  assert.deepEqual(Object.keys(stacks), onDisk, 'a new *Stack.tsx must be added here');

  for (const [name, load] of Object.entries(stacks)) {
    const Stack = (await load())[name];
    const view = await harness.render(<Stack />);
    const [navigator] = view.queryAllByType('Navigator');
    assert.equal(
      navigator.props.screenLayout,
      renderScreenWithErrorBoundary,
      `${name} must pass screenLayout={renderScreenWithErrorBoundary}`
    );
    assert.ok(view.queryAllByType('Screen').length > 0, `${name} registers its screens`);
    await view.unmount();
  }
});
