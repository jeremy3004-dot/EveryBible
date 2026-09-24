import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCrossReferences,
  getTopCrossReferences,
  type CrossReference,
} from './crossReferenceService';

// ---------------------------------------------------------------------------
// getCrossReferences — basic contract
// ---------------------------------------------------------------------------

test('returns an empty array (not null/undefined) when no cross-refs exist for a verse', () => {
  const result = getCrossReferences('REV', 22, 21);
  assert.ok(Array.isArray(result), 'Expected an array');
  assert.equal(result.length, 0);
});

test('returns an empty array for a verse with an unknown book ID', () => {
  const result = getCrossReferences('XYZ', 1, 1);
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 0);
});

test('returns cross-references for John 3:16', () => {
  const result = getCrossReferences('JHN', 3, 16);
  assert.ok(result.length > 0, 'Expected at least one cross-reference for John 3:16');
});

test('all returned entries have the correct fromBook/fromChapter/fromVerse', () => {
  const result = getCrossReferences('JHN', 3, 16);
  for (const ref of result) {
    assert.equal(ref.fromBook, 'JHN');
    assert.equal(ref.fromChapter, 3);
    assert.equal(ref.fromVerse, 16);
  }
});

// ---------------------------------------------------------------------------
// Sorting — descending by votes
// ---------------------------------------------------------------------------

test('getCrossReferences returns results sorted by votes descending', () => {
  const result = getCrossReferences('JHN', 3, 16);
  for (let i = 1; i < result.length; i++) {
    assert.ok(
      (result[i - 1] as CrossReference).votes >= (result[i] as CrossReference).votes,
      `Expected votes at index ${i - 1} >= votes at index ${i}`
    );
  }
});

test('getTopCrossReferences also returns results sorted by votes descending', () => {
  const result = getTopCrossReferences('ROM', 3, 23, 10);
  for (let i = 1; i < result.length; i++) {
    assert.ok(
      (result[i - 1] as CrossReference).votes >= (result[i] as CrossReference).votes,
      `Expected votes at index ${i - 1} >= votes at index ${i}`
    );
  }
});

// ---------------------------------------------------------------------------
// getTopCrossReferences — limit behaviour
// ---------------------------------------------------------------------------

test('getTopCrossReferences respects the limit parameter', () => {
  const result = getTopCrossReferences('JHN', 3, 16, 3);
  assert.ok(result.length <= 3, `Expected at most 3 results, got ${result.length}`);
});

test('getTopCrossReferences defaults to 5 when limit is omitted', () => {
  const result = getTopCrossReferences('JHN', 3, 16);
  assert.ok(result.length <= 5, `Expected at most 5 results, got ${result.length}`);
});

test('getTopCrossReferences returns all results when limit exceeds available refs', () => {
  const allRefs = getCrossReferences('JHN', 3, 16);
  const topRefs = getTopCrossReferences('JHN', 3, 16, 1000);
  assert.equal(topRefs.length, allRefs.length);
});

test('getTopCrossReferences returns an empty array for a verse with no refs', () => {
  const result = getTopCrossReferences('REV', 22, 21, 5);
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 0);
});

// ---------------------------------------------------------------------------
// Sample data — known cross-references for John 3:16
// ---------------------------------------------------------------------------

test('John 3:16 includes a cross-reference to Romans 5:8', () => {
  const result = getCrossReferences('JHN', 3, 16);
  const hasRom58 = result.some((r) => r.toBook === 'ROM' && r.toChapter === 5 && r.toVerse === 8);
  assert.ok(hasRom58, 'Expected John 3:16 to cross-reference Romans 5:8');
});

test('John 3:16 includes a cross-reference to 1 John 4:9', () => {
  const result = getCrossReferences('JHN', 3, 16);
  const has1Jn49 = result.some((r) => r.toBook === '1JN' && r.toChapter === 4 && r.toVerse === 9);
  assert.ok(has1Jn49, 'Expected John 3:16 to cross-reference 1 John 4:9');
});

// ---------------------------------------------------------------------------
// CrossReference shape — structural validation
// ---------------------------------------------------------------------------

test('every CrossReference entry has all required numeric and string fields', () => {
  const result = getCrossReferences('ROM', 3, 23);
  assert.ok(result.length > 0);
  for (const ref of result) {
    assert.equal(typeof ref.fromBook, 'string');
    assert.equal(typeof ref.fromChapter, 'number');
    assert.equal(typeof ref.fromVerse, 'number');
    assert.equal(typeof ref.toBook, 'string');
    assert.equal(typeof ref.toChapter, 'number');
    assert.equal(typeof ref.toVerse, 'number');
    assert.equal(typeof ref.votes, 'number');
    assert.ok(ref.votes >= 0);
  }
});
