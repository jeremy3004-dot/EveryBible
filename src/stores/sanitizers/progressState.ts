/** Sanitizer for the persisted reading/listening progress ledger. */
import { getBookById } from '../../constants/books';
import { isRecord } from './guards';

const sanitizeChapterTimestampMap = (value: unknown): Record<string, number> => {
  const source = isRecord(value) ? value : {};
  return Object.fromEntries(
    Object.entries(source).filter(([key, timestamp]) => {
      if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) {
        return false;
      }

      const separatorIndex = key.lastIndexOf('_');
      if (separatorIndex <= 0) {
        return false;
      }

      const bookId = key.slice(0, separatorIndex);
      const chapter = Number(key.slice(separatorIndex + 1));
      return Boolean(getBookById(bookId)) && Number.isInteger(chapter) && chapter > 0;
    })
  ) as Record<string, number>;
};

// "YYYY-MM-DD" -> accumulated milliseconds. Anything that is not a plain local
// date key with a positive finite duration is dropped, so a corrupted or
// pre-upgrade payload degrades to an empty ledger rather than NaN totals.
const LOCAL_DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const sanitizeDailyDurationMap = (value: unknown): Record<string, number> => {
  const source = isRecord(value) ? value : {};
  return Object.fromEntries(
    Object.entries(source).filter(
      ([key, ms]) =>
        LOCAL_DATE_KEY_PATTERN.test(key) && typeof ms === 'number' && Number.isFinite(ms) && ms > 0
    )
  ) as Record<string, number>;
};

// "YYYY-MM-DD" -> chapters that day. Same key rule; counts are whole numbers.
const sanitizeDailyCountMap = (value: unknown): Record<string, number> =>
  Object.fromEntries(
    Object.entries(sanitizeDailyDurationMap(value))
      .map(([key, count]) => [key, Math.floor(count)] as const)
      .filter(([, count]) => count > 0)
  );

export const sanitizePersistedProgressState = (value: unknown) => {
  const persisted = isRecord(value) ? value : {};
  const chaptersRead = sanitizeChapterTimestampMap(persisted.chaptersRead);
  // Both listening fields default to empty, so installs that persisted progress
  // before the Home ledger shipped hydrate cleanly instead of crashing on undefined.
  const chaptersListened = sanitizeChapterTimestampMap(persisted.chaptersListened);
  const listeningMsByDate = sanitizeDailyDurationMap(persisted.listeningMsByDate);
  const chaptersByDate = sanitizeDailyCountMap(persisted.chaptersByDate);

  return {
    chaptersRead,
    chaptersListened,
    listeningMsByDate,
    chaptersByDate,
    streakDays:
      typeof persisted.streakDays === 'number' &&
      Number.isFinite(persisted.streakDays) &&
      persisted.streakDays >= 0
        ? Math.floor(persisted.streakDays)
        : 0,
    lastReadDate:
      typeof persisted.lastReadDate === 'string' && persisted.lastReadDate.length > 0
        ? persisted.lastReadDate
        : null,
  };
};
