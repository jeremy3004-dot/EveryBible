import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { verifyElEnvelope } from './elEnvelope';
import { parseElManifestPayload, resolveElChapterFromManifest } from './elManifestModel';

const fixturesDir = new URL('./fixtures/', import.meta.url);
const readJson = (name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(name, fixturesDir).href), 'utf8'));
const jwks = readJson('dev.jwks.json').keys;
const manifestEnvelope = readJson('manifest-lqdtest.json');

const validChapter = (chapter: number) => ({
  chapter,
  path: `/audio/lqdtest/v2026-07-20-1/chapters/JHN/${chapter}.mp3`,
  bytes: 2703104,
  sha256: '7a07cff44f854a28c311ec910aa4ea57ca792ef946094774e13694e52872f7d5',
  duration_ms: 225000,
});

const validManifest = (overrides: Record<string, unknown> = {}) => ({
  schema: 'everybible-audio-manifest/v1',
  translation_id: 'lqdtest',
  audio_version: 'v2026-07-20-1',
  delivery_mode: 'chapter',
  base_url: 'http://localhost:8787',
  file_ext: 'mp3',
  mime_type: 'audio/mpeg',
  books: { JHN: { chapters: [validChapter(1), validChapter(2)] } },
  ...overrides,
});

test('parses the real signed fixture manifest payload', async () => {
  const payload = await verifyElEnvelope(manifestEnvelope, jwks);
  const manifest = parseElManifestPayload(payload);
  assert.ok(manifest);
  assert.equal(manifest.schema, 'everybible-audio-manifest/v1');
  assert.equal(manifest.translationId, 'lqdtest');
  assert.equal(manifest.audioVersion, 'v2026-07-20-1');
  assert.equal(manifest.deliveryMode, 'chapter');
  assert.equal(manifest.baseUrl, 'http://localhost:8787');
  assert.equal(manifest.fileExt, 'mp3');
  assert.equal(manifest.mimeType, 'audio/mpeg');
  assert.deepEqual(Object.keys(manifest.books), ['JHN']);
  assert.equal(manifest.books.JHN.length, 2);
  assert.equal(manifest.books.JHN[0].chapter, 1);
  assert.equal(manifest.books.JHN[0].bytes, 2703104);
  assert.equal(manifest.books.JHN[0].durationMs, 225000);
  assert.equal(manifest.books.JHN[1].chapter, 2);
});

test('resolves absolute chapter URLs from the fixture manifest', async () => {
  const payload = await verifyElEnvelope(manifestEnvelope, jwks);
  const manifest = parseElManifestPayload(payload);
  assert.ok(manifest);
  const resolved = resolveElChapterFromManifest(manifest, 'JHN', 1);
  assert.ok(resolved);
  assert.equal(
    resolved.url,
    'http://localhost:8787/audio/lqdtest/v2026-07-20-1/chapters/JHN/1.mp3'
  );
  assert.equal(resolved.mimeType, 'audio/mpeg');
  assert.equal(resolved.fileExt, 'mp3');
  assert.equal(resolved.bytes, 2703104);
  assert.equal(resolved.durationMs, 225000);
});

test('strips a trailing slash from base_url when resolving', () => {
  const manifest = parseElManifestPayload(validManifest({ base_url: 'http://localhost:8787/' }));
  assert.ok(manifest);
  const resolved = resolveElChapterFromManifest(manifest, 'JHN', 1);
  assert.ok(resolved);
  assert.equal(
    resolved.url,
    'http://localhost:8787/audio/lqdtest/v2026-07-20-1/chapters/JHN/1.mp3'
  );
});

test('returns null for an unknown schema major', () => {
  assert.equal(
    parseElManifestPayload(validManifest({ schema: 'everybible-audio-manifest/v2' })),
    null
  );
});

test('returns null for a non-chapter delivery mode', () => {
  assert.equal(parseElManifestPayload(validManifest({ delivery_mode: 'segment' })), null);
});

test('returns null when a required top-level field is missing', () => {
  const bad = validManifest();
  delete (bad as Record<string, unknown>).base_url;
  assert.equal(parseElManifestPayload(bad), null);

  const bad2 = validManifest();
  delete (bad2 as Record<string, unknown>).file_ext;
  assert.equal(parseElManifestPayload(bad2), null);
});

test('skips malformed chapters but keeps the valid ones in a book', () => {
  const manifest = parseElManifestPayload(
    validManifest({
      books: {
        JHN: {
          chapters: [
            validChapter(1),
            { ...validChapter(2), chapter: 0 }, // chapter < 1
            { ...validChapter(3), bytes: -5 }, // non-positive bytes
            { ...validChapter(4), sha256: 'nothex' }, // bad hash
            { ...validChapter(5), path: 'no-leading-slash' }, // path not absolute
            validChapter(6),
          ],
        },
      },
    })
  );
  assert.ok(manifest);
  assert.deepEqual(
    manifest.books.JHN.map((c) => c.chapter),
    [1, 6]
  );
});

test('skips an entirely malformed book without dropping other books', () => {
  const manifest = parseElManifestPayload(
    validManifest({
      books: {
        JHN: { chapters: [validChapter(1)] },
        NOTABOOK: 'garbage',
        GEN: { chapters: 'not-an-array' },
      },
    })
  );
  assert.ok(manifest);
  assert.deepEqual(Object.keys(manifest.books), ['JHN']);
});

test('drops a book whose chapters all fail validation', () => {
  const manifest = parseElManifestPayload(
    validManifest({
      books: {
        JHN: { chapters: [validChapter(1)] },
        GEN: { chapters: [{ ...validChapter(1), path: 'bad' }] },
      },
    })
  );
  assert.ok(manifest);
  assert.deepEqual(Object.keys(manifest.books), ['JHN']);
});

test('omits durationMs when it is not a number', () => {
  const chapter = validChapter(1);
  delete (chapter as Record<string, unknown>).duration_ms;
  const manifest = parseElManifestPayload(
    validManifest({ books: { JHN: { chapters: [chapter] } } })
  );
  assert.ok(manifest);
  assert.equal(manifest.books.JHN[0].durationMs, undefined);
  const resolved = resolveElChapterFromManifest(manifest, 'JHN', 1);
  assert.ok(resolved);
  assert.equal(resolved.durationMs, undefined);
});

test('returns null when resolving an unknown book or missing chapter', () => {
  const manifest = parseElManifestPayload(validManifest());
  assert.ok(manifest);
  assert.equal(resolveElChapterFromManifest(manifest, 'GEN', 1), null);
  assert.equal(resolveElChapterFromManifest(manifest, 'JHN', 99), null);
});

test('returns null for non-object payloads', () => {
  assert.equal(parseElManifestPayload(null), null);
  assert.equal(parseElManifestPayload('nope'), null);
});
