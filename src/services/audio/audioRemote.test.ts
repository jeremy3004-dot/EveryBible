import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearRemoteAudioCache,
  fetchRemoteChapterAudio,
  isRemoteAudioAvailable,
} from './audioRemote';

test.afterEach(() => {
  clearRemoteAudioCache();
});

test('world english bible audio resolves a direct public-domain chapter file without Bible.is credentials', async () => {
  const audio = await fetchRemoteChapterAudio('web', 'GEN', 1);

  assert.deepEqual(audio, {
    url: 'https://ebible.org/eng-webbe/mp3/eng-webbe_002_GEN_01.mp3',
    duration: 0,
  });
});

test('world english bible audio supports psalms three-digit chapter filenames', async () => {
  const audio = await fetchRemoteChapterAudio('web', 'PSA', 150);

  assert.deepEqual(audio, {
    url: 'https://ebible.org/eng-webbe/mp3/eng-webbe_020_PSA_150.mp3',
    duration: 0,
  });
});

test('world english bible audio returns null for unsupported books', async () => {
  const audio = await fetchRemoteChapterAudio('web', 'XXX', 1);

  assert.equal(audio, null);
});

test('world english bible audio returns null for invalid chapters', async () => {
  const audio = await fetchRemoteChapterAudio('web', 'GEN', 0);

  assert.equal(audio, null);
});

test('public-domain web audio remains remotely available without Bible.is credentials', () => {
  assert.equal(isRemoteAudioAvailable('web'), true);
});

test('translations without configured audio remain unavailable remotely', () => {
  assert.equal(isRemoteAudioAvailable('kjv'), false);
});
