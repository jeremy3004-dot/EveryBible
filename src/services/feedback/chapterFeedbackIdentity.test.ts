import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasChapterFeedbackIdentity,
  normalizeChapterFeedbackIdentity,
} from './chapterFeedbackIdentity';

test('a feedback identity keeps its name and role with surrounding whitespace removed', () => {
  assert.deepEqual(normalizeChapterFeedbackIdentity({ name: '  Asha ', role: ' Reviewer  ' }), {
    name: 'Asha',
    role: 'Reviewer',
  });
  assert.equal(hasChapterFeedbackIdentity({ name: 'Asha', role: 'Reviewer' }), true);
});

test('a missing identity is treated as no identity', () => {
  assert.equal(normalizeChapterFeedbackIdentity(null), null);
  assert.equal(normalizeChapterFeedbackIdentity(undefined), null);
  assert.equal(hasChapterFeedbackIdentity(undefined), false);
});

test('an identity without both a name and a role is not an identity', () => {
  assert.equal(normalizeChapterFeedbackIdentity({ name: 'Asha', role: '   ' }), null);
  assert.equal(normalizeChapterFeedbackIdentity({ name: '', role: 'Reviewer' }), null);
  assert.equal(hasChapterFeedbackIdentity({ name: '  ', role: 'Reviewer' }), false);
});

test('identity fields left null by a persisted draft are tolerated rather than thrown on', () => {
  // A draft read back from storage can carry null fields despite the declared string type.
  const draftFromStorage = JSON.parse('{"name":null,"role":"Reviewer"}') as {
    name: string;
    role: string;
  };

  assert.equal(normalizeChapterFeedbackIdentity(draftFromStorage), null);
  assert.equal(hasChapterFeedbackIdentity(draftFromStorage), false);
});
