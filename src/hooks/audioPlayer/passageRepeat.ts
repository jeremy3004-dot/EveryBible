import { getBookById } from '../../constants/books';
import { audioPlayer } from '../../services/audio';
import type { TrackPlayerProgressSnapshot } from '../../services/audio/audioPlayer';
import { getAudioChaptersForBook } from '../../services/bible/contentAvailability';
import { useAudioStore } from '../../stores/audioStore';
import { hasAudioPlaybackSequenceEntry } from '../../stores/audioPlaybackSequenceModel';
import {
  checkPassageEndBoundary,
  isPassagePosition,
  normalizeRepeatPassage,
  resolvePassageChapterAdvance,
  resolvePassageChapterBounds,
  resolvePassageLoopStart,
  resolvePassageLoopStartMs,
  type PassageVerseTimings,
} from '../../stores/audioRepeatPassageModel';
import type { RepeatPassage } from '../../types';
import type { AudioPlayerSession, ResolveAudioCoverage } from './playerSession';
import { followAutoAdvancedChapter } from './readingPositionFollow';
import { chapterTransition, pausedByListener } from './sharedPlaybackState';

// Carries out `repeatMode: 'passage'` (the decisions live in
// stores/audioRepeatPassageModel.ts).
//
// How it avoids fighting the listener: the passage steers playback only at its
// boundaries, and at the moment it is set.
// - Boundaries: the end of `end.verse` reached by playing on (where the chapter has
//   verse timings), and the end of any chapter. A seek, skip or chapter pick in
//   between is left alone. A seek past the end verse plays on to the end of that
//   chapter; a chapter the listener moved to outside the passage plays to its end.
//   Either chapter end then returns to the passage's start.
// - Setting (or changing) the passage moves a loaded chapter that is outside it to
//   the passage's start: playing on if it was playing, cued if paused. With nothing
//   loaded, the listener's next Play starts at the passage's start instead of
//   wherever it would have; any other command first (a chapter pick, say) cancels that.

export interface PassageRepeatContext {
  session: AudioPlayerSession;
  fallbackTranslationId: string;
  resolveAudioCoverage: ResolveAudioCoverage;
}

interface ChapterRef {
  bookId: string;
  chapter: number;
}

export interface PassagePlaybackStart extends ChapterRef {
  startPositionMs: number;
}

export interface PlayRequest extends PassagePlaybackStart {
  translationId: string;
}

// Work started from a native callback or the store subscription, which nobody awaits.
const backgroundWork = new Set<Promise<unknown>>();

function runInBackground(work: Promise<unknown>): void {
  // A failed decision leaves playback as it was; it must not surface as an unhandled rejection.
  const tracked = work
    .catch((error: unknown) => console.warn('[Audio] Passage repeat step failed:', error))
    .finally(() => backgroundWork.delete(tracked));
  backgroundWork.add(tracked);
}

/**
 * Resolves once the passage work started by callbacks and the subscription has
 * finished, including whatever that work started in turn. For tests, which must see
 * a decision made before asserting that it did (or did not) move playback.
 */
export async function passageRepeatSettled(): Promise<void> {
  while (backgroundWork.size > 0) await Promise.all([...backgroundWork]);
}

// --- verse timings -------------------------------------------------------------

// A passage touches few chapters; a handful of entries covers its two ends in a
// couple of translations.
const TIMINGS_CACHE_LIMIT = 8;
const timingsCache = new Map<string, PassageVerseTimings | null>();
const timingsLoads = new Map<string, Promise<PassageVerseTimings | null>>();

const chapterKey = (translationId: string, bookId: string, chapter: number) =>
  `${translationId}/${bookId}/${chapter}`;

/** Timings already known for a chapter: undefined until they have loaded (null: none). */
function peekTimings(key: string): PassageVerseTimings | null | undefined {
  return timingsCache.get(key);
}

/**
 * A chapter's verse timings, null when the translation has none. The timing tables
 * are large, so the service is imported on first use, as the reader does, and
 * nothing is parsed at startup.
 */
function loadTimings(
  translationId: string,
  bookId: string,
  chapter: number
): Promise<PassageVerseTimings | null> {
  const key = chapterKey(translationId, bookId, chapter);
  const known = timingsCache.get(key);
  if (known !== undefined) return Promise.resolve(known);
  const inFlight = timingsLoads.get(key);
  if (inFlight) return inFlight;

  const load = import('../../services/bible/verseTimestamps')
    .then(({ getChapterTimestamps }) => getChapterTimestamps(translationId, bookId, chapter))
    .catch(() => null)
    .then((timings) => {
      timingsLoads.delete(key);
      if (timingsCache.size >= TIMINGS_CACHE_LIMIT) {
        const oldest = timingsCache.keys().next().value;
        if (oldest !== undefined) timingsCache.delete(oldest);
      }
      timingsCache.set(key, timings);
      return timings;
    });
  timingsLoads.set(key, load);
  return load;
}

// --- shared resolution ---------------------------------------------------------

/** The passage being repeated, fitted to its book; null when repeat is not 'passage'. */
function activePassage(): { raw: RepeatPassage; passage: RepeatPassage } | null {
  const { repeatMode, repeatPassage } = useAudioStore.getState();
  if (repeatMode !== 'passage' || !repeatPassage) return null;
  const passage = normalizeRepeatPassage(
    repeatPassage,
    getBookById(repeatPassage.bookId)?.chapters ?? 0
  );
  return passage ? { raw: repeatPassage, passage } : null;
}

/** Whether the start or end of the passage falls inside `chapter`, so its timings matter. */
const hasVerseBoundIn = (passage: RepeatPassage, { bookId, chapter }: ChapterRef) =>
  bookId === passage.bookId &&
  ((chapter === passage.start.chapter && passage.start.verse > 1) ||
    chapter === passage.end.chapter);

async function passageCoverage(
  resolveAudioCoverage: ResolveAudioCoverage,
  translationId: string,
  passage: RepeatPassage
): Promise<readonly number[] | undefined> {
  const coverage = await resolveAudioCoverage(translationId);
  // A resolved map without the book means the book has no audio, as isChapterAudioCovered reads it.
  return coverage ? (getAudioChaptersForBook(coverage, passage.bookId) ?? []) : undefined;
}

/** Where the next loop begins in `translationId`, or null when no passage chapter has audio. */
async function resolveLoopStart(
  resolveAudioCoverage: ResolveAudioCoverage,
  translationId: string,
  passage: RepeatPassage
): Promise<PassagePlaybackStart | null> {
  const start = resolvePassageLoopStart(
    passage,
    await passageCoverage(resolveAudioCoverage, translationId, passage)
  );
  if (!start) return null;
  const timings = hasVerseBoundIn(passage, start)
    ? await loadTimings(translationId, start.bookId, start.chapter)
    : null;
  return {
    bookId: start.bookId,
    chapter: start.chapter,
    startPositionMs: resolvePassageLoopStartMs(passage, start.chapter, timings),
  };
}

interface TrackAtDecision extends ChapterRef {
  requestId: number;
  translationId: string;
  rawPassage: RepeatPassage;
}

function captureTrack(ctx: PassageRepeatContext, rawPassage: RepeatPassage): TrackAtDecision {
  const { currentTranslationId, currentBookId, currentChapter } = useAudioStore.getState();
  return {
    requestId: ctx.session.playRequestId,
    translationId: currentTranslationId ?? ctx.fallbackTranslationId,
    bookId: currentBookId ?? '',
    chapter: currentChapter ?? 0,
    rawPassage,
  };
}

/**
 * Whether anything took over while a decision awaited timings or coverage: a newer
 * command (play, pause, stop, a chapter pick), another chapter, or another passage.
 */
function tookOver(ctx: PassageRepeatContext, at: TrackAtDecision): boolean {
  const live = useAudioStore.getState();
  return (
    ctx.session.playRequestId !== at.requestId ||
    (live.currentTranslationId ?? ctx.fallbackTranslationId) !== at.translationId ||
    live.currentBookId !== at.bookId ||
    live.currentChapter !== at.chapter ||
    live.repeatMode !== 'passage' ||
    live.repeatPassage !== at.rawPassage
  );
}

/** Moves the loaded sound to `positionMs`, as a seek does, without restarting it. */
async function seekLoadedChapter(session: AudioPlayerSession, positionMs: number): Promise<void> {
  // Re-anchor interpolation, or its next tick extrapolates from the pre-seek position.
  session.lastPollPosition = positionMs;
  session.lastPollTime = Date.now();
  await audioPlayer.seekTo(positionMs);
  useAudioStore.getState().setPosition(positionMs);
}

// --- the end verse -------------------------------------------------------------

interface BoundaryWatch {
  trackKey: string | null;
  /** The previous progress report in this chapter, since the last seek. */
  lastPositionMs: number | null;
  timer: ReturnType<typeof setTimeout> | null;
}

const watch: BoundaryWatch = { trackKey: null, lastPositionMs: null, timer: null };
let loopInFlight = false;

function clearBoundaryTimer(): void {
  if (watch.timer) {
    clearTimeout(watch.timer);
    watch.timer = null;
  }
}

function resetBoundaryWatch(): void {
  clearBoundaryTimer();
  watch.trackKey = null;
  watch.lastPositionMs = null;
}

/**
 * A listener seek or skip (reader, lock screen): the next report starts a fresh
 * reading, so a jump across the end verse is not taken for playback crossing it.
 */
export function notePassageManualSeek(): void {
  clearBoundaryTimer();
  watch.lastPositionMs = null;
}

/** Plays the passage again from its start, because its end verse has just been heard. */
async function loopFromEndVerse(ctx: PassageRepeatContext): Promise<void> {
  const active = activePassage();
  if (!active || loopInFlight) return;
  const { passage, raw } = active;
  const at = captureTrack(ctx, raw);
  loopInFlight = true;
  try {
    // Seam for the end-of-chapter sleep timer: the end verse is where a passage's
    // "chapter" ends, so a timer set to stop there should end playback here instead of
    // looping (as it does in finishChapterAndAdvance for a whole chapter).
    const target = await resolveLoopStart(ctx.resolveAudioCoverage, at.translationId, passage);
    if (!target || tookOver(ctx, at)) return;
    resetBoundaryWatch();

    // A one-chapter passage loops inside the loaded sound: a seek, not a reload.
    if (target.bookId === at.bookId && target.chapter === at.chapter && audioPlayer.isLoaded()) {
      await seekLoadedChapter(ctx.session, target.startPositionMs);
      return;
    }
    if (!ctx.session.playChapterForTranslation) return;
    chapterTransition.current = true;
    followAutoAdvancedChapter(at, target);
    await ctx.session.playChapterForTranslation(
      at.translationId,
      target.bookId,
      target.chapter,
      undefined,
      { startPositionMs: target.startPositionMs }
    );
  } finally {
    loopInFlight = false;
  }
}

/**
 * Follows native progress for the end verse of a repeated passage. Called with every
 * snapshot of the Bible sound, after the player state has taken it in.
 */
export function watchPassageProgress(
  ctx: PassageRepeatContext,
  snapshot: TrackPlayerProgressSnapshot
): void {
  const active = activePassage();
  if (!active) {
    resetBoundaryWatch();
    return;
  }
  const state = useAudioStore.getState();
  const { currentBookId: bookId, currentChapter: chapter } = state;
  if (state.status !== 'playing' || !snapshot.isPlaying || !bookId || !chapter) {
    // Paused (or a sleep-timer pause just now): the end is not getting any closer.
    clearBoundaryTimer();
    return;
  }

  const { passage } = active;
  const translationId = state.currentTranslationId ?? ctx.fallbackTranslationId;
  const key = chapterKey(translationId, bookId, chapter);
  if (watch.trackKey !== key) {
    resetBoundaryWatch();
    watch.trackKey = key;
  }
  const previousPositionMs = watch.lastPositionMs;
  const positionMs = snapshot.positionMillis;
  watch.lastPositionMs = positionMs;

  if (bookId !== passage.bookId || chapter !== passage.end.chapter) return;
  // A plan or rhythm session owns playback through its own chapters.
  if (hasAudioPlaybackSequenceEntry(state.playbackSequence, bookId, chapter)) return;

  const timings = peekTimings(key);
  if (timings === undefined) {
    runInBackground(loadTimings(translationId, bookId, chapter));
    // The loop will need the start verse's time too; have it ready.
    if (hasVerseBoundIn(passage, { bookId, chapter: passage.start.chapter })) {
      runInBackground(loadTimings(translationId, bookId, passage.start.chapter));
    }
    return;
  }

  const check = checkPassageEndBoundary({
    previousPositionMs,
    positionMs,
    endMs: resolvePassageChapterBounds(passage, chapter, timings).endMs,
    playbackRate: state.playbackRate,
  });
  if (check.kind === 'loop') {
    clearBoundaryTimer();
    runInBackground(loopFromEndVerse(ctx));
  } else if (check.kind === 'schedule' && !watch.timer) {
    // Progress comes about once a second; waiting for the report after the end would
    // let up to a second of the next verse through.
    const requestId = ctx.session.playRequestId;
    watch.timer = setTimeout(() => {
      watch.timer = null;
      const live = useAudioStore.getState();
      if (
        ctx.session.playRequestId !== requestId ||
        watch.trackKey !== key ||
        live.status !== 'playing'
      ) {
        return;
      }
      runInBackground(loopFromEndVerse(ctx));
    }, check.delayMs);
  }
}

// --- the end of a chapter ------------------------------------------------------

/**
 * What plays after `finished` played to its end while a passage repeats: its next
 * chapter, or the passage's start (at the start verse where there are timings). Null
 * when repeat is not 'passage' or no passage chapter has audio.
 */
export async function resolvePassageFinishTarget(
  resolveAudioCoverage: ResolveAudioCoverage,
  finished: ChapterRef & { translationId: string }
): Promise<PassagePlaybackStart | null> {
  const active = activePassage();
  if (!active) return null;
  const { passage } = active;
  const advance = resolvePassageChapterAdvance(
    passage,
    finished,
    await passageCoverage(resolveAudioCoverage, finished.translationId, passage)
  );
  if (!advance) return null;
  if (!advance.loops)
    return { bookId: advance.bookId, chapter: advance.chapter, startPositionMs: 0 };
  const timings = hasVerseBoundIn(passage, advance)
    ? await loadTimings(finished.translationId, advance.bookId, advance.chapter)
    : null;
  return {
    bookId: advance.bookId,
    chapter: advance.chapter,
    startPositionMs: resolvePassageLoopStartMs(passage, advance.chapter, timings),
  };
}

// --- setting the passage -------------------------------------------------------

/** Armed when a passage is set with nothing loaded; the next Play starts at the passage. */
let pendingEngagement: { requestId: number } | null = null;
let passageSubscription: (() => void) | null = null;
let latestContext: PassageRepeatContext | null = null;

/** Cues `target` without playing it, so Play (here or on the lock screen) starts there. */
async function cueChapter(
  ctx: PassageRepeatContext,
  translationId: string,
  target: PassagePlaybackStart
): Promise<void> {
  // Supersedes any load still in flight, as a pause would.
  ctx.session.playRequestId += 1;
  pausedByListener.current = true;
  chapterTransition.current = false;
  const store = useAudioStore.getState();
  store.setCurrentTrack(translationId, target.bookId, target.chapter, target.startPositionMs);
  // Unloaded, Play loads the cued chapter at its resume point (resolvePlaybackStart).
  await audioPlayer.stop();
}

/** Moves a loaded chapter that is outside the passage to the passage's start. */
async function moveIntoPassage(
  ctx: PassageRepeatContext,
  active: { raw: RepeatPassage; passage: RepeatPassage }
): Promise<void> {
  const { passage, raw } = active;
  const at = captureTrack(ctx, raw);
  const timings = hasVerseBoundIn(passage, at)
    ? await loadTimings(at.translationId, at.bookId, at.chapter)
    : null;
  if (tookOver(ctx, at)) return;
  const positionMs = useAudioStore.getState().currentPosition;
  if (isPassagePosition(passage, { ...at, positionMs }, timings)) return;

  const target = await resolveLoopStart(ctx.resolveAudioCoverage, at.translationId, passage);
  if (!target || tookOver(ctx, at)) return;
  resetBoundaryWatch();

  if (target.bookId === at.bookId && target.chapter === at.chapter && audioPlayer.isLoaded()) {
    // Playing or paused, the loaded sound only has to move.
    await seekLoadedChapter(ctx.session, target.startPositionMs);
    return;
  }
  if (useAudioStore.getState().status === 'paused') {
    await cueChapter(ctx, at.translationId, target);
    return;
  }
  if (!ctx.session.playChapterForTranslation) return;
  await ctx.session.playChapterForTranslation(
    at.translationId,
    target.bookId,
    target.chapter,
    undefined,
    { startPositionMs: target.startPositionMs }
  );
}

function engagePassage(ctx: PassageRepeatContext): void {
  const active = activePassage();
  resetBoundaryWatch();
  if (!active) return;
  const { status, currentBookId, currentChapter } = useAudioStore.getState();
  if (!currentBookId || !currentChapter || status === 'idle' || status === 'error') {
    pendingEngagement = { requestId: ctx.session.playRequestId };
    // The Play that follows should not wait on the timing table.
    const { currentTranslationId, lastPlayedTranslationId } = useAudioStore.getState();
    const translationId =
      currentTranslationId ?? lastPlayedTranslationId ?? ctx.fallbackTranslationId;
    const { passage } = active;
    if (hasVerseBoundIn(passage, { bookId: passage.bookId, chapter: passage.start.chapter })) {
      runInBackground(loadTimings(translationId, passage.bookId, passage.start.chapter));
    }
    return;
  }
  pendingEngagement = null;
  runInBackground(moveIntoPassage(ctx, active));
}

/**
 * Starts following the passage the listener sets. A store subscription, like the
 * music bed's, created once however many players mount; the latest player's context
 * carries it out.
 */
export function followRepeatPassage(ctx: PassageRepeatContext): void {
  latestContext = ctx;
  passageSubscription ??= useAudioStore.subscribe((state, previous) => {
    if (state.repeatMode !== 'passage' || !state.repeatPassage) {
      if (previous.repeatMode === 'passage') {
        pendingEngagement = null;
        resetBoundaryWatch();
      }
      return;
    }
    const isNewlySet =
      previous.repeatMode !== 'passage' || state.repeatPassage !== previous.repeatPassage;
    if (isNewlySet && latestContext) engagePassage(latestContext);
  });
}

/** Whether the next Play is to be steered into a passage just set with nothing loaded. */
export function isPassagePlayRedirectPending(ctx: PassageRepeatContext): boolean {
  return (
    pendingEngagement !== null &&
    pendingEngagement.requestId === ctx.session.playRequestId &&
    activePassage() !== null
  );
}

/**
 * Play, when a passage was set with nothing loaded: a chapter outside the passage
 * starts at the passage's start instead. Anything else is returned unchanged. Only
 * the first Play after setting it, and only if nothing else took over playback first.
 */
export async function redirectPlayToPassage(
  ctx: PassageRepeatContext,
  request: PlayRequest
): Promise<PlayRequest> {
  const pending = pendingEngagement;
  pendingEngagement = null;
  if (!pending || pending.requestId !== ctx.session.playRequestId) return request;
  const active = activePassage();
  if (!active) return request;
  const { passage } = active;
  const timings = hasVerseBoundIn(passage, request)
    ? await loadTimings(request.translationId, request.bookId, request.chapter)
    : null;
  if (isPassagePosition(passage, { ...request, positionMs: request.startPositionMs }, timings)) {
    return request;
  }
  const target = await resolveLoopStart(ctx.resolveAudioCoverage, request.translationId, passage);
  return target ? { translationId: request.translationId, ...target } : request;
}

/** Forgets every in-memory passage decision (each test starts from nothing). */
export function resetPassageRepeatState(): void {
  resetBoundaryWatch();
  loopInFlight = false;
  pendingEngagement = null;
  timingsCache.clear();
  timingsLoads.clear();
}
