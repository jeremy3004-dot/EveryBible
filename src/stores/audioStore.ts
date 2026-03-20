import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AudioStatus, PlaybackRate, SleepTimerOption } from '../types';
import type { AudioQueueEntry } from './audioQueueModel';
import { sanitizePersistedAudioState } from './persistedStateSanitizers';

interface AudioState {
  // Playback state (not persisted)
  status: AudioStatus;
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
  lastPlayedBookId: string | null;
  lastPlayedChapter: number | null;
  lastPosition: number;

  // Sleep timer state
  sleepTimerEndTime: number | null;

  // Settings (persisted)
  playbackRate: PlaybackRate;
  autoAdvanceChapter: boolean;
  sleepTimerMinutes: SleepTimerOption;

  // Playback actions
  setStatus: (status: AudioStatus) => void;
  setCurrentTrack: (bookId: string | null, chapter: number | null) => void;
  setPosition: (position: number) => void;
  setDuration: (duration: number) => void;
  setError: (error: string | null) => void;
  syncQueueToTrack: (bookId: string, chapter: number) => void;
  addToQueue: (bookId: string, chapter: number) => void;
  removeFromQueue: (entryId: string) => void;
  clearQueue: () => void;
  setQueueIndex: (queueIndex: number) => void;

  // Player visibility
  setShowPlayer: (show: boolean) => void;
  togglePlayer: () => void;

  // Settings actions
  setPlaybackRate: (rate: PlaybackRate) => void;
  setAutoAdvanceChapter: (enabled: boolean) => void;
  setSleepTimer: (minutes: SleepTimerOption) => void;
  clearSleepTimer: () => void;

  // Reset
  resetPlayback: () => void;
}

export const useAudioStore = create<AudioState>()(
  persist(
    (set) => ({
      // Initial playback state
      status: 'idle',
      currentBookId: null,
      currentChapter: null,
      currentPosition: 0,
      duration: 0,
      error: null,
      showPlayer: false,
      queue: [],
      queueIndex: 0,
      lastPlayedBookId: null,
      lastPlayedChapter: null,
      lastPosition: 0,
      sleepTimerEndTime: null,

      // Initial settings
      playbackRate: 1.0,
      autoAdvanceChapter: true,
      sleepTimerMinutes: null,

      // Playback actions
      setStatus: (status) => set({ status, error: status === 'error' ? 'Playback error' : null }),

      setCurrentTrack: (bookId, chapter) =>
        set({
          currentBookId: bookId,
          currentChapter: chapter,
          currentPosition: 0,
          duration: 0,
          lastPlayedBookId: bookId,
          lastPlayedChapter: chapter,
          lastPosition: 0,
        }),

      setPosition: (position) =>
        set({
          currentPosition: position,
          lastPosition: position,
        }),

      setDuration: (duration) => set({ duration }),

      setError: (error) => set({ error, status: error ? 'error' : 'idle' }),

      syncQueueToTrack: (bookId, chapter) =>
        set((state) => {
          const queueId = `${bookId}:${chapter}`;
          const existingIndex = state.queue.findIndex((entry) => entry.id === queueId);

          if (existingIndex >= 0) {
            return { queueIndex: existingIndex };
          }

          return {
            queue: [{ id: queueId, bookId, chapter, addedAt: Date.now() }],
            queueIndex: 0,
          };
        }),

      addToQueue: (bookId, chapter) =>
        set((state) => {
          const queueId = `${bookId}:${chapter}`;
          if (state.queue.some((entry) => entry.id === queueId)) {
            return state;
          }

          return {
            queue: [...state.queue, { id: queueId, bookId, chapter, addedAt: Date.now() }],
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

      // Player visibility
      setShowPlayer: (show) => set({ showPlayer: show }),
      togglePlayer: () => set((state) => ({ showPlayer: !state.showPlayer })),

      // Settings actions
      setPlaybackRate: (rate) => set({ playbackRate: rate }),

      setAutoAdvanceChapter: (enabled) => set({ autoAdvanceChapter: enabled }),

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

      // Reset playback state
      resetPlayback: () =>
        set({
          status: 'idle',
          currentBookId: null,
          currentChapter: null,
          currentPosition: 0,
          duration: 0,
          error: null,
        }),
    }),
    {
      name: 'audio-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist settings, not playback state
      partialize: (state) => ({
        playbackRate: state.playbackRate,
        autoAdvanceChapter: state.autoAdvanceChapter,
        sleepTimerMinutes: state.sleepTimerMinutes,
        queue: state.queue,
        queueIndex: state.queueIndex,
        lastPlayedBookId: state.lastPlayedBookId,
        lastPlayedChapter: state.lastPlayedChapter,
        lastPosition: state.lastPosition,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...sanitizePersistedAudioState(persistedState),
      }),
    }
  )
);
