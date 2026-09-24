import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import {
  concern,
  feedbackPage,
  installFeedbackReviewFixture,
  item,
  praise,
  settled,
} from './ChapterFeedbackReviewScreen.renderFixture';

// Filters, paging, bulk review, failures and playback edges of the translator's
// chapter feedback list.
const fixture = installFeedbackReviewFixture(mock);
const { harness, t, calls, responders, renderReview, visibleSheet, listenButton } = fixture;

type View = Awaited<ReturnType<typeof renderReview>>;

const lastFetch = () => calls.fetch[calls.fetch.length - 1];
const alerts = () => harness.rn.__recorded.alerts;
const announcements = () => harness.rn.__recorded.announcements;
const flatList = (view: View) => view.queryAllByType('FlatList')[0];

// ---- Filters -------------------------------------------------------------------

test('choosing a source in the source sheet refetches for that source and names it on the button', async () => {
  const view = await renderReview();
  const sourceButton = (label: string) =>
    view.getByRole('button', { name: `${t('feedback.sourceFilter')}: ${label}` });

  await view.press(sourceButton(t('feedback.everyone')));
  const sheet = visibleSheet(view);
  assert.ok(sheet, 'the source sheet is open');
  await view.press(sheet.getByText(t('feedback.council')));
  await view.flush();

  assert.equal(visibleSheet(view), null, 'choosing a source closes the sheet');
  assert.equal(lastFetch().category, 'scripture_council');
  assert.equal(lastFetch().cursor, null);
  assert.ok(sourceButton(t('feedback.council')));
});

test('the Done tab asks the server for settled feedback', async () => {
  const view = await renderReview();

  await view.press(view.getByRole('tab', { name: t('feedback.doneTab') }));
  await view.flush();

  assert.equal(lastFetch().status, 'reviewed');
  assert.ok(view.getByRole('tab', { name: t('feedback.doneTab'), selected: true }));
});

test('accurate-without-comment feedback can be viewed on its own and hidden again', async () => {
  responders.fetch = async () => feedbackPage({ positiveCount: 2 });
  const view = await renderReview();
  assert.ok(view.getByText(t('feedback.plainPositive', { count: 2 })));

  await view.press(view.getByRole('button', { name: t('feedback.viewPositive') }));
  await view.flush();
  assert.equal(lastFetch().positiveOnly, true);

  await view.press(view.getByRole('button', { name: t('feedback.showComments') }));
  await view.flush();
  assert.equal(lastFetch().positiveOnly, false);
});

// ---- Bulk review ---------------------------------------------------------------

async function renderWithPositive() {
  responders.fetch = async () => feedbackPage({ feedback: [concern], positiveCount: 2 });
  const view = await renderReview();
  // The card's own Mark reviewed button belongs to praise; this list has only a concern.
  const bulk = view.getByRole('button', { name: t('feedback.markReviewed') });
  return { view, bulk };
}

test('Mark reviewed on the accurate count confirms the exact previewed IDs, then reloads', async () => {
  responders.reviewPositive = async (input) =>
    input.ids ? { success: true } : { success: true, feedbackIds: ['a', 'b'] };
  const { view, bulk } = await renderWithPositive();

  await view.press(bulk);
  await view.flush();
  const [confirm] = alerts();
  assert.equal(confirm.title, t('feedback.markReviewed'));
  assert.equal(confirm.message, t('feedback.bulkConfirm', { count: 2 }));
  assert.equal(calls.reviewPositive.length, 1);
  assert.equal(calls.reviewPositive[0].ids, undefined, 'the first call only previews');

  const fetchesBefore = calls.fetch.length;
  const buttons = confirm.buttons as { text: string; onPress?: () => void }[];
  await act(async () => buttons.find((b) => b.text === t('feedback.markReviewed'))?.onPress?.());
  await view.flush();

  assert.deepEqual(calls.reviewPositive[1].ids, ['a', 'b']);
  assert.equal(calls.reviewPositive[1].input.status, 'pending');
  assert.deepEqual(announcements(), [t('feedback.reviewed')]);
  assert.equal(calls.fetch.length, fetchesBefore + 1, 'the list reloads');
});

test('Mark reviewed with nothing left to review reloads without asking', async () => {
  const { view, bulk } = await renderWithPositive();
  const fetchesBefore = calls.fetch.length;

  await view.press(bulk);
  await view.flush();

  assert.deepEqual(alerts(), []);
  assert.equal(calls.fetch.length, fetchesBefore + 1);
});

test('a bulk review that fails to preview says so', async () => {
  responders.reviewPositive = async () => ({ success: false });
  const { view, bulk } = await renderWithPositive();

  await view.press(bulk);
  await view.flush();

  assert.deepEqual(
    alerts().map(({ title, message }) => [title, message]),
    [[t('common.error'), t('common.unexpectedError')]]
  );
});

test('Mark reviewed on the accurate count is only offered on the Open tab', async () => {
  const { view } = await renderWithPositive();

  await view.press(view.getByRole('tab', { name: t('feedback.doneTab') }));
  await view.flush();

  assert.ok(view.getByText(t('feedback.plainPositive', { count: 2 })));
  assert.equal(view.queryByRole('button', { name: t('feedback.markReviewed') }), null);
});

// ---- Headline and empty states --------------------------------------------------

test('a chapter with nothing open says it is caught up', async () => {
  responders.fetch = async () =>
    feedbackPage({
      feedback: [settled],
      summary: { bookId: 'JHN', chapter: 3, total: 1, unresolvedDown: 0, unresolvedUp: 0 },
    });
  const view = await renderReview();

  assert.ok(view.getByText(t('feedback.complete')));
  assert.equal(view.queryByText(t('feedback.noMatching')), null);
});

test('a chapter with no feedback at all says so', async () => {
  responders.fetch = async () => feedbackPage({ feedback: [], summary: null });
  const view = await renderReview();

  assert.ok(view.getByText(t('bible.translatorReviewEmpty')));
  assert.equal(view.queryByText(t('feedback.noMatching')), null);
});

test('an empty filter over a chapter that has feedback explains that nothing matches', async () => {
  const view = await renderReview();
  responders.fetch = async () => feedbackPage({ feedback: [] });

  await view.press(view.getByRole('tab', { name: t('feedback.doneTab') }));
  await view.flush();

  assert.ok(view.getByText(t('feedback.noMatching')));
});

// ---- Paging -----------------------------------------------------------------------

const newer = item({ id: 'n1', comment: 'A later concern' });

test('Continue loads the next page and adds only the feedback not already listed', async () => {
  responders.fetch = async (input) =>
    input.cursor
      ? feedbackPage({ feedback: [settled, newer] })
      : feedbackPage({ nextCursor: { createdAt: '2026-09-01T12:00:00Z', id: 's1' } });
  const view = await renderReview();

  await view.press(view.getByRole('button', { name: t('common.continue') }));
  await view.flush();

  assert.deepEqual(lastFetch().cursor, { createdAt: '2026-09-01T12:00:00Z', id: 's1' });
  assert.equal(view.getAllByText('Old concern').length, 1, 'no duplicate card');
  assert.ok(view.getByText('A later concern'));
  assert.equal(view.queryByRole('button', { name: t('common.continue') }), null, 'last page');
});

test('reaching the end of the list loads the next page once, and not without a cursor', async () => {
  let release: (() => void) | null = null;
  responders.fetch = async (input) => {
    if (!input.cursor) return feedbackPage({ nextCursor: { createdAt: 'c', id: 'x' } });
    await new Promise<void>((resolve) => (release = resolve));
    return feedbackPage({ feedback: [newer] });
  };
  const view = await renderReview();

  await view.fire(flatList(view), 'onEndReached');
  await view.fire(flatList(view), 'onEndReached');
  assert.equal(calls.fetch.length, 2, 'a page already loading is not asked for again');
  (release as (() => void) | null)?.();
  await view.flush();
  assert.ok(view.getByText('A later concern'));

  await view.fire(flatList(view), 'onEndReached');
  assert.equal(calls.fetch.length, 2);
});

test('pulling to refresh reloads the first page', async () => {
  const view = await renderReview();

  await act(async () => flatList(view).props.refreshControl.props.onRefresh());
  await view.flush();

  assert.equal(calls.fetch.length, 2);
  assert.equal(lastFetch().cursor, null);
});

// ---- Failures and access -------------------------------------------------------------

test('a failed load offers Retry, which loads again', async () => {
  responders.fetch = async () => ({ success: false });
  const view = await renderReview();

  responders.fetch = async () => feedbackPage();
  await view.press(view.getByRole('button', { name: t('common.retry') }));
  await view.flush();

  assert.equal(calls.fetch.length, 2);
  assert.ok(view.getByText('The name is misspelled'));
  assert.equal(view.queryByRole('button', { name: t('common.retry') }), null);
});

test('a passcode that does not open this translation shows what it does open', async () => {
  responders.fetch = async () => ({
    success: false,
    code: 'translation_not_covered',
    coveredTranslationIds: ['web'],
  });
  const view = await renderReview();

  const [notice] = view.queryAllByType('TranslationNotCoveredNotice');
  assert.ok(notice);
  assert.equal(notice.props.translationId, 'bsb');
  assert.deepEqual(notice.props.coveredTranslationIds, ['web']);
  assert.equal(view.queryByRole('button', { name: t('common.retry') }), null);

  await act(async () => notice.props.onSwitched());
  assert.equal(fixture.goBacks.length, 1, 'switching returns to the reader');
  await act(async () => notice.props.onRetry());
  await view.flush();
  assert.equal(calls.fetch.length, 2);
});

test('with translator access off the screen explains and loads nothing', async () => {
  fixture.reviewStore.setState({ enabled: false });
  const view = await renderReview();

  assert.ok(view.getByText(t('settings.translatorAccessSummaryOff')));
  assert.deepEqual(calls.fetch, []);
  assert.equal(view.queryAllByType('FlatList').length, 0);
});

test('the back button returns to the reader', async () => {
  const view = await renderReview();

  await view.press(view.getByRole('button', { name: t('common.back') }));

  assert.equal(fixture.goBacks.length, 1);
});

// ---- Resolving -------------------------------------------------------------------------

test('a settled decision is announced, and a failed one from the list alerts', async () => {
  const view = await renderReview();
  await view.press(view.getByRole('button', { name: t('feedback.markReviewed') }));
  await view.flush();
  assert.equal(announcements().length, 1);
  assert.deepEqual(alerts(), []);

  responders.resolve = async () => ({ success: false });
  await view.press(view.getByRole('button', { name: t('feedback.markReviewed') }));
  await view.flush();
  assert.deepEqual(
    alerts().map(({ title, message }) => [title, message]),
    [[t('common.error'), t('common.unexpectedError')]]
  );
  assert.equal(announcements().length, 1, 'no announcement for a failed save');
});

test('a reason that fails to save keeps the sheet open and says so inside it', async () => {
  responders.resolve = async () => ({ success: false });
  const view = await renderReview();
  await view.press(view.getByRole('button', { name: t('feedback.markAddressed') }));
  const sheet = visibleSheet(view);
  assert.ok(sheet);

  await view.changeText(sheet.getByLabelText(t('feedback.explanation')), 'Fixed');
  await view.press(sheet.getByRole('button', { name: t('feedback.markAddressed') }));
  await view.flush();

  const open = visibleSheet(view);
  assert.ok(open, 'the sheet stays open');
  assert.ok(open.getByRole('alert', { name: t('common.unexpectedError') }));
  assert.deepEqual(alerts(), [], 'an Alert cannot show over the sheet');
});

test('a reason typed for one concern is kept when its sheet is closed and reopened', async () => {
  const view = await renderReview();
  await view.press(view.getByRole('button', { name: t('feedback.markAddressed') }));
  const sheet = visibleSheet(view);
  assert.ok(sheet);
  await view.changeText(sheet.getByLabelText(t('feedback.explanation')), 'Draft reason');
  await view.press(sheet.getByRole('button', { name: t('common.cancel') }));
  assert.equal(visibleSheet(view), null);

  await view.press(view.getByRole('button', { name: t('feedback.markAddressed') }));
  const reopened = visibleSheet(view);
  assert.ok(reopened);
  assert.equal(reopened.getByLabelText(t('feedback.explanation')).props.value, 'Draft reason');
});

// ---- Voice notes ---------------------------------------------------------------------------

test('a voice note that cannot be fetched says so and leaves Listen showing', async () => {
  responders.audioUrl = async () => ({ success: false });
  const view = await renderReview();

  await view.press(listenButton(view, 'bible.translatorReviewListen'));
  await view.flush();

  assert.deepEqual(
    alerts().map(({ title, message }) => [title, message]),
    [[t('common.error'), t('bible.translatorReviewAudioError')]]
  );
  assert.ok(listenButton(view, 'bible.translatorReviewListen'));
  assert.deepEqual(fixture.created, []);
});

test('a voice note that plays to the end is marked listened and returns to Listen', async () => {
  const view = await renderReview();
  await view.press(listenButton(view, 'bible.translatorReviewListen'));
  await view.flush();
  assert.ok(listenButton(view, 'bible.translatorReviewPause'));

  await act(async () =>
    fixture.playback.onStatus?.({
      isLoaded: true,
      didJustFinish: true,
      positionMillis: 12000,
      durationMillis: 12000,
    })
  );

  assert.deepEqual(fixture.listened, ['c1']);
  assert.deepEqual(fixture.soundCalls, ['unload']);
  assert.ok(listenButton(view, 'bible.translatorReviewListen'));
});

test('leaving the screen unloads the voice note that is playing', async () => {
  const view = await renderReview();
  await view.press(listenButton(view, 'bible.translatorReviewListen'));
  await view.flush();

  await view.unmount();

  assert.deepEqual(fixture.soundCalls, ['unload']);
});

test('changing a filter stops the voice note that is playing', async () => {
  const view = await renderReview();
  await view.press(listenButton(view, 'bible.translatorReviewListen'));
  await view.flush();

  await view.press(view.getByRole('tab', { name: t('feedback.doneTab') }));
  await view.flush();

  assert.deepEqual(fixture.soundCalls, ['unload']);
  assert.ok(listenButton(view, 'bible.translatorReviewListen'));
});

test('the chapter feedback list shows praise and concerns with their decisions', async () => {
  responders.fetch = async () => feedbackPage({ feedback: [praise, settled] });
  const view = await renderReview();

  assert.ok(view.getByText('Reads clearly'));
  assert.ok(view.getByText('Spelling corrected'));
});
