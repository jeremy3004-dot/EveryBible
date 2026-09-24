import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { installReaderRenderFixture } from './BibleReaderScreen.renderFixture';

// Chapter-feedback voice notes: recording and previewing them must never leave
// the microphone, a sound or the recording timer running once nobody wants them.
const reader = installReaderRenderFixture(mock);
const { harness, t, renderReader, chapters, feedbackAv } = reader;

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

/** Record and stop, leaving a draft voice note ready to preview. */
async function recordDraft(view: View) {
  await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioRecord') }));
  await view.flush();
  await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioStop') }));
  await view.flush();
  return view.getByRole('button', { name: t('bible.chapterFeedbackAudioPreview') });
}

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
