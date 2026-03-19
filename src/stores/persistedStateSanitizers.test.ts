import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultAuthPreferences,
  sanitizePersistedAudioState,
  sanitizePersistedAuthState,
  sanitizePersistedBibleState,
  sanitizePersistedProgressState,
} from './persistedStateSanitizers';

test('sanitizePersistedBibleState falls back when translations are malformed', () => {
  const sanitized = sanitizePersistedBibleState({
    currentBook: 'INVALID',
    currentChapter: -4,
    currentTranslation: 'missing',
    translations: { broken: true },
  });

  assert.equal(sanitized.currentBook, 'GEN');
  assert.equal(sanitized.currentChapter, 1);
  assert.equal(sanitized.currentTranslation, 'bsb');
  assert.ok(Array.isArray(sanitized.translations));
  assert.ok(sanitized.translations.some((translation) => translation.id === 'bsb'));
});

test('sanitizePersistedBibleState preserves valid downloaded audio books only', () => {
  const sanitized = sanitizePersistedBibleState({
    translations: [
      {
        id: 'bsb',
        downloadedAudioBooks: ['GEN', 'INVALID', 'JHN'],
      },
    ],
  });

  const bsb = sanitized.translations.find((translation) => translation.id === 'bsb');
  assert.ok(bsb);
  assert.deepEqual(bsb.downloadedAudioBooks, ['GEN', 'JHN']);
});

test('sanitizePersistedBibleState refreshes bundled translation capabilities during upgrades', () => {
  const sanitized = sanitizePersistedBibleState({
    currentTranslation: 'web',
    translations: [
      {
        id: 'web',
        hasAudio: false,
        audioGranularity: 'none',
        downloadedAudioBooks: ['GEN'],
      },
    ],
  });

  const web = sanitized.translations.find((translation) => translation.id === 'web');

  assert.equal(sanitized.currentTranslation, 'web');
  assert.ok(web);
  assert.equal(web.hasAudio, true);
  assert.equal(web.audioGranularity, 'chapter');
  assert.deepEqual(web.downloadedAudioBooks, ['GEN']);
});

test('sanitizePersistedBibleState falls back when a retired translation is selected', () => {
  const sanitized = sanitizePersistedBibleState({
    currentTranslation: 'bsb_audio',
    translations: [
      {
        id: 'bsb_audio',
      },
    ],
  });

  assert.equal(sanitized.currentTranslation, 'bsb');
});

test('sanitizePersistedProgressState removes invalid chapter entries', () => {
  const sanitized = sanitizePersistedProgressState({
    chaptersRead: {
      GEN_1: Date.now(),
      INVALID_2: Date.now(),
      PSA_bad: Date.now(),
      JHN_3: 'oops',
    },
    streakDays: -2,
    lastReadDate: 123,
  });

  assert.deepEqual(Object.keys(sanitized.chaptersRead), ['GEN_1']);
  assert.equal(sanitized.streakDays, 0);
  assert.equal(sanitized.lastReadDate, null);
});

test('sanitizePersistedAuthState normalizes unsupported preferences', () => {
  const sanitized = sanitizePersistedAuthState({
    user: {
      uid: 'user-1',
      email: 123,
      displayName: 'Tester',
      photoURL: null,
      createdAt: 'bad',
      lastActive: 42,
    },
    isAuthenticated: true,
    preferences: {
      fontSize: 'huge',
      theme: 'sepia',
      language: 'xx',
      countryCode: 'usa',
      countryName: '',
      contentLanguageCode: 123,
      contentLanguageName: 'English',
      contentLanguageNativeName: '',
      onboardingCompleted: 'yes',
      notificationsEnabled: true,
      reminderTime: '9am',
    },
  });

  assert.equal(sanitized.user?.uid, 'user-1');
  assert.equal(sanitized.user?.email, null);
  assert.equal(sanitized.isAuthenticated, true);
  assert.equal(sanitized.preferences.fontSize, defaultAuthPreferences.fontSize);
  assert.equal(sanitized.preferences.theme, defaultAuthPreferences.theme);
  assert.equal(sanitized.preferences.language, defaultAuthPreferences.language);
  assert.equal(sanitized.preferences.countryCode, null);
  assert.equal(sanitized.preferences.countryName, null);
  assert.equal(sanitized.preferences.contentLanguageCode, null);
  assert.equal(sanitized.preferences.contentLanguageName, 'English');
  assert.equal(sanitized.preferences.contentLanguageNativeName, null);
  assert.equal(sanitized.preferences.onboardingCompleted, false);
  assert.equal(sanitized.preferences.notificationsEnabled, true);
  assert.equal(sanitized.preferences.reminderTime, null);
});

test('sanitizePersistedAudioState keeps only supported playback settings', () => {
  const sanitized = sanitizePersistedAudioState({
    playbackRate: 9,
    autoAdvanceChapter: 'yes',
    sleepTimerMinutes: 999,
  });

  assert.equal(sanitized.playbackRate, 1.0);
  assert.equal(sanitized.autoAdvanceChapter, true);
  assert.equal(sanitized.sleepTimerMinutes, null);
});
