import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  SWIPE_THRESHOLD,
  SWIPE_VELOCITY_MIN,
  resolveSwipeChapterNavigation,
} from './bibleReaderModel';

test('returns next when translationX exceeds negative threshold', () => {
  assert.equal(
    resolveSwipeChapterNavigation({
      translationX: -(SWIPE_THRESHOLD + 1),
      velocityX: 0,
      hasNextChapter: true,
      hasPrevChapter: true,
    }),
    'next'
  );
});

test('returns prev when translationX exceeds positive threshold', () => {
  assert.equal(
    resolveSwipeChapterNavigation({
      translationX: SWIPE_THRESHOLD + 1,
      velocityX: 0,
      hasNextChapter: true,
      hasPrevChapter: true,
    }),
    'prev'
  );
});

test('returns next via velocity fast-path even when translationX is small', () => {
  assert.equal(
    resolveSwipeChapterNavigation({
      translationX: -10,
      velocityX: -(SWIPE_VELOCITY_MIN + 1),
      hasNextChapter: true,
      hasPrevChapter: true,
    }),
    'next'
  );
});

test('returns prev via velocity fast-path even when translationX is small', () => {
  assert.equal(
    resolveSwipeChapterNavigation({
      translationX: 10,
      velocityX: SWIPE_VELOCITY_MIN + 1,
      hasNextChapter: true,
      hasPrevChapter: true,
    }),
    'prev'
  );
});

test('returns null when swipe wants next but hasNextChapter is false', () => {
  assert.equal(
    resolveSwipeChapterNavigation({
      translationX: -(SWIPE_THRESHOLD + 1),
      velocityX: 0,
      hasNextChapter: false,
      hasPrevChapter: true,
    }),
    null
  );
});

test('returns null when swipe wants prev but hasPrevChapter is false', () => {
  assert.equal(
    resolveSwipeChapterNavigation({
      translationX: SWIPE_THRESHOLD + 1,
      velocityX: 0,
      hasNextChapter: true,
      hasPrevChapter: false,
    }),
    null
  );
});

test('returns null when translationX and velocity are both below thresholds', () => {
  assert.equal(
    resolveSwipeChapterNavigation({
      translationX: 10,
      velocityX: 50,
      hasNextChapter: true,
      hasPrevChapter: true,
    }),
    null
  );
});

test('SWIPE_THRESHOLD constant is 80', () => {
  assert.equal(SWIPE_THRESHOLD, 80);
});

test('SWIPE_VELOCITY_MIN constant is 600', () => {
  assert.equal(SWIPE_VELOCITY_MIN, 600);
});

test('BibleReaderScreen gives haptic feedback when a swipe commits a chapter change', () => {
  const source = readFileSync(
    fileURLToPath(new URL('./BibleReaderScreen.tsx', import.meta.url).href),
    'utf8'
  );

  assert.match(
    source,
    /const handleSwipeEnd = \(translationX: number, velocityX: number\) => \{[\s\S]*?resolveSwipeChapterNavigation\(\{[\s\S]*?\}\);/,
    'the screen should resolve swipe navigation through the shared, tested model instead of duplicating thresholds'
  );

  assert.match(
    source,
    /const handleSwipeEnd = \(translationX: number, velocityX: number\) => \{[\s\S]*?lightHaptic\(\);[\s\S]*?handleSwipeNavigation\(direction\);/,
    'a committed swipe should fire a haptic before navigating to the next/previous chapter'
  );

  assert.equal(
    /event\.translationX < -SWIPE_THRESHOLD/.test(source),
    false,
    'the swipe worklet should no longer inline the threshold comparison'
  );
});
