import test, { after, afterEach, mock } from 'node:test';
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
afterEach(async () => {
  const { resetNarrationOwnership } = await import('../../services/audio/narrationOwnership');
  resetNarrationOwnership();
});

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

test('recording a contributor voice note suspends current Bible narration before requesting the mic', async () => {
  const { bibleNarrationOwner, claimNarration, resetNarrationOwnership } =
    await import('../../services/audio/narrationOwnership');
  resetNarrationOwnership();
  const view = await renderComposer();
  let paused = false;
  const bible = claimNarration('bible', bibleNarrationOwner, async () => {
    paused = true;
  });
  await bible.ready;

  try {
    await view.press(recordButton(view));
    await view.flush();
    assert.equal(paused, true);
    assert.ok(feedbackAv.log.includes('Recording.createAsync'));
  } finally {
    await view.unmount();
    resetNarrationOwnership();
  }
});

/** Record and stop, leaving a draft voice note ready to preview. */
async function recordDraft(view: View) {
  await view.press(recordButton(view));
  await view.flush();
  await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioStop') }));
  await view.flush();
  return view.getByRole('button', { name: t('bible.chapterFeedbackAudioPreview') });
}

async function claimBibleNarration(suspend: () => Promise<void> = async () => {}) {
  const { bibleNarrationOwner, claimNarration } =
    await import('../../services/audio/narrationOwnership');
  return claimNarration('bible', bibleNarrationOwner, suspend);
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

test('Bible takeover during the microphone prompt cancels Record before recorder creation', async () => {
  const view = await renderComposer();
  feedbackAv.hold('requestPermissionsAsync');
  await view.press(recordButton(view));
  assert.equal(feedbackAv.waiting('requestPermissionsAsync'), 1);

  const bible = await claimBibleNarration();
  await bible.ready;
  await feedbackAv.release('requestPermissionsAsync');
  await view.flush();
  assert.equal(feedbackAv.log.includes('Recording.createAsync'), false);
  assert.equal(intervals.liveCount, 0);
  assert.ok(recordButton(view));
  await view.unmount();
});

test('Bible takeover waits for pending recorder creation and discards the abandoned recording', async () => {
  const view = await renderComposer();
  feedbackAv.hold('Recording.createAsync');
  await view.press(recordButton(view));
  await view.flush();
  assert.equal(feedbackAv.waiting('Recording.createAsync'), 1);

  const bible = await claimBibleNarration();
  let ready = false;
  void bible.ready.then(() => {
    ready = true;
  });
  await view.flush();
  assert.equal(ready, false, 'the new narration waits for the native recorder');
  await feedbackAv.release('Recording.createAsync');
  await bible.ready;
  await view.flush();
  assert.ok(feedbackAv.log.includes('recording1.stopAndUnload'));
  assert.ok(recordButton(view), 'an abandoned start does not become a finished draft');
  assert.equal(intervals.liveCount, 0);
  await view.unmount();
});

test('Bible takeover waits for a failed recorder start to restore playback mode', async (context) => {
  const { Audio } = await import('expo-av');
  let restores = 0;
  let finishFirstRestore!: () => void;
  const firstRestore = new Promise<void>((resolve) => {
    finishFirstRestore = resolve;
  });
  context.mock.method(Audio.Recording.prototype, 'startAsync', async () => {
    throw new Error('native recorder start failed');
  });
  context.mock.method(
    Audio,
    'setAudioModeAsync',
    async (mode: { allowsRecordingIOS?: boolean }) => {
      if (mode.allowsRecordingIOS === false && ++restores === 1) await firstRestore;
    }
  );
  const view = await renderComposer();
  try {
    await view.press(recordButton(view));
    await view.flush();
    assert.equal(restores, 1, 'the failed native start began restoring playback mode');
    const bible = await claimBibleNarration();
    let ready = false;
    void bible.ready.then(() => {
      ready = true;
    });
    await view.flush();
    assert.equal(ready, false, 'Bible cannot proceed while the old mode restore is pending');
    finishFirstRestore();
    await bible.ready;
  } finally {
    finishFirstRestore();
    await view.unmount();
  }
});

test('Bible takeover waits for failed recorder start cleanup before a new recording can begin', async (context) => {
  const { Audio } = await import('expo-av');
  const originalStart = Audio.Recording.prototype.startAsync;
  const originalStop = Audio.Recording.prototype.stopAndUnloadAsync;
  let starts = 0;
  context.mock.method(
    Audio.Recording.prototype,
    'startAsync',
    async function (this: InstanceType<typeof Audio.Recording>) {
      starts += 1;
      if (starts === 1) throw new Error('native start failed');
      return originalStart.call(this);
    }
  );
  let finishCleanup!: () => void;
  const cleanup = new Promise<void>((resolve) => {
    finishCleanup = resolve;
  });
  let cleanupStarted = false;
  context.mock.method(
    Audio.Recording.prototype,
    'stopAndUnloadAsync',
    async function (this: InstanceType<typeof Audio.Recording>) {
      cleanupStarted = true;
      await cleanup;
      return originalStop.call(this);
    }
  );
  const view = await renderComposer();
  try {
    await view.press(recordButton(view));
    await view.flush();
    assert.equal(cleanupStarted, true);
    const bible = await claimBibleNarration();
    let ready = false;
    void bible.ready.then(() => {
      ready = true;
    });
    await view.flush();
    assert.equal(ready, false, 'Bible cannot start during the recorder cleanup');
    await act(async () => finishCleanup());
    await bible.ready;
    assert.ok(feedbackAv.log.includes('recording1.stopAndUnload'));
    await view.press(recordButton(view));
    await view.flush();
    assert.equal(feedbackAv.recordings.length, 2);
  } finally {
    finishCleanup();
    await view.unmount();
  }
});

test('a failed Bible suspension blocks Record and an explicit retry starts it', async () => {
  const view = await renderComposer();
  let attempts = 0;
  const bible = await claimBibleNarration(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('native pause failed');
  });
  await bible.ready;

  await view.press(recordButton(view));
  await view.flush();
  assert.equal(feedbackAv.log.includes('Recording.createAsync'), false);
  assert.equal(attempts, 1);
  await view.press(recordButton(view));
  await view.flush();
  assert.equal(attempts, 2);
  assert.ok(feedbackAv.log.includes('Recording.createAsync'));
  await view.unmount();
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

test('preview suspends Bible narration and a later Bible takeover releases the preview', async () => {
  const view = await renderComposer();
  const preview = await recordDraft(view);
  let paused = false;
  const bible = await claimBibleNarration(async () => {
    paused = true;
  });
  await bible.ready;
  await view.press(preview);
  await view.flush();
  assert.equal(paused, true);
  assert.ok(feedbackAv.log.includes('sound1.play'));

  const resumedBible = await claimBibleNarration();
  await resumedBible.ready;
  assert.ok(feedbackAv.log.includes('sound1.unload'));
  await view.unmount();
});

test('Bible takeover waits for a preview still creating before starting narration', async () => {
  const view = await renderComposer();
  const preview = await recordDraft(view);
  feedbackAv.hold('Sound.createAsync');
  await view.press(preview);
  await view.flush();
  assert.equal(feedbackAv.waiting('Sound.createAsync'), 1);

  const bible = await claimBibleNarration();
  let ready = false;
  void bible.ready.then(() => {
    ready = true;
  });
  await view.flush();
  assert.equal(ready, false, 'the newly claimed narration waits for the preview load');
  await feedbackAv.release('Sound.createAsync');
  await bible.ready;
  await view.flush();
  assert.equal(feedbackAv.log.includes('sound1.play'), false);
  assert.ok(feedbackAv.log.includes('sound1.unload'));
  await view.unmount();
});

test('Record waits for an abandoned preview native Play to finish unloading', async () => {
  const view = await renderComposer();
  const preview = await recordDraft(view);
  const sounds = feedbackAv.sounds;
  const originalPush = sounds.push;
  let finishPlay!: () => void;
  const pendingPlay = new Promise<void>((resolve) => {
    finishPlay = resolve;
  });
  sounds.push = function (...incoming) {
    for (const sound of incoming) {
      sound.playAsync = async () => {
        await pendingPlay;
      };
    }
    return originalPush.apply(this, incoming);
  };

  try {
    await view.press(preview);
    await view.flush();
    assert.equal(sounds.length, 1);
    await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioRerecord') }));
    await view.press(recordButton(view));
    await view.flush();
    assert.equal(feedbackAv.recordings.length, 1, 'new recorder waits for native preview Play');
    await act(async () => finishPlay());
    await view.flush();
    assert.ok(feedbackAv.log.includes('sound1.unload'));
    assert.equal(feedbackAv.recordings.length, 2);
  } finally {
    finishPlay();
    sounds.push = originalPush;
    await view.unmount();
  }
});

test('Record waits for an abandoned preview factory before creating a recorder', async () => {
  const view = await renderComposer();
  const preview = await recordDraft(view);
  feedbackAv.hold('Sound.createAsync');
  await view.press(preview);
  await view.flush();
  assert.equal(feedbackAv.waiting('Sound.createAsync'), 1);

  await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioRerecord') }));
  await view.press(recordButton(view));
  await view.flush();
  assert.equal(feedbackAv.recordings.length, 1, 'the old preview factory still owns native audio');
  await feedbackAv.release('Sound.createAsync');
  await view.flush();
  assert.equal(feedbackAv.log.includes('sound1.play'), false);
  assert.ok(feedbackAv.log.includes('sound1.unload'));
  assert.equal(feedbackAv.recordings.length, 2);
  await view.unmount();
});

test('a failed preview unload blocks Bible takeover until its next explicit retry', async () => {
  const view = await renderComposer();
  const preview = await recordDraft(view);
  await view.press(preview);
  await view.flush();
  const sound = feedbackAv.sounds[0];
  const originalUnload = sound.unloadAsync;
  let attempts = 0;
  sound.unloadAsync = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('native unload failed');
    await originalUnload();
  };

  const first = await claimBibleNarration();
  await assert.rejects(first.ready, /native unload failed/);
  assert.equal(attempts, 1);
  const retry = await claimBibleNarration();
  await retry.ready;
  assert.equal(attempts, 2);
  assert.ok(feedbackAv.log.includes('sound1.unload'));
  await view.unmount();
});

test('a failed recorder stop blocks Bible takeover and retries without losing its draft', async () => {
  const view = await renderComposer();
  await view.press(recordButton(view));
  await view.flush();
  const recording = feedbackAv.recordings[0];
  const originalStop = recording.stopAndUnloadAsync.bind(recording);
  let attempts = 0;
  recording.stopAndUnloadAsync = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('native stop failed');
    return originalStop();
  };

  await act(async () => {
    const first = await claimBibleNarration();
    await assert.rejects(first.ready, /native stop failed/);
  });
  assert.equal(attempts, 1);
  await act(async () => {
    const retry = await claimBibleNarration();
    await retry.ready;
  });
  await view.flush();
  assert.equal(attempts, 2);
  assert.ok(view.getByRole('button', { name: t('bible.chapterFeedbackAudioPreview') }));
  await view.unmount();
});

test('an Expo stop error after recorder cleanup does not trap all future narration', async () => {
  const view = await renderComposer();
  await view.press(recordButton(view));
  await view.flush();
  const recording = feedbackAv.recordings[0];
  let released = false;
  recording.stopAndUnloadAsync = async () => {
    feedbackAv.log.push('recording1.stopAndUnload');
    released = true;
    throw new Error('E_AUDIO_NODATA');
  };
  recording.getStatusAsync = async () => ({
    durationMillis: 0,
    canRecord: !released,
    isDoneRecording: released,
  });

  await act(async () => {
    const bible = await claimBibleNarration();
    await bible.ready;
  });
  await view.flush();
  assert.ok(view.getByText(t('bible.chapterFeedbackAudioStopError')));
  assert.equal(
    view.queryByRole('button', { name: t('bible.chapterFeedbackAudioPreview') }),
    null,
    'an invalid empty recording is not saved as a draft'
  );
  await view.press(recordButton(view));
  await view.flush();
  assert.equal(
    feedbackAv.recordings.length,
    2,
    'a fresh recording is allowed after confirmed unload'
  );
  await view.unmount();
});

/** Opens the real modal composer from the reader's chapter actions. */
async function renderModalComposer() {
  harness.authStore.getState().setPreferences({
    chapterFeedbackEnabled: true,
    chapterFeedbackName: 'Ruth',
    chapterFeedbackRole: 'Reviewer',
  });
  const view = await renderReader({ preferredMode: 'read' });
  await reopenModalComposer(view);
  await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackThumbsUp') }));
  return view;
}

async function reopenModalComposer(view: View) {
  await view.press(view.getByRole('button', { name: t('bible.chapterOptions') }));
  // The reader also has an entry outside the actions sheet; choose the modal row.
  const actions = view.queryAllByType('Modal')[0];
  assert.ok(actions);
  const { within } = await import('../../testing/render');
  await view.press(within(actions).getByRole('button', { name: t('bible.chapterFeedback') }));
  assert.ok(view.getByRole('button', { name: t('common.cancel') }));
}

for (const operation of ['requestPermissionsAsync', 'Recording.createAsync'] as const) {
  test(`closing the feedback modal abandons pending ${operation}, then recording works on reopen`, async () => {
    const view = await renderModalComposer();
    const readerTimers = intervals.liveCount;
    feedbackAv.hold(operation);
    await view.press(recordButton(view));
    await view.flush();
    assert.equal(feedbackAv.waiting(operation), 1);
    await view.press(view.getByRole('button', { name: t('common.cancel') }));
    assert.equal(view.queryByRole('button', { name: t('common.cancel') }), null);
    await feedbackAv.release(operation);
    await view.flush();
    if (operation === 'requestPermissionsAsync') {
      assert.equal(feedbackAv.log.includes('Recording.createAsync'), false);
    } else {
      assert.ok(feedbackAv.log.includes('recording1.stopAndUnload'));
    }
    assert.equal(intervals.liveCount, readerTimers, 'no hidden recorder timer survives');
    await reopenModalComposer(view);
    await view.press(recordButton(view));
    await view.flush();
    assert.equal(feedbackAv.waiting(operation), 1);
    await feedbackAv.release(operation);
    await view.flush();
    assert.ok(view.getByRole('button', { name: t('bible.chapterFeedbackAudioStop') }));
    await view.unmount();
    await act(async () => {});
    assert.equal(intervals.liveCount, 0);
  });
}

test('closing the feedback modal stops its microphone and preserves the completed draft', async () => {
  const view = await renderModalComposer();
  const readerTimers = intervals.liveCount;
  await view.press(recordButton(view));
  await view.flush();
  assert.equal(feedbackAv.recordings.length, 1);
  await view.press(view.getByRole('button', { name: t('common.cancel') }));
  await view.flush();
  assert.ok(feedbackAv.log.includes('recording1.stopAndUnload'));
  assert.equal(intervals.liveCount, readerTimers, 'only the mounted reader timers remain');
  await reopenModalComposer(view);
  assert.ok(view.getByRole('button', { name: t('bible.chapterFeedbackAudioPreview') }));
  assert.equal(
    view.getByRole('button', { name: t('bible.chapterFeedbackThumbsUp') }).props.accessibilityState
      .selected,
    true
  );
  await view.unmount();
});

for (const pending of [true, false]) {
  test(`closing the feedback modal releases ${pending ? 'pending' : 'playing'} preview without discarding the voice draft`, async () => {
    const view = await renderModalComposer();
    const preview = await recordDraft(view);
    if (pending) feedbackAv.hold('Sound.createAsync');
    await view.press(preview);
    await view.flush();
    await view.press(view.getByRole('button', { name: t('common.cancel') }));
    if (pending) await feedbackAv.release('Sound.createAsync');
    await view.flush();
    assert.ok(feedbackAv.log.includes('sound1.unload'));
    if (pending) assert.equal(feedbackAv.log.includes('sound1.play'), false);
    await reopenModalComposer(view);
    assert.ok(view.getByRole('button', { name: t('bible.chapterFeedbackAudioPreview') }));
    await view.unmount();
  });
}

test('closing feedback unloads the recorder without depending on a separate status read', async (context) => {
  context.mock.timers.enable({ apis: ['setInterval'] });
  let now = 1_000;
  context.mock.method(Date, 'now', () => now);
  const view = await renderModalComposer();
  await view.press(recordButton(view));
  await view.flush();
  now = 5_000;
  await act(async () => context.mock.timers.tick(500));
  const statusRead = context.mock.method(feedbackAv.recordings[0], 'getStatusAsync', async () => {
    throw new Error('native status unavailable');
  });
  await view.press(view.getByRole('button', { name: t('common.cancel') }));
  await view.flush();
  assert.ok(
    feedbackAv.log.includes('recording1.stopAndUnload'),
    'status failure cannot skip microphone teardown'
  );
  assert.equal(statusRead.mock.callCount(), 0, 'native stop supplies the final status');
  await reopenModalComposer(view);
  assert.ok(
    view.getByRole('button', { name: t('bible.chapterFeedbackAudioPreview') }),
    'successfully stopped voice note remains usable'
  );
  assert.ok(
    view.getByText(t('bible.chapterFeedbackAudioReady', { duration: '0:04' })),
    'duration falls back to the elapsed timer'
  );
  await view.unmount();
});

test('a real stop failure stays visible even when the preceding status read fails', async () => {
  const view = await renderModalComposer();
  await view.press(recordButton(view));
  await view.flush();
  feedbackAv.recordings[0].getStatusAsync = async () => {
    throw new Error('status unavailable');
  };
  feedbackAv.recordings[0].stopAndUnloadAsync = async () => {
    feedbackAv.log.push('recording1.stopAndUnload');
    throw new Error('native stop failed');
  };
  await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioStop') }));
  await view.flush();
  assert.ok(feedbackAv.log.includes('recording1.stopAndUnload'));
  assert.ok(view.getByText(t('bible.chapterFeedbackAudioStopError')));
  assert.equal(view.queryByRole('button', { name: t('bible.chapterFeedbackAudioPreview') }), null);
  await view.unmount();
});
test('reopening keeps recording controls until the old native stop finalizes', async () => {
  const view = await renderModalComposer();
  let finishStop: () => void = () => {};
  try {
    await view.press(recordButton(view));
    await view.flush();
    feedbackAv.recordings[0].stopAndUnloadAsync = async () => {
      feedbackAv.log.push('recording1.stop.pending');
      await new Promise<void>((resolve) => {
        finishStop = resolve;
      });
      feedbackAv.log.push('recording1.stopAndUnload');
      return { durationMillis: 4_000 };
    };
    await view.press(view.getByRole('button', { name: t('common.cancel') }));
    await view.flush();
    assert.ok(feedbackAv.log.includes('recording1.stop.pending'));
    await reopenModalComposer(view);
    assert.equal(view.queryByRole('button', { name: t('bible.chapterFeedbackAudioRecord') }), null);
    await view.flush();
    assert.equal(
      feedbackAv.log.filter((call) => call === 'Recording.createAsync').length,
      1,
      'Expo AV supports one native recorder; the new start must wait for the old stop'
    );
    await act(async () => finishStop());
    await view.flush();
    await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioRerecord') }));
    await view.press(recordButton(view));
    await view.flush();
    assert.equal(feedbackAv.recordings.length, 2);
    assert.ok(view.getByRole('button', { name: t('bible.chapterFeedbackAudioStop') }));
  } finally {
    finishStop();
    await view.unmount();
    await act(async () => {});
  }
});

test('closing again during native stop preserves the finished draft for a fresh recording', async () => {
  const view = await renderModalComposer();
  await view.press(recordButton(view));
  await view.flush();
  let finishStop: () => void = () => {};
  feedbackAv.recordings[0].stopAndUnloadAsync = () =>
    new Promise<{ durationMillis: number }>((resolve) => {
      finishStop = () => resolve({ durationMillis: 4_000 });
    });
  await view.press(view.getByRole('button', { name: t('common.cancel') }));
  await view.flush();
  await reopenModalComposer(view);
  assert.equal(view.queryByRole('button', { name: t('bible.chapterFeedbackAudioRecord') }), null);
  await view.press(view.getByRole('button', { name: t('common.cancel') }));
  await act(async () => finishStop());
  await view.flush();
  assert.equal(
    feedbackAv.recordings.length,
    1,
    'reopening cannot create another recorder while native stop is pending'
  );
  await reopenModalComposer(view);
  await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioRerecord') }));
  await view.press(recordButton(view));
  await view.flush();
  assert.equal(feedbackAv.recordings.length, 2, 'discard and a later fresh start still work');
  await view.unmount();
});

test('a fresh recording waits for old playback-mode restoration and owns the next draft', async (context) => {
  const { Audio } = await import('expo-av');
  let holdRestore = false;
  let finishRestore: () => void = () => {};
  const modes: boolean[] = [];
  context.mock.method(
    Audio,
    'setAudioModeAsync',
    async (mode: { allowsRecordingIOS?: boolean }) => {
      modes.push(Boolean(mode.allowsRecordingIOS));
      if (holdRestore && mode.allowsRecordingIOS === false) {
        await new Promise<void>((resolve) => {
          finishRestore = resolve;
        });
      }
    }
  );
  const view = await renderModalComposer();
  await view.press(recordButton(view));
  await view.flush();
  holdRestore = true;
  await view.press(view.getByRole('button', { name: t('common.cancel') }));
  await view.flush();
  assert.ok(feedbackAv.log.includes('recording1.stopAndUnload'));
  await reopenModalComposer(view);
  await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioRerecord') }));
  await view.press(recordButton(view));
  await view.flush();
  assert.equal(feedbackAv.recordings.length, 1, 'old audio-mode completion must drain too');
  holdRestore = false;
  await act(async () => finishRestore());
  await view.flush();
  assert.equal(feedbackAv.recordings.length, 2);
  assert.equal(modes.at(-1), true, 'recording mode is established after the old playback mode');
  await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioStop') }));
  await view.flush();
  const { ChapterFeedbackModal } = await import('./reader/ChapterFeedbackModal');
  const feedback = view.root.findByType(ChapterFeedbackModal).props.feedback;
  assert.equal(feedback.feedbackAudioDraft.uri, 'file:///feedback-2.m4a');
  await view.unmount();
});

test('the finalized native stop status supplies the voice note duration', async () => {
  const view = await renderModalComposer();
  await view.press(recordButton(view));
  await view.flush();
  feedbackAv.recordings[0].stopAndUnloadAsync = async () => {
    feedbackAv.log.push('recording1.stopAndUnload');
    return { durationMillis: 6_100 };
  };
  await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioStop') }));
  await view.flush();
  assert.ok(view.getByText(t('bible.chapterFeedbackAudioReady', { duration: '0:06' })));
  await view.unmount();
});

for (const [composer, render] of [
  ['modal', renderModalComposer],
  ['inline', renderComposer],
] as const) {
  test(`${composer} Send cannot discard a voice note still preparing`, async () => {
    const view = await render();
    feedbackAv.hold('Recording.createAsync');
    try {
      await view.press(recordButton(view));
      await view.flush();
      assert.equal(feedbackAv.waiting('Recording.createAsync'), 1);
      await view.press(view.getByText(t('bible.chapterFeedbackSubmit')));
      assert.equal(reader.feedbackSubmissions.length, 0, 'Send must wait for recorder setup');
      await feedbackAv.release('Recording.createAsync');
      await view.flush();
      await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioStop') }));
      await view.flush();
      await view.press(view.getByText(t('bible.chapterFeedbackSubmit')));
      await view.flush();
      assert.equal(reader.feedbackSubmissions.length, 1);
      assert.equal(reader.feedbackAudioUploads.length, 1, 'the completed draft is attached');
    } finally {
      if (feedbackAv.waiting('Recording.createAsync')) {
        await feedbackAv.release('Recording.createAsync');
      }
      await view.unmount();
      await act(async () => {});
    }
  });

  test(`${composer} failed recording setup re-enables written feedback submission`, async (context) => {
    const { Audio } = await import('expo-av');
    context.mock.method(Audio, 'requestPermissionsAsync', async () => {
      throw new Error('permission request failed');
    });
    const view = await render();
    try {
      await view.press(recordButton(view));
      await view.flush();
      await view.press(view.getByText(t('bible.chapterFeedbackSubmit')));
      await view.flush();
      assert.equal(reader.feedbackSubmissions.length, 1);
      assert.equal(reader.feedbackAudioUploads.length, 0);
    } finally {
      await view.unmount();
    }
  });

  test(`${composer} Send waits until native stop has finalized the voice note`, async () => {
    const attachment = {
      bucket: 'chapter-feedback-audio' as const,
      path: 'feedback/voice.m4a',
      durationMs: 4_000,
      mimeType: 'audio/m4a',
      sizeBytes: 512,
      createdAt: '2026-09-28T00:00:00Z',
    };
    reader.feedbackAudioUploadOutcome.result = { success: true, data: attachment };
    const view = await render();
    let finishStop: () => void = () => {};
    try {
      await view.press(recordButton(view));
      await view.flush();
      feedbackAv.recordings[0].stopAndUnloadAsync = async () => {
        await new Promise<void>((resolve) => {
          finishStop = resolve;
        });
        return { durationMillis: 4_000 };
      };
      await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioStop') }));
      await view.flush();
      await view.press(view.getByText(t('bible.chapterFeedbackSubmit')));
      assert.equal(
        reader.feedbackSubmissions.length,
        0,
        'Send cannot omit a voice note still being finalized'
      );
      await act(async () => finishStop());
      await view.flush();
      assert.ok(view.getByRole('button', { name: t('bible.chapterFeedbackAudioPreview') }));
      await view.press(view.getByText(t('bible.chapterFeedbackSubmit')));
      await view.flush();
      assert.equal(
        reader.feedbackSubmissions.length,
        1,
        'the finalized voice note can be sent normally'
      );
      assert.deepEqual(reader.feedbackAudioUploads, [
        {
          uri: 'file:///feedback-1.m4a',
          durationMs: 4_000,
          mimeType: 'audio/m4a',
        },
      ]);
      assert.deepEqual(reader.feedbackSubmissions[0].audioResponse, attachment);
      if (composer === 'modal') await reopenModalComposer(view);
      await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackThumbsUp') }));
      assert.equal(
        view.queryByRole('button', { name: t('bible.chapterFeedbackAudioPreview') }),
        null,
        'successful submission clears the completed voice draft'
      );
    } finally {
      finishStop();
      await view.unmount();
      await act(async () => {});
    }
  });
}

for (const operation of ['requestPermissionsAsync', 'Recording.createAsync'] as const) {
  test(`canceling pending ${operation} re-enables written feedback without an abandoned voice note`, async () => {
    const view = await renderModalComposer();
    feedbackAv.hold(operation);
    try {
      await view.press(recordButton(view));
      await view.flush();
      assert.equal(feedbackAv.waiting(operation), 1);
      await view.press(view.getByRole('button', { name: t('common.cancel') }));
      await feedbackAv.release(operation);
      await view.flush();
      await reopenModalComposer(view);
      await view.press(view.getByText(t('bible.chapterFeedbackSubmit')));
      await view.flush();
      assert.equal(reader.feedbackSubmissions.length, 1);
      assert.equal(reader.feedbackAudioUploads.length, 0);
    } finally {
      if (feedbackAv.waiting(operation)) await feedbackAv.release(operation);
      await view.unmount();
      await act(async () => {});
    }
  });
}

test('closing abandons a fresh start waiting for old playback-mode restoration', async (context) => {
  const { Audio } = await import('expo-av');
  let holdRestore = false;
  let finishRestore: () => void = () => {};
  context.mock.method(
    Audio,
    'setAudioModeAsync',
    async (mode: { allowsRecordingIOS?: boolean }) => {
      if (holdRestore && mode.allowsRecordingIOS === false) {
        await new Promise<void>((resolve) => {
          finishRestore = resolve;
        });
      }
    }
  );
  const view = await renderModalComposer();
  try {
    await view.press(recordButton(view));
    await view.flush();
    holdRestore = true;
    await view.press(view.getByRole('button', { name: t('common.cancel') }));
    await view.flush();
    await reopenModalComposer(view);
    await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioRerecord') }));
    await view.press(recordButton(view));
    await view.flush();
    await view.press(view.getByRole('button', { name: t('common.cancel') }));
    holdRestore = false;
    await act(async () => finishRestore());
    await view.flush();
    assert.equal(feedbackAv.recordings.length, 1, 'closing invalidates the queued fresh start');
    await reopenModalComposer(view);
    await view.press(recordButton(view));
    await view.flush();
    assert.equal(feedbackAv.recordings.length, 2, 'a later current start still works');
  } finally {
    holdRestore = false;
    finishRestore();
    await view.unmount();
    await act(async () => {});
  }
});
