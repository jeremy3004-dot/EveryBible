import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mockModule, sourcePath } from '../testing/mockModules';

const ErrorBoundary = function ErrorBoundaryStub() {
  return null;
};
mockModule(mock, sourcePath('components/ErrorBoundary.tsx'), { ErrorBoundary });

interface FakeNavigation {
  canGoBack: () => boolean;
  goBack: () => void;
}

const layoutArgs = (routeName: string, navigation: FakeNavigation) =>
  ({
    children: 'screen-content',
    route: { key: `${routeName}-1`, name: routeName },
    navigation,
  }) as unknown as Parameters<
    typeof import('./screenErrorLayout').renderScreenWithErrorBoundary
  >[0];

test('each screen renders inside its own error boundary tagged with the route name', async () => {
  const { renderScreenWithErrorBoundary } = await import('./screenErrorLayout');

  const element = renderScreenWithErrorBoundary(
    layoutArgs('BibleReader', { canGoBack: () => true, goBack: () => {} })
  );

  assert.equal(element.type, ErrorBoundary);
  const props = element.props as { scope: string; children: unknown };
  assert.equal(props.scope, 'screen:BibleReader');
  assert.equal(props.children, 'screen-content');
});

test('a crashed pushed screen offers Back, which pops it off the stack', async () => {
  const { renderScreenWithErrorBoundary } = await import('./screenErrorLayout');
  let wentBack = 0;

  const element = renderScreenWithErrorBoundary(
    layoutArgs('ChapterSelector', {
      canGoBack: () => true,
      goBack: () => {
        wentBack += 1;
      },
    })
  );
  const { onGoBack } = element.props as { onGoBack?: () => void };

  assert.equal(typeof onGoBack, 'function');
  onGoBack?.();
  assert.equal(wentBack, 1);
});

test('a crashed stack root offers no Back action because there is nowhere to go back to', async () => {
  const { renderScreenWithErrorBoundary } = await import('./screenErrorLayout');

  const element = renderScreenWithErrorBoundary(
    layoutArgs('HomeScreen', { canGoBack: () => false, goBack: () => {} })
  );

  assert.equal((element.props as { onGoBack?: unknown }).onGoBack, undefined);
});

// UI-only source check: asserts on navigator render code, which the suite cannot render (no component renderer); not a behaviour test.
test('every stack navigator wraps its screens in the per-screen error boundary', () => {
  const navigationDir = fileURLToPath(new URL('.', import.meta.url).href);
  const stackFiles = readdirSync(navigationDir).filter((file) => /Stack\.tsx$/.test(file));

  assert.ok(stackFiles.length >= 6, `expected every *Stack.tsx, found ${stackFiles.join(', ')}`);
  for (const file of stackFiles) {
    const source = readFileSync(`${navigationDir}/${file}`, 'utf8');
    assert.match(
      source,
      /<Stack\.Navigator[^>]*screenLayout=\{renderScreenWithErrorBoundary\}/s,
      `${file} must pass screenLayout={renderScreenWithErrorBoundary} so one screen's render error cannot blank the whole app`
    );
  }
});
