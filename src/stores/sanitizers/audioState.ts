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

  return {
    playbackRate:
      typeof persisted.playbackRate === 'number' &&
      validPlaybackRates.has(persisted.playbackRate as PlaybackRate)
        ? (persisted.playbackRate as PlaybackRate)
        : 1.0,
    autoAdvanceChapter:
      typeof persisted.autoAdvanceChapter === 'boolean' ? persisted.autoAdvanceChapter : true,
    repeatMode: validRepeatModes.has(persisted.repeatMode as RepeatMode)
      ? (persisted.repeatMode as RepeatMode)
      : 'off',
    sleepTimerMinutes: validSleepTimers.has(persisted.sleepTimerMinutes as SleepTimerOption)
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
