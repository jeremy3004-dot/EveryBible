import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adaptLangQuestManifestToEveryBibleAudioVersion,
  buildEveryBibleAudioPromotionManifest,
  buildLangQuestManifest,
  buildLangQuestR2Key,
  classifyAudioKey,
  computeChecksum,
  orderSegmentRows,
  parseAssetVerseRange,
  parseVerseReference,
  type LangQuestSegmentInput,
} from './index';

test('classifyAudioKey separates cloud object keys and local filesystem paths', () => {
  assert.equal(classifyAudioKey('audio/langquest/npi/v1/JHN.mp3').kind, 'cloud');
  assert.equal(classifyAudioKey('r2://everybible/audio/JHN.mp3').kind, 'cloud');
  assert.equal(classifyAudioKey('https://cdn.example.test/audio/JHN.mp3').kind, 'cloud');
  assert.equal(classifyAudioKey('/tmp/langquest/JHN.mp3').kind, 'local');
  assert.equal(classifyAudioKey('local/device-only.wav').kind, 'local');
  assert.equal(classifyAudioKey('file://device-only.wav').kind, 'local');
  assert.equal(classifyAudioKey('../fixtures/JHN.mp3').kind, 'local');
  assert.equal(classifyAudioKey('C:\\audio\\JHN.mp3').kind, 'local');
});

test('parseAssetVerseRange accepts explicit fields and references without throwing on bad input', () => {
  assert.deepEqual(
    parseAssetVerseRange({
      book_id: 'jhn',
      chapter_number: '3',
      start_verse: '16',
      end_verse: '18',
    }),
    {
      ok: true,
      range: { bookId: 'JHN', chapter: 3, startVerse: 16, endVerse: 18 },
    }
  );

  assert.deepEqual(parseVerseReference('MAT 5:9'), {
    ok: true,
    range: { bookId: 'MAT', chapter: 5, startVerse: 9, endVerse: 9 },
  });

  assert.deepEqual(parseAssetVerseRange({ verse: { from: 4, to: 6 } }), {
    ok: true,
    range: { bookId: undefined, chapter: undefined, startVerse: 4, endVerse: 6 },
  });

  assert.equal(parseAssetVerseRange({ reference: 'NOPE' }).ok, false);
  assert.equal(parseAssetVerseRange(null).ok, false);
  assert.equal(
    parseAssetVerseRange({ bookId: 'JHN', chapter: 3, verse: 20, endVerse: 18 }).ok,
    false
  );
});

test('orderSegmentRows follows LangQuest asset and content-link ordering first', () => {
  const rows: LangQuestSegmentInput[] = [
    {
      ...segment('late', 'MAT', 1, 1, 1, 0),
      assetOrderIndex: 2,
      assetCreatedAt: '2026-05-08T00:00:02.000Z',
      contentLinkOrderIndex: 1,
    },
    {
      ...segment('content-second', 'MAT', 1, 1, 1, 0),
      assetOrderIndex: 1,
      assetCreatedAt: '2026-05-08T00:00:01.000Z',
      contentLinkOrderIndex: 2,
    },
    {
      ...segment('content-first', 'JHN', 3, 17, 17, 0),
      assetOrderIndex: 1,
      assetCreatedAt: '2026-05-08T00:00:01.000Z',
      contentLinkOrderIndex: 1,
    },
  ];

  assert.deepEqual(
    orderSegmentRows(rows).map((row) => row.id),
    ['content-first', 'content-second', 'late']
  );
});

test('computeChecksum returns deterministic sha256 hex', () => {
  assert.equal(
    computeChecksum('EveryBible LangQuest'),
    'e4f6c799b73ee7e3f2ac19bfef20c2fcadd0ca10ff959ece7371661a60e25b4c'
  );
});

test('buildLangQuestR2Key is deterministic and validates unsafe inputs', () => {
  assert.equal(
    buildLangQuestR2Key({
      translationId: 'npiulb',
      audioVersion: '2026.05.08-v1',
      bookId: 'jhn',
      chapter: 3,
      startVerse: 16,
      endVerse: 18,
    }),
    'audio/langquest/npiulb/2026.05.08-v1/segments/JHN/003/016-018.mp3'
  );

  assert.throws(() =>
    buildLangQuestR2Key({
      translationId: '../bad',
      audioVersion: 'v1',
      bookId: 'JHN',
      chapter: 3,
      startVerse: 16,
      endVerse: 16,
    })
  );
});

test('buildLangQuestManifest groups ordered segments and adapts to EveryBible audio-version manifest shape', () => {
  const manifest = buildLangQuestManifest({
    translationId: 'npiulb',
    audioVersion: '2026.05.08-v1',
    updatedAt: '2026-05-08T00:00:00.000Z',
    segments: [
      {
        ...segment('jhn-3-16', 'JHN', 3, 16, 16, 0),
        byteLength: 400,
        checksum: 'sha-jhn',
      },
      {
        ...segment('mat-1-1', 'MAT', 1, 1, 1, 0),
        byteLength: 200,
        checksum: 'sha-mat',
      },
    ],
  });

  assert.equal(manifest.totalBooks, 2);
  assert.equal(manifest.totalBytes, 600);
  assert.equal(manifest.totalSegments, 2);
  assert.deepEqual(Object.keys(manifest.books), ['MAT', 'JHN']);
  assert.equal(
    manifest.books.MAT.chapters[0]?.segments[0]?.r2Key,
    'audio/langquest/npiulb/2026.05.08-v1/segments/MAT/001/001.mp3'
  );

  const everyBibleManifest = adaptLangQuestManifestToEveryBibleAudioVersion(manifest);
  assert.equal(everyBibleManifest.deliveryMode, 'segment');
  assert.equal(everyBibleManifest.storageProvider, 'cloudflare-r2');
  assert.equal(everyBibleManifest.audioVersion, manifest.audioVersion);
  assert.equal(everyBibleManifest.books.JHN.totalSegments, 1);
});

test('buildEveryBibleAudioPromotionManifest preserves promoted R2 segment keys', () => {
  const manifest = buildEveryBibleAudioPromotionManifest({
    translationId: 'npiulb',
    audioVersion: '2026.05.08-v1',
    updatedAt: '2026-05-08T00:00:00.000Z',
    artifacts: [
      {
        id: 'artifact-jhn-3',
        bookId: 'JHN',
        chapter: 3,
        manifest: {
          segments: [
            {
              byte_size: 512,
              content_type: 'audio/mpeg',
              r2_key: 'langquest/ingest/selected/checksum/chapters/JHN/003/segments/001-v16.mp3',
              seq: 1,
              sha256: 'sha-jhn',
              source_supabase_key: 'source/jhn-3-16.mp3',
              verse_from: 16,
              verse_to: 16,
            },
          ],
        },
      },
      {
        id: 'artifact-mat-1',
        bookId: 'MAT',
        chapter: 1,
        manifest: {
          segments: [
            {
              byte_size: 128,
              r2_key: 'langquest/ingest/selected/checksum/chapters/MAT/001/segments/001-v1.mp3',
              verse_from: 1,
              verse_to: 1,
            },
          ],
        },
      },
    ],
  });

  assert.equal(manifest.deliveryMode, 'segment');
  assert.equal(manifest.baseUrl, 'manifests/audio/npiulb/2026.05.08-v1.json');
  assert.equal(manifest.totalBooks, 2);
  assert.equal(manifest.totalBytes, 640);
  assert.deepEqual(Object.keys(manifest.books), ['MAT', 'JHN']);
  assert.equal(
    manifest.books.JHN.chapters[0]?.segments[0]?.r2Key,
    'langquest/ingest/selected/checksum/chapters/JHN/003/segments/001-v16.mp3'
  );
});

test('buildEveryBibleAudioPromotionManifest rejects empty chapter artifacts', () => {
  assert.throws(() =>
    buildEveryBibleAudioPromotionManifest({
      translationId: 'npiulb',
      audioVersion: '2026.05.08-v1',
      updatedAt: '2026-05-08T00:00:00.000Z',
      artifacts: [{ id: 'artifact-empty', bookId: 'JHN', chapter: 3, manifest: { segments: [] } }],
    })
  );
});

function segment(
  id: string,
  bookId: string,
  chapter: number,
  startVerse: number,
  endVerse: number,
  startMs: number
): LangQuestSegmentInput {
  return {
    id,
    sourceKey: `fixtures/${id}.mp3`,
    bookId,
    chapter,
    startVerse,
    endVerse,
    startMs,
    endMs: startMs + 1000,
  };
}
