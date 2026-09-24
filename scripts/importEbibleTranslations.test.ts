import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { createSupabaseFake } from '../src/testing/supabaseFake';
import { importTranslation } from './import-ebible-translations';

// The real per-translation import, with the eBible download and Supabase replaced. The
// catalog row is what makes a translation appear in the app, so it must only be written
// once every verse and the version row are in place.
mock.method(console, 'log', () => undefined);
mock.method(console, 'warn', () => undefined);

const supabase = createSupabaseFake();
beforeEach(() => supabase.reset());

const translation = {
  translationId: 'engwebp',
  shortTitle: 'WEB Test',
  languageCode: 'eng',
  languageNameInEnglish: 'English',
  otBooks: 39,
  ntBooks: 27,
  redistributable: true,
  downloadable: true,
  textDirection: 'ltr',
  copyright: 'Public Domain',
};

function vplZip(): Buffer {
  const zip = new AdmZip();
  zip.addFile(
    'engwebp_vpl.xml',
    Buffer.from(
      '<vpl><h>The Word</h><v b="JHN" c="1" v="1">In the beginning was the Word.</v>' +
        '<v b="JHN" c="1" v="2">The same was in the beginning with God.</v></vpl>'
    )
  );
  return zip.toBuffer();
}

const tablesWritten = () =>
  supabase.calls.filter((call) => call.operation === 'upsert').map((call) => call.table);

test('verses and the version row are written before the translation is advertised', async () => {
  await importTranslation(supabase.client as never, translation, async () => vplZip());

  assert.deepEqual(tablesWritten(), [
    'bible_verses',
    'translation_versions',
    'translation_catalog',
  ]);
  const catalog = supabase.calls.find((call) => call.table === 'translation_catalog')!;
  assert.equal((catalog.payload as { is_available: boolean }).is_available, true);
  const version = supabase.calls.find((call) => call.table === 'translation_versions')!;
  assert.equal((version.payload as { total_verses: number }).total_verses, 2);
});

test('a failed verse write stops the import before the catalog row', async () => {
  supabase.respondTo('bible_verses', () => ({ error: { message: 'timeout' } }));

  await assert.rejects(
    importTranslation(supabase.client as never, translation, async () => vplZip()),
    /verses upsert failed for engwebp/
  );
  assert.deepEqual(tablesWritten(), ['bible_verses']);
});

test('a failed version write stops the import before the catalog row', async () => {
  supabase.respondTo('translation_versions', () => ({ error: { message: 'constraint' } }));

  await assert.rejects(
    importTranslation(supabase.client as never, translation, async () => vplZip()),
    /versions upsert failed for engwebp/
  );
  assert.deepEqual(tablesWritten(), ['bible_verses', 'translation_versions']);
});

test('an unavailable download skips the translation without writing anything', async () => {
  await importTranslation(supabase.client as never, translation, async () => {
    throw new Error('404');
  });

  assert.deepEqual(tablesWritten(), []);
});
