import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultAuthPreferences } from '../../stores/persistedStateSanitizers';
import { mergeChapterProgress, mergePreferences, mergeReadingSnapshot } from './syncMerge';
import type { LocalPreferenceSnapshot, LocalReadingSnapshot } from './syncMerge';
import type {
  UserPreferences as RemoteUserPreferences,
  UserProgress as RemoteUserProgress,
} from '../supabase/types';

test('mergeChapterProgress keeps the newest timestamp per chapter', () => {
  const merged = mergeChapterProgress(
    {
      GEN_1: 100,
      MAT_1: 300,
    },
    {
      GEN_1: 200,
      JHN_3: 150,
    }
  );

  assert.deepEqual(merged, {
    GEN_1: 200,
    MAT_1: 300,
    JHN_3: 150,
  });
});

test('mergeReadingSnapshot uses the remote reading position for a fresh local device', () => {
  const local: LocalReadingSnapshot = {
    chaptersRead: {},
    streakDays: 0,
    lastReadDate: null,
    currentBook: 'GEN',
    currentChapter: 1,
  };

  const remote: RemoteUserProgress = {
    id: 'progress-1',
    user_id: 'user-1',
    chapters_read: {
      JHN_3: 500,
    },
    streak_days: 4,
    last_read_date: '2026-03-09',
    current_book: 'JHN',
    current_chapter: 3,
    synced_at: '2026-03-09T06:00:00.000Z',
  };

  const merged = mergeReadingSnapshot(local, remote);

  assert.deepEqual(merged.progress.chaptersRead, { JHN_3: 500 });
  assert.equal(merged.progress.streakDays, 4);
  assert.equal(merged.progress.lastReadDate, '2026-03-09');
  assert.deepEqual(merged.readingPosition, {
    bookId: 'JHN',
    chapter: 3,
  });
  assert.equal(merged.positionSource, 'remote');
});

test('mergeReadingSnapshot keeps the newer local reading position when it is ahead', () => {
  const local: LocalReadingSnapshot = {
    chaptersRead: {
      JHN_4: 900,
    },
    streakDays: 2,
    lastReadDate: '2026-03-09',
    currentBook: 'JHN',
    currentChapter: 4,
  };

  const remote: RemoteUserProgress = {
    id: 'progress-1',
    user_id: 'user-1',
    chapters_read: {
      JHN_3: 500,
    },
    streak_days: 5,
    last_read_date: '2026-03-08',
    current_book: 'JHN',
    current_chapter: 3,
    synced_at: '2026-03-09T05:00:00.000Z',
  };

  const merged = mergeReadingSnapshot(local, remote);

  assert.deepEqual(merged.readingPosition, {
    bookId: 'JHN',
    chapter: 4,
  });
  assert.equal(merged.positionSource, 'local');
  assert.equal(merged.progress.streakDays, 5);
});

test('mergePreferences prefers the newer remote preferences snapshot', () => {
  const local: LocalPreferenceSnapshot = {
    preferences: {
      ...defaultAuthPreferences,
      theme: 'dark',
      language: 'en',
    },
    updatedAt: '2026-03-09T05:00:00.000Z',
  };

  const remote: RemoteUserPreferences = {
    id: 'prefs-1',
    user_id: 'user-1',
    font_size: 'large',
    theme: 'light',
    language: 'es',
    country_code: 'MX',
    country_name: 'Mexico',
    content_language_code: 'es',
    content_language_name: 'Spanish',
    content_language_native_name: 'Español',
    onboarding_completed: true,
    notifications_enabled: true,
    reminder_time: '08:00',
    synced_at: '2026-03-09T06:00:00.000Z',
  };

  const merged = mergePreferences(local, remote);

  assert.equal(merged.source, 'remote');
  assert.equal(merged.updatedAt, '2026-03-09T06:00:00.000Z');
  assert.equal(merged.preferences.theme, 'light');
  assert.equal(merged.preferences.language, 'es');
  assert.equal(merged.preferences.reminderTime, '08:00');
});

test('mergePreferences keeps the newer local preferences snapshot', () => {
  const local: LocalPreferenceSnapshot = {
    preferences: {
      ...defaultAuthPreferences,
      fontSize: 'large',
      theme: 'light',
      language: 'fr',
      onboardingCompleted: true,
    },
    updatedAt: '2026-03-09T07:00:00.000Z',
  };

  const remote: RemoteUserPreferences = {
    id: 'prefs-1',
    user_id: 'user-1',
    font_size: 'small',
    theme: 'dark',
    language: 'es',
    country_code: null,
    country_name: null,
    content_language_code: null,
    content_language_name: null,
    content_language_native_name: null,
    onboarding_completed: true,
    notifications_enabled: false,
    reminder_time: null,
    synced_at: '2026-03-09T06:00:00.000Z',
  };

  const merged = mergePreferences(local, remote);

  assert.equal(merged.source, 'local');
  assert.equal(merged.updatedAt, '2026-03-09T07:00:00.000Z');
  assert.equal(merged.preferences.theme, 'light');
  assert.equal(merged.preferences.language, 'fr');
  assert.equal(merged.preferences.fontSize, 'large');
});
