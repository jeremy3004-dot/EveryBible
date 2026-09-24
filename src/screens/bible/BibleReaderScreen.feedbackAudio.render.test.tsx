import test, { after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { installIntervalLeakGuard } from '../../testing/reactHookRuntime';
import { isPrivacyLockGraceActive } from '../../services/privacy/privacyLockGrace';
import { isHiddenFromAccessibility } from '../../testing/render';
import { installReaderRenderFixture } from './BibleReaderScreen.renderFixture';

// Chapter-feedback voice notes: recording and previewing them must never leave
// the microphone, a sound or the recording timer running once nobody wants them.
const reader = installReaderRenderFixture(mock);
const { harness, t, renderReader, chapters, feedbackAv } = reader;
const intervals = installIntervalLeakGuard();
after(() => intervals.restore());

type View = Awaited<ReturnType<typeof renderReader>>;

/** The listen page carries the feedback composer, with its voice-note controls, inline. */
async function renderComposer() {
  harness.authStore.getState().setPreferences({
    chapterFeedbackEnabled: true,
    chapterFeedbackName: 'Ruth',
    chapterFeedbackRole: 'Reviewer',
  });
  chapters.set('JHN:3', []);
  const view = await renderReader();
  // The voice-note controls open with the rest of the composer once a sentiment is chosen.
  await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackThumbsUp') }));
  return view;
}

const recordButton = (view: View) =>
  view.getByRole('button', { name: t('bible.chapterFeedbackAudioRecord') });

/** Record and stop, leaving a draft voice note ready to preview. */
async function recordDraft(view: View) {
  await view.press(recordButton(view));
  await view.flush();
  await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioStop') }));
  await view.flush();
  return view.getByRole('button', { name: t('bible.chapterFeedbackAudioPreview') });
}

// ---- Recording ------------------------------------------------------------------

test('starting and stopping a voice note is spoken, since Record and Stop swap under the finger', async () => {
  const view = await renderComposer();
  const before = harness.rn.__recorded.announcements.length;

  await view.press(recordButton(view));
  await view.flush();
  const recording = t('bible.chapterFeedbackAudioRecording', { duration: '0:00' });
  assert.deepEqual(harness.rn.__recorded.announcements.slice(before), [recording]);

  await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioStop') }));
  await view.flush();
  assert.deepEqual(harness.rn.__recorded.announcements.slice(before), [
    recording,
    t('bible.chapterFeedbackAudioReady', { duration: '0:04' }),
  ]);
  // The ring's bare remaining time is decoration next to the worded status.
  const countdown = view.queryAllByType('Text').find((node) => node.props.children === '0:56');
  assert.ok(countdown, 'the ring shows the remaining time');
  assert.equal(isHiddenFromAccessibility(countdown), true);
  await view.unmount();
});

test('a double tap on record starts one recording, not two', async () => {
  const view = await renderComposer();
  feedbackAv.hold('requestPermissionsAsync');

  await view.press(recordButton(view));
  await view.press(recordButton(view));
  while (feedbackAv.waiting('requestPermissionsAsync') > 0) {
    await feedbackAv.release('requestPermissionsAsync');
  }
  await view.flush();

  assert.equal(
    feedbackAv.log.filter((entry) => entry === 'Recording.createAsync').length,
    1,
    'the second tap is ignored while the first start is in flight'
  );
  assert.ok(view.getByRole('button', { name: t('bible.chapterFeedbackAudioStop') }));
  await view.unmount();
});

test('the microphone prompt runs under the privacy lock grace', async () => {
  // iOS turns the app inactive under its microphone prompt; discreet mode must not
  // take that for the reader leaving and lock mid-recording (see privacyLockGrace).
  const view = await renderComposer();
  feedbackAv.hold('requestPermissionsAsync');

  await view.press(recordButton(view));
  assert.equal(feedbackAv.waiting('requestPermissionsAsync'), 1, 'the prompt is open');
  assert.equal(isPrivacyLockGraceActive(), true);

  await feedbackAv.release('requestPermissionsAsync');
  await view.flush();
  assert.ok(view.getByRole('button', { name: t('bible.chapterFeedbackAudioStop') }));
  await view.unmount();
});

test('leaving the reader during the microphone prompt never starts the recording', async () => {
  const view = await renderComposer();
  feedbackAv.hold('requestPermissionsAsync');

  await view.press(recordButton(view));
  await view.unmount();
  await feedbackAv.release('requestPermissionsAsync');
  await act(async () => {});

  assert.equal(feedbackAv.log.includes('Recording.createAsync'), false);
  assert.equal(intervals.liveCount, 0, 'no recording timer is left running');
});

test('a recording that finishes starting after the reader closed is stopped at once', async () => {
  const view = await renderComposer();
  feedbackAv.hold('Recording.createAsync');

  await view.press(recordButton(view));
  await view.flush();
  assert.equal(feedbackAv.waiting('Recording.createAsync'), 1);
  await view.unmount();
  await feedbackAv.release('Recording.createAsync');
  await act(async () => {});

  assert.ok(
    feedbackAv.log.includes('recording1.stopAndUnload'),
    'the microphone is released instead of recording on'
  );
  assert.equal(intervals.liveCount, 0, 'no recording timer is left running');
});

// ---- Preview ------------------------------------------------------------------------

test('a double tap on preview releases the first sound instead of letting it play on', async () => {
  const view = await renderComposer();
  const preview = await recordDraft(view);
  feedbackAv.hold('Sound.createAsync');

  await view.press(preview);
  await view.press(preview);
  await feedbackAv.release('Sound.createAsync');
  await feedbackAv.release('Sound.createAsync');
  await view.flush();

  assert.equal(feedbackAv.sounds.length, 2);
  assert.ok(feedbackAv.log.includes('sound1.unload'), 'the superseded sound is unloaded');
  assert.equal(feedbackAv.log.includes('sound1.play'), false, 'and never starts playing');
  assert.ok(feedbackAv.log.includes('sound2.play'));
  assert.equal(feedbackAv.log.includes('sound2.unload'), false, 'the newest one keeps playing');
  await view.unmount();
  await act(async () => {});
  assert.ok(feedbackAv.log.includes('sound2.unload'), 'leaving the reader stops it');
});

test('a preview that finishes loading after the reader closed is unloaded, not played', async () => {
  const view = await renderComposer();
  const preview = await recordDraft(view);
  feedbackAv.hold('Sound.createAsync');

  await view.press(preview);
  await view.unmount();
  await feedbackAv.release('Sound.createAsync');
  await act(async () => {});

  assert.ok(feedbackAv.log.includes('sound1.unload'));
  assert.equal(feedbackAv.log.includes('sound1.play'), false);
});

test('an older preview finishing does not forget the one that is playing now', async () => {
  const view = await renderComposer();
  const preview = await recordDraft(view);

  await view.press(preview);
  await view.press(preview);
  await view.flush();
  assert.equal(feedbackAv.sounds.length, 2);

  await act(async () => {
    feedbackAv.sounds[0].onStatus?.({ isLoaded: true, didJustFinish: true });
  });
  assert.equal(feedbackAv.log.includes('sound2.unload'), false, 'the playing preview plays on');
  await view.unmount();
  await act(async () => {});

  assert.ok(feedbackAv.log.includes('sound2.unload'), 'the current sound is still stopped on exit');
});

test('a preview that plays to the end is released', async () => {
  const view = await renderComposer();
  const preview = await recordDraft(view);

  await view.press(preview);
  await view.flush();
  const [sound] = feedbackAv.sounds;
  assert.ok(sound.onStatus, 'the reader listens for the end of the preview');
  await act(async () => {
    sound.onStatus?.({ isLoaded: true, didJustFinish: true });
  });

  assert.ok(feedbackAv.log.includes('sound1.unload'));
  await view.unmount();
});
