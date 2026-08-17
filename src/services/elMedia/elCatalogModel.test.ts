import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { verifyElEnvelope } from './elEnvelope';
import { parseElCatalogPayload } from './elCatalogModel';

const fixturesDir = new URL('./fixtures/', import.meta.url);
const readJson = (name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(name, fixturesDir).href), 'utf8'));
const jwks = readJson('dev.jwks.json').keys;
const catalogEnvelope = readJson('catalog.dev.json');

// A minimal valid catalog entry the tests can clone and mutate per case.
const validEntry = () => ({
  translation_id: 'lqdtest',
  language_iso639_3: 'eng',
  language_name: 'English (EL test)',
  translation_name: 'EL Test Translation',
  abbreviation: 'LQTEST',
  language_autonym: 'English',
  text_direction: 'ltr',
  source: 'langquest',
  copyright: 'CC0-1.0',
  delivery_mode: 'chapter',
  has_audio: true,
  current_audio_version: 'v2026-07-20-1',
  manifest_url: '/manifests/audio/lqdtest/v2026-07-20-1.json',
  manifest_sha256: 'adbb4675d4afa29e851f4a9055a9fcfb61f13ae4a0da6c982694dd11c9a03fac',
});

const validCatalog = (overrides: Record<string, unknown> = {}) => ({
  schema_version: 'lqd-catalog/v1',
  sequence: 1,
  generated_at: '2026-07-18T12:00:00.000Z',
  base_url: 'http://localhost:8787',
  translations: [validEntry()],
  ...overrides,
});

test('parses the real signed fixture catalog payload', async () => {
  const payload = await verifyElEnvelope(catalogEnvelope, jwks);
  const catalog = parseElCatalogPayload(payload);
  assert.ok(catalog);
  assert.equal(catalog.schemaVersion, 'lqd-catalog/v1');
  assert.equal(catalog.sequence, 1);
  assert.equal(catalog.baseUrl, 'http://localhost:8787');
  assert.equal(catalog.translations.length, 1);
  const t = catalog.translations[0];
  assert.equal(t.translationId, 'lqdtest');
  assert.equal(t.languageIso6393, 'eng');
  assert.equal(t.languageName, 'English (EL test)');
  assert.equal(t.translationName, 'EL Test Translation');
  assert.equal(t.abbreviation, 'LQTEST');
  assert.equal(t.languageAutonym, 'English');
  assert.equal(t.textDirection, 'ltr');
  assert.equal(t.source, 'langquest');
  assert.equal(t.copyright, 'CC0-1.0');
  assert.equal(t.deliveryMode, 'chapter');
  assert.equal(t.hasAudio, true);
  assert.equal(t.currentAudioVersion, 'v2026-07-20-1');
  assert.equal(t.manifestUrl, '/manifests/audio/lqdtest/v2026-07-20-1.json');
  assert.equal(
    t.manifestSha256,
    'adbb4675d4afa29e851f4a9055a9fcfb61f13ae4a0da6c982694dd11c9a03fac'
  );
});

test('ignores unknown top-level and entry fields', () => {
  const catalog = parseElCatalogPayload(
    validCatalog({
      unknown_top: 'junk',
      translations: [{ ...validEntry(), unknown_entry: 'junk' }],
    })
  );
  assert.ok(catalog);
  assert.equal(catalog.translations.length, 1);
});

test('skips entries with unknown delivery_mode but keeps valid ones', () => {
  const catalog = parseElCatalogPayload(
    validCatalog({
      translations: [{ ...validEntry(), delivery_mode: 'segment' }, validEntry()],
    })
  );
  assert.ok(catalog);
  assert.equal(catalog.translations.length, 1);
});

test('skips an entry missing a required field but still returns the catalog', () => {
  const bad = validEntry();
  delete (bad as Record<string, unknown>).translation_name;
  const catalog = parseElCatalogPayload(validCatalog({ translations: [bad] }));
  assert.ok(catalog);
  assert.equal(catalog.translations.length, 0);
});

test('returns null for an unknown schema major', () => {
  assert.equal(parseElCatalogPayload(validCatalog({ schema_version: 'lqd-catalog/v2' })), null);
});

test('returns null for non-integer or negative sequence', () => {
  assert.equal(parseElCatalogPayload(validCatalog({ sequence: 1.5 })), null);
  assert.equal(parseElCatalogPayload(validCatalog({ sequence: -1 })), null);
});

test('accepts an empty translations array', () => {
  const catalog = parseElCatalogPayload(validCatalog({ translations: [] }));
  assert.ok(catalog);
  assert.equal(catalog.translations.length, 0);
});

test('skips entries whose translation_id fails the collision guard', () => {
  const catalog = parseElCatalogPayload(
    validCatalog({
      translations: [
        { ...validEntry(), translation_id: 'bsb' },
        { ...validEntry(), translation_id: 'LQDT' },
        { ...validEntry(), translation_id: 'EL-BHUJEL' },
        { ...validEntry(), translation_id: 'el-' },
        { ...validEntry(), translation_id: 'elephant' },
        validEntry(),
      ],
    })
  );
  assert.ok(catalog);
  assert.equal(catalog.translations.length, 1);
});

// Contract rev 2026-08-15: EL translation ids are `el-{slug}` (source-agnostic permanent
// ids); `lqdtest` stays grandfathered. A regex that rejects `el-*` drops every real EL
// translation *silently*, because the parser is deliberately tolerant.
test('keeps el-prefixed translation ids from the production catalog', () => {
  const catalog = parseElCatalogPayload(
    validCatalog({
      translations: [
        {
          ...validEntry(),
          translation_id: 'el-bhujel',
          language_iso639_3: 'byh',
          language_name: 'Bhujel',
          translation_name: 'Bhujel Bible',
          abbreviation: 'BYH',
          source: 'every-language',
          current_audio_version: 'v2026-08-15-2',
          manifest_url: '/manifests/audio/el-bhujel/v2026-08-15-2.json',
        },
        validEntry(),
      ],
    })
  );
  assert.ok(catalog);
  assert.equal(catalog.translations.length, 2);
  assert.equal(catalog.translations[0].translationId, 'el-bhujel');
  assert.equal(
    catalog.translations[0].manifestUrl,
    '/manifests/audio/el-bhujel/v2026-08-15-2.json'
  );
  assert.equal(catalog.translations[1].translationId, 'lqdtest');
});

// `mis` is ISO 639-3's own "uncoded languages" value; many EL field languages have no
// ISO code, so it appears verbatim and must not disqualify an entry.
test('accepts the ISO uncoded-language value and unknown source labels', () => {
  const catalog = parseElCatalogPayload(
    validCatalog({
      translations: [
        {
          ...validEntry(),
          translation_id: 'el-santhali',
          language_iso639_3: 'mis',
          language_glottocode: 'sant1410',
          source: 'some-future-source',
        },
      ],
    })
  );
  assert.ok(catalog);
  assert.equal(catalog.translations.length, 1);
  assert.equal(catalog.translations[0].languageIso6393, 'mis');
  assert.equal(catalog.translations[0].source, 'some-future-source');
});

test('drops an invalid text_direction but keeps the entry', () => {
  const catalog = parseElCatalogPayload(
    validCatalog({ translations: [{ ...validEntry(), text_direction: 'weird' }] })
  );
  assert.ok(catalog);
  assert.equal(catalog.translations.length, 1);
  assert.equal(catalog.translations[0].textDirection, undefined);
});

test('drops an invalid manifest_sha256', () => {
  const catalog = parseElCatalogPayload(
    validCatalog({ translations: [{ ...validEntry(), manifest_sha256: 'nothex' }] })
  );
  assert.ok(catalog);
  assert.equal(catalog.translations.length, 0);
});

test('returns null when base_url is not an http(s) URL', () => {
  assert.equal(parseElCatalogPayload(validCatalog({ base_url: 'ftp://example.com' })), null);
  assert.equal(parseElCatalogPayload(validCatalog({ base_url: 'example.com' })), null);
});

test('returns null for non-object payloads', () => {
  assert.equal(parseElCatalogPayload(null), null);
  assert.equal(parseElCatalogPayload('nope'), null);
});
