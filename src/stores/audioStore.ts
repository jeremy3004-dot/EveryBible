import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AudioStatus, PlaybackRate, SleepTimerOption } from '../types';
import {
  getAudioTrackId,
  syncAudioQueueToTrack,
  type AudioQueueEntry,
} from './audioQueueModel';
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
  lastPlayedTranslationId: string | null;
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
      currentTranslationId: null,
      currentBookId: null,
      currentChapter: null,
      currentPosition: 0,
      duration: 0,
      error: null,
      showPlayer: false,
      queue: [],
      queueIndex: 0,
      lastPlayedTranslationId: null,
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

      setPosition: (position) =>
        set({
          currentPosition: position,
          lastPosition: position,
        }),

      setDuration: (duration) => set({ duration }),

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
          currentTranslationId: null,
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
        lastPlayedTranslationId: state.lastPlayedTranslationId,
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
