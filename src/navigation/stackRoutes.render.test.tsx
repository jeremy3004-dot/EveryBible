import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, Fragment, type ReactNode } from 'react';
import { mockModule, sourcePath } from '../testing/mockModules';
import { installRenderHarness } from '../testing/render';

const harness = installRenderHarness(mock);

// A native-stack double: the navigator renders its screens as host `Screen`
// elements, so a test reads the registered routes and their options.
mockModule(mock, '@react-navigation/native-stack', {
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children),
    Screen: (props: Record<string, unknown>) => createElement('Screen', props),
  }),
});

// The error-boundary screen layout pulls in the app's storage; it has its own tests.
mockModule(mock, sourcePath('navigation/screenErrorLayout.ts'), {
  renderScreenWithErrorBoundary: ({ children }: { children: ReactNode }) => children,
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
