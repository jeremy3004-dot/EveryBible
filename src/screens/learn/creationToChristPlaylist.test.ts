import test from 'node:test';
import assert from 'node:assert/strict';
import {
  creationToChristPlaylist,
  type CreationToChristPlaylistEntry,
} from './creationToChristPlaylist';

test('exports a typed playlist model with chapter-level entries', () => {
  const typedPlaylist: CreationToChristPlaylistEntry[] = creationToChristPlaylist;
  assert.equal(Array.isArray(typedPlaylist), true);
  assert.equal(typedPlaylist.length > 0, true);
});

test('uses chapter-only targets with no verse-level field', () => {
  for (const entry of creationToChristPlaylist) {
    assert.deepEqual(Object.keys(entry).sort(), ['bookId', 'chapter']);
    assert.equal(typeof entry.bookId, 'string');
    assert.equal(Number.isInteger(entry.chapter), true);
    assert.equal(entry.chapter > 0, true);
    assert.equal('verse' in entry, false);
  }
});

test('keeps an explicit Creation-to-Christ ordering', () => {
  const orderedReferences = creationToChristPlaylist.map((entry) => `${entry.bookId} ${entry.chapter}`);

  assert.deepEqual(orderedReferences, [
    'GEN 1',
    'GEN 3',
    'GEN 12',
    'EXO 12',
    'ISA 53',
    'LUK 2',
    'JHN 3',
    'JHN 19',
    'JHN 20',
  ]);
});

test('avoids duplicate chapter references', () => {
  const chapterReferences = creationToChristPlaylist.map((entry) => `${entry.bookId}:${entry.chapter}`);
  assert.equal(new Set(chapterReferences).size, chapterReferences.length);
});
