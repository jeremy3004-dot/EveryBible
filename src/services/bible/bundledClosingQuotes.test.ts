// Runs the read-time closing-quote normalizer over every verse of the shipped .db, which is a
// committed artefact the unit tests cannot otherwise see (see verseFormatting.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  normalizeClosingQuoteSpacing,
  normalizeVerseFormatting,
  normalizeVerseFormattingQuotes,
  reconcileVerseFormattingWithText,
} from './verseFormatting';

type Row = { translation_id: string; book_id: string; chapter: number; verse: number } & {
  text: string;
  formatting: string | null;
};

const stripWhitespace = (value: string) => value.replace(/\s+/g, '');
const STRAY_SPACE = /[^\s‘“’”] +[’”](?![\p{L}\p{N}])/u;
const CLOSING_ONLY_LINE = /^[?!.,;:)\]’”]+$/;

test('the bundled database has no stray closing-quote spacing or quote-only lines after normalizing', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const database = new DatabaseSync(
    fileURLToPath(new URL('../../../assets/databases/bible-bsb-v2.db', import.meta.url).href),
    { readOnly: true }
  );

  const fixedVerses = new Map<string, number>();
  const mergedLines = new Map<string, number>();
  let verses = 0;
  try {
    const rows = database
      .prepare('SELECT translation_id, book_id, chapter, verse, text, formatting FROM verses')
      .all() as Row[];

    for (const row of rows) {
      verses += 1;
      const where = `${row.translation_id} ${row.book_id} ${row.chapter}:${row.verse}`;
      const text = normalizeClosingQuoteSpacing(row.text);
      const stored = normalizeVerseFormatting(row.formatting);
      const formatting = reconcileVerseFormattingWithText(
        text,
        normalizeVerseFormattingQuotes(stored)
      );

      assert.ok(!STRAY_SPACE.test(text), `stray space left in text of ${where}`);
      assert.equal(
        stripWhitespace(text),
        stripWhitespace(row.text),
        `${where} changed beyond whitespace`
      );

      if (formatting && stored) {
        for (const line of formatting.lines) {
          assert.ok(!STRAY_SPACE.test(line.text), `stray space left in a line of ${where}`);
        }
        // Only a leading punctuation-only line has nothing to merge into.
        for (const line of formatting.lines.slice(1)) {
          assert.ok(!CLOSING_ONLY_LINE.test(line.text), `punctuation-only line left in ${where}`);
        }
        // Normalizing may only move whitespace and line breaks, never alter the words.
        const cleaned = normalizeVerseFormattingQuotes(stored);
        const merged = stored.lines.length - (cleaned?.lines.length ?? 0);
        if (merged > 0) {
          mergedLines.set(row.translation_id, (mergedLines.get(row.translation_id) ?? 0) + merged);
        }
        assert.equal(
          stripWhitespace((cleaned?.lines ?? []).map((line) => line.text).join('')),
          stripWhitespace(stored.lines.map((line) => line.text).join('')),
          `${where} formatting changed beyond whitespace`
        );
      }

      if (text !== row.text) {
        fixedVerses.set(row.translation_id, (fixedVerses.get(row.translation_id) ?? 0) + 1);
      }
    }
  } finally {
    database.close();
  }

  console.log('merged punctuation-only lines per translation', Object.fromEntries(mergedLines));
  console.log(
    'verses with stray-space text fixed per translation',
    Object.fromEntries(fixedVerses)
  );
  assert.ok(verses > 100000, 'expected the full bundled database');
  assert.ok((fixedVerses.get('bsb') ?? 0) > 0, 'expected the BSB stray spaces to be found');
});
