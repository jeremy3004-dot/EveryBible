import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readProjectFile(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url).href),
    'utf8'
  );
}

test('bundled Bible database builder includes the Nepali text source', () => {
  const source = readProjectFile('scripts/build_bible_db.py');

  assert.match(source, /"translation_id": "npiulb"/);
  assert.match(source, /"path": ROOT \/ "data" \/ "npiulb_processed\.json"/);
  assert.match(source, /"expected_verse_count": 31102/);
});

test('Nepali bundled source contains the expected verse corpus', () => {
  const source = JSON.parse(readProjectFile('data/npiulb_processed.json')) as {
    translation: { id: string; totalVerses: number };
    verses: Array<{ b: string; c: number; v: number; t: string }>;
  };

  assert.equal(source.translation.id, 'NPIULB');
  assert.equal(source.translation.totalVerses, 31102);
  assert.equal(source.verses.length, 31102);

  const john316 = source.verses.find(
    (verse) => verse.b === 'JHN' && verse.c === 3 && verse.v === 16
  );

  assert.ok(john316?.t.includes('परमेश्‍वरले'));
});
