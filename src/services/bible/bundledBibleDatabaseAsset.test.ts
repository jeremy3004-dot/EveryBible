// Non-TypeScript artefact check: reads the Python build script, a data JSON and the shipped .db (the readiness constant comes from the real module) as text; there is no module to load for it.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mockModule } from '../../testing/mockModules';
import { BUNDLED_BIBLE_SCHEMA_VERSION } from './bibleDataModel';

function readProjectFile(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url).href),
    'utf8'
  );
}

// bibleDatabase.ts loads expo-sqlite, expo-file-system/legacy and the bundled .db asset at
// module scope. None is used to read its exported readiness constant, so each is stubbed
// just enough for the real module to load (the same specifiers bibleDatabase.test.ts mocks).
mockModule(
  mock,
  fileURLToPath(new URL('../../../assets/databases/bible-bsb-v2.db', import.meta.url).href),
  { __bundledBibleAsset: true }
);
mockModule(mock, 'expo-sqlite', {});
mockModule(mock, 'expo-file-system/legacy', {});

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

    const { DEFAULT_MINIMUM_READY_VERSE_COUNT: minimumReadyVerseCount } =
      await import('./bibleDatabase');
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
