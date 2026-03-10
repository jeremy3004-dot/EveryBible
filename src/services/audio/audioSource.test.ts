import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePreferredChapterAudio } from './audioSource';

test('resolvePreferredChapterAudio prefers a downloaded file over the remote stream', () => {
  const result = resolvePreferredChapterAudio('file:///local/JHN/3.mp3', {
    url: 'https://audio.test/JHN/3.mp3',
    duration: 42000,
  });

  assert.deepEqual(result, {
    url: 'file:///local/JHN/3.mp3',
    duration: 42000,
  });
});

test('resolvePreferredChapterAudio falls back to the remote stream when no local file exists', () => {
  const result = resolvePreferredChapterAudio(null, {
    url: 'https://audio.test/JHN/3.mp3',
    duration: 42000,
  });

  assert.deepEqual(result, {
    url: 'https://audio.test/JHN/3.mp3',
    duration: 42000,
  });
});

test('resolvePreferredChapterAudio returns null when neither local nor remote audio exists', () => {
  assert.equal(resolvePreferredChapterAudio(null, null), null);
});
