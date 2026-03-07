import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AudioStatus, PlaybackRate, SleepTimerOption } from '../types';
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
        }),

      setPosition: (position) => set({ currentPosition: position }),

      setDuration: (duration) => set({ duration }),

      setError: (error) => set({ error, status: error ? 'error' : 'idle' }),

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
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...sanitizePersistedAudioState(persistedState),
      }),
    }
  )
);
