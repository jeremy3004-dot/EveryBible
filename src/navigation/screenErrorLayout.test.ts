import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
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

// That every *Stack.tsx passes this as its screenLayout is rendered in
// stackRoutes.render.test.tsx.
