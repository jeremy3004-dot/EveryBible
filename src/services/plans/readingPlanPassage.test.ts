import assert from 'node:assert/strict';
import test from 'node:test';
import { readingPlanEntriesByPlanId } from '../../data/readingPlans.generated';
import {
  formatPlanPassageLabel,
  formatPlanPassageReference,
  getPlanChapterFocusVerse,
} from './readingPlanPassage';
import { assertDefined } from '../../utils/assertDefined';

test('Sermon on the Mount shows all seven exact verse assignments and focuses their first verse', () => {
  const entries = assertDefined(
    readingPlanEntriesByPlanId['sermon-on-the-mount-7-days'],
    'sermon-on-the-mount-7-days entries'
  );
  assert.deepEqual(
    entries.map((entry) => formatPlanPassageReference(entry, 'Matthew')),
    [
      'Matthew 5:1–12',
      'Matthew 5:13–20',
      'Matthew 5:21–32',
      'Matthew 5:33–48',
      'Matthew 6:1–18',
      'Matthew 6:19–34',
      'Matthew 7:1–29',
    ]
  );
  for (const entry of entries) {
    assert.equal(
      getPlanChapterFocusVerse([entry], entry.book, entry.chapter_start),
      entry.verse_start
    );
    assert.equal(getPlanChapterFocusVerse([entry], 'GEN', 1), undefined);
  }
});

test('whole-chapter assignments retain their references and default scroll position', () => {
  const entry = assertDefined(
    readingPlanEntriesByPlanId['bible-in-30-days']?.[0],
    'bible-in-30-days day 1'
  );
  assert.equal(formatPlanPassageReference(entry, 'Genesis'), 'Genesis 1–40');
  assert.equal(getPlanChapterFocusVerse([entry], 'GEN', 1), undefined);
  const proverb = assertDefined(
    readingPlanEntriesByPlanId['proverbs-31-days']?.[0],
    'proverbs-31-days day 1'
  );
  assert.equal(formatPlanPassageReference(proverb, 'Proverbs'), 'Proverbs 1');
});

test('a plan entry of one Psalm reads in the singular, a range of Psalms in the plural', () => {
  const t = (key: string) => key;
  const entry = {
    book: 'PSA',
    chapter_start: 71,
    chapter_end: null,
    verse_start: null,
    verse_end: null,
  };

  assert.equal(formatPlanPassageLabel(entry, t), 'Psalm 71');
  assert.equal(
    formatPlanPassageLabel({ ...entry, chapter_start: 1, chapter_end: 3 }, t),
    'Psalms 1–3'
  );
  assert.equal(formatPlanPassageLabel({ ...entry, chapter_end: 71 }, t), 'Psalm 71');
});
