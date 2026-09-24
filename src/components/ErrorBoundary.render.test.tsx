import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mockMmkvStorage, mockModule } from '../testing/mockModules';
import { flattenStyle, hostAncestors, installRenderHarness } from '../testing/render';

// The fallback a user sees when a screen (or the whole app) fails to render.
// The crash log and report queue run for real over an in-memory MMKV.
mockMmkvStorage(mock);
mockModule(mock, createRequire(import.meta.url).resolve('expo-constants'), {
  default: { default: { expoConfig: { version: '1.0.9' } } },
});
const harness = installRenderHarness(mock);
const t = (key: string) => harness.i18n.t(key);

// componentDidCatch also logs to the console; keep the test output readable.
mock.method(console, 'error', () => {});

function Broken(): never {
  throw new Error('render failed');
}

async function renderFallback(props: { onGoBack?: () => void } = {}) {
  const { ErrorBoundary } = await import('./ErrorBoundary');
  return harness.render(
    <ErrorBoundary scope="screen:Test" {...props}>
      <Broken />
    </ErrorBoundary>
  );
}

test('the fallback names what happened and offers Try again and Back', async () => {
  let wentBack = 0;
  const view = await renderFallback({ onGoBack: () => wentBack++ });

  assert.ok(view.getByRole('header', { name: t('common.somethingWentWrong') }));
  assert.ok(view.getByText(t('common.unexpectedError')));
  assert.ok(view.getByRole('button', { name: t('common.tryAgain') }));
  await view.press(view.getByRole('button', { name: t('common.back') }));
  assert.equal(wentBack, 1);
});

test('the fallback scrolls, so its message and buttons stay reachable at large text', async () => {
  harness.setFontScale(2);
  const view = await renderFallback({ onGoBack: () => {} });

  const title = view.getByRole('header', { name: t('common.somethingWentWrong') });
  const scroll = hostAncestors(title).find((node) => (node.type as unknown) === 'ScrollView');
  assert.ok(scroll, 'a centred, non-scrolling column ran off the screen at 2.0');
  const content = flattenStyle(scroll.props.contentContainerStyle) ?? {};
  assert.equal(content.flexGrow, 1, 'still centred when it fits');
  assert.equal(content.justifyContent, 'center');
});

test('the Try again label shrinks beside its icon instead of running past the button', async () => {
  const view = await renderFallback();

  const label = view.getByText(t('common.tryAgain'));
  assert.equal(flattenStyle(label.props.style)?.flexShrink, 1);
});
