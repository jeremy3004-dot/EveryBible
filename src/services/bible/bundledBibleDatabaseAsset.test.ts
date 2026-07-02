import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BUNDLED_BIBLE_SCHEMA_VERSION } from './bibleDataModel';

function readProjectFile(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url).href),
    'utf8'
  );
}

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

// bibleDatabase.ts imports expo-sqlite at module scope, which breaks the tsx/esbuild transform
// used by this node test runner — so the constant is read out of the source text instead of
// imported directly, matching the source-regex pattern used elsewhere in this test suite.
function readDefaultMinimumReadyVerseCount(): number {
  const source = readRelativeSource('./bibleDatabase.ts');
  const match = source.match(/export const DEFAULT_MINIMUM_READY_VERSE_COUNT = (\d+);/);
  assert.ok(match, 'bibleDatabase.ts should export DEFAULT_MINIMUM_READY_VERSE_COUNT as a numeric literal');
  return Number(match[1]);
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

test('shipped bundled database asset matches the schema-version and verse-count readiness constants', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const dbPath = fileURLToPath(
    new URL('../../../assets/databases/bible-bsb-v2.db', import.meta.url).href
  );

  const database = new DatabaseSync(dbPath, { readOnly: true });

  try {
    const userVersionRow = database.prepare('PRAGMA user_version').get() as
      | { user_version: number }
      | undefined;
    const verseCountRow = database.prepare('SELECT COUNT(*) as count FROM verses').get() as
      | { count: number }
      | undefined;
    const ftsRow = database
      .prepare(
        "SELECT COUNT(*) as present FROM sqlite_master WHERE type = 'table' AND name = 'verses_fts'"
      )
      .get() as { present: number } | undefined;

    assert.equal(
      userVersionRow?.user_version,
      BUNDLED_BIBLE_SCHEMA_VERSION,
      'shipped bible-bsb-v2.db PRAGMA user_version must match BUNDLED_BIBLE_SCHEMA_VERSION or the app will treat every device as needing a re-import'
    );

    const minimumReadyVerseCount = readDefaultMinimumReadyVerseCount();
    assert.ok(
      (verseCountRow?.count ?? 0) >= minimumReadyVerseCount,
      `shipped bible-bsb-v2.db has ${verseCountRow?.count ?? 0} verses, below DEFAULT_MINIMUM_READY_VERSE_COUNT (${minimumReadyVerseCount}) — the readiness gate would reject this asset on-device`
    );

    assert.ok(
      (ftsRow?.present ?? 0) > 0,
      'shipped bible-bsb-v2.db must include the verses_fts table for the readiness gate to pass'
    );
  } finally {
    database.close();
  }
});
