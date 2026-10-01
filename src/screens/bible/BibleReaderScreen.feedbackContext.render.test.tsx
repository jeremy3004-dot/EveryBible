import test, { after, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { installIntervalLeakGuard } from '../../testing/reactHookRuntime';
import { within } from '../../testing/render';
import { installReaderRenderFixture, verseOf } from './BibleReaderScreen.renderFixture';

const reader = installReaderRenderFixture(mock);
const { t, harness, feedbackAv } = reader;
const intervals = installIntervalLeakGuard();
after(() => intervals.restore());
afterEach(async () => {
  const { resetNarrationOwnership } = await import('../../services/audio/narrationOwnership');
  resetNarrationOwnership();
});
type View = Awaited<ReturnType<typeof reader.renderReader>>;

async function open(view: View) {
  await view.press(view.getByRole('button', { name: t('bible.chapterOptions') }));
  const actions = view.queryAllByType('Modal')[0];
  assert.ok(actions);
  await view.press(within(actions).getByRole('button', { name: t('bible.chapterFeedback') }));
}

async function composer() {
  harness.authStore.setState({ user: { uid: 'A' }, authGeneration: 1 });
  harness.authStore.getState().setPreferences({
    chapterFeedbackEnabled: true,
    chapterFeedbackName: 'Alice',
    chapterFeedbackRole: 'Reader',
  });
  reader.chapters.set('JHN:4', [verseOf(1, 'Chapter four', {}, 'JHN', 4)]);
  reader.chapters.set('GEN:1', [verseOf(1, 'Genesis one', {}, 'GEN', 1)]);
  const view = await reader.renderReader({ preferredMode: 'read' });
  await open(view);
  await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackThumbsDown') }));
  await view.changeText(
    view.getByLabelText(t('bible.chapterFeedbackPlaceholder')),
    'Private John three concern'
  );
  return view;
}

async function record(view: View) {
  await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioRecord') }));
  await view.flush();
}

function assertEmpty(view: View) {
  assert.equal(view.getByLabelText(t('bible.chapterFeedbackPlaceholder')).props.value, '');
  assert.equal(view.queryByRole('button', { name: t('bible.chapterFeedbackAudioPreview') }), null);
  assert.equal(view.queryByRole('button', { name: t('bible.chapterFeedbackAudioStop') }), null);
  assert.equal(
    view.getByRole('button', { name: t('bible.chapterFeedbackThumbsDown') }).props
      .accessibilityState.selected,
    false
  );
}

async function changeContext(
  view: View,
  kind: 'chapter' | 'account' | 'generation' | 'book' | 'translation'
) {
  if (kind === 'chapter' || kind === 'book') {
    await reader.navigateReader(view, {
      bookId: kind === 'book' ? 'GEN' : 'JHN',
      chapter: kind === 'book' ? 1 : 4,
    });
  } else {
    await act(async () => {
      if (kind === 'translation') {
        const translation = reader.bibleStore.getState().translations[0];
        assert.ok(translation);
        reader.bibleStore.setState({
          currentTranslation: 'web',
          translations: [translation, { ...translation, id: 'web', name: 'World English Bible' }],
        });
      } else
        harness.authStore.setState({
          user: { uid: kind === 'account' ? 'B' : 'A' },
          authGeneration: 2,
        });
    });
    await view.flush();
  }
  if (!view.queryByRole('button', { name: t('common.cancel') })) await open(view);
}

test('actual Next cannot attribute a closed John3 text and voice draft to John4', async () => {
  const view = await composer();
  try {
    await record(view);
    await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioStop') }));
    await view.flush();
    await view.press(view.getByRole('button', { name: t('common.cancel') }));
    await view.press(view.getByRole('button', { name: t('audio.nextChapter') }));
    const params = reader.setParamsCalls().at(-1);
    assert.ok(params);
    await reader.navigateReader(view, params);
    await open(view);
    assertEmpty(view);
    await view.press(view.getByText(t('bible.chapterFeedbackSubmit')));
    assert.equal(reader.feedbackSubmissions.length, 0);
    await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackThumbsUp') }));
    await view.changeText(
      view.getByLabelText(t('bible.chapterFeedbackPlaceholder')),
      'Chapter four'
    );
    await view.press(view.getByText(t('bible.chapterFeedbackSubmit')));
    await view.flush();
    assert.equal(reader.feedbackSubmissions[0]?.chapter, 4);
    assert.equal(reader.feedbackSubmissions[0]?.comment, 'Chapter four');
    assert.equal(reader.feedbackAudioUploads.length, 0);
  } finally {
    await view.unmount();
  }
});

for (const kind of ['account', 'generation', 'book', 'translation'] as const) {
  test(`${kind} replacement clears the prior contributor's completed draft`, async () => {
    const view = await composer();
    try {
      await record(view);
      await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioStop') }));
      await view.flush();
      await changeContext(view, kind);
      assertEmpty(view);
    } finally {
      await view.unmount();
    }
  });
}

for (const kind of ['chapter', 'account'] as const) {
  test(`${kind} replacement does not expose an outgoing active recorder's stop failure`, async () => {
    const view = await composer();
    try {
      await record(view);
      const recording = feedbackAv.recordings[0];
      assert.ok(recording);
      const original = recording.stopAndUnloadAsync.bind(recording);
      let attempts = 0;
      recording.stopAndUnloadAsync = async () => {
        if (++attempts === 1) throw new Error('outgoing recorder could not stop');
        return original();
      };
      await changeContext(view, kind);
      await view.flush();
      assert.equal(attempts, 1, 'context replacement attempts native recorder release');
      assertEmpty(view);
      await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackThumbsDown') }));
      assert.equal(view.queryByText(t('bible.chapterFeedbackAudioStopError')), null);
      await record(view);
      assert.ok(view.getByRole('button', { name: t('bible.chapterFeedbackAudioStop') }));
    } finally {
      await view.unmount();
    }
  });

  for (const operation of [
    'requestPermissionsAsync',
    'Recording.createAsync',
    'Recording.startAsync',
  ] as const) {
    test(`${kind} replacement abandons pending ${operation} without restoring a draft or timer`, async () => {
      const view = await composer();
      const readerTimers = intervals.liveCount;
      feedbackAv.hold(operation);
      try {
        await record(view);
        assert.equal(feedbackAv.waiting(operation), 1);
        await changeContext(view, kind);
        assertEmpty(view);
        await feedbackAv.release(operation);
        await view.flush();
        assertEmpty(view);
        assert.equal(intervals.liveCount, readerTimers);
        assert.equal(
          feedbackAv.log.includes('Recording.startAsync'),
          operation === 'Recording.startAsync'
        );
        if (operation !== 'requestPermissionsAsync')
          assert.ok(feedbackAv.log.includes('recording1.stopAndUnload'));
      } finally {
        if (feedbackAv.waiting(operation)) await feedbackAv.release(operation);
        await view.unmount();
      }
    });
  }

  for (const failed of [false, true]) {
    test(`${kind} replacement suppresses an old ${failed ? 'failed' : 'successful'} native Stop completion`, async () => {
      const view = await composer();
      let finishStop = () => {};
      try {
        await record(view);
        const recording = feedbackAv.recordings[0];
        assert.ok(recording);
        const original = recording.stopAndUnloadAsync.bind(recording);
        let attempt = 0;
        recording.stopAndUnloadAsync = async () => {
          if (++attempt === 1) {
            await new Promise<void>((resolve) => {
              finishStop = resolve;
            });
            if (failed) throw new Error('old native stop failed');
          }
          return original();
        };
        await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioStop') }));
        await view.flush();
        await changeContext(view, kind);
        assertEmpty(view);
        await act(async () => finishStop());
        await view.flush();
        assertEmpty(view);
        assert.equal(view.queryByText(t('bible.chapterFeedbackAudioStopError')), null);
        // A current explicit Record can retry any native resource still retained.
        await record(view);
        assert.ok(view.getByRole('button', { name: t('bible.chapterFeedbackAudioStop') }));
      } finally {
        finishStop();
        await view.unmount();
      }
    });
  }
}

test('same-context close/reopen and submit retry retain the intended contributor draft', async () => {
  const view = await composer();
  try {
    await record(view);
    await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioStop') }));
    await view.flush();
    await view.press(view.getByRole('button', { name: t('common.cancel') }));
    await open(view);
    assert.equal(
      view.getByLabelText(t('bible.chapterFeedbackPlaceholder')).props.value,
      'Private John three concern'
    );
    assert.ok(view.getByRole('button', { name: t('bible.chapterFeedbackAudioPreview') }));
    reader.feedbackOutcome.result = { success: false };
    await view.press(view.getByText(t('bible.chapterFeedbackSubmit')));
    await view.flush();
    assert.ok(view.getByRole('button', { name: t('bible.chapterFeedbackAudioPreview') }));
    assert.equal(
      view.getByLabelText(t('bible.chapterFeedbackPlaceholder')).props.value,
      'Private John three concern'
    );
  } finally {
    await view.unmount();
  }
});

test('returning to John3 cannot resurrect a draft or pending start from the earlier visit', async () => {
  const view = await composer();
  feedbackAv.hold('Recording.createAsync');
  try {
    await record(view);
    await changeContext(view, 'chapter');
    await reader.navigateReader(view, { bookId: 'JHN', chapter: 3 });
    if (!view.queryByRole('button', { name: t('common.cancel') })) await open(view);
    await feedbackAv.release('Recording.createAsync');
    await view.flush();
    assertEmpty(view);
  } finally {
    if (feedbackAv.waiting('Recording.createAsync'))
      await feedbackAv.release('Recording.createAsync');
    await view.unmount();
  }
});

test('account replacement releases a pending preview without playing the prior private voice note', async () => {
  const view = await composer();
  try {
    await record(view);
    await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioStop') }));
    await view.flush();
    feedbackAv.hold('Sound.createAsync');
    await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackAudioPreview') }));
    assert.equal(feedbackAv.waiting('Sound.createAsync'), 1);
    await changeContext(view, 'account');
    assertEmpty(view);
    await feedbackAv.release('Sound.createAsync');
    await view.flush();
    assert.equal(feedbackAv.log.includes('sound1.play'), false);
    assert.ok(feedbackAv.log.includes('sound1.unload'));
    assertEmpty(view);
  } finally {
    if (feedbackAv.waiting('Sound.createAsync')) await feedbackAv.release('Sound.createAsync');
    await view.unmount();
  }
});

test('an obsolete native Start rejection cannot publish an error after chapter replacement', async (context) => {
  const { Audio } = await import('expo-av');
  let finishStart = () => {};
  context.mock.method(Audio.Recording.prototype, 'startAsync', async () => {
    await new Promise<void>((resolve) => {
      finishStart = resolve;
    });
    throw new Error('old native start failed');
  });
  const view = await composer();
  try {
    await record(view);
    assert.equal(feedbackAv.recordings.length, 1);
    await changeContext(view, 'chapter');
    await act(async () => finishStart());
    await view.flush();
    assertEmpty(view);
    await view.press(view.getByRole('button', { name: t('bible.chapterFeedbackThumbsDown') }));
    assert.equal(view.queryByText(t('bible.chapterFeedbackAudioStartError')), null);
    assert.ok(feedbackAv.log.includes('recording1.stopAndUnload'));
  } finally {
    finishStart();
    await view.unmount();
  }
});
