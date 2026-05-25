import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('isBibleDataReady treats bundled database probe failures as not-ready instead of throwing on startup', () => {
  const source = readRelativeSource('./bibleService.ts');

  assert.match(
    source,
    /export async function isBibleDataReady\(\): Promise<boolean> \{[\s\S]*try \{[\s\S]*const status = await bibleDb\.inspectBundledDatabaseStatus\(MIN_READY_VERSE_COUNT\);[\s\S]*\} catch \(error\) \{[\s\S]*console\.warn\('\[Bible\] Failed to inspect bundled database readiness:', error\);[\s\S]*return false;[\s\S]*\}/,
    'startup readiness checks should degrade to "not ready" when expo-sqlite throws so HomeScreen can fall back gracefully instead of surfacing a device-only startup error'
  );
});

test('initBibleData reuses initDatabase readiness status instead of counting verses twice', () => {
  const source = readRelativeSource('./bibleService.ts');

  assert.match(
    source,
    /const status = await bibleDb\.initDatabase\(MIN_READY_VERSE_COUNT\);[\s\S]*const count = status\.verseCount;/,
    'initBibleData should use the readiness status returned by initDatabase instead of running a second bundled database inspection'
  );
  const initBibleDataSource = source.slice(
    source.indexOf('export async function initBibleData'),
    source.indexOf('export async function getChapter')
  );
  assert.doesNotMatch(
    initBibleDataSource,
    /getVerseCount\(\)/,
    'initBibleData should not call getVerseCount immediately after initDatabase'
  );
});
