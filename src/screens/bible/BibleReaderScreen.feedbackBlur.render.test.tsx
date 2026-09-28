import test, { after, afterEach, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { act } from 'react-test-renderer';
import { installReaderRenderFixture } from './BibleReaderScreen.renderFixture';
import { mockModule, mockPackage } from '../../testing/mockModules';
import { createReactNavigationFake } from '../../testing/nativePackageFakes';
import { installIntervalLeakGuard } from '../../testing/reactHookRuntime';

// The default render fixture always treats a screen as focused. Run the installed
// focus hook against real fixture events so blur cleanup is tested without unmount.
const reader = installReaderRenderFixture(mock, { skip: ['@react-navigation/native'] });
const { harness, t, feedbackAv } = reader;
const intervals = installIntervalLeakGuard();
after(() => intervals.restore());
type View = Awaited<ReturnType<typeof reader.renderReader>>;
let focused = true;
harness.navigation.navigation.isFocused = () => focused;
const navigationDirectory = dirname(
  createRequire(import.meta.url).resolve('@react-navigation/core')
);
mockModule(mock, join(navigationDirectory, 'useNavigation.js'), {
  useNavigation: () => harness.navigation.navigation,
});
before(async () => {
  const { useFocusEffect } = (await import(join(navigationDirectory, 'useFocusEffect.js'))) as {
    useFocusEffect: typeof import('@react-navigation/native').useFocusEffect;
  };
  mockPackage(mock, '@react-navigation/native', {
    ...createReactNavigationFake(harness.navigation),
    useFocusEffect,
  });
});
afterEach(async () => {
  focused = true;
  const { resetNarrationOwnership } = await import('../../services/audio/narrationOwnership');
  resetNarrationOwnership();
});

async function composer() {
  harness.authStore.getState().setPreferences({
    chapterFeedbackEnabled: true,
    chapterFeedbackName: 'Ruth',
    chapterFeedbackRole: 'Reviewer',
  });
  reader.chapters.set('JHN:3', []);
  const view = await reader.renderReader();
  await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackThumbsUp') }));
  return view;
}
async function record(view: View) {
  await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioRecord') }));
  await view.flush();
}
async function draft(view: View) {
  await record(view);
  await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioStop') }));
  await view.flush();
}
async function blur() {
  const { useReaderPlayerBarStore } = await import('../../stores/readerPlayerBarStore');
  assert.ok(useReaderPlayerBarStore.getState().ownerKey, 'focus published the reader controls');
  await act(async () => {
    focused = false;
    harness.navigation.emit('blur', {});
  });
  assert.equal(
    useReaderPlayerBarStore.getState().ownerKey,
    null,
    'actual reader focus cleanup ran'
  );
}
async function refocus() {
  await act(async () => {
    focused = true;
    harness.navigation.emit('focus', {});
  });
}

test('retained reader blur releases its microphone and preserves the finalized draft on return', async () => {
  const view = await composer();
  try {
    await record(view);
    const recording = feedbackAv.recordings[0];
    assert.ok(recording);
    await view.changeText(
      view.getByLabelText(t('bible.chapterFeedbackPlaceholder')),
      'My voice note'
    );
    assert.equal(
      feedbackAv.log.includes('recording1.stopAndUnload'),
      false,
      'ordinary renders keep Record active'
    );
    await blur();
    await view.flush();
    assert.equal(
      (await recording.getStatusAsync()).canRecord,
      false,
      'blur releases mic without unmount'
    );
    await refocus();
    assert.ok(view.getByRole('button', { name: t('bible.chapterFeedbackAudioPreview') }));
    assert.equal(
      view.getByLabelText(t('bible.chapterFeedbackPlaceholder')).props.value,
      'My voice note'
    );
    assert.equal(view.queryByRole('button', { name: t('bible.chapterFeedbackAudioStop') }), null);
  } finally {
    await view.unmount();
    await act(async () => {});
  }
});

test('retained reader blur unloads preview and returning requires another explicit Preview', async () => {
  const view = await composer();
  try {
    await draft(view);
    await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioPreview') }));
    await view.flush();
    assert.ok(feedbackAv.log.includes('sound1.play'));
    await blur();
    await view.flush();
    assert.ok(feedbackAv.log.includes('sound1.unload'), 'blur releases preview without unmount');
    await refocus();
    assert.equal(
      feedbackAv.sounds.length,
      1,
      'refocus does not automatically start voice playback'
    );
    await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioPreview') }));
    await view.flush();
    assert.ok(feedbackAv.log.includes('sound2.play'));
  } finally {
    await view.unmount();
  }
});

for (const operation of [
  'requestPermissionsAsync',
  'Recording.createAsync',
  'Recording.startAsync',
] as const) {
  test(`retained blur abandons pending ${operation} and explicit Record works after return`, async () => {
    const view = await composer();
    const readerTimers = intervals.liveCount;
    feedbackAv.hold(operation);
    try {
      await record(view);
      assert.equal(feedbackAv.waiting(operation), 1);
      await blur();
      await feedbackAv.release(operation);
      await view.flush();
      assert.equal(view.queryByRole('button', { name: t('bible.chapterFeedbackAudioStop') }), null);
      assert.equal(
        view.queryByRole('button', { name: t('bible.chapterFeedbackAudioPreview') }),
        null
      );
      assert.equal(intervals.liveCount, readerTimers, 'no abandoned voice recording timer');
      if (operation === 'requestPermissionsAsync') assert.equal(feedbackAv.recordings.length, 0);
      else {
        const recording = feedbackAv.recordings[0];
        assert.ok(recording);
        assert.equal((await recording.getStatusAsync()).canRecord, false);
      }
      await refocus();
      await record(view);
      assert.equal(feedbackAv.waiting(operation), 1);
      await feedbackAv.release(operation);
      await view.flush();
      assert.ok(view.getByRole('button', { name: t('bible.chapterFeedbackAudioStop') }));
    } finally {
      if (feedbackAv.waiting(operation)) await feedbackAv.release(operation);
      await view.unmount();
      await act(async () => {});
    }
  });
}

test('retained blur releases a preview that finishes loading later without discarding its draft', async () => {
  const view = await composer();
  try {
    await draft(view);
    feedbackAv.hold('Sound.createAsync');
    await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioPreview') }));
    assert.equal(feedbackAv.waiting('Sound.createAsync'), 1);
    await blur();
    await feedbackAv.release('Sound.createAsync');
    await view.flush();
    assert.equal(feedbackAv.log.includes('sound1.play'), false);
    assert.ok(feedbackAv.log.includes('sound1.unload'));
    await refocus();
    assert.ok(view.getByRole('button', { name: t('bible.chapterFeedbackAudioPreview') }));
  } finally {
    if (feedbackAv.waiting('Sound.createAsync')) await feedbackAv.release('Sound.createAsync');
    await view.unmount();
  }
});

test('retained blur allows an already stopping recording to finalize its same-context draft', async () => {
  const view = await composer();
  let finishStop = () => {};
  try {
    await record(view);
    const recording = feedbackAv.recordings[0];
    assert.ok(recording);
    const original = recording.stopAndUnloadAsync.bind(recording);
    recording.stopAndUnloadAsync = async () => {
      await new Promise<void>((resolve) => {
        finishStop = resolve;
      });
      return original();
    };
    await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioStop') }));
    await blur();
    await act(async () => finishStop());
    await view.flush();
    await refocus();
    assert.ok(view.getByRole('button', { name: t('bible.chapterFeedbackAudioPreview') }));
    assert.equal((await recording.getStatusAsync()).canRecord, false);
  } finally {
    finishStop();
    await view.unmount();
  }
});

test('a native stop failure on blur keeps cleanup retryable for explicit Record after return', async () => {
  const view = await composer();
  try {
    await record(view);
    const recording = feedbackAv.recordings[0];
    assert.ok(recording);
    const original = recording.stopAndUnloadAsync.bind(recording);
    let attempts = 0;
    recording.stopAndUnloadAsync = async () => {
      if (++attempts === 1) throw new Error('native stop temporarily failed');
      return original();
    };
    await blur();
    await view.flush();
    assert.equal(attempts, 1);
    await refocus();
    await record(view);
    assert.equal(attempts, 2, 'retry releases the old resource before starting anew');
    assert.equal(feedbackAv.recordings.length, 2);
    assert.ok(view.getByRole('button', { name: t('bible.chapterFeedbackAudioStop') }));
  } finally {
    await view.unmount();
  }
});
