import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { bibleTranslations } from './translations';

/**
 * The app treats a missing `source` as bundled — isTranslationReadableLocally checks
 * `source !== 'runtime'` — so the original built-ins (bsb, web, asv) carry no explicit
 * field. Mirror that rule here rather than requiring the string.
 */
const isBundledText = (translation: (typeof bibleTranslations)[number]): boolean =>
  translation.source !== 'runtime' && translation.hasText;

/**
 * The bundled database is built by scripts/build_bible_db.py from a fixed list. A catalog
 * entry that claims `source: 'bundled'` with `hasText` is telling the app the verses are
 * already on device, which makes the sanitizer force `isDownloaded: true` and makes
 * mergeRuntimeCatalogTranslations prefer it over the real cloud entry. If the verses were
 * never actually built in, the translation becomes unreadable in a way nothing can repair:
 * it never downloads, because the app believes it is already installed.
 *
 * That is exactly what happened to the Hindi Contemporary Version — declared bundled with
 * text, never added to the builder, so every chapter rendered "does not have written text
 * yet". These tests pin the two lists together in both directions.
 */
function builderTranslationIds(): Set<string> {
  const source = readFileSync(
    fileURLToPath(new URL('../../scripts/build_bible_db.py', import.meta.url).href),
    'utf8'
  );
  const block = source.slice(source.indexOf('SOURCE_DATA = ['), source.indexOf('def parse_args'));
  const ids = [...block.matchAll(/"translation_id":\s*"([^"]+)"/g)].map((match) => match[1]);
  assert.ok(ids.length > 0, 'could not parse SOURCE_DATA out of scripts/build_bible_db.py');
  return new Set(ids);
}

test('every translation claiming bundled text is actually built into the database', () => {
  const built = builderTranslationIds();
  const claimed = bibleTranslations.filter(isBundledText).map((translation) => translation.id);

  const missing = claimed.filter((id) => !built.has(id));
  assert.deepEqual(
    missing,
    [],
    `these translations claim bundled text but are not in scripts/build_bible_db.py, so they will render empty chapters forever: ${missing.join(', ')}`
  );
});

test('every translation built into the database is declared as bundled text', () => {
  const built = builderTranslationIds();
  const declaredBundledText = new Set(
    bibleTranslations.filter(isBundledText).map((translation) => translation.id)
  );

  const undeclared = [...built].filter((id) => !declaredBundledText.has(id));
  assert.deepEqual(
    undeclared,
    [],
    `these translations are shipped inside the bundled database but the catalog does not declare them bundled-with-text, so the app will try to download text it already has: ${undeclared.join(', ')}`
  );
});

test('a bundled translation is never also marked remote-only', () => {
  const contradictory = bibleTranslations
    .filter(isBundledText)
    .filter((translation) => translation.installState === 'remote-only')
    .map((translation) => translation.id);

  assert.deepEqual(
    contradictory,
    [],
    `bundled text cannot be remote-only: ${contradictory.join(', ')}`
  );
});
