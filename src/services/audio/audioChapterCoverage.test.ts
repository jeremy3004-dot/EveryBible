import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../../testing/mockModules';
import type { ElAudioManifest } from '../elMedia/elManifestModel';
import type { BibleTranslation } from '../../types';

interface ManifestRef {
  translationId: string;
  manifestUrl: string;
  audioVersion: string;
  catalogBaseUrl: string;
}

const manifestCalls: ManifestRef[] = [];
let respondWithManifest: (ref: ManifestRef) => Promise<ElAudioManifest | null> = async () => null;

mockModule(mock, sourcePath('services/elMedia/elManifestService.ts'), {
  getElManifestForAudioCatalog: (ref: ManifestRef) => {
    manifestCalls.push(ref);
    return respondWithManifest(ref);
  },
});

let coverage: typeof import('./audioChapterCoverage');

before(async () => {
  coverage = await import('./audioChapterCoverage');
});

beforeEach(() => {
  coverage.__resetAudioChapterCoverageForTests();
  manifestCalls.length = 0;
  respondWithManifest = async () => null;
});

function makeManifest(translationId: string, books: Record<string, number[]>): ElAudioManifest {
  return {
    schema: 'everybible-audio-manifest/v1',
    translationId,
    audioVersion: '2026-01-01',
    deliveryMode: 'chapter',
    baseUrl: 'https://media.everybible.app',
    fileExt: 'mp3',
    mimeType: 'audio/mpeg',
    books: Object.fromEntries(
      Object.entries(books).map(([bookId, chapters]) => [
        bookId,
        chapters.map((chapter) => ({
          chapter,
          path: `/${chapter}.mp3`,
          bytes: 10,
          sha256: 'a'.repeat(64),
        })),
      ])
    ),
  };
}

function makeElTranslation(
  id = 'el-bhj',
  audioVersion = '2026-01-01'
): Pick<BibleTranslation, 'id' | 'catalog'> {
  return {
    id,
    catalog: {
      version: '1',
      updatedAt: '2026-01-01',
      audio: {
        strategy: 'el-manifest',
        manifestUrl: `/manifests/${id}.json`,
        audioVersion,
        catalogBaseUrl: 'https://catalog.everylanguage.org',
      },
    },
  };
}

test('an Every Language translation resolves to the chapters its manifest covers', async () => {
  respondWithManifest = async (ref) =>
    makeManifest(ref.translationId, { GEN: [5, 1, 5], PSA: [117] });

  const map = await coverage.resolveAudioChapterMap(makeElTranslation());

  assert.deepEqual(map, { GEN: [1, 5], PSA: [117] });
  assert.deepEqual(manifestCalls, [
    {
      translationId: 'el-bhj',
      manifestUrl: '/manifests/el-bhj.json',
      audioVersion: '2026-01-01',
      catalogBaseUrl: 'https://catalog.everylanguage.org',
    },
  ]);
});

test('resolved coverage is remembered and can be read without waiting', async () => {
  respondWithManifest = async (ref) => makeManifest(ref.translationId, { PSA: [117] });
  const translation = makeElTranslation();
  assert.equal(coverage.peekAudioChapterMap(translation), undefined);

  await coverage.resolveAudioChapterMap(translation);
  const again = await coverage.resolveAudioChapterMap(translation);

  assert.deepEqual(again, { PSA: [117] });
  assert.deepEqual(coverage.peekAudioChapterMap(translation), { PSA: [117] });
  assert.equal(manifestCalls.length, 1);
});

test('each translation and audio version resolves its own coverage', async () => {
  respondWithManifest = async (ref) =>
    makeManifest(ref.translationId, ref.translationId === 'el-a' ? { GEN: [1] } : { MAT: [5] });

  await coverage.resolveAudioChapterMap(makeElTranslation('el-a'));
  const other = await coverage.resolveAudioChapterMap(makeElTranslation('el-b'));
  await coverage.resolveAudioChapterMap(makeElTranslation('el-a', '2026-02-01'));

  assert.deepEqual(other, { MAT: [5] });
  assert.equal(manifestCalls.length, 3);
  assert.equal(coverage.peekAudioChapterMap(makeElTranslation('el-a', '2026-03-01')), undefined);
});

test('a manifest that cannot be resolved leaves coverage unknown and is asked again later', async () => {
  const translation = makeElTranslation();

  assert.equal(await coverage.resolveAudioChapterMap(translation), undefined);
  respondWithManifest = async () => {
    throw new Error('offline');
  };
  assert.equal(await coverage.resolveAudioChapterMap(translation), undefined);
  respondWithManifest = async (ref) => makeManifest(ref.translationId, { GEN: [1] });
  assert.deepEqual(await coverage.resolveAudioChapterMap(translation), { GEN: [1] });
  assert.equal(manifestCalls.length, 3);
});

test('translations without manifest-described audio have no exact coverage', async () => {
  const plain = { id: 'bsb', catalog: undefined };
  const incomplete = makeElTranslation();
  if (incomplete.catalog?.audio) incomplete.catalog.audio.manifestUrl = undefined;

  assert.equal(await coverage.resolveAudioChapterMap(plain), undefined);
  assert.equal(await coverage.resolveAudioChapterMap(incomplete), undefined);
  assert.equal(await coverage.resolveAudioChapterMap(undefined), undefined);
  assert.equal(manifestCalls.length, 0);
});
