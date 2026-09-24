import test from 'node:test';
import assert from 'node:assert/strict';

import { lessonAudioTranslationCandidates, resolveLessonAudio } from './lessonAudioSource';
import type { PassageBlock } from './gatherBibleService';
import type { BibleReference } from '../../types/gather';

const block = (translationId: string, verseCount = 3): PassageBlock => ({
  label: 'Genesis 1',
  translationId,
  verses: Array.from({ length: verseCount }, (_, index) => ({
    id: index + 1,
    bookId: 'GEN',
    chapter: 1,
    verse: index + 1,
    text: `v${index + 1}`,
  })),
});

test('a story read in the reading translation only asks that translation for audio', () => {
  assert.deepEqual(lessonAudioTranslationCandidates([block('hincv')], 'hincv'), ['hincv']);
  // Before the passage has loaded there is nothing to fall back from.
  assert.deepEqual(lessonAudioTranslationCandidates([], 'hincv'), ['hincv']);
});

test('a story that fell back to BSB text may also play BSB audio', () => {
  // A New Testament-only translation on a Genesis lesson showed BSB text, but
  // audio was only asked of the reading translation, so Play stayed disabled.
  assert.deepEqual(lessonAudioTranslationCandidates([block('bsb')], 'nt-only'), ['nt-only', 'bsb']);
});

test('only the primary (first) passage decides the audio fallback', () => {
  assert.deepEqual(lessonAudioTranslationCandidates([block('hincv'), block('bsb')], 'hincv'), [
    'hincv',
  ]);
});

const genesisOne: BibleReference[] = [{ bookId: 'GEN', chapter: 1, startVerse: 1, endVerse: 5 }];

test('lesson audio comes from the first translation that has the chapter', async () => {
  const asked: string[] = [];
  const source = await resolveLessonAudio(genesisOne, ['nt-only', 'bsb'], async (id, book, ch) => {
    asked.push(`${id}:${book}:${ch}`);
    return id === 'bsb' ? { url: 'https://audio.test/bsb/gen1.mp3' } : null;
  });

  assert.deepEqual(asked, ['nt-only:GEN:1', 'bsb:GEN:1']);
  assert.deepEqual(source, {
    translationId: 'bsb',
    bookId: 'GEN',
    chapter: 1,
    url: 'https://audio.test/bsb/gen1.mp3',
  });
});

test('the reading translation audio wins when it has the chapter', async () => {
  const source = await resolveLessonAudio(genesisOne, ['el-audio', 'bsb'], async (id) => ({
    url: `https://audio.test/${id}.mp3`,
  }));

  assert.equal(source?.translationId, 'el-audio');
});

test('a failing lookup falls through to the next translation, and no audio anywhere is null', async () => {
  const source = await resolveLessonAudio(genesisOne, ['broken', 'bsb'], async (id) => {
    if (id === 'broken') throw new Error('manifest offline');
    return { url: 'https://audio.test/bsb.mp3' };
  });
  assert.equal(source?.translationId, 'bsb');

  assert.equal(await resolveLessonAudio(genesisOne, ['a', 'b'], async () => null), null);
  assert.equal(await resolveLessonAudio([], ['bsb'], async () => ({ url: 'x' })), null);
});
