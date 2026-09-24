/**
 * Shared setup for the BibleReaderScreen render tests.
 *
 * The reader is one large screen that reaches most of the app, so every test
 * file that renders it installs the same fakes: real Zustand stores holding
 * just the fields the screen selects, a `useAudioPlayer` driven by the fake
 * audio store (so a test changes playback by setting store state), and
 * recording services. Call `installReaderRenderFixture(mock)` once at module
 * scope, before the screen is imported.
 */
import { afterEach, beforeEach, type MockTracker } from 'node:test';
import assert from 'node:assert/strict';
import { useRef } from 'react';
import { act, type ReactTestInstance } from 'react-test-renderer';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { BibleTranslation, Verse } from '../../types';
import type { UserAnnotation } from '../../services/supabase/types';
import { hostComponent } from '../../testing/reactNativeHost';
import { createReanimatedFake, type ReanimatedFakeState } from '../../testing/nativePackageFakes';
import {
  mockBarrel,
  mockMmkvStorage,
  mockModule,
  mockPackage,
  mockSecureStore,
  sourcePath,
} from '../../testing/mockModules';
import {
  flattenStyle,
  installRenderHarness,
  type RenderHarnessOptions,
  type RenderResult,
} from '../../testing/render';

export const BSB: BibleTranslation = {
  id: 'bsb',
  name: 'Berean Standard Bible',
  abbreviation: 'BSB',
  language: 'English',
  description: '',
  copyright: '',
  isDownloaded: true,
  downloadedBooks: [],
  downloadedAudioBooks: [],
  totalBooks: 66,
  sizeInMB: 0,
  hasText: true,
  hasAudio: true,
  audioGranularity: 'chapter',
};

export const verseOf = (
  number: number,
  text: string,
  extra: Partial<Verse> = {},
  bookId = 'JHN',
  chapter = 3
): Verse => ({
  id: 43_003_000 + number,
  bookId,
  chapter,
  verse: number,
  text,
  ...extra,
});

export const JOHN_3 = [
  verseOf(1, 'Now there was a Pharisee named Nicodemus, a leader of the Jews.'),
  verseOf(2, 'He came to Jesus at night and said, “Rabbi, we know that You are a teacher.”'),
  verseOf(3, 'Jesus replied, “Truly, truly, I tell you, no one can see the kingdom of God.”'),
];

type AudioStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface FakeRecording {
  id: number;
  getStatusAsync: () => Promise<{ durationMillis: number }>;
  stopAndUnloadAsync: () => Promise<void>;
  getURI: () => string;
}

export interface FakeSound {
  id: number;
  onStatus: ((status: { isLoaded: boolean; didJustFinish?: boolean }) => void) | null;
  playAsync: () => Promise<void>;
  unloadAsync: () => Promise<void>;
  setOnPlaybackStatusUpdate: (
    listener: (status: { isLoaded: boolean; didJustFinish?: boolean }) => void
  ) => void;
}

export function installReaderRenderFixture(
  mocker: MockTracker,
  options: RenderHarnessOptions = {}
) {
  const harness = installRenderHarness(mocker, {
    ...options,
    skip: [...(options.skip ?? []), 'react-native-reanimated'],
  });
  // Reanimated as the harness fakes it, except that useAnimatedScrollHandler keeps its
  // identity across renders as the real one does (useEvent returns a ref), so the
  // memoized verse list can be shown to skip re-renders it takes nothing from.
  const motion: ReanimatedFakeState = { reduceMotion: false, animations: harness.animations };
  const setHarnessReduceMotion = harness.setReduceMotion;
  harness.setReduceMotion = (value) => {
    setHarnessReduceMotion(value);
    motion.reduceMotion = value;
  };
  const reanimated = createReanimatedFake(motion);
  const useFakeScrollHandler = reanimated.useAnimatedScrollHandler as (
    handlers: unknown
  ) => (event: unknown) => void;
  mockPackage(mocker, 'react-native-reanimated', {
    ...reanimated,
    useAnimatedScrollHandler: (handlers: unknown) => {
      const latest = useRef(handlers);
      latest.current = handlers;
      const dispatch = useFakeScrollHandler({
        onScroll: (event: unknown, context: Record<string, unknown>) => {
          const current = latest.current as
            | ((payload: unknown, scope: Record<string, unknown>) => void)
            | { onScroll?: (payload: unknown, scope: Record<string, unknown>) => void };
          if (typeof current === 'function') current(event, context);
          else current.onScroll?.(event, context);
        },
      });
      const stable = useRef(dispatch);
      return stable.current;
    },
  });
  mockMmkvStorage(mocker);
  mockSecureStore(mocker);

  // ---- Stores ----------------------------------------------------------------
  const bibleStore = create(() => ({
    currentTranslation: 'bsb',
    translations: [BSB] as BibleTranslation[],
    setCurrentBook: () => {},
    setCurrentChapter: () => {},
    setPreferredChapterLaunchMode: () => {},
    downloadAudioForBook: async () => {},
    recoverMissingInstalledPack: async () => {},
  }));
  mockModule(mocker, sourcePath('stores/bibleStore.ts'), { useBibleStore: bibleStore });

  // Playback: the reader reads it through useAudioPlayer, the position leaves
  // through useAudioPosition, both from this store.
  const audioStore = create(() => ({
    status: 'idle' as AudioStatus,
    currentTranslationId: null as string | null,
    currentBookId: null as string | null,
    currentChapter: null as number | null,
    // The persisted last track, which survives a relaunch when nothing is loaded.
    lastPlayedTranslationId: null as string | null,
    lastPlayedBookId: null as string | null,
    lastPlayedChapter: null as number | null,
    currentPosition: 0,
    duration: 0,
    sleepTimerMinutes: null as number | null,
    setPlaybackSequence: () => {},
    setAudioReturnTarget: () => {},
    setCurrentTrack: () => {},
    clearPlaybackSequence: () => {},
  }));
  mockModule(mocker, sourcePath('stores/audioStore.ts'), { useAudioStore: audioStore });

  const libraryStore = create(() => ({
    favorites: [] as Array<{ id: string }>,
    history: [],
    toggleFavorite: () => {},
    addChapterToDefaultPlaylist: () => {},
  }));
  mockModule(mocker, sourcePath('stores/libraryStore.ts'), { useLibraryStore: libraryStore });

  const progressStore = create(() => ({
    chaptersRead: {} as Record<string, number>,
    markChapterRead: () => {},
  }));
  mockModule(mocker, sourcePath('stores/progressStore.ts'), { useProgressStore: progressStore });

  const readingPlansStore = create(() => ({
    progressByPlanId: {} as Record<string, unknown>,
    setPlanDayResume: () => {},
    clearPlanDayResume: () => {},
  }));
  mockModule(mocker, sourcePath('stores/readingPlansStore.ts'), {
    useReadingPlansStore: readingPlansStore,
  });

  // ---- Hooks -----------------------------------------------------------------
  const audioCalls: Array<[string, ...unknown[]]> = [];
  /** What previousChapter()/nextChapter() resolve to (the player's new chapter). */
  const playerSteps: { previous: unknown; next: unknown } = { previous: null, next: null };
  /** One increment per BibleReaderScreen render: the screen calls useAudioPlayer once. */
  const renders = { count: 0 };
  const record =
    (name: string, result: () => unknown = () => undefined) =>
    async (...args: unknown[]) => {
      audioCalls.push([name, ...args]);
      return result();
    };
  const playerActions = {
    playChapter: record('playChapter'),
    navigateChapterForTranslation: record('navigateChapterForTranslation'),
    addToQueue: record('addToQueue'),
    stop: record('stop'),
    togglePlayPause: record('togglePlayPause'),
    previousChapter: record('previousChapter', () => playerSteps.previous),
    nextChapter: record('nextChapter', () => playerSteps.next),
    seekTo: record('seekTo'),
    skipBackward: record('skipBackward'),
    skipForward: record('skipForward'),
    changePlaybackRate: record('changePlaybackRate'),
    cycleRepeatMode: record('cycleRepeatMode'),
    startSleepTimer: record('startSleepTimer'),
    changeBackgroundMusicChoice: record('changeBackgroundMusicChoice'),
  };
  mockModule(mocker, sourcePath('hooks/useAudioPlayer.ts'), {
    useAudioPlayer: () => {
      renders.count += 1;
      // Transport state only, like the real hook: position ticks must not reach here.
      const transport = audioStore(
        useShallow((state) => ({
          status: state.status,
          currentTranslationId: state.currentTranslationId,
          currentBookId: state.currentBookId,
          currentChapter: state.currentChapter,
          lastPlayedTranslationId: state.lastPlayedTranslationId,
          lastPlayedBookId: state.lastPlayedBookId,
          lastPlayedChapter: state.lastPlayedChapter,
        }))
      );
      return {
        ...transport,
        playbackRate: 1,
        repeatMode: 'off',
        sleepTimerRemaining: null,
        backgroundMusicChoice: 'off',
        ...playerActions,
      };
    },
  });
  // useFontSize runs for real on the harness auth store: its scaleValue keeps its
  // identity until the size preference changes, which the memoized verse list relies on.
  const contentSummary: { audioChapters?: Record<string, readonly number[]> } = {};
  mockModule(mocker, sourcePath('hooks/useTranslationContentSummary.ts'), {
    useTranslationContentSummary: () =>
      contentSummary.audioChapters ? { audioChapters: contentSummary.audioChapters } : undefined,
  });

  // ---- Services --------------------------------------------------------------
  /** Writes the reader made through services and native packages, in order. */
  const serviceCalls: Array<[string, ...unknown[]]> = [];
  const chapters = new Map<string, Verse[]>();
  const chapterRequests: string[] = [];
  mockModule(mocker, sourcePath('services/bible/bibleService.ts'), {
    getChapter: async (translationId: string, bookId: string, chapter: number) => {
      chapterRequests.push(`${translationId}:${bookId}:${chapter}`);
      return chapters.get(`${bookId}:${chapter}`) ?? [];
    },
    prefetchNextChapter: async () => {},
  });

  /** Annotation loads wait for the test to resolve them, newest last. */
  const annotationLoads: Array<{
    chapter: string;
    resolve: (data: unknown[]) => void;
  }> = [];
  let holdAnnotationLoads = false;
  /** The saved annotations, as the local annotation store keeps them (soft deletes included). */
  const annotationRows: UserAnnotation[] = [];
  mockModule(mocker, sourcePath('services/annotations/annotationService.ts'), {
    getAnnotationsForChapter: (bookId: string, chapter: number) =>
      holdAnnotationLoads
        ? new Promise((resolve) => {
            annotationLoads.push({
              chapter: `${bookId}:${chapter}`,
              resolve: (data) => resolve({ success: true, data }),
            });
          })
        : Promise.resolve({
            success: true,
            // Fresh objects per load, as the store hands out new rows after every write.
            data: annotationRows
              .filter(
                (row) => row.deleted_at == null && row.book === bookId && row.chapter === chapter
              )
              .map((row) => ({ ...row })),
          }),
    upsertAnnotation: async (
      annotation: Omit<UserAnnotation, 'user_id' | 'created_at' | 'updated_at' | 'synced_at'>
    ) => {
      serviceCalls.push(['upsertAnnotation', annotation]);
      const saved: UserAnnotation = {
        ...annotation,
        user_id: 'local',
        created_at: '2026-09-24T00:00:00.000Z',
        updated_at: '2026-09-24T00:00:00.000Z',
        synced_at: '2026-09-24T00:00:00.000Z',
      };
      const index = annotationRows.findIndex((row) => row.id === annotation.id);
      if (index >= 0) annotationRows[index] = saved;
      else annotationRows.push(saved);
      return { success: true, data: saved };
    },
    softDeleteAnnotation: async (id: string) => {
      serviceCalls.push(['softDeleteAnnotation', id]);
      const row = annotationRows.find((candidate) => candidate.id === id);
      if (!row || row.deleted_at != null) return { success: false, error: 'not found' };
      row.deleted_at = '2026-09-24T00:00:01.000Z';
      return { success: true };
    },
  });
  let timestamps: Record<number, number> | null = null;
  mockModule(mocker, sourcePath('services/bible/verseTimestamps.ts'), {
    getChapterTimestamps: async () => timestamps,
  });
  mockBarrel(mocker, 'services/analytics/index.ts', {
    provide: {
      trackAnonymousUsageEvent: () => {},
      flushAnonymousUsageEvents: async () => {},
    },
  });
  mockModule(mocker, sourcePath('services/analytics/bibleExperienceAnalytics.ts'), {
    trackBibleExperienceEvent: () => {},
  });
  mockModule(mocker, sourcePath('services/audio/audioRemote.ts'), {
    isRemoteAudioAvailable: () => true,
  });
  const feedbackSubmissions: Array<Record<string, unknown>> = [];
  // What the send (or offline queue) reports back; a test sets it before submitting.
  const feedbackOutcome: { result: Record<string, unknown> } = { result: { success: true } };
  const recordFeedback = async (submission: Record<string, unknown>) => {
    feedbackSubmissions.push(submission);
    return feedbackOutcome.result;
  };
  mockBarrel(mocker, 'services/feedback/index.ts', {
    provide: {
      submitChapterFeedback: recordFeedback,
      submitChapterFeedbackOrQueue: recordFeedback,
    },
  });
  mockModule(mocker, sourcePath('services/feedback/chapterFeedbackAudio.ts'), {
    CHAPTER_FEEDBACK_AUDIO_MAX_DURATION_MS: 60_000,
    CHAPTER_FEEDBACK_AUDIO_MIME_TYPE: 'audio/m4a',
    uploadChapterFeedbackAudio: async () => ({ success: true }),
  });
  mockModule(mocker, sourcePath('services/plans/readingPlanService.ts'), {
    markDayComplete: async (...args: unknown[]) => {
      serviceCalls.push(['markDayComplete', ...args]);
      return { success: true };
    },
    markPlanSessionComplete: async (...args: unknown[]) => {
      serviceCalls.push(['markPlanSessionComplete', ...args]);
      return { success: true };
    },
  });
  mockBarrel(mocker, 'services/plans/index.ts', { real: ['getPlanChapterFocusVerse'] });
  mockBarrel(mocker, 'services/sync/index.ts', {
    provide: { syncPreferences: async () => ({ success: true }) },
  });
  // PlaybackControls reaches the audio barrel only for the bundled music catalogue.
  mockBarrel(mocker, 'services/audio/index.ts', { real: ['BACKGROUND_MUSIC_OPTIONS'] });

  // ---- Components and native packages ---------------------------------------
  mockBarrel(mocker, 'components/feedback/index.ts', {
    provide: { ChapterFeedbackSummary: hostComponent('ChapterFeedbackSummary') },
  });
  mockModule(mocker, sourcePath('screens/bible/TranslationPickerList.tsx'), {
    TranslationPickerList: hostComponent('TranslationPickerList'),
  });
  mockPackage(mocker, 'expo-clipboard', {
    setStringAsync: async (text: string) => {
      serviceCalls.push(['Clipboard.setStringAsync', text]);
      return true;
    },
  });
  // expo-av for chapter-feedback recording and preview. Every call is logged; a
  // held operation waits until the test releases it, so a test can unmount or tap
  // again while the reader is mid-await.
  const av = {
    log: [] as string[],
    held: new Set<string>(),
    pending: [] as Array<{ name: string; release: () => void }>,
    recordings: [] as FakeRecording[],
    sounds: [] as FakeSound[],
  };
  const avStep = async (name: string) => {
    av.log.push(name);
    if (av.held.has(name)) {
      await new Promise<void>((release) => av.pending.push({ name, release }));
    }
  };
  mockPackage(mocker, 'expo-av', {
    Audio: {
      RecordingOptionsPresets: { HIGH_QUALITY: { preset: 'high' } },
      Recording: {
        createAsync: async () => {
          await avStep('Recording.createAsync');
          const id = av.recordings.length + 1;
          const recording: FakeRecording = {
            id,
            getStatusAsync: async () => ({ durationMillis: 4_000 }),
            stopAndUnloadAsync: async () => void av.log.push(`recording${id}.stopAndUnload`),
            getURI: () => `file:///feedback-${id}.m4a`,
          };
          av.recordings.push(recording);
          return { recording };
        },
      },
      Sound: {
        createAsync: async () => {
          await avStep('Sound.createAsync');
          const id = av.sounds.length + 1;
          const sound: FakeSound = {
            id,
            onStatus: null,
            playAsync: async () => void av.log.push(`sound${id}.play`),
            unloadAsync: async () => void av.log.push(`sound${id}.unload`),
            setOnPlaybackStatusUpdate: (listener) => {
              sound.onStatus = listener;
            },
          };
          av.sounds.push(sound);
          return { sound };
        },
      },
      setAudioModeAsync: async () => {},
      requestPermissionsAsync: async () => {
        await avStep('requestPermissionsAsync');
        return { granted: true };
      },
    },
  });
  const feedbackAv = {
    log: av.log,
    recordings: av.recordings,
    sounds: av.sounds,
    /** Make the next calls of `name` wait for `release(name)`. */
    hold: (name: string) => void av.held.add(name),
    /** Let the oldest waiting call of `name` finish, inside act. */
    release: async (name: string) => {
      const index = av.pending.findIndex((entry) => entry.name === name);
      assert.ok(index >= 0, `a pending ${name}`);
      const [entry] = av.pending.splice(index, 1);
      await act(async () => {
        entry.release();
      });
    },
    waiting: (name: string) => av.pending.filter((entry) => entry.name === name).length,
  };

  // The reader drives the ROOT tab navigator, which it finds by id.
  const rootTabCalls: Array<Record<string, unknown>> = [];
  const rootTab = {
    setOptions: (options: Record<string, unknown>) => {
      rootTabCalls.push(options);
    },
  };
  harness.navigation.navigation.getParent = (id?: unknown) =>
    id === 'RootTab' ? rootTab : undefined;

  beforeEach(() => {
    chapters.clear();
    chapters.set('JHN:3', JOHN_3);
  });

  afterEach(() => {
    motion.reduceMotion = false;
    audioCalls.length = 0;
    chapterRequests.length = 0;
    rootTabCalls.length = 0;
    feedbackSubmissions.length = 0;
    feedbackOutcome.result = { success: true };
    annotationLoads.length = 0;
    annotationRows.length = 0;
    serviceCalls.length = 0;
    av.log.length = 0;
    av.held.clear();
    av.pending.length = 0;
    av.recordings.length = 0;
    av.sounds.length = 0;
    holdAnnotationLoads = false;
    timestamps = null;
    playerSteps.previous = null;
    playerSteps.next = null;
    renders.count = 0;
    delete contentSummary.audioChapters;
    bibleStore.setState(bibleStore.getInitialState(), true);
    audioStore.setState(audioStore.getInitialState(), true);
    libraryStore.setState(libraryStore.getInitialState(), true);
    progressStore.setState(progressStore.getInitialState(), true);
    readingPlansStore.setState(readingPlansStore.getInitialState(), true);
  });

  const t = (key: string, values?: Record<string, unknown>) => harness.i18n.t(key, values);

  async function renderReader(params: Record<string, unknown> = {}) {
    harness.navigation.route.name = 'BibleReader';
    harness.navigation.route.key = 'reader-route';
    harness.navigation.route.params = { bookId: 'JHN', chapter: 3, ...params };
    const { BibleReaderScreen } = await import('./BibleReaderScreen');
    const view = await harness.render(<BibleReaderScreen />);
    await view.flush();
    return view;
  }

  /** Re-render the mounted reader after the route params changed. */
  async function navigateReader(view: RenderResult, params: Record<string, unknown>) {
    harness.navigation.route.params = { ...harness.navigation.route.params, ...params };
    const { BibleReaderScreen } = await import('./BibleReaderScreen');
    await view.rerender(<BibleReaderScreen />);
    await view.flush();
  }

  /** The virtualized read-mode list. */
  const readerList = (view: RenderResult) => {
    const [list] = view.queryAllByType('FlatList');
    assert.ok(list, 'the read-mode paragraph list is rendered');
    return list;
  };

  /** Scroll the read-mode list like a finger would, one native frame. */
  async function scrollReader(
    view: RenderResult,
    y: number,
    { viewport = 700, content = 3000 }: { viewport?: number; content?: number } = {}
  ) {
    await view.fire(readerList(view), 'onScroll', {
      nativeEvent: {
        contentOffset: { x: 0, y },
        layoutMeasurement: { width: 390, height: viewport },
        contentSize: { width: 390, height: content },
      },
    });
    await view.flush();
  }

  const setParamsCalls = () =>
    harness.navigation.calls
      .filter((call) => call.method === 'setParams')
      .map((call) => call.args[0] as Record<string, unknown>);

  /** The floating top bar: the nearest host ancestor of the reference pill with a `top`. */
  function topChrome(view: RenderResult): ReactTestInstance {
    let node: ReactTestInstance | null = view.getByRole('button', {
      name: 'John 3',
      includeHidden: true,
    });
    while (node && flattenStyle(node.props.style)?.top === undefined) node = node.parent;
    assert.ok(node, 'top chrome');
    return node;
  }

  /** Change playback state the way the player does, inside act. */
  async function setAudio(patch: Partial<ReturnType<typeof audioStore.getState>>) {
    await act(async () => {
      audioStore.setState(patch);
    });
  }

  return {
    harness,
    setAudio,
    t,
    bibleStore,
    audioStore,
    libraryStore,
    progressStore,
    readingPlansStore,
    audioCalls,
    playerSteps,
    renders,
    contentSummary,
    chapters,
    chapterRequests,
    annotationLoads,
    annotationRows,
    holdAnnotations: () => {
      holdAnnotationLoads = true;
    },
    setTimestamps: (value: Record<number, number> | null) => {
      timestamps = value;
    },
    feedbackSubmissions,
    feedbackAv,
    serviceCalls,
    feedbackOutcome,
    rootTabCalls,
    renderReader,
    navigateReader,
    readerList,
    scrollReader,
    setParamsCalls,
    topChrome,
  };
}
