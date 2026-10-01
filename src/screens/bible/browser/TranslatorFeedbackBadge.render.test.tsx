import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { installRenderHarness } from '../../../testing/render';

// The corner badge on every book row and chapter tile in the Bible browser.
const harness = installRenderHarness(mock);
const t = (key: string) => harness.i18n.t(key);

test('a pending badge and an addressed badge name their state', async () => {
  const { TranslatorFeedbackBadge } = await import('./TranslatorFeedbackBadge');
  const view = await harness.render(
    createElement(
      'View',
      null,
      createElement(TranslatorFeedbackBadge, { status: 'pending' }),
      createElement(TranslatorFeedbackBadge, { status: 'addressed' })
    )
  );

  assert.deepEqual(
    view.getAllByRole('image').map((node) => node.props.accessibilityLabel),
    [t('feedback.needsReview'), t('bible.translatorReviewConfirmedAccurate')]
  );
});

// Nearly every tile has no feedback, and Psalms alone draws 150 tiles. Each
// useTranslation subscribes to i18n and builds a wrapper object, which showed up as
// ~15 ms of a release-build reader open on an iPhone 17 simulator.
test('tiles without feedback draw nothing and do not subscribe to i18n', async (context) => {
  const { TranslatorFeedbackBadge } = await import('./TranslatorFeedbackBadge');
  const subscribe = context.mock.method(harness.i18n, 'on');
  const view = await harness.render(
    createElement(
      'View',
      null,
      Array.from({ length: 40 }, (_, index) =>
        createElement(TranslatorFeedbackBadge, { key: index, status: null })
      )
    )
  );

  assert.equal(view.queryAllByRole('image').length, 0);
  assert.equal(subscribe.mock.callCount(), 0);
});
