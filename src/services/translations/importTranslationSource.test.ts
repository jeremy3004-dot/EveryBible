import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readImportScriptSource(): string {
  return readFileSync(
    fileURLToPath(new URL('../../../scripts/import-ebible-translations.ts', import.meta.url).href),
    'utf8'
  );
}

test('import script only marks a translation available after verses and version metadata are written', () => {
  const source = readImportScriptSource();

  assert.match(
    source,
    /const verseRows = parseVplXml\(vplContent, translationId\);[\s\S]*await upsertVersesBatch\(supabase, batch, translationId\);[\s\S]*await upsertVersionRow\(supabase, translationId, verseRows\.length\);[\s\S]*await upsertCatalogRow\(supabase, translation\);/,
    'import-ebible-translations.ts should only upsert translation_catalog after verse rows and translation_versions succeed, otherwise the app can advertise broken downloads'
  );
});
