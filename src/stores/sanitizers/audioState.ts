/** Sanitizer for persisted audio playback settings and queue. */
import {
  BACKGROUND_MUSIC_CHOICES,
  PLAYBACK_RATES,
  REPEAT_MODES,
  SLEEP_TIMER_OPTIONS,
} from '../../types/audio';
import type {
  BackgroundMusicChoice,
  PlaybackRate,
  RepeatMode,
  RepeatPassage,
  RepeatPassagePoint,
  SleepTimerOption,
} from '../../types';
import { getAudioTrackId } from '../audioQueueModel';
import { sanitizeBookId, sanitizeTranslationId } from './bibleIds';
import { isRecord } from './guards';

const validPlaybackRates = new Set<PlaybackRate>(PLAYBACK_RATES);
const validRepeatModes = new Set<RepeatMode>(REPEAT_MODES);
const validSleepTimers = new Set<SleepTimerOption>(
  SLEEP_TIMER_OPTIONS.map((option) => option.value)
);
const validBackgroundMusicChoices = new Set<BackgroundMusicChoice>(BACKGROUND_MUSIC_CHOICES);

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

const sanitizePassagePoint = (value: unknown): RepeatPassagePoint | null =>
  isRecord(value) && isPositiveInteger(value.chapter) && isPositiveInteger(value.verse)
    ? { chapter: value.chapter, verse: value.verse }
    : null;

/** A stored passage survives only whole, inside one known book, with start before end. */
const sanitizeRepeatPassage = (value: unknown): RepeatPassage | null => {
  if (!isRecord(value)) return null;
  const bookId = sanitizeBookId(value.bookId);
  const start = sanitizePassagePoint(value.start);
  const end = sanitizePassagePoint(value.end);
  if (!bookId || !start || !end) return null;
  const startsAfterEnd =
    start.chapter > end.chapter || (start.chapter === end.chapter && start.verse > end.verse);
  return startsAfterEnd ? null : { bookId, start, end };
};

const sanitizeUnitVolume = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

export const sanitizePersistedAudioState = (value: unknown) => {
  const persisted = isRecord(value) ? value : {};
  const queue = Array.isArray(persisted.queue)
    ? persisted.queue.flatMap((entry) => {
        if (!isRecord(entry)) {
          return [];
        }

        const translationId = sanitizeTranslationId(entry.translationId);
        const bookId = sanitizeBookId(entry.bookId);
        const chapter =
          typeof entry.chapter === 'number' && Number.isInteger(entry.chapter) && entry.chapter > 0
            ? entry.chapter
            : null;
        const addedAt =
          typeof entry.addedAt === 'number' && Number.isFinite(entry.addedAt)
            ? entry.addedAt
            : null;

        if (!translationId || !bookId || chapter == null || addedAt == null) {
          return [];
        }

        return [
          {
            id: getAudioTrackId(translationId, bookId, chapter),
            translationId,
            bookId,
            chapter,
            addedAt,
          },
        ];
      })
    : [];

  const repeatPassage = sanitizeRepeatPassage(persisted.repeatPassage);

  return {
    playbackRate:
      typeof persisted.playbackRate === 'number' &&
      validPlaybackRates.has(persisted.playbackRate as PlaybackRate)
        ? (persisted.playbackRate as PlaybackRate)
        : 1.0,
    autoAdvanceChapter:
      typeof persisted.autoAdvanceChapter === 'boolean' ? persisted.autoAdvanceChapter : true,
    repeatMode: validRepeatModes.has(persisted.repeatMode as RepeatMode)
      ? // Passage repeat means nothing without a passage to loop.
        persisted.repeatMode === 'passage' && !repeatPassage
        ? 'off'
        : (persisted.repeatMode as RepeatMode)
      : 'off',
    repeatPassage,
    narrationVolume: sanitizeUnitVolume(persisted.narrationVolume, 1),
    backgroundMusicLevel: sanitizeUnitVolume(persisted.backgroundMusicLevel, 0.5),
    // An End of chapter timer is for the session it was set in; restored, it would stop
    // a later session's first chapter unasked (a minute timer's countdown isn't saved).
    sleepTimerMinutes:
      validSleepTimers.has(persisted.sleepTimerMinutes as SleepTimerOption) &&
      persisted.sleepTimerMinutes !== 'end-of-chapter'
        ? ((persisted.sleepTimerMinutes as SleepTimerOption) ?? null)
        : null,
    backgroundMusicChoice: validBackgroundMusicChoices.has(
      persisted.backgroundMusicChoice as BackgroundMusicChoice
    )
      ? (persisted.backgroundMusicChoice as BackgroundMusicChoice)
      : 'off',
    queue,
    queueIndex:
      typeof persisted.queueIndex === 'number' &&
      Number.isInteger(persisted.queueIndex) &&
      persisted.queueIndex >= 0 &&
      persisted.queueIndex < Math.max(queue.length, 1)
        ? persisted.queueIndex
        : 0,
    lastPlayedTranslationId: sanitizeTranslationId(persisted.lastPlayedTranslationId),
    lastPlayedBookId: sanitizeBookId(persisted.lastPlayedBookId),
    lastPlayedChapter:
      typeof persisted.lastPlayedChapter === 'number' &&
      Number.isInteger(persisted.lastPlayedChapter) &&
      persisted.lastPlayedChapter > 0
        ? persisted.lastPlayedChapter
        : null,
    lastPosition:
      typeof persisted.lastPosition === 'number' &&
      Number.isFinite(persisted.lastPosition) &&
      persisted.lastPosition >= 0
        ? persisted.lastPosition
        : 0,
  };
};
