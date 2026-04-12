import test from 'node:test';
import assert from 'node:assert/strict';
import { APPEARANCE_PALETTE_IDS } from '../constants/appearancePalettes';
import {
  defaultAuthPreferences,
  sanitizePersistedAudioState,
  sanitizePersistedAuthState,
  sanitizePersistedBibleState,
  sanitizePersistedLibraryState,
  sanitizePersistedProgressState,
} from './persistedStateSanitizers';

test('sanitizePersistedBibleState falls back when translations are malformed', () => {
  const sanitized = sanitizePersistedBibleState({
    currentBook: 'INVALID',
    currentChapter: -4,
    preferredChapterLaunchMode: 'audio',
    currentTranslation: 'missing',
    translations: { broken: true },
  });

  assert.equal(sanitized.currentBook, 'GEN');
  assert.equal(sanitized.currentChapter, 1);
  assert.equal(sanitized.preferredChapterLaunchMode, 'read');
  assert.equal(sanitized.currentTranslation, 'bsb');
  assert.ok(Array.isArray(sanitized.translations));
  assert.ok(sanitized.translations.some((translation) => translation.id === 'bsb'));
});

test('sanitizePersistedBibleState preserves valid downloaded audio books only', () => {
  const sanitized = sanitizePersistedBibleState({
    preferredChapterLaunchMode: 'listen',
    preferredTranslationLanguage: 'Nepali',
    translations: [
      {
        id: 'bsb',
        downloadedAudioBooks: ['GEN', 'INVALID', 'JHN'],
      },
    ],
  });

  const bsb = sanitized.translations.find((translation) => translation.id === 'bsb');
  assert.ok(bsb);
  assert.equal(sanitized.preferredChapterLaunchMode, 'listen');
  assert.equal(sanitized.preferredTranslationLanguage, 'Nepali');
  assert.deepEqual(bsb.downloadedAudioBooks, ['GEN', 'JHN']);
});

test('sanitizePersistedBibleState drops a malformed preferred translation language', () => {
  const sanitized = sanitizePersistedBibleState({
    preferredTranslationLanguage: 42,
  });

  assert.equal(sanitized.preferredTranslationLanguage, null);
});

test('sanitizePersistedBibleState only marks reader history when a prior chapter was actually persisted', () => {
  const fallbackState = sanitizePersistedBibleState({});
  assert.equal(
    fallbackState.hasReaderHistory,
    false,
    'Bible state should not pretend there is a resumable reader session when no chapter was persisted yet'
  );

  const persistedState = sanitizePersistedBibleState({
    currentBook: 'JHN',
    currentChapter: 3,
  });
  assert.equal(persistedState.currentBook, 'JHN');
  assert.equal(persistedState.currentChapter, 3);
  assert.equal(
    persistedState.hasReaderHistory,
    true,
    'Bible state should remember that the user has a real chapter session to resume'
  );
});

test('sanitizePersistedBibleState refreshes bundled translation capabilities during upgrades', () => {
  const sanitized = sanitizePersistedBibleState({
    currentTranslation: 'web',
    translations: [
      {
        id: 'web',
        hasText: false,
        hasAudio: false,
        audioGranularity: 'none',
        downloadedAudioBooks: ['GEN'],
      },
    ],
  });

  const web = sanitized.translations.find((translation) => translation.id === 'web');

  assert.equal(sanitized.currentTranslation, 'web');
  assert.ok(web);
  assert.equal(web.hasText, true);
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

test('sanitizePersistedBibleState preserves valid runtime translations alongside seeded ones but falls back current selection until installed', () => {
  const sanitized = sanitizePersistedBibleState({
    currentTranslation: 'niv',
    translations: [
      {
        id: 'niv',
        name: 'New International Version',
        abbreviation: 'NIV',
        language: 'English',
        description: 'Runtime translation from backend catalog',
        copyright: 'Example License',
        isDownloaded: false,
        downloadedBooks: [],
        downloadedAudioBooks: ['MAT', 'INVALID'],
        totalBooks: 66,
        sizeInMB: 5.2,
        hasText: true,
        hasAudio: true,
        audioGranularity: 'chapter',
        source: 'runtime',
        installState: 'remote-only',
        activeTextPackVersion: '2026.03.21',
        catalog: {
          version: '2026.03.21',
          updatedAt: '2026-03-21T10:00:00.000Z',
          text: {
            format: 'sqlite',
            version: '2026.03.21',
            downloadUrl: 'https://cdn.example.com/niv.sqlite',
            sha256: 'sha256-text',
          },
          audio: {
            strategy: 'stream-template',
            baseUrl: 'https://cdn.example.com/audio/niv',
            chapterPathTemplate: '{bookId}/{chapter}.mp3',
          },
          timing: {
            strategy: 'stream-template',
            baseUrl: 'https://cdn.example.com/timestamps/niv',
            chapterPathTemplate: '{bookId}/{chapter}.json',
            fileExtension: 'json',
            mimeType: 'application/json',
          },
        },
      },
    ],
  });

  const runtimeTranslation = sanitized.translations.find((translation) => translation.id === 'niv');

  assert.equal(sanitized.currentTranslation, 'bsb');
  assert.ok(runtimeTranslation);
  assert.equal(runtimeTranslation.source, 'runtime');
  assert.equal(runtimeTranslation.installState, 'remote-only');
  assert.equal(runtimeTranslation.activeTextPackVersion, '2026.03.21');
  assert.equal(runtimeTranslation.catalog?.text?.format, 'sqlite');
  assert.equal(runtimeTranslation.catalog?.audio?.strategy, 'stream-template');
  assert.equal(runtimeTranslation.catalog?.timing?.strategy, 'stream-template');
  assert.deepEqual(runtimeTranslation.downloadedAudioBooks, ['MAT']);
  assert.ok(sanitized.translations.some((translation) => translation.id === 'bsb'));
});

test('sanitizePersistedBibleState keeps seeded runtime translations aligned with persisted runtime metadata', () => {
  const sanitized = sanitizePersistedBibleState({
    translations: [
      {
        id: 'hincv',
        name: 'Hindi Contemporary Version Bible',
        abbreviation: 'HCV',
        language: 'Hindi',
        description: 'Hindi remote catalog entry',
        copyright: 'Public Domain',
        isDownloaded: false,
        downloadedBooks: [],
        downloadedAudioBooks: [],
        totalBooks: 66,
        sizeInMB: 4.5,
        hasText: true,
        hasAudio: false,
        audioGranularity: 'none',
        source: 'runtime',
        installState: 'remote-only',
      },
    ],
  });

  const hincv = sanitized.translations.find((translation) => translation.id === 'hincv');

  assert.ok(hincv);
  assert.equal(hincv.source, 'runtime');
  assert.equal(hincv.hasText, true);
  assert.equal(hincv.description, 'Hindi remote catalog entry');
  assert.equal(hincv.installState, 'remote-only');
});

test('sanitizePersistedBibleState falls back when runtime translation is not locally readable', () => {
  const sanitized = sanitizePersistedBibleState({
    currentTranslation: 'NIV',
    translations: [
      {
        id: 'NIV',
        name: 'New International Version',
        abbreviation: 'NIV',
        language: 'English',
        description: 'Runtime translation from backend catalog',
        copyright: 'Example License',
        isDownloaded: false,
        downloadedBooks: [],
        downloadedAudioBooks: [],
        totalBooks: 66,
        sizeInMB: 5.2,
        hasText: true,
        hasAudio: false,
        audioGranularity: 'none',
        source: 'runtime',
        installState: 'installed',
        catalog: {
          version: '2026.03.21',
          updatedAt: '2026-03-21T10:00:00.000Z',
          text: {
            format: 'sqlite',
            version: '2026.03.21',
            downloadUrl: 'https://cdn.example.com/niv.sqlite',
            sha256: 'sha256-text',
          },
        },
      },
    ],
  });

  assert.equal(sanitized.currentTranslation, 'bsb');
  const runtime = sanitized.translations.find((translation) => translation.id === 'niv');
  assert.ok(runtime);
  assert.equal(runtime.installState, 'remote-only');
  assert.equal(runtime.isDownloaded, false);
});


test('sanitizePersistedBibleState drops malformed runtime translations', () => {
  const sanitized = sanitizePersistedBibleState({
    currentTranslation: 'niv',
    translations: [
      {
        id: 'niv',
        name: 'New International Version',
        abbreviation: 'NIV',
        language: 'English',
        description: 'Runtime translation from backend catalog',
        copyright: 'Example License',
        isDownloaded: false,
        downloadedBooks: [],
        downloadedAudioBooks: [],
        totalBooks: 66,
        sizeInMB: 5.2,
        hasText: true,
        hasAudio: true,
        audioGranularity: 'chapter',
        source: 'runtime',
        installState: 'remote-only',
        catalog: {
          version: '2026.03.21',
          updatedAt: 'not-a-date',
          text: {
            format: 'sqlite',
            version: '2026.03.21',
            downloadUrl: 'https://cdn.example.com/niv.sqlite',
            sha256: 42,
          },
        },
      },
    ],
  });

  assert.equal(sanitized.currentTranslation, 'bsb');
  assert.equal(
    sanitized.translations.some((translation) => translation.id === 'niv'),
    false
  );
});
test('sanitizePersistedBibleState restores an audio-only runtime translation as currentTranslation after restart', () => {
  // Regression: audio-only translations (hasText:false, hasAudio:true) were being
  // discarded by isReadableTranslation on rehydration, causing a silent reset to BSB
  // even though the write path saved them correctly.
  const sanitized = sanitizePersistedBibleState({
    currentTranslation: 'audiobible',
    translations: [
      {
        id: 'audiobible',
        name: 'Audio-Only Bible',
        abbreviation: 'AO',
        language: 'English',
        description: 'A runtime translation with audio but no text',
        copyright: 'Public Domain',
        isDownloaded: false,
        downloadedBooks: [],
        downloadedAudioBooks: [],
        totalBooks: 66,
        sizeInMB: 0,
        hasText: false,
        hasAudio: true,
        audioGranularity: 'chapter',
        source: 'runtime',
        installState: 'remote-only',
        catalog: {
          version: '2026.01.01',
          updatedAt: '2026-01-01T00:00:00.000Z',
          audio: {
            strategy: 'stream-template',
            baseUrl: 'https://cdn.example.com/audio/ao',
            chapterPathTemplate: '{bookId}/{chapter}.mp3',
          },
        },
      },
    ],
  });

  assert.equal(
    sanitized.currentTranslation,
    'audiobible',
    'An audio-only translation selected by the user must survive rehydration'
  );
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
      appearancePalette: 'violet',
      language: 'xx',
      countryCode: 'usa',
      countryName: '',
      contentLanguageCode: 123,
      contentLanguageName: 'English',
      contentLanguageNativeName: '',
      chapterFeedbackName: '  Grace  ',
      chapterFeedbackRole: '  Elder  ',
      chapterFeedbackIdNumber: '  009  ',
      onboardingCompleted: 'yes',
      chapterFeedbackEnabled: 'sometimes',
      hidePlayButtonFromReadingTab: 'sometimes',
      notificationsEnabled: true,
      reminderTime: '9am',
    },
  });

  assert.equal(
    sanitized.user,
    null,
    'Persisted auth identity should not be restored without a live Supabase session'
  );
  assert.equal(
    sanitized.isAuthenticated,
    false,
    'Persisted auth flags should stay signed out until the live session is rehydrated'
  );
  assert.equal(sanitized.preferences.fontSize, defaultAuthPreferences.fontSize);
  assert.equal(sanitized.preferences.theme, defaultAuthPreferences.theme);
  assert.equal(sanitized.preferences.appearancePalette, defaultAuthPreferences.appearancePalette);
  assert.equal(sanitized.preferences.language, defaultAuthPreferences.language);
  assert.equal(sanitized.preferences.countryCode, null);
  assert.equal(sanitized.preferences.countryName, null);
  assert.equal(sanitized.preferences.contentLanguageCode, null);
  assert.equal(sanitized.preferences.contentLanguageName, 'English');
  assert.equal(sanitized.preferences.contentLanguageNativeName, null);
  assert.equal(sanitized.preferences.chapterFeedbackName, 'Grace');
  assert.equal(sanitized.preferences.chapterFeedbackRole, 'Elder');
  assert.equal(sanitized.preferences.onboardingCompleted, false);
  assert.equal(sanitized.preferences.chapterFeedbackEnabled, false);
  assert.equal(sanitized.preferences.hidePlayButtonFromReadingTab, false);
  assert.equal(sanitized.preferences.notificationsEnabled, true);
  assert.equal(sanitized.preferences.reminderTime, null);
});

test('sanitizePersistedAuthState preserves supported appearance palettes', () => {
  for (const appearancePalette of APPEARANCE_PALETTE_IDS) {
    const sanitized = sanitizePersistedAuthState({
      preferences: {
        appearancePalette,
      },
    });

    assert.equal(sanitized.preferences.appearancePalette, appearancePalette);
  }
});

test('sanitizePersistedAuthState defaults chapter feedback to false when the key is absent', () => {
  const sanitized = sanitizePersistedAuthState({
    preferences: {
      fontSize: 'medium',
      theme: 'dark',
      appearancePalette: 'ember',
      language: 'en',
      onboardingCompleted: true,
      notificationsEnabled: false,
      reminderTime: null,
      chapterFeedbackName: null,
      chapterFeedbackRole: null,
    },
  });

  assert.equal(sanitized.preferences.chapterFeedbackEnabled, false);
  assert.equal(sanitized.preferences.hidePlayButtonFromReadingTab, false);
});

test('sanitizePersistedAuthState preserves a valid chapter feedback boolean', () => {
  const sanitized = sanitizePersistedAuthState({
    preferences: {
      appearancePalette: 'sapphire',
      chapterFeedbackEnabled: true,
      chapterFeedbackName: 'Ada',
      chapterFeedbackRole: 'Leader',
      chapterFeedbackIdNumber: '7',
    },
  });

  assert.equal(sanitized.preferences.chapterFeedbackEnabled, true);
  assert.equal(sanitized.preferences.chapterFeedbackName, 'Ada');
  assert.equal(sanitized.preferences.chapterFeedbackRole, 'Leader');
});

test('sanitizePersistedAuthState preserves a valid hide-play-button boolean', () => {
  const sanitized = sanitizePersistedAuthState({
    preferences: {
      appearancePalette: 'sapphire',
      hidePlayButtonFromReadingTab: true,
    },
  });

  assert.equal(sanitized.preferences.hidePlayButtonFromReadingTab, true);
});

test('sanitizePersistedAuthState drops the legacy manual feedback ID number field', () => {
  const sanitized = sanitizePersistedAuthState({
    preferences: {
      chapterFeedbackName: 'Ada',
      chapterFeedbackRole: 'Leader',
      chapterFeedbackIdNumber: '7',
    },
  });

  assert.deepEqual(sanitized.preferences, {
    ...defaultAuthPreferences,
    chapterFeedbackName: 'Ada',
    chapterFeedbackRole: 'Leader',
  });
});

test('sanitizePersistedAudioState keeps only supported playback settings', () => {
  const sanitized = sanitizePersistedAudioState({
    playbackRate: 9,
    autoAdvanceChapter: 'yes',
    repeatMode: 'forever',
    sleepTimerMinutes: 999,
    queue: [
      { id: 'bsb:MAT:5', translationId: 'bsb', bookId: 'MAT', chapter: 5, addedAt: 1 },
      { id: 'oops', bookId: 'BAD', chapter: 1, addedAt: 2 },
    ],
    queueIndex: 9,
    lastPlayedTranslationId: 'bsb',
    lastPlayedBookId: 'MAT',
    lastPlayedChapter: 5,
    lastPosition: 3200,
  });

  assert.equal(sanitized.playbackRate, 1.0);
  assert.equal(sanitized.autoAdvanceChapter, true);
  assert.equal(sanitized.repeatMode, 'off');
  assert.equal(sanitized.sleepTimerMinutes, null);
  assert.deepEqual(sanitized.queue, [
    { id: 'bsb:MAT:5', translationId: 'bsb', bookId: 'MAT', chapter: 5, addedAt: 1 },
  ]);
  assert.equal(sanitized.queueIndex, 0);
  assert.equal(sanitized.lastPlayedTranslationId, 'bsb');
  assert.equal(sanitized.lastPlayedBookId, 'MAT');
  assert.equal(sanitized.lastPlayedChapter, 5);
  assert.equal(sanitized.lastPosition, 3200);
});

test('sanitizePersistedAudioState preserves supported repeat modes', () => {
  const sanitized = sanitizePersistedAudioState({
    repeatMode: 'book',
  });

  assert.equal(sanitized.repeatMode, 'book');
});

test('sanitizePersistedAudioState preserves the extended supported playback rates', () => {
  const onePointSeventyFive = sanitizePersistedAudioState({
    playbackRate: 1.75,
  });
  const twoPointFive = sanitizePersistedAudioState({
    playbackRate: 2.5,
  });

  assert.equal(onePointSeventyFive.playbackRate, 1.75);
  assert.equal(twoPointFive.playbackRate, 2.5);
});

test('sanitizePersistedAudioState falls back to off for unsupported background music choices', () => {
  const sanitized = sanitizePersistedAudioState({
    backgroundMusicChoice: 'forest-birds',
  });

  assert.equal(sanitized.backgroundMusicChoice, 'off');
});

test('sanitizePersistedAudioState preserves supported bundled background music choices', () => {
  const sanitized = sanitizePersistedAudioState({
    backgroundMusicChoice: 'ocean-waves',
  });

  assert.equal(sanitized.backgroundMusicChoice, 'ocean-waves');
});

test('sanitizePersistedLibraryState keeps only valid favorites, playlists, and history entries', () => {
  const sanitized = sanitizePersistedLibraryState({
    favorites: [
      { id: 'MAT:5', bookId: 'MAT', chapter: 5, addedAt: 1 },
      { id: 'BAD:1', bookId: 'BAD', chapter: 1, addedAt: 2 },
    ],
    playlists: [
      {
        id: 'saved',
        title: '',
        createdAt: 1,
        updatedAt: 2,
        entries: [
          { id: 'JHN:3', bookId: 'JHN', chapter: 3, addedAt: 3 },
          { id: 'oops', bookId: 'BAD', chapter: 1, addedAt: 4 },
        ],
      },
    ],
    history: [
      { id: 'GAL:1', bookId: 'GAL', chapter: 1, listenedAt: 10, progress: 0.3 },
      { id: 'oops', bookId: 'BAD', chapter: 1, listenedAt: 11, progress: 2 },
    ],
  });

  assert.deepEqual(sanitized.favorites, [{ id: 'MAT:5', bookId: 'MAT', chapter: 5, addedAt: 1 }]);
  assert.equal(sanitized.playlists[0]?.title, 'Untitled');
  assert.deepEqual(sanitized.playlists[0]?.entries, [
    { id: 'JHN:3', bookId: 'JHN', chapter: 3, addedAt: 3 },
  ]);
  assert.deepEqual(sanitized.history, [
    { id: 'GAL:1', bookId: 'GAL', chapter: 1, listenedAt: 10, progress: 0.3 },
  ]);
});
