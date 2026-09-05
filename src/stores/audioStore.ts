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

  // Sleep timer state
  sleepTimerEndTime: number | null;

  // Settings (persisted)
  playbackRate: PlaybackRate;
  autoAdvanceChapter: boolean;
  repeatMode: RepeatMode;
  sleepTimerMinutes: SleepTimerOption;
  backgroundMusicChoice: BackgroundMusicChoice;

  // Playback actions
  setStatus: (status: AudioStatus) => void;
  setCurrentTrack: (
    translationId: string | null,
    bookId: string | null,
    chapter: number | null
  ) => void;
  setPosition: (position: number) => void;
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

      // Initial settings
      playbackRate: 1.0,
      autoAdvanceChapter: true,
      repeatMode: 'off',
      sleepTimerMinutes: null,
      backgroundMusicChoice: 'off',

      // Playback actions
      setStatus: (status) => {
        const error = status === 'error' ? 'Playback error' : null;
        if (get().status !== status || get().error !== error) set({ status, error });
      },

      setCurrentTrack: (translationId, bookId, chapter) =>
        set({
          currentTranslationId: translationId,
          currentBookId: bookId,
          currentChapter: chapter,
          currentPosition: 0,
          duration: 0,
          lastPlayedTranslationId: translationId,
          lastPlayedBookId: bookId,
          lastPlayedChapter: chapter,
          lastPosition: 0,
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

      setDuration: (duration) => {
        if (get().duration !== duration) set({ duration });
      },

      setError: (error) => set({ error, status: error ? 'error' : 'idle' }),

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

      setSleepTimer: (minutes) =>
        set({
          sleepTimerMinutes: minutes,
          sleepTimerEndTime: minutes ? Date.now() + minutes * 60 * 1000 : null,
        }),

      clearSleepTimer: () =>
        set({
          sleepTimerMinutes: null,
          sleepTimerEndTime: null,
        }),

      setBackgroundMusicChoice: (choice) => set({ backgroundMusicChoice: choice }),

      // Reset playback state
      resetPlayback: () =>
        set({
          status: 'idle',
          currentTranslationId: null,
          currentBookId: null,
          currentChapter: null,
          currentPosition: 0,
          duration: 0,
          error: null,
          audioReturnTarget: null,
        }),
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
