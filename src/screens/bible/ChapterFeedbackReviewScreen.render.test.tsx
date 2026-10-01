import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { flattenStyle, hostAncestors, within } from '../../testing/render';
import {
  concern,
  feedbackPage,
  installFeedbackReviewFixture,
} from './ChapterFeedbackReviewScreen.renderFixture';
import { assertDefined } from '../../utils/assertDefined';

const {
  harness,
  t,
  participationCalls,
  listened,
  soundCalls,
  created,
  playback,
  calls,
  renderReview,
  visibleSheet,
  recordingSound,
  gateSoundLoads,
  listenButton,
  responders,
} = installFeedbackReviewFixture(mock);

const passcodeArgs = { apiVersion: 2, passcode: '123456', translationId: 'bsb' };

test('the review lists the chapter feedback the server returns for this translation', async () => {
  const view = await renderReview();

  assert.deepEqual(calls.fetch, [
    {
      apiVersion: 2,
      translationId: 'bsb',
      bookId: 'JHN',
      chapter: 3,
      passcode: '123456',
      category: 'all',
      status: 'pending',
      positiveOnly: false,
      cursor: null,
    },
  ]);
  assert.ok(view.getByRole('header', { name: 'John 3' }));
  assert.ok(view.getByText(t('feedback.openCount', { count: 2 })));
  for (const comment of ['The name is misspelled', 'Reads clearly', 'Old concern']) {
    assert.ok(view.getByText(comment));
  }
});

test('the list is for reading, with no review walkthrough to start', async () => {
  const view = await renderReview();

  assert.equal(view.queryByText('Start review'), null);
  assert.equal(visibleSheet(view), null);
});

test('each source label may wrap under its verdict instead of truncating beside it', async () => {
  const view = await renderReview();

  const verdicts = [
    ...view.queryAllByText(t('bible.chapterFeedbackThumbsUp')),
    ...view.queryAllByText(t('bible.chapterFeedbackThumbsDown')),
  ];
  assert.ok(verdicts.length > 0);
  for (const verdict of verdicts) {
    const row = assertDefined(hostAncestors(verdict)[1], 'row');
    assert.equal(flattenStyle(row.props.style)?.flexWrap, 'wrap');
    const source = assertDefined(within(row).queryAllByType('Text')[1], 'the source label');
    assert.equal(source.props.numberOfLines, 2);
  }
});

test('at large text the reason sheet scrolls inside its height cap, reason field and save included', async () => {
  harness.setFontScale(2);
  const view = await renderReview();
  await view.press(view.getByRole('button', { name: t('feedback.markAddressed') }));
  const sheet = visibleSheet(view);
  assert.ok(sheet, 'the reason sheet is open');

  const input = sheet.getByLabelText(t('feedback.explanation'));
  const save = sheet.getByRole('button', { name: t('feedback.markAddressed') });
  const scrollAround = (node: typeof input) =>
    hostAncestors(node).find((ancestor) => (ancestor.type as unknown) === 'ScrollView');
  const scroll = scrollAround(save);
  assert.ok(scroll, 'the verdict, comment, reason field and buttons scroll');
  assert.equal(scrollAround(input), scroll);
  // A tap on Save while the keyboard is up must save, not just drop the keyboard.
  assert.equal(scroll.props.keyboardShouldPersistTaps, 'handled');

  const surface = hostAncestors(scroll).find((node) => node.props.accessibilityViewIsModal);
  assert.ok(surface);
  const maxHeight = Number(flattenStyle(surface.props.style)?.maxHeight);
  assert.ok(maxHeight > 0 && maxHeight < 844 - harness.insets.top, `capped (${maxHeight})`);
});

test('a concern is marked addressed from its card with a written reason, saved on the server', async () => {
  const view = await renderReview();
  await view.press(view.getByRole('button', { name: t('feedback.markAddressed') }));
  const sheet = visibleSheet(view);
  assert.ok(sheet, 'the reason sheet is open');

  assert.ok(sheet.getByText('The name is misspelled'));
  // A concern cannot be settled without saying why.
  const confirm = () => sheet.getByRole('button', { name: t('feedback.markAddressed') });
  assert.ok(sheet.getByRole('button', { name: t('feedback.markAddressed'), disabled: true }));
  await view.press(confirm());
  assert.deepEqual(calls.resolve, []);

  await view.changeText(sheet.getByLabelText(t('feedback.explanation')), 'Fixed the spelling');
  await view.press(confirm());
  await view.flush();

  assert.deepEqual(calls.resolve, [
    { ...passcodeArgs, feedbackId: 'c1', resolution: 'fixed', note: 'Fixed the spelling' },
  ]);
  assert.equal(visibleSheet(view), null, 'the sheet closes once saved');
  assert.deepEqual(calls.reopen, []);
});

test('No change needed on a concern also asks for the reason before saving', async () => {
  const view = await renderReview();
  await view.press(view.getByRole('button', { name: t('feedback.noChange') }));
  const sheet = visibleSheet(view);
  assert.ok(sheet, 'the reason sheet is open');

  await view.changeText(sheet.getByLabelText(t('feedback.explanation')), 'Spelling is standard');
  await view.press(sheet.getByRole('button', { name: t('feedback.noChange') }));
  await view.flush();

  assert.deepEqual(calls.resolve, [
    {
      ...passcodeArgs,
      feedbackId: 'c1',
      resolution: 'no_change_needed',
      note: 'Spelling is standard',
    },
  ]);
});

test('praise is settled straight from its card with Mark reviewed', async () => {
  const view = await renderReview();
  await view.press(view.getByRole('button', { name: t('feedback.markReviewed') }));
  await view.flush();

  assert.equal(visibleSheet(view), null, 'praise needs no reason');
  assert.deepEqual(calls.resolve, [
    { ...passcodeArgs, feedbackId: 'p1', resolution: 'no_change_needed', note: '' },
  ]);
});

test('no control claims the chapter is accurate', async () => {
  const view = await renderReview();
  await view.press(view.getByRole('button', { name: t('feedback.markAddressed') }));
  const sheet = visibleSheet(view);
  assert.ok(sheet);

  for (const scope of [view, sheet]) {
    assert.equal(scope.queryByText(t('bible.translatorReviewConfirmAccurate')), null);
    assert.equal(scope.queryByText(t('bible.translatorReviewConfirmedAccurate')), null);
  }
});

test('Reopen on settled feedback reopens it on the server instead of resolving it', async () => {
  const view = await renderReview();
  await view.press(view.getByRole('button', { name: t('bible.translatorReviewReopen') }));
  await view.flush();

  assert.deepEqual(calls.reopen, [{ ...passcodeArgs, feedbackId: 's1' }]);
  assert.deepEqual(calls.resolve, []);
});

test('the review screen offers no way to switch feedback participation', async () => {
  const view = await renderReview();
  await view.press(view.getByRole('button', { name: t('feedback.markAddressed') }));
  const sheet = visibleSheet(view);
  assert.ok(sheet);

  for (const scope of [view, sheet]) {
    assert.deepEqual(scope.queryAllByType('Switch'), []);
    assert.equal(scope.queryByText(t('settings.translatorAccessUnlock')), null);
    const inputs = scope.queryAllByType('TextInput');
    assert.ok(
      inputs.every((node) => node.props.placeholder !== t('settings.translatorAccessPlaceholder')),
      'no passcode field'
    );
  }
  assert.deepEqual(participationCalls, []);
});

test('review audio has named play and pause buttons and marks the item listened', async () => {
  const view = await renderReview();
  const audioButton = (key: string) =>
    view.getByRole('button', { name: `${t(key)}, ${t('myFeedback.audioLabel')}` });

  await view.press(audioButton('bible.translatorReviewListen'));
  await view.flush();
  assert.deepEqual(calls.audioUrl.length, 1);
  assert.equal((calls.audioUrl[0] as { feedbackId: string }).feedbackId, 'c1');
  assert.deepEqual(created, [
    { source: { uri: 'https://media.test/c1.m4a' }, status: { shouldPlay: false } },
  ]);

  await view.press(audioButton('bible.translatorReviewPause'));
  await view.flush();
  assert.deepEqual(soundCalls, ['play', 'pause']);

  await view.press(audioButton('bible.translatorReviewListen'));
  await view.flush();
  assert.deepEqual(soundCalls, ['play', 'pause', 'play']);

  assert.deepEqual(listened, []);
  playback.onStatus?.({ isLoaded: true, positionMillis: 8000, durationMillis: 12000 });
  assert.deepEqual(listened, ['c1']);
});

// Listen starts play() without awaiting it, so a released load settles on a later turn.
const settleReleasedLoad = () => new Promise<void>((resolve) => setImmediate(resolve));

test('reviewer playback drains Bible narration before loading a silent native sound', async () => {
  const { bibleNarrationOwner, claimNarration, resetNarrationOwnership } =
    await import('../../services/audio/narrationOwnership');
  resetNarrationOwnership();
  let bibleSuspensions = 0;
  let finishSuspension: () => void = () => {};
  const bible = claimNarration(
    'bible',
    bibleNarrationOwner,
    () =>
      new Promise<void>((resolve) => {
        bibleSuspensions += 1;
        finishSuspension = resolve;
      })
  );
  const view = await renderReview();
  try {
    await view.press(listenButton(view, 'bible.translatorReviewListen'));
    await view.flush();
    assert.equal(bibleSuspensions, 1);
    assert.equal(created.length, 0, 'reviewer waits for Bible native suspension');
    await act(async () => finishSuspension());
    await view.flush();
    assert.deepEqual(created[0]?.status, { shouldPlay: false });
    assert.deepEqual(soundCalls, ['play']);
  } finally {
    finishSuspension();
    await view.unmount();
    bible.cancel();
    resetNarrationOwnership();
  }
});

test('an old Pause completion cannot clear the newer reviewer clip', async () => {
  responders.fetch = async () =>
    feedbackPage({ feedback: [concern, { ...concern, id: 'c2', comment: 'Second note' }] });
  const loads = gateSoundLoads();
  const view = await renderReview();
  const buttons = (key: string) =>
    view.queryAllByRole('button', { name: `${t(key)}, ${t('myFeedback.audioLabel')}` });
  let finishPause: () => void = () => {};
  try {
    await view.press(
      assertDefined(
        buttons('bible.translatorReviewListen')[0],
        "buttons('bible.translatorReviewListen')[0]"
      )
    );
    await loads.loadsStarted(1);
    const first = recordingSound('first');
    first.pauseAsync = () =>
      new Promise<void>((resolve) => {
        finishPause = resolve;
      });
    await act(async () => loads.release(0, first));
    await view.flush();
    act(() =>
      assertDefined(
        buttons('bible.translatorReviewPause')[0],
        "buttons('bible.translatorReviewPause')[0]"
      ).props.onPress()
    );
    await view.press(
      assertDefined(
        buttons('bible.translatorReviewListen')[0],
        "buttons('bible.translatorReviewListen')[0]"
      )
    );
    await loads.loadsStarted(2);
    await act(async () => loads.release(1, recordingSound('second')));
    await view.flush();
    assert.equal(buttons('bible.translatorReviewPause').length, 1);
    await act(async () => finishPause());
    await view.flush();
    assert.equal(buttons('bible.translatorReviewPause').length, 1);
  } finally {
    finishPause();
    await view.unmount();
  }
});

test('a voice note that finishes loading after the screen closes is unloaded, not played', async () => {
  const loads = gateSoundLoads();
  const view = await renderReview();

  await view.press(listenButton(view, 'bible.translatorReviewListen'));
  await loads.loadsStarted(1);
  await view.unmount();
  loads.release(0, recordingSound('late'));
  await settleReleasedLoad();

  assert.deepEqual(soundCalls, ['late:unload']);
  assert.deepEqual(created[0]?.status, { shouldPlay: false });
});

test('Bible takeover waits for a pending reviewer factory and its native unload', async () => {
  const { bibleNarrationOwner, claimNarration, resetNarrationOwnership } =
    await import('../../services/audio/narrationOwnership');
  resetNarrationOwnership();
  const loads = gateSoundLoads();
  const view = await renderReview();
  let finishUnload: () => void = () => {};
  try {
    await view.press(listenButton(view, 'bible.translatorReviewListen'));
    await loads.loadsStarted(1);
    const bible = claimNarration('bible', bibleNarrationOwner, async () => {});
    let ready = false;
    void bible.ready.then(() => {
      ready = true;
    });
    await view.flush();
    assert.equal(ready, false);
    const late = recordingSound('late');
    late.unloadAsync = () =>
      new Promise<void>((resolve) => {
        soundCalls.push('late:unload');
        finishUnload = resolve;
      });
    await act(async () => loads.release(0, late));
    await view.flush();
    assert.deepEqual(soundCalls, ['late:unload']);
    assert.equal(ready, false, 'takeover must wait for actual native release');
    await act(async () => finishUnload());
    await bible.ready;
    assert.equal(ready, true);
  } finally {
    finishUnload();
    await view.unmount();
    resetNarrationOwnership();
  }
});

test('a failed URL refresh reports the error and a current Listen can retry', async () => {
  responders.audioUrl = async () => ({ success: false });
  const view = await renderReview();
  await view.press(listenButton(view, 'bible.translatorReviewListen'));
  await view.flush();
  assert.equal(harness.rn.__recorded.alerts.at(-1)?.message, t('bible.translatorReviewAudioError'));
  assert.deepEqual(created, []);
  responders.audioUrl = async () => ({
    success: true,
    playbackUrl: 'https://media.test/retry.m4a',
  });
  await view.press(listenButton(view, 'bible.translatorReviewListen'));
  await view.flush();
  assert.ok(listenButton(view, 'bible.translatorReviewPause'));
  assert.deepEqual(soundCalls, ['play']);
  await view.unmount();
});

test('a replaced clip status cannot mark it listened or stop the current clip', async () => {
  responders.fetch = async () =>
    feedbackPage({ feedback: [concern, { ...concern, id: 'c2', comment: 'Second note' }] });
  const loads = gateSoundLoads();
  const view = await renderReview();
  let oldStatus: (status: {
    isLoaded: boolean;
    positionMillis: number;
    durationMillis: number;
    didJustFinish: boolean;
  }) => void = () => {};
  const first = recordingSound('first');
  first.setOnPlaybackStatusUpdate = (listener) => {
    oldStatus = listener;
  };
  await view.press(
    assertDefined(
      view.queryAllByRole('button', {
        name: `${t('bible.translatorReviewListen')}, ${t('myFeedback.audioLabel')}`,
      })[0],
      "view.queryAllByRole('button', { name: `${t('bible.transla..."
    )
  );
  await loads.loadsStarted(1);
  await act(async () => loads.release(0, first));
  await view.flush();
  await view.press(listenButton(view, 'bible.translatorReviewListen'));
  await loads.loadsStarted(2);
  await act(async () => loads.release(1, recordingSound('second')));
  await view.flush();
  await act(async () =>
    oldStatus({ isLoaded: true, positionMillis: 12000, durationMillis: 12000, didJustFinish: true })
  );
  assert.deepEqual(listened, []);
  assert.ok(listenButton(view, 'bible.translatorReviewPause'));
  assert.deepEqual(soundCalls, ['first:play', 'first:unload', 'second:play']);
  await view.unmount();
});

test('pressing Listen twice during a load leaves one clip playing, and Pause stops it', async () => {
  const loads = gateSoundLoads();
  const view = await renderReview();

  await view.press(listenButton(view, 'bible.translatorReviewListen'));
  await loads.loadsStarted(1);
  await view.press(listenButton(view, 'bible.translatorReviewListen'));
  assert.equal(created.length, 1, 'replacement waits for the outgoing native factory');
  await act(async () => loads.release(0, recordingSound('older')));
  await loads.loadsStarted(2);
  await act(async () => loads.release(1, recordingSound('newer')));
  await view.flush();

  assert.deepEqual(soundCalls, ['older:unload', 'newer:play']);

  await view.press(listenButton(view, 'bible.translatorReviewPause'));
  await view.flush();

  assert.deepEqual(soundCalls, ['older:unload', 'newer:play', 'newer:pause']);
});
