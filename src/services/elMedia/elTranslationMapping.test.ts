import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { verifyElEnvelope } from './elEnvelope';
import { parseElCatalogPayload, type ElCatalog } from './elCatalogModel';
import { mapElCatalogToBibleTranslations, mapElLanguageCode } from './elTranslationMapping';
import { normalizeCatalogTranslationId } from '../translations/translationCatalogModel';
import { filterInstallableCatalogEntries } from '../translations/translationCatalogModel';
import type { TranslationCatalogEntry } from '../supabase/types';

const fixturesDir = new URL('./fixtures/', import.meta.url);
const readJson = (name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(name, fixturesDir).href), 'utf8'));
const jwks = readJson('dev.jwks.json').keys;
const catalogEnvelope = readJson('catalog.dev.json');

async function loadFixtureCatalog(): Promise<ElCatalog> {
  const payload = await verifyElEnvelope(catalogEnvelope, jwks);
  const catalog = parseElCatalogPayload(payload);
  assert.ok(catalog, 'fixture catalog should verify + parse');
  return catalog;
}

test('maps the real fixture catalog to one BibleTranslation with every field', async () => {
  const catalog = await loadFixtureCatalog();
  const mapped = mapElCatalogToBibleTranslations(catalog);
  assert.equal(mapped.length, 1);

  const t = mapped[0];
  // Identity: id/name/abbreviation come straight from the entry.
  assert.equal(t.id, 'lqdtest');
  assert.equal(t.name, 'EL Test Translation');
  assert.equal(t.abbreviation, 'LQTEST');
  // language is the EL catalog's English display name (language_name), which is
  // the picker's filter-grouping bucket key — NOT the ISO-style code. This keeps
  // EL entries in the same language bucket as Supabase entries for the same
  // language instead of fragmenting into a raw code bucket.
  assert.equal(t.language, 'English (EL test)');
  // languageAutonym ('English') preferred over languageName for the display label.
  assert.equal(t.description, 'English');
  // CC0-1.0 → the app's public-domain-audio representation.
  assert.equal(t.copyright, 'Public Domain audio (CC0 1.0)');

  // Audio-only: has audio, no text, chapter granularity, runtime source.
  assert.equal(t.hasAudio, true);
  assert.equal(t.hasText, false);
  assert.equal(t.audioGranularity, 'chapter');
  assert.equal(t.source, 'runtime');
  assert.equal(t.installState, 'remote-only');
  assert.equal(t.isDownloaded, false);
  assert.deepEqual(t.downloadedBooks, []);
  assert.deepEqual(t.downloadedAudioBooks, []);

  // catalog.audio carries the 'el-manifest' strategy payload.
  assert.ok(t.catalog);
  assert.equal(t.totalBooks, 0, 'audio-only entries do not advertise a text book count');
  assert.equal(t.catalog.updatedAt, catalog.generatedAt);
  assert.ok(t.catalog.audio);
  assert.equal(t.catalog.audio.strategy, 'el-manifest');
  assert.equal(t.catalog.audio.manifestUrl, '/manifests/audio/lqdtest/v2026-07-20-1.json');
  assert.equal(t.catalog.audio.audioVersion, 'v2026-07-20-1');
  assert.equal(t.catalog.audio.catalogBaseUrl, catalog.baseUrl);
  assert.equal(t.catalog.audio.fileExtension, 'mp3');
});

test('skips entries with hasAudio === false', () => {
  const catalog: ElCatalog = {
    schemaVersion: 'lqd-catalog/v1',
    sequence: 1,
    generatedAt: '2026-07-18T12:00:00.000Z',
    baseUrl: 'https://media.example.com',
    translations: [
      {
        translationId: 'lqnoaudio',
        languageIso6393: 'spa',
        languageName: 'Spanish',
        translationName: 'No Audio Test',
        abbreviation: 'NAT',
        source: 'langquest',
        copyright: 'CC0-1.0',
        deliveryMode: 'chapter',
        hasAudio: false,
        currentAudioVersion: 'v1',
        manifestUrl: '/m.json',
        manifestSha256: 'a'.repeat(64),
      },
      {
        translationId: 'lqhasaudio',
        languageIso6393: 'spa',
        languageName: 'Spanish',
        translationName: 'Has Audio Test',
        abbreviation: 'HAT',
        source: 'langquest',
        copyright: 'CC0-1.0',
        deliveryMode: 'chapter',
        hasAudio: true,
        currentAudioVersion: 'v1',
        manifestUrl: '/m2.json',
        manifestSha256: 'b'.repeat(64),
      },
    ],
  };

  const mapped = mapElCatalogToBibleTranslations(catalog);
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].id, 'lqhasaudio');
});

test('mapped id survives normalizeCatalogTranslationId unchanged', async () => {
  const catalog = await loadFixtureCatalog();
  const mapped = mapElCatalogToBibleTranslations(catalog);
  const id = mapped[0].id;
  assert.equal(normalizeCatalogTranslationId(id), id);
});

test('language name falls back to languageName when autonym absent', () => {
  const catalog: ElCatalog = {
    schemaVersion: 'lqd-catalog/v1',
    sequence: 1,
    generatedAt: '2026-07-18T12:00:00.000Z',
    baseUrl: 'https://media.example.com',
    translations: [
      {
        translationId: 'lqnoautonym',
        languageIso6393: 'mis',
        languageName: 'Test Language',
        translationName: 'No Autonym',
        abbreviation: 'NA',
        source: 'langquest',
        copyright: 'CC0-1.0',
        deliveryMode: 'chapter',
        hasAudio: true,
        currentAudioVersion: 'v1',
        manifestUrl: '/m.json',
        manifestSha256: 'a'.repeat(64),
      },
    ],
  };
  const mapped = mapElCatalogToBibleTranslations(catalog);
  assert.equal(mapped[0].description, 'Test Language');
});

test('mapElLanguageCode maps known iso639-3 codes and passes unknown through', () => {
  assert.equal(mapElLanguageCode('eng'), 'en');
  assert.equal(mapElLanguageCode('spa'), 'es');
  assert.equal(mapElLanguageCode('hin'), 'hi');
  assert.equal(mapElLanguageCode('nep'), 'ne');
  assert.equal(mapElLanguageCode('mar'), 'mr');
  assert.equal(mapElLanguageCode('ben'), 'bn');
  assert.equal(mapElLanguageCode('tam'), 'ta');
  assert.equal(mapElLanguageCode('tel'), 'te');
  assert.equal(mapElLanguageCode('pan'), 'pa');
  assert.equal(mapElLanguageCode('urd'), 'ur');
  assert.equal(mapElLanguageCode('ara'), 'ar');
  assert.equal(mapElLanguageCode('fra'), 'fr');
  assert.equal(mapElLanguageCode('deu'), 'de');
  assert.equal(mapElLanguageCode('por'), 'pt');
  assert.equal(mapElLanguageCode('rus'), 'ru');
  assert.equal(mapElLanguageCode('ind'), 'id');
  assert.equal(mapElLanguageCode('jpn'), 'ja');
  assert.equal(mapElLanguageCode('kor'), 'ko');
  assert.equal(mapElLanguageCode('tur'), 'tr');
  assert.equal(mapElLanguageCode('vie'), 'vi');
  assert.equal(mapElLanguageCode('zho'), 'zh');
  // Unmapped codes pass through as-is (grouped under the iso639-3 code).
  assert.equal(mapElLanguageCode('sat'), 'sat');
});

test('audio-only mapped shape is installable (not filtered out)', async () => {
  const catalog = await loadFixtureCatalog();
  const mapped = mapElCatalogToBibleTranslations(catalog);
  const t = mapped[0];

  // Mirror the mapped BibleTranslation into a Supabase-shaped catalog entry to
  // prove the audio-only representation (has_text=false + catalog.audio present,
  // runtime source) clears the installability gate and appears in the picker.
  const entry: TranslationCatalogEntry = {
    id: t.id,
    translation_id: t.id,
    name: t.name,
    abbreviation: t.abbreviation,
    language_code: t.language,
    language_name: t.language,
    license_type: t.copyright,
    license_url: null,
    source_url: null,
    has_audio: t.hasAudio,
    has_text: t.hasText,
    is_bundled: false,
    is_available: true,
    sort_order: 0,
    catalog: t.catalog ?? null,
    created_at: '2026-08-03T00:00:00.000Z',
    updated_at: '2026-08-03T00:00:00.000Z',
  };

  const installable = filterInstallableCatalogEntries([entry], new Set<string>());
  assert.equal(installable.length, 1);
  assert.equal(installable[0].translation_id, t.id);
});
