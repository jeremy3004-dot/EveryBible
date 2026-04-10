import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReaderChapterRouteParams,
  FOLLOW_ALONG_VERSE_LINE_HEIGHT,
  getNextBibleTabBarVisibility,
  getListenCountedNoticeViewModel,
  getPlanSessionTrailingActionState,
  getReaderChromeAnimationProgress,
  getReaderVerseLineHeight,
  isReaderChromeCollapsed,
  LISTEN_COUNTED_NOTICE_TEST_ID,
  LISTEN_PLAN_PROGRESS_CARD_TEST_ID,
  READER_TOP_CHROME_DISMISS_DISTANCE,
  READER_BOTTOM_CHROME_COLLAPSE_DISTANCE,
  getEstimatedFollowAlongVerse,
  isActiveAudioTrackMatch,
  getNextChapterSessionMode,
  getNextFollowAlongVisibility,
  getNextFontSizeSheetVisibility,
  getInitialChapterSessionMode,
  getNextTranslationSheetVisibility,
  shouldReplayActiveAudioForTranslationChange,
  shouldAutoplayChapterAudio,
  shouldSyncReaderToActiveAudioChapter,
} from './bibleReaderModel';

test('uses the plan completion action on the final plan chapter even while listening', () => {
  assert.deepEqual(
    getPlanSessionTrailingActionState({
      isLastPlanChapter: true,
      isPlanDayComplete: true,
      hasNextChapter: true,
    }),
    {
      showCompletionAction: true,
      isEnabled: true,
      iconName: 'checkmark',
    }
  );
});

test('clamps reader chrome animation progress for premium scroll collapse', () => {
  assert.equal(getReaderChromeAnimationProgress(-24, 120), 0);
  assert.equal(getReaderChromeAnimationProgress(0, 120), 0);
  assert.equal(getReaderChromeAnimationProgress(60, 120), 0.5);
  assert.equal(getReaderChromeAnimationProgress(180, 120), 1);
});

test('only treats the reader chrome as collapsed once the bottom controls have crossed the compact-pill threshold', () => {
  assert.equal(isReaderChromeCollapsed(READER_BOTTOM_CHROME_COLLAPSE_DISTANCE - 1), false);
  assert.equal(isReaderChromeCollapsed(READER_BOTTOM_CHROME_COLLAPSE_DISTANCE), true);
  assert.equal(isReaderChromeCollapsed(READER_BOTTOM_CHROME_COLLAPSE_DISTANCE + 80), true);
});

test('keeps the premium top chrome visible across a wider upward-scroll window', () => {
  assert.equal(READER_TOP_CHROME_DISMISS_DISTANCE, 220);
  assert.equal(getReaderChromeAnimationProgress(110, READER_TOP_CHROME_DISMISS_DISTANCE), 0.5);
  assert.equal(getReaderChromeAnimationProgress(220, READER_TOP_CHROME_DISMISS_DISTANCE), 1);
});

test('toggles the font sheet from the font button', () => {
  assert.equal(getNextFontSizeSheetVisibility(false, 'toggleButton'), true);
  assert.equal(getNextFontSizeSheetVisibility(true, 'toggleButton'), false);
});

test('closes the font sheet when the reader content is tapped', () => {
  assert.equal(getNextFontSizeSheetVisibility(true, 'readerContentTap'), false);
  assert.equal(getNextFontSizeSheetVisibility(false, 'readerContentTap'), false);
});

test('closes the font sheet when chapter navigation or scrolling starts', () => {
  assert.equal(getNextFontSizeSheetVisibility(true, 'scrollStart'), false);
  assert.equal(getNextFontSizeSheetVisibility(true, 'chapterChange'), false);
});

test('opens the translation sheet from the header chip when multiple translations are enabled', () => {
  assert.equal(getNextTranslationSheetVisibility(false, true, 'toggleChip'), true);
  assert.equal(getNextTranslationSheetVisibility(true, true, 'toggleChip'), false);
});

test('keeps the translation sheet closed when translation switching is unavailable', () => {
  assert.equal(getNextTranslationSheetVisibility(false, false, 'toggleChip'), false);
  assert.equal(getNextTranslationSheetVisibility(true, false, 'toggleChip'), false);
});

test('uses a slightly more open line height for reader verses', () => {
  assert.equal(getReaderVerseLineHeight(20), 30);
  assert.equal(getReaderVerseLineHeight(18), 27);
  assert.equal(FOLLOW_ALONG_VERSE_LINE_HEIGHT, 32);
});

test('builds a deterministic listen-counted notice view model only when notice copy exists', () => {
  assert.equal(getListenCountedNoticeViewModel(null), null);
  assert.equal(getListenCountedNoticeViewModel('   '), null);

  assert.deepEqual(
    getListenCountedNoticeViewModel('Matthew 16 counted for today\'s plan'),
    {
      testID: LISTEN_COUNTED_NOTICE_TEST_ID,
      accessibilityLabel: 'Matthew 16 counted for today\'s plan',
      text: 'Matthew 16 counted for today\'s plan',
    }
  );
});

test('keeps listen-mode plan progress exposed behind a stable simulator selector', () => {
  assert.equal(LISTEN_PLAN_PROGRESS_CARD_TEST_ID, 'bible-reader-listen-plan-progress-card');
});

test('closes the translation sheet after selection or manual dismissal', () => {
  assert.equal(getNextTranslationSheetVisibility(true, true, 'selectTranslation'), false);
  assert.equal(getNextTranslationSheetVisibility(true, true, 'dismiss'), false);
});

test('keeps the Bible tab bar open in listen and read modes', () => {
  assert.equal(
    getNextBibleTabBarVisibility({
      sessionMode: 'listen',
      action: 'enter',
    }),
    true
  );

  assert.equal(
    getNextBibleTabBarVisibility({
      sessionMode: 'listen',
      action: 'scrollStart',
      previousScrollOffsetY: 120,
      currentScrollOffsetY: 240,
      velocityY: 900,
    }),
    true
  );
  assert.equal(
    getNextBibleTabBarVisibility({
      sessionMode: 'read',
      action: 'scrollStart',
      previousScrollOffsetY: 0,
      currentScrollOffsetY: 36,
      velocityY: 0,
    }),
    true
  );
  assert.equal(
    getNextBibleTabBarVisibility({
      sessionMode: 'read',
      action: 'scrollEndDrag',
      previousScrollOffsetY: 240,
      currentScrollOffsetY: 210,
      velocityY: 0,
    }),
    true
  );
});

test('builds chapter route params that preserve the current reader session mode', () => {
  assert.deepEqual(
    buildReaderChapterRouteParams({
      bookId: 'JHN',
      chapter: 4,
      preferredMode: 'read',
    }),
    {
      bookId: 'JHN',
      chapter: 4,
      focusVerse: undefined,
      preferredMode: 'read',
      autoplayAudio: false,
    }
  );

  assert.deepEqual(
    buildReaderChapterRouteParams({
      bookId: 'JHN',
      chapter: 5,
      preferredMode: 'listen',
    }),
    {
      bookId: 'JHN',
      chapter: 5,
      focusVerse: undefined,
      preferredMode: 'listen',
      autoplayAudio: false,
    }
  );

  assert.deepEqual(
    buildReaderChapterRouteParams({
      bookId: 'ROM',
      chapter: 8,
      preferredMode: 'read',
      planId: 'plan-a',
      planDayNumber: 3,
      returnToPlanOnComplete: true,
      sessionContext: {
        type: 'rhythm',
        rhythmId: 'rhythm-1',
        title: 'Morning Rhythm',
        itemIds: ['item-plan-a'],
        planIds: ['plan-a'],
        chapterKeys: ['ROM_8'],
        segments: [
          {
            itemId: 'item-plan-a',
            type: 'plan',
            title: 'Plan A',
            planId: 'plan-a',
            dayNumber: 3,
            startIndex: 0,
            endIndex: 1,
            chapterKeys: ['ROM_8'],
            isComplete: false,
          },
        ],
      },
    }),
    {
      bookId: 'ROM',
      chapter: 8,
      focusVerse: undefined,
      preferredMode: 'read',
      autoplayAudio: false,
      planId: 'plan-a',
      planDayNumber: 3,
      returnToPlanOnComplete: true,
      sessionContext: {
        type: 'rhythm',
        rhythmId: 'rhythm-1',
        title: 'Morning Rhythm',
        itemIds: ['item-plan-a'],
        planIds: ['plan-a'],
        chapterKeys: ['ROM_8'],
        segments: [
          {
            itemId: 'item-plan-a',
            type: 'plan',
            title: 'Plan A',
            planId: 'plan-a',
            dayNumber: 3,
            startIndex: 0,
            endIndex: 1,
            chapterKeys: ['ROM_8'],
            isComplete: false,
          },
        ],
      },
    }
  );
});

test('prefers listen mode when autoplay starts the chapter session', () => {
  assert.equal(
    getInitialChapterSessionMode({
      audioEnabled: true,
      hasText: true,
      autoplayAudio: true,
      preferredMode: null,
      bookId: 'MAT',
      chapter: 1,
      activeAudioBookId: null,
      activeAudioChapter: null,
    }),
    'listen'
  );
});

test('prefers listen mode when the active audio chapter already matches the session', () => {
  assert.equal(
    getInitialChapterSessionMode({
      translationId: 'bsb',
      audioEnabled: true,
      hasText: true,
      autoplayAudio: false,
      preferredMode: null,
      bookId: 'MAT',
      chapter: 1,
      activeAudioTranslationId: 'bsb',
      activeAudioBookId: 'MAT',
      activeAudioChapter: 1,
    }),
    'listen'
  );
});

test('falls back to read mode when the chapter has text and no active audio context', () => {
  assert.equal(
    getInitialChapterSessionMode({
      translationId: 'bsb',
      audioEnabled: true,
      hasText: true,
      autoplayAudio: false,
      preferredMode: null,
      bookId: 'MAT',
      chapter: 1,
      activeAudioTranslationId: 'web',
      activeAudioBookId: 'MRK',
      activeAudioChapter: 2,
    }),
    'read'
  );
});

test('forces the session into a supported mode when toggling between listen and read', () => {
  assert.equal(
    getNextChapterSessionMode('read', {
      requestedMode: 'listen',
      audioEnabled: false,
      hasText: true,
    }),
    'read'
  );
  assert.equal(
    getNextChapterSessionMode('listen', {
      requestedMode: 'read',
      audioEnabled: true,
      hasText: false,
    }),
    'listen'
  );
  assert.equal(
    getNextChapterSessionMode('read', {
      requestedMode: 'listen',
      audioEnabled: true,
      hasText: true,
    }),
    'listen'
  );
});

test('respects an explicit preferred launch mode from the book hub when that mode is supported', () => {
  assert.equal(
    getInitialChapterSessionMode({
      translationId: 'bsb',
      audioEnabled: true,
      hasText: true,
      autoplayAudio: false,
      preferredMode: 'read',
      bookId: 'MAT',
      chapter: 1,
      activeAudioTranslationId: 'bsb',
      activeAudioBookId: 'MAT',
      activeAudioChapter: 1,
    }),
    'read'
  );

  assert.equal(
    getInitialChapterSessionMode({
      translationId: 'bsb',
      audioEnabled: true,
      hasText: true,
      autoplayAudio: false,
      preferredMode: 'listen',
      bookId: 'MAT',
      chapter: 1,
      activeAudioTranslationId: null,
      activeAudioBookId: null,
      activeAudioChapter: null,
    }),
    'listen'
  );
});

test('does not treat a chapter as the active session when only the translation differs', () => {
  assert.equal(
    isActiveAudioTrackMatch({
      translationId: 'bsb',
      bookId: 'JHN',
      chapter: 3,
      activeAudioTranslationId: 'web',
      activeAudioBookId: 'JHN',
      activeAudioChapter: 3,
    }),
    false
  );

  assert.equal(
    isActiveAudioTrackMatch({
      translationId: 'bsb',
      bookId: 'JHN',
      chapter: 3,
      activeAudioTranslationId: 'bsb',
      activeAudioBookId: 'JHN',
      activeAudioChapter: 3,
    }),
    true
  );
});

test('estimates the follow-along verse from weighted playback progress', () => {
  const verses = [
    { id: 1, bookId: 'MAT', chapter: 1, verse: 1, text: 'Short intro' },
    {
      id: 2,
      bookId: 'MAT',
      chapter: 1,
      verse: 2,
      text: 'A longer line that should occupy more of the chapter timeline',
    },
    { id: 3, bookId: 'MAT', chapter: 1, verse: 3, text: 'Closing thought' },
  ];

  assert.equal(
    getEstimatedFollowAlongVerse({
      verses,
      currentPosition: 0,
      duration: 90000,
    }),
    1
  );
  assert.equal(
    getEstimatedFollowAlongVerse({
      verses,
      currentPosition: 40000,
      duration: 90000,
    }),
    2
  );
  assert.equal(
    getEstimatedFollowAlongVerse({
      verses,
      currentPosition: 88000,
      duration: 90000,
    }),
    3
  );
});

test('uses the focused verse as a graceful follow-along fallback when timing is unavailable', () => {
  const verses = [
    { id: 1, bookId: 'MAT', chapter: 1, verse: 1, text: 'Short intro' },
    { id: 2, bookId: 'MAT', chapter: 1, verse: 2, text: 'Second verse' },
  ];

  assert.equal(
    getEstimatedFollowAlongVerse({
      verses,
      currentPosition: 0,
      duration: 0,
      fallbackVerse: 2,
    }),
    2
  );
  assert.equal(
    getEstimatedFollowAlongVerse({
      verses: [],
      currentPosition: 0,
      duration: 0,
      fallbackVerse: 4,
    }),
    4
  );
});

test('uses exact timestamps instead of word-weight estimation when provided', () => {
  const verses = [
    { id: 1, bookId: 'GEN', chapter: 1, verse: 1, text: 'In the beginning God created the heavens and the earth.' },
    { id: 2, bookId: 'GEN', chapter: 1, verse: 2, text: 'The earth was formless and empty.' },
    { id: 3, bookId: 'GEN', chapter: 1, verse: 3, text: 'God said let there be light and there was light.' },
  ];
  // NOTE: timestamps are stored in seconds, while currentPosition is milliseconds.
  const timestamps = { 1: 0, 2: 5, 3: 12 };

  // At position 0ms, verse 1 should be active
  assert.equal(
    getEstimatedFollowAlongVerse({
      verses,
      currentPosition: 0,
      duration: 20000,
      timestamps,
    }),
    1
  );

  // At position 7000ms (between verse 2 start and verse 3 start), verse 2 active
  assert.equal(
    getEstimatedFollowAlongVerse({
      verses,
      currentPosition: 7000,
      duration: 20000,
      timestamps,
    }),
    2
  );

  // At position 15000ms (after verse 3 start), verse 3 active
  assert.equal(
    getEstimatedFollowAlongVerse({
      verses,
      currentPosition: 15000,
      duration: 20000,
      timestamps,
    }),
    3
  );

  // At position exactly at verse 3 start, verse 3 active
  assert.equal(
    getEstimatedFollowAlongVerse({
      verses,
      currentPosition: 12000,
      duration: 20000,
      timestamps,
    }),
    3
  );
});

test('falls back to word-weight estimation when timestamps are null', () => {
  const verses = [
    { id: 1, bookId: 'GEN', chapter: 1, verse: 1, text: 'Short' },
    { id: 2, bookId: 'GEN', chapter: 1, verse: 2, text: 'A much longer verse with many more words in it' },
  ];

  // With null timestamps, should use word-weight fallback (verse 2 occupies most of the timeline)
  const result = getEstimatedFollowAlongVerse({
    verses,
    currentPosition: 45000,
    duration: 60000,
    timestamps: null,
  });
  assert.equal(result, 2);
});

test('timestamps with a single verse return that verse for any position', () => {
  const verses = [
    { id: 1, bookId: 'OBA', chapter: 1, verse: 1, text: 'The vision of Obadiah.' },
  ];
  const timestamps = { 1: 0 };

  assert.equal(
    getEstimatedFollowAlongVerse({
      verses,
      currentPosition: 5000,
      duration: 10000,
      timestamps,
    }),
    1
  );
});

test('keeps the live transcript open only when the next chapter stays in listen mode with text', () => {
  assert.equal(
    getNextFollowAlongVisibility({
      currentlyVisible: true,
      nextSessionMode: 'listen',
      hasText: true,
    }),
    true
  );

  assert.equal(
    getNextFollowAlongVisibility({
      currentlyVisible: true,
      nextSessionMode: 'read',
      hasText: true,
    }),
    false
  );

  assert.equal(
    getNextFollowAlongVisibility({
      currentlyVisible: true,
      nextSessionMode: 'listen',
      hasText: false,
    }),
    false
  );

  assert.equal(
    getNextFollowAlongVisibility({
      currentlyVisible: false,
      nextSessionMode: 'listen',
      hasText: true,
    }),
    false
  );
});

test('does not autoplay a chapter again when that chapter is already the active audio session', () => {
  assert.equal(
    shouldAutoplayChapterAudio({
      translationId: 'bsb',
      autoplayAudio: true,
      audioEnabled: true,
      isLoading: false,
      bookId: 'ROM',
      chapter: 8,
      activeAudioTranslationId: 'bsb',
      activeAudioBookId: 'ROM',
      activeAudioChapter: 8,
    }),
    false
  );

  assert.equal(
    shouldAutoplayChapterAudio({
      translationId: 'bsb',
      autoplayAudio: true,
      audioEnabled: true,
      isLoading: false,
      bookId: 'ROM',
      chapter: 8,
      activeAudioTranslationId: 'web',
      activeAudioBookId: 'ROM',
      activeAudioChapter: 8,
    }),
    true
  );
});

test('replays the displayed chapter when the user switches translations away from the active audio voice', () => {
  assert.equal(
    shouldReplayActiveAudioForTranslationChange({
      currentTranslationId: 'web',
      nextTranslationId: 'bsb',
      audioEnabled: true,
      bookId: 'JHN',
      chapter: 3,
      activeAudioTranslationId: 'web',
      activeAudioBookId: 'JHN',
      activeAudioChapter: 3,
    }),
    true
  );

  assert.equal(
    shouldReplayActiveAudioForTranslationChange({
      currentTranslationId: 'web',
      nextTranslationId: 'bsb',
      audioEnabled: true,
      bookId: 'JHN',
      chapter: 3,
      activeAudioTranslationId: 'web',
      activeAudioBookId: 'JHN',
      activeAudioChapter: 4,
    }),
    false
  );
});

test('reader only follows active audio chapter changes when the reader was already showing the playing chapter', () => {
  assert.equal(
    shouldSyncReaderToActiveAudioChapter({
      audioEnabled: true,
      bookId: 'GEN',
      chapter: 3,
      activeAudioBookId: 'GEN',
      activeAudioChapter: 4,
      previousActiveAudioBookId: 'GEN',
      previousActiveAudioChapter: 3,
    }),
    true
  );

  assert.equal(
    shouldSyncReaderToActiveAudioChapter({
      audioEnabled: true,
      bookId: 'GEN',
      chapter: 5,
      activeAudioBookId: 'GEN',
      activeAudioChapter: 3,
      previousActiveAudioBookId: 'GEN',
      previousActiveAudioChapter: 3,
    }),
    false
  );

  assert.equal(
    shouldSyncReaderToActiveAudioChapter({
      audioEnabled: true,
      bookId: 'GEN',
      chapter: 3,
      activeAudioBookId: 'EXO',
      activeAudioChapter: 1,
      previousActiveAudioBookId: 'GEN',
      previousActiveAudioChapter: 3,
    }),
    true
  );
});
