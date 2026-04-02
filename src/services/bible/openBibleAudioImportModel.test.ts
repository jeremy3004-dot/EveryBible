import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeOpenBibleAudioEntryName,
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
