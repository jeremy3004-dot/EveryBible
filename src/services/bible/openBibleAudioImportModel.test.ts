import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeOpenBibleAudioEntryName,
  normalizeOpenBibleTimingEntryName,
  parseOpenBibleArtifactManifest,
  parseOpenBibleTimingText,
} from './openBibleAudioImportModel';

test('parseOpenBibleArtifactManifest extracts the inline artifact manifest and api base url', () => {
  const html = String.raw`<script>self.__next_f.push([1,"{\"artifacts\":[{\"id\":\"abc123\",\"bookCode\":\"MAT\",\"fileName\":\"MAT.zip\"},{\"id\":\"timing456\",\"bookCode\":null,\"fileName\":\"timing.zip\"}],\"apiBaseUrl\":\"https://openbible-api-1.biblica.com\"}"])</script>`;

  const manifest = parseOpenBibleArtifactManifest(html);

  assert.equal(manifest.apiBaseUrl, 'https://openbible-api-1.biblica.com');
  assert.equal(manifest.artifacts.length, 2);
  assert.equal(manifest.artifacts[0]?.id, 'abc123');
  assert.equal(manifest.artifacts[1]?.fileName, 'timing.zip');
});

test('parseOpenBibleTimingText converts verse timing rows into seconds keyed by verse number', () => {
  const raw = `Marker file version: 1
Time format: Time
Chapter Title\t00:00:02,00000000\t\t
Verse 1\t00:00:06,36343750\t\t
Verse 2\t00:00:12,03177083\t\t
Verse 16\t00:01:48,23508333\t\t
`;

  const parsed = parseOpenBibleTimingText(raw);

  assert.deepEqual(parsed, {
    1: 6.363437,
    2: 12.031771,
    16: 108.235083,
  });
});

test('normalizeOpenBibleAudioEntryName maps chapter mp3 names onto book and chapter ids', () => {
  assert.deepEqual(normalizeOpenBibleAudioEntryName('PHM_001.mp3'), {
    bookId: 'PHM',
    chapter: 1,
  });
  assert.equal(normalizeOpenBibleAudioEntryName('metadata.xml'), null);
});

test('parseOpenBibleArtifactManifest unescapes the JSON-escaped slashes in the api base url', () => {
  const html = String.raw`{\"artifacts\":[{\"id\":\"a\",\"bookCode\":\"JHN\",\"fileName\":\"JHN.zip\",\"sequence\":4}],\"apiBaseUrl\":\"https:\/\/api.example.test\/v1\"}`;

  assert.deepEqual(parseOpenBibleArtifactManifest(html), {
    apiBaseUrl: 'https://api.example.test/v1',
    artifacts: [{ id: 'a', bookCode: 'JHN', fileName: 'JHN.zip', sequence: 4 }],
  });
});

test('parseOpenBibleArtifactManifest rejects a page with no artifact manifest', () => {
  assert.throws(
    () => parseOpenBibleArtifactManifest('<html><body>Maintenance</body></html>'),
    /artifact manifest not found/
  );
});

test('parseOpenBibleArtifactManifest rejects a manifest with no api base url after it', () => {
  const html = String.raw`{\"artifacts\":[{\"id\":\"a\",\"bookCode\":null,\"fileName\":\"a.zip\"}]}`;

  assert.throws(() => parseOpenBibleArtifactManifest(html), /API base URL not found/);
});

test('parseOpenBibleArtifactManifest rejects an api base url cut off before its closing quote', () => {
  const html = String.raw`{\"artifacts\":[],\"apiBaseUrl\":\"https://api.example.test`;

  assert.throws(() => parseOpenBibleArtifactManifest(html), /API base URL was truncated/);
});

test('parseOpenBibleTimingText pads short fractions and skips rows that are not verse markers', () => {
  const raw = 'Verse 3\t00:00:01,5\r\nVerse x\t00:00:09,1\r\nVerse 4\t0:00:02,1\r\n';

  assert.deepEqual(parseOpenBibleTimingText(raw), { 3: 1.5 });
});

test('normalizeOpenBibleAudioEntryName upper-cases numbered book ids and rejects other extensions', () => {
  assert.deepEqual(normalizeOpenBibleAudioEntryName('1co_013.MP3'), { bookId: '1CO', chapter: 13 });
  assert.equal(normalizeOpenBibleAudioEntryName('1CO_013.txt'), null);
});

test('normalizeOpenBibleTimingEntryName maps chapter timing files onto book and chapter ids', () => {
  assert.deepEqual(normalizeOpenBibleTimingEntryName('JHN_003.txt'), { bookId: 'JHN', chapter: 3 });
  assert.deepEqual(normalizeOpenBibleTimingEntryName('2ki_025.TXT'), {
    bookId: '2KI',
    chapter: 25,
  });
  assert.equal(normalizeOpenBibleTimingEntryName('JHN_003.mp3'), null);
  assert.equal(normalizeOpenBibleTimingEntryName('readme.txt'), null);
});
