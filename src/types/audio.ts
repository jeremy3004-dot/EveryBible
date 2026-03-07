// Audio playback types for Bible audio feature

export type AudioStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface AudioTrack {
  bookId: string;
  chapter: number;
  audioUrl: string;
  duration?: number; // milliseconds
}

export interface AudioPlaybackState {
  status: AudioStatus;
  currentBookId: string | null;
  currentChapter: number | null;
  currentPosition: number; // milliseconds
  duration: number; // milliseconds
  playbackRate: number;
}

export interface AudioSettings {
  playbackRate: number; // 0.5 - 2.0
  autoAdvanceChapter: boolean;
  sleepTimerMinutes: number | null;
}

export type PlaybackRate = 0.75 | 1.0 | 1.25 | 1.5 | 2.0;

export const PLAYBACK_RATES: PlaybackRate[] = [0.75, 1.0, 1.25, 1.5, 2.0];

export type SleepTimerOption = 5 | 10 | 15 | 30 | 60 | null;

export const SLEEP_TIMER_OPTIONS: { label: string; value: SleepTimerOption }[] = [
  { label: 'Off', value: null },
  { label: '5 min', value: 5 },
  { label: '10 min', value: 10 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
];

// Bible.is API response types
export interface BibleIsAudioFile {
  book_id: string;
  chapter_start: number;
  chapter_end: number;
  verse_start: number;
  verse_end: number;
  path: string;
  duration: number;
}

export interface BibleIsAudioResponse {
  data: BibleIsAudioFile[];
}
