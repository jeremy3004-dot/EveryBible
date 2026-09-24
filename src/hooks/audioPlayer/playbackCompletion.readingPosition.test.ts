/**
 * Audio moves on by itself while the reader is closed. The saved reading position (the
 * Bible tab resume, Home "Continue reading") and a plan day's resume point are written by
 * a mounted reader only, so without help they stay on the chapter the listener left and
 * the Bible tab reopens a chapter that is no longer playing.
 *
 * Runs the real finish handler against the real Bible, audio and reading-plan stores,
 * with no reader mounted.
 */
import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage, mockModule, sourcePath } from '../../testing/mockModules';
import { installBibleStoreDoubles } from '../../stores/__tests__/bibleStoreDoubles';
import type { AudioPlayerSession, PlayChapterForTranslation } from './playerSession';

const mmkv = mockMmkvStorage(mock);
installBibleStoreDoubles(mock);

mockModule(mock, sourcePath('services/audio/index.ts'), {
  audioPlayer: { isLoaded: () => true },
  clearBibleNowPlaying: async () => {},
});
mockModule(mock, sourcePath('services/analytics/index.ts'), {
  trackAnonymousUsageEvent: () => {},
});
mockModule(mock, sourcePath('services/audio/audioChapterCoverage.ts'), {
  peekAudioChapterMap: () => undefined,
  resolveAudioChapterMap: async () => undefined,
});
mockModule(mock, sourcePath('stores/libraryStore.ts'), {
  useLibraryStore: { getState: () => ({ recordHistory: () => {} }) },
});
// Only listening is recorded; a reading-progress call would throw on this double.
const progressCalls: [string, string, number][] = [];
mockModule(mock, sourcePath('stores/progressStore.ts'), {
  useProgressStore: {
    getState: () => ({
      markChapterListened: (bookId: string, chapter: number) => {
        progressCalls.push(['listened', bookId, chapter]);
      },
      recordListeningTime: () => {},
    }),
  },
});

let finishChapterAndAdvance: (typeof import('./playbackCompletion'))['finishChapterAndAdvance'];
let followAutoAdvancedChapter: (typeof import('./readingPositionFollow'))['followAutoAdvancedChapter'];
let useAudioStore: (typeof import('../../stores/audioStore'))['useAudioStore'];
let useBibleStore: (typeof import('../../stores/bibleStore'))['useBibleStore'];
let readingPlansStore: (typeof import('../../stores/readingPlansStore'))['readingPlansStore'];
let getBibleTabResumeParams: (typeof import('../../navigation/tabNavigatorParts/tabNavigatorModel'))['getBibleTabResumeParams'];

before(async () => {
  ({ finishChapterAndAdvance } = await import('./playbackCompletion'));
  ({ followAutoAdvancedChapter } = await import('./readingPositionFollow'));
  ({ useAudioStore } = await import('../../stores/audioStore'));
  ({ useBibleStore } = await import('../../stores/bibleStore'));
  ({ readingPlansStore } = await import('../../stores/readingPlansStore'));
  ({ getBibleTabResumeParams } =
    await import('../../navigation/tabNavigatorParts/tabNavigatorModel'));
});

beforeEach(() => {
  mmkv.store.clear();
  useAudioStore.setState(useAudioStore.getInitialState(), true);
  useBibleStore.setState(useBibleStore.getInitialState(), true);
  readingPlansStore.setState(readingPlansStore.getInitialState(), true);
  progressCalls.length = 0;
});

/** The player a closed reader leaves behind: it plays whatever it is told to. */
function makeSession(): AudioPlayerSession {
  const playChapterForTranslation: PlayChapterForTranslation = async (
    translationId,
    bookId,
    chapter
  ) => {
    useAudioStore.getState().setCurrentTrack(translationId, bookId, chapter);
    useAudioStore.getState().setDuration(300_000);
    useAudioStore.getState().setStatus('playing');
  };
  return {
    playRequestId: 0,
    playbackErrorId: 0,
    lastPlaybackError: null,
    loadingPlayRequestId: null,
    isMounted: false,
    interpolationTimer: null,
    lastPollPosition: 0,
    lastPollTime: 0,
    lastNowPlayingSignature: null,
    pause: null,
    playChapterForTranslation,
  };
}

const session = makeSession();

async function finishPlaying(): Promise<void> {
  await finishChapterAndAdvance({
    session,
    fallbackTranslationId: 'bsb',
    resolveAudioCoverage: async () => undefined,
  });
}

/** The reader had opened this chapter (and so saved it) before the listener left it. */
function readerLeftOn(bookId: string, chapter: number): void {
  useBibleStore.getState().setCurrentBook(bookId);
  useBibleStore.getState().setCurrentChapter(chapter);
}

async function audioPlaying(bookId: string, chapter: number): Promise<void> {
  await session.playChapterForTranslation?.('bsb', bookId, chapter);
}

const savedPosition = () => {
  const { currentBook, currentChapter } = useBibleStore.getState();
  return { bookId: currentBook, chapter: currentChapter };
};

test('the saved reading position follows audio that auto-advances with the reader closed', async () => {
  readerLeftOn('GEN', 5);
  await audioPlaying('GEN', 5);

  await finishPlaying();
  await finishPlaying();

  assert.equal(useAudioStore.getState().currentChapter, 7);
  assert.deepEqual(savedPosition(), { bookId: 'GEN', chapter: 7 });

  // Tapping the Bible tab from the browser reopens the chapter that is playing.
  const state = useBibleStore.getState();
  const params = getBibleTabResumeParams(
    { state: { index: 0, routes: [{ name: 'BibleBrowser' }] } },
    {
      hasReaderHistory: state.hasReaderHistory,
      currentBibleBook: state.currentBook,
      currentBibleChapter: state.currentChapter,
      preferredBibleMode: state.preferredChapterLaunchMode,
    }
  );
  assert.equal(params?.bookId, 'GEN');
  assert.equal(params?.chapter, 7);
});

test('the saved reading position follows audio across a book boundary', async () => {
  readerLeftOn('GEN', 50);
  await audioPlaying('GEN', 50);

  await finishPlaying();

  assert.deepEqual(savedPosition(), { bookId: 'EXO', chapter: 1 });
});

test('a reading position the listener moved away from the playing chapter stays put', async () => {
  readerLeftOn('GEN', 3);
  await audioPlaying('GEN', 5);

  await finishPlaying();

  assert.equal(useAudioStore.getState().currentChapter, 6);
  assert.deepEqual(savedPosition(), { bookId: 'GEN', chapter: 3 });
});

test('audio started without ever opening the reader leaves the fresh position alone', async () => {
  await audioPlaying('GEN', 1);

  await finishPlaying();

  assert.deepEqual(savedPosition(), { bookId: 'GEN', chapter: 1 });
  assert.equal(useBibleStore.getState().hasReaderHistory, false);
});

test('auto-advance records the chapter as heard, not as read', async () => {
  readerLeftOn('GEN', 5);
  await audioPlaying('GEN', 5);

  await finishPlaying();

  assert.deepEqual(progressCalls, [['listened', 'GEN', 5]]);
  assert.equal(useBibleStore.getState().preferredChapterLaunchMode, 'listen');
});

const PLAN_ID = 'psalms-30-days';
const PLAN_DAY = 2;

function planSessionPlaying(bookId: string, chapter: number): Promise<void> {
  useAudioStore.getState().setPlaybackSequence([
    { bookId: 'PSA', chapter: 4 },
    { bookId: 'PSA', chapter: 5 },
    { bookId: 'PSA', chapter: 6 },
  ]);
  // What a mounted plan-session reader leaves behind for the mini player.
  useAudioStore.getState().setAudioReturnTarget({
    translationId: 'bsb',
    bookId,
    chapter,
    preferredMode: 'listen',
    planId: PLAN_ID,
    planDayNumber: PLAN_DAY,
    returnToPlanOnComplete: true,
  });
  return audioPlaying(bookId, chapter);
}

test('a plan session that auto-advances with the reader closed moves the plan day resume point', async () => {
  readerLeftOn('PSA', 4);
  readingPlansStore.getState().setPlanDayResume(PLAN_ID, PLAN_DAY, 'PSA', 4);
  await planSessionPlaying('PSA', 4);

  await finishPlaying();
  await finishPlaying();

  assert.equal(useAudioStore.getState().currentChapter, 6);
  assert.deepEqual(readingPlansStore.getState().getPlanDayResume(PLAN_ID, PLAN_DAY), {
    bookId: 'PSA',
    chapter: 6,
  });
  assert.deepEqual(savedPosition(), { bookId: 'PSA', chapter: 6 });
});

test('a plan day resume point the listener moved away from stays put', async () => {
  readerLeftOn('PSA', 6);
  readingPlansStore.getState().setPlanDayResume(PLAN_ID, PLAN_DAY, 'PSA', 6);
  await planSessionPlaying('PSA', 4);

  await finishPlaying();

  assert.equal(useAudioStore.getState().currentChapter, 5);
  assert.deepEqual(readingPlansStore.getState().getPlanDayResume(PLAN_ID, PLAN_DAY), {
    bookId: 'PSA',
    chapter: 6,
  });
});

test('another plan day keeps its own resume point', async () => {
  readerLeftOn('PSA', 4);
  readingPlansStore.getState().setPlanDayResume(PLAN_ID, PLAN_DAY, 'PSA', 4);
  readingPlansStore.getState().setPlanDayResume(PLAN_ID, PLAN_DAY + 1, 'PSA', 4);
  await planSessionPlaying('PSA', 4);

  await finishPlaying();

  assert.deepEqual(readingPlansStore.getState().getPlanDayResume(PLAN_ID, PLAN_DAY + 1), {
    bookId: 'PSA',
    chapter: 4,
  });
});

test('a chapter repeating itself leaves the saved position where it was', async () => {
  readerLeftOn('GEN', 5);
  await audioPlaying('GEN', 5);
  useAudioStore.setState({ repeatMode: 'chapter' });

  await finishPlaying();

  assert.equal(useAudioStore.getState().currentChapter, 5);
  assert.deepEqual(savedPosition(), { bookId: 'GEN', chapter: 5 });
});

test('a mounted reader following the same step leaves one consistent place', async () => {
  readerLeftOn('PSA', 4);
  readingPlansStore.getState().setPlanDayResume(PLAN_ID, PLAN_DAY, 'PSA', 4);
  await planSessionPlaying('PSA', 4);

  await finishPlaying();
  // The open reader follows the audio to PSA 5 and records it as it does for any chapter.
  readerLeftOn('PSA', 5);
  readingPlansStore.getState().setPlanDayResume(PLAN_ID, PLAN_DAY, 'PSA', 5);
  // Seeing the same step again moves nothing further.
  followAutoAdvancedChapter({ bookId: 'PSA', chapter: 4 }, { bookId: 'PSA', chapter: 5 });

  assert.deepEqual(savedPosition(), { bookId: 'PSA', chapter: 5 });
  assert.deepEqual(readingPlansStore.getState().getPlanDayResume(PLAN_ID, PLAN_DAY), {
    bookId: 'PSA',
    chapter: 5,
  });
});
