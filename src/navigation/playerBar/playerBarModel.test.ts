import test from 'node:test';
import assert from 'node:assert/strict';
import type { ThemeColors } from '../../contexts/ThemeContext';
import {
  getPlayerBarClearance,
  getPlayerBarPalette,
  getReturnToReaderTarget,
  isAudioSessionActive,
  PLAYER_BAR_NOTICE_HEIGHT,
} from './playerBarModel';
import { PLAYER_BAR_SECTION_HEIGHT } from '../readerTabBarMotion';

test('the reader wears the reading surface’s colours and the rest of the app its own', () => {
  const colors = {
    biblePrimaryText: 'bible-ink',
    bibleSecondaryText: 'bible-muted',
    bibleAccent: 'bible-accent',
    bibleElevatedSurface: 'bible-tile',
    bibleDivider: 'bible-line',
    primaryText: 'ink',
    secondaryText: 'muted',
    accentPrimary: 'accent',
    background: 'tile',
    cardBorder: 'line',
    onAccent: 'on-accent',
  } as unknown as ThemeColors;

  assert.deepEqual(getPlayerBarPalette(colors, 'reader'), {
    ink: 'bible-ink',
    muted: 'bible-muted',
    accent: 'bible-accent',
    onAccent: 'on-accent',
    tile: 'bible-tile',
    hairline: 'bible-line',
  });
  assert.deepEqual(getPlayerBarPalette(colors, 'app'), {
    ink: 'ink',
    muted: 'muted',
    accent: 'accent',
    onAccent: 'on-accent',
    tile: 'tile',
    hairline: 'line',
  });
});

test('a session is a loaded chapter that is playing, loading or paused', () => {
  for (const status of ['playing', 'loading', 'paused'] as const) {
    assert.equal(isAudioSessionActive(status, 'JHN', 3), true);
  }
  for (const status of ['idle', 'error'] as const) {
    assert.equal(isAudioSessionActive(status, 'JHN', 3), false);
  }
  assert.equal(isAudioSessionActive('playing', null, 3), false);
  assert.equal(isAudioSessionActive('playing', 'JHN', null), false);
});

test('the text clears the tab row, the player row, a notice and the gaps between', () => {
  const base = { bottomPadding: 22, tabRowHeight: 64, showsPlayerRow: true, gap: 16 };
  assert.equal(getPlayerBarClearance(base), 22 + 64 + PLAYER_BAR_SECTION_HEIGHT + 16);
  assert.equal(
    getPlayerBarClearance({ ...base, noticeHeight: PLAYER_BAR_NOTICE_HEIGHT }),
    22 + 64 + PLAYER_BAR_SECTION_HEIGHT + 16 + PLAYER_BAR_NOTICE_HEIGHT + 16
  );
  assert.equal(getPlayerBarClearance({ ...base, showsPlayerRow: false }), 22 + 64 + 16);
});

test('back to what is playing: the loaded chapter in its translation, with its plan session', () => {
  const target = getReturnToReaderTarget({
    currentTranslationId: 'web',
    currentBookId: 'JHN',
    currentChapter: 4,
    lastPlayedTranslationId: null,
    audioReturnTarget: {
      translationId: 'web',
      bookId: 'JHN',
      chapter: 3,
      preferredMode: 'listen',
      planId: 'plan-1',
      planDayNumber: 2,
      returnToPlanOnComplete: true,
    },
    currentTranslation: 'bsb',
  });
  assert.deepEqual(target, {
    translationId: 'web',
    params: {
      bookId: 'JHN',
      chapter: 4,
      preferredMode: 'listen',
      planId: 'plan-1',
      planDayNumber: 2,
      returnToPlanOnComplete: true,
    },
  });
});

test('between chapters the return target stands in, and the current translation is not re-set', () => {
  assert.deepEqual(
    getReturnToReaderTarget({
      currentTranslationId: null,
      currentBookId: null,
      currentChapter: null,
      lastPlayedTranslationId: null,
      audioReturnTarget: { translationId: 'bsb', bookId: 'GEN', chapter: 1, preferredMode: 'read' },
      currentTranslation: 'bsb',
    }),
    { translationId: null, params: { bookId: 'GEN', chapter: 1, preferredMode: 'read' } }
  );
  assert.equal(
    getReturnToReaderTarget({
      currentTranslationId: null,
      currentBookId: null,
      currentChapter: null,
      lastPlayedTranslationId: 'web',
      audioReturnTarget: null,
      currentTranslation: 'bsb',
    }),
    null,
    'nothing loaded and nowhere to return to'
  );
});
