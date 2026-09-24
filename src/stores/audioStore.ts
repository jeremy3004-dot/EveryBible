import { create } from 'zustand';
import {
  persist,
  createJSONStorage,
  type PersistStorage,
  type StorageValue,
} from 'zustand/middleware';
import { zustandStorage } from './mmkvStorage';
import type {
  AudioPlaybackSequenceEntry,
  AudioReturnTarget,
  AudioStatus,
  BackgroundMusicChoice,
  PlaybackRate,
  RepeatMode,
  SleepTimerOption,
} from '../types';
import { getAudioTrackId, syncAudioQueueToTrack, type AudioQueueEntry } from './audioQueueModel';
import { getNextRepeatMode } from './audioPlaybackCompletionModel';
import { sanitizePersistedAudioState } from './persistedStateSanitizers';

interface AudioState {
  // Playback state (not persisted)
  status: AudioStatus;
  currentTranslationId: string | null;
  currentBookId: string | null;
  currentChapter: number | null;
  currentPosition: number; // milliseconds
  duration: number; // milliseconds
  error: string | null;

  // Player visibility
  showPlayer: boolean;

  // Queue and resume state
  queue: AudioQueueEntry[];
  queueIndex: number;
  playbackSequence: AudioPlaybackSequenceEntry[];
  audioReturnTarget: AudioReturnTarget | null;
  lastPlayedTranslationId: string | null;
  lastPlayedBookId: string | null;
  lastPlayedChapter: number | null;
  lastPosition: number;

  // Sleep timer state. The timer only runs while audio plays (the podcast and
  // audiobook convention): while it runs `sleepTimerEndTime` holds the
  // wall-clock stop time; while playback is paused or stopped the countdown is
  // frozen in `sleepTimerRemainingMs` and the end time is recomputed on resume.
  sleepTimerEndTime: number | null;
  sleepTimerRemainingMs: number | null;

  // Settings (persisted)
  playbackRate: PlaybackRate;
  autoAdvanceChapter: boolean;
  repeatMode: RepeatMode;
  sleepTimerMinutes: SleepTimerOption;
  backgroundMusicChoice: BackgroundMusicChoice;

  // Playback actions
  setStatus: (status: AudioStatus) => void;
  /**
   * Selects the chapter to play. `startPosition` is where it will start (a resume
   * point), kept as the durable resume anchor until playback moves on from it.
   */
  setCurrentTrack: (
    translationId: string | null,
    bookId: string | null,
    chapter: number | null,
    startPosition?: number
  ) => void;
  setPosition: (position: number) => void;
  /** Drops the durable resume point, e.g. once a chapter has been heard to the end. */
  clearResumePosition: () => void;
  setDuration: (duration: number) => void;
  setError: (error: string | null) => void;
  syncQueueToTrack: (translationId: string, bookId: string, chapter: number) => void;
  addToQueue: (translationId: string, bookId: string, chapter: number) => void;
  removeFromQueue: (entryId: string) => void;
  clearQueue: () => void;
  setQueueIndex: (queueIndex: number) => void;
  setPlaybackSequence: (entries: AudioPlaybackSequenceEntry[]) => void;
  clearPlaybackSequence: () => void;
  setAudioReturnTarget: (target: AudioReturnTarget) => void;
  clearAudioReturnTarget: () => void;

  // Player visibility
  setShowPlayer: (show: boolean) => void;
  togglePlayer: () => void;

  // Settings actions
  setPlaybackRate: (rate: PlaybackRate) => void;
  setAutoAdvanceChapter: (enabled: boolean) => void;
  setRepeatMode: (mode: RepeatMode) => void;
  cycleRepeatMode: () => void;
  setSleepTimer: (minutes: SleepTimerOption) => void;
  clearSleepTimer: () => void;
  setBackgroundMusicChoice: (choice: BackgroundMusicChoice) => void;

  // Reset
  resetPlayback: () => void;
}

/** Statuses during which a sleep timer counts down; buffering counts as playing. */
const isSleepTimerRunningStatus = (status: AudioStatus) =>
  status === 'playing' || status === 'loading';

type SleepTimerFields = Pick<AudioState, 'sleepTimerEndTime' | 'sleepTimerRemainingMs'>;

/**
 * Moves the sleep timer between its running (end time) and frozen (remaining
 * time) forms to follow a playback status change. Returns null when nothing changes.
 */
function getSleepTimerForStatus(
  state: SleepTimerFields,
  status: AudioStatus,
  now: number
): SleepTimerFields | null {
  if (isSleepTimerRunningStatus(status)) {
    if (state.sleepTimerRemainingMs === null) return null;
    return { sleepTimerEndTime: now + state.sleepTimerRemainingMs, sleepTimerRemainingMs: null };
  }
  if (state.sleepTimerEndTime === null) return null;
  return {
    sleepTimerEndTime: null,
    sleepTimerRemainingMs: Math.max(0, state.sleepTimerEndTime - now),
  };
}

const selectPersistedAudioState = (state: AudioState) => ({
  playbackRate: state.playbackRate,
  autoAdvanceChapter: state.autoAdvanceChapter,
  repeatMode: state.repeatMode,
  sleepTimerMinutes: state.sleepTimerMinutes,
  backgroundMusicChoice: state.backgroundMusicChoice,
  queue: state.queue,
  queueIndex: state.queueIndex,
  lastPlayedTranslationId: state.lastPlayedTranslationId,
  lastPlayedBookId: state.lastPlayedBookId,
  lastPlayedChapter: state.lastPlayedChapter,
  lastPosition: state.lastPosition,
});

type PersistedAudioState = ReturnType<typeof selectPersistedAudioState>;
const audioJsonStorage = createJSONStorage<PersistedAudioState>(() => zustandStorage)!;
let lastSavedAudio: StorageValue<PersistedAudioState> | undefined;

function hasSameSavedAudio(left: PersistedAudioState, right: PersistedAudioState): boolean {
  // Both values come from the same fixed projection. Avoid allocating Maps or
  // serializing the queue just to check the fixed saved fields.
  for (const key in right) {
    const field = key as keyof PersistedAudioState;
    if (!Object.is(left[field], right[field])) return false;
  }
  return true;
}

// Zustand calls storage even when partialize excludes the changed field. Compare
// before JSON serialization so 250ms playback ticks do not serialize the queue or
// cross the native storage boundary between the existing resume checkpoints.
const audioStorage: PersistStorage<PersistedAudioState> = {
  getItem: (name) => {
    lastSavedAudio = undefined;
    return audioJsonStorage.getItem(name);
  },
  removeItem: (name) => {
    lastSavedAudio = undefined;
    return audioJsonStorage.removeItem(name);
  },
  setItem: (name, value) => {
    if (
      lastSavedAudio?.version === value.version &&
      lastSavedAudio &&
      hasSameSavedAudio(lastSavedAudio.state, value.state)
    ) {
      return;
    }
    const result = audioJsonStorage.setItem(name, value);
    // MMKV is synchronous. Only remember successful synchronous saves; an async
    // adapter can still work, but must not suppress a write before it has finished.
    lastSavedAudio = result === undefined ? value : undefined;
    return result;
  },
};

export const useAudioStore = create<AudioState>()(
  persist(
    (set, get) => ({
      // Initial playback state
      status: 'idle',
      currentTranslationId: null,
      currentBookId: null,
      currentChapter: null,
      currentPosition: 0,
      duration: 0,
      error: null,
      showPlayer: false,
      queue: [],
      queueIndex: 0,
      playbackSequence: [],
      audioReturnTarget: null,
      lastPlayedTranslationId: null,
      lastPlayedBookId: null,
      lastPlayedChapter: null,
      lastPosition: 0,
      sleepTimerEndTime: null,
      sleepTimerRemainingMs: null,

      // Initial settings
      playbackRate: 1.0,
      autoAdvanceChapter: true,
      repeatMode: 'off',
      sleepTimerMinutes: null,
      backgroundMusicChoice: 'off',

      // Playback actions
      setStatus: (status) => {
        const state = get();
        const error = status === 'error' ? 'Playback error' : null;
        if (state.status !== status || state.error !== error) {
          set({ status, error, ...getSleepTimerForStatus(state, status, Date.now()) });
        }
      },

      setCurrentTrack: (translationId, bookId, chapter, startPosition = 0) =>
        set({
          currentTranslationId: translationId,
          currentBookId: bookId,
          currentChapter: chapter,
          currentPosition: startPosition,
          duration: 0,
          lastPlayedTranslationId: translationId,
          lastPlayedBookId: bookId,
          lastPlayedChapter: chapter,
          lastPosition: startPosition,
        }),

      setPosition: (position) => {
        const state = get();
        const lastPosition =
          Math.abs(position - state.lastPosition) >= 5000 || position === 0
            ? position
            : state.lastPosition;
        if (state.currentPosition !== position || state.lastPosition !== lastPosition) {
          set({ currentPosition: position, lastPosition });
        }
      },

      clearResumePosition: () => {
        if (get().lastPosition !== 0) set({ lastPosition: 0 });
      },

      setDuration: (duration) => {
        if (get().duration !== duration) set({ duration });
      },

      setError: (error) => {
        const status: AudioStatus = error ? 'error' : 'idle';
        set({ error, status, ...getSleepTimerForStatus(get(), status, Date.now()) });
      },

      syncQueueToTrack: (translationId, bookId, chapter) =>
        set((state) => {
          const nextQueueState = syncAudioQueueToTrack(state.queue, {
            translationId,
            bookId,
            chapter,
            addedAt: Date.now(),
          });

          return nextQueueState;
        }),

      addToQueue: (translationId, bookId, chapter) =>
        set((state) => {
          const queueId = getAudioTrackId(translationId, bookId, chapter);
          if (state.queue.some((entry) => entry.id === queueId)) {
            return state;
          }

          return {
            queue: [
              ...state.queue,
              { id: queueId, translationId, bookId, chapter, addedAt: Date.now() },
            ],
          };
        }),

      removeFromQueue: (entryId) =>
        set((state) => {
          const nextQueue = state.queue.filter((entry) => entry.id !== entryId);
          const nextIndex = Math.min(state.queueIndex, Math.max(nextQueue.length - 1, 0));

          return {
            queue: nextQueue,
            queueIndex: nextQueue.length === 0 ? 0 : nextIndex,
          };
        }),

      clearQueue: () => set({ queue: [], queueIndex: 0 }),
      setQueueIndex: (queueIndex) => set({ queueIndex }),
      setPlaybackSequence: (entries) => set({ playbackSequence: entries }),
      clearPlaybackSequence: () => set({ playbackSequence: [] }),
      setAudioReturnTarget: (audioReturnTarget) => set({ audioReturnTarget }),
      clearAudioReturnTarget: () => set({ audioReturnTarget: null }),

      // Player visibility
      setShowPlayer: (show) => set({ showPlayer: show }),
      togglePlayer: () => set((state) => ({ showPlayer: !state.showPlayer })),

      // Settings actions
      setPlaybackRate: (rate) => set({ playbackRate: rate }),

      setAutoAdvanceChapter: (enabled) => set({ autoAdvanceChapter: enabled }),

      setRepeatMode: (mode) => set({ repeatMode: mode }),

      cycleRepeatMode: () =>
        set((state) => ({
          repeatMode: getNextRepeatMode(state.repeatMode),
        })),

      setSleepTimer: (minutes) => {
        const lengthMs = minutes ? minutes * 60 * 1000 : null;
        const isRunning = lengthMs !== null && isSleepTimerRunningStatus(get().status);
        set({
          sleepTimerMinutes: minutes,
          sleepTimerEndTime: isRunning ? Date.now() + lengthMs : null,
          sleepTimerRemainingMs: isRunning ? null : lengthMs,
        });
      },

      clearSleepTimer: () =>
        set({
          sleepTimerMinutes: null,
          sleepTimerEndTime: null,
          sleepTimerRemainingMs: null,
        }),

      setBackgroundMusicChoice: (choice) => set({ backgroundMusicChoice: choice }),

      // Reset playback state
      resetPlayback: () =>
        set((state) => ({
          ...getSleepTimerForStatus(state, 'idle', Date.now()),
          status: 'idle',
          currentTranslationId: null,
          currentBookId: null,
          currentChapter: null,
          currentPosition: 0,
          duration: 0,
          error: null,
          audioReturnTarget: null,
        })),
    }),
    {
      name: 'audio-storage',
      storage: audioStorage,
      partialize: selectPersistedAudioState,
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...sanitizePersistedAudioState(persistedState),
      }),
    }
  )
);
