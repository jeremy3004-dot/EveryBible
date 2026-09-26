import type { PlanSessionKey, RhythmSessionContext } from '../services/plans/types';

// Audio playback types for Bible audio feature

export type AudioStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface AudioPlaybackSequenceEntry {
  bookId: string;
  chapter: number;
}

export interface AudioReturnTarget {
  translationId: string | null;
  bookId: string;
  chapter: number;
  preferredMode: 'listen' | 'read';
  planId?: string;
  planDayNumber?: number;
  planSessionKey?: PlanSessionKey;
  returnToPlanOnComplete?: boolean;
  sessionContext?: RhythmSessionContext;
}

export type PlaybackRate = 0.75 | 1.0 | 1.25 | 1.5 | 1.75 | 2.0 | 2.25 | 2.5;

export const PLAYBACK_RATES: PlaybackRate[] = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5];

export type RepeatMode = 'off' | 'chapter' | 'book' | 'passage';

export const REPEAT_MODES: RepeatMode[] = ['off', 'chapter', 'book', 'passage'];

/** A verse position inside a book, for the ends of a repeated passage. */
export interface RepeatPassagePoint {
  chapter: number;
  verse: number;
}

/**
 * The stretch that `repeatMode: 'passage'` loops: from `start` to `end`, both inclusive,
 * inside one book. Where a translation has no verse timings the ends round out to whole
 * chapters.
 */
export interface RepeatPassage {
  bookId: string;
  start: RepeatPassagePoint;
  end: RepeatPassagePoint;
}

/** Minutes of listening, or 'end-of-chapter' to stop when the current chapter finishes. */
export type SleepTimerOption = 5 | 10 | 15 | 30 | 60 | 'end-of-chapter' | null;

export const SLEEP_TIMER_OPTIONS: { label: string; value: SleepTimerOption }[] = [
  { label: 'Off', value: null },
  { label: '5 min', value: 5 },
  { label: '10 min', value: 10 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: 'End of chapter', value: 'end-of-chapter' },
];

export type BackgroundMusicChoice =
  | 'off'
  | 'ambient'
  | 'piano'
  | 'soft-guitar'
  | 'harp'
  | 'flute'
  | 'sitar'
  | 'ocean-waves'
  | 'shuffle'
  | 'hymns'
  | 'gregorian-chant'
  | 'organ'
  | 'piano-cello'
  | 'rain'
  | 'gentle-breeze'
  | 'summer-night'
  | 'waterfall'
  | 'birdsong'
  | 'shore'
  | 'fireplace'
  | 'church-bells'
  | 'village'
  | 'garden'
  | 'wilderness';

export const BACKGROUND_MUSIC_CHOICES: BackgroundMusicChoice[] = [
  'off',
  'ambient',
  'piano',
  'soft-guitar',
  'harp',
  'flute',
  'sitar',
  'ocean-waves',
  'shuffle',
  'hymns',
  'gregorian-chant',
  'organ',
  'piano-cello',
  'rain',
  'gentle-breeze',
  'summer-night',
  'waterfall',
  'birdsong',
  'shore',
  'fireplace',
  'church-bells',
  'village',
  'garden',
  'wilderness',
];

// Bible.is API response types
interface BibleIsAudioFile {
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
