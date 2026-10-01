import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { TFunction } from 'i18next';
import { mockModule, sourcePath } from '../../../testing/mockModules';
import { createReactHookRuntime } from '../../../testing/reactHookRuntime';

const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);

// Focus is driven by hand: `blur()` runs the focus effect's cleanup without unmounting.
let blur: () => void = () => {};
mockModule(mock, '@react-navigation/native', {
  useFocusEffect: (effect: () => void | (() => void)) =>
    runtime.react.useEffect(() => {
      const cleanup = effect();
      blur = typeof cleanup === 'function' ? cleanup : () => {};
      return cleanup;
    }, [effect]),
});

const pending: Array<(result: unknown) => void> = [];
mockModule(mock, sourcePath('services/feedback/index.ts'), {
  TRANSLATION_NOT_COVERED: 'translation_not_covered',
  fetchChapterFeedbackReviewSummaryForTranslation: () =>
    new Promise((resolve) => {
      pending.push(resolve);
    }),
});

afterEach(() => {
  runtime.unmountAll();
  pending.length = 0;
});

const t = ((key: string) => key) as unknown as TFunction;

test('a response discarded after the screen loses focus does not leave loading stuck on', async () => {
  const { useTranslatorFeedbackSummaries } = await import('./useTranslatorFeedbackSummaries');
  const view = runtime.mount(useTranslatorFeedbackSummaries, 'bsb', true, '1234', t);
  await view.commit();
  view.rerender();
  assert.equal(view.result.isLoading, true);
  assert.equal(pending.length, 1);

  blur();
  pending[0]?.({ success: true, chapters: [] });
  await view.commit();
  view.rerender();

  assert.equal(view.result.isLoading, false);
});

test('a superseded response leaves loading on for the newer request', async () => {
  const { useTranslatorFeedbackSummaries } = await import('./useTranslatorFeedbackSummaries');
  const view = runtime.mount(useTranslatorFeedbackSummaries, 'bsb', true, '1234', t);
  await view.commit();
  view.result.reload();
  await view.commit();
  assert.equal(pending.length, 2);

  pending[0]?.({ success: true, chapters: [] });
  await view.commit();
  view.rerender();
  assert.equal(view.result.isLoading, true);

  pending[1]?.({ success: true, chapters: [] });
  await view.commit();
  view.rerender();
  assert.equal(view.result.isLoading, false);
});
