import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLessonLinkShare,
  buildLessonTextShareMessage,
  shareLessonAudio,
  toSharePayload,
  type LessonAudioShareDeps,
} from './lessonShareService';
import type { PassageBlock } from './gatherBibleService';
import type { LessonAudioSource } from './lessonAudioSource';

const verse = (chapter: number, number: number, text: string) => ({
  id: chapter * 1000 + number,
  bookId: 'GEN',
  chapter,
  verse: number,
  text,
});

const names: Record<string, string> = { bsb: 'Berean Standard Bible', web: 'World English Bible' };
const translationName = (id: string) => names[id] ?? id;

test('share text carries the lesson, each passage reference with its translation, and the verses', () => {
  // All three share rows used to send the same "title - reference" string.
  const blocks: PassageBlock[] = [
    {
      label: 'Genesis 1:1-2',
      translationId: 'web',
      verses: [verse(1, 1, 'In the beginning.'), verse(1, 2, 'The earth was formless.')],
    },
    { label: 'Genesis 2:3', translationId: 'bsb', verses: [verse(2, 3, 'God blessed the day.')] },
  ];

  assert.equal(
    buildLessonTextShareMessage({
      lessonTitle: 'Creation',
      referenceLabel: 'Genesis 1:1-2; 2:3',
      blocks,
      translationName,
    }),
    [
      'Creation',
      '',
      'Genesis 1:1-2 (World English Bible)',
      'In the beginning. The earth was formless.',
      '',
      'Genesis 2:3 (Berean Standard Bible)',
      'God blessed the day.',
    ].join('\n')
  );
});

test('share text without any loaded verses still names the lesson and its reference', () => {
  assert.equal(
    buildLessonTextShareMessage({
      lessonTitle: 'Creation',
      referenceLabel: 'Genesis 1',
      blocks: [{ label: 'Genesis 1', translationId: 'web', verses: [] }],
      translationName,
    }),
    'Creation\nGenesis 1'
  );
});

test('the lesson link opens the first passage in the reader', () => {
  assert.deepEqual(
    buildLessonLinkShare({
      lessonTitle: 'Creation',
      referenceLabel: 'Génesis 1:1-25',
      references: [{ bookId: 'GEN', chapter: 1, startVerse: 1, endVerse: 25 }],
    }),
    { message: 'Creation · Génesis 1:1-25', url: 'com.everybible.app://bible/genesis/1/1' }
  );
  assert.deepEqual(
    buildLessonLinkShare({
      lessonTitle: 'Psalm',
      referenceLabel: 'Psalms 23',
      references: [{ bookId: 'PSA', chapter: 23 }],
    }).url,
    'com.everybible.app://bible/psalms/23'
  );
  assert.equal(
    buildLessonLinkShare({ lessonTitle: 'x', referenceLabel: 'y', references: [] }).url,
    null
  );
});

test('Android gets the link inside the message; iOS gets it as the share url', () => {
  assert.deepEqual(toSharePayload('android', 'Creation', 'com.everybible.app://bible/genesis/1'), {
    message: 'Creation\ncom.everybible.app://bible/genesis/1',
  });
  assert.deepEqual(toSharePayload('ios', 'Creation', 'com.everybible.app://bible/genesis/1'), {
    message: 'Creation',
    url: 'com.everybible.app://bible/genesis/1',
  });
  assert.deepEqual(toSharePayload('ios', 'Creation', null), { message: 'Creation' });
});

const source: LessonAudioSource = {
  translationId: 'bsb',
  bookId: 'GEN',
  chapter: 1,
  url: 'https://audio.test/bsb/GEN/1.mp3',
};

const recordingDeps = (overrides: Partial<LessonAudioShareDeps> = {}) => {
  const calls: string[] = [];
  const deps: LessonAudioShareDeps = {
    prepareAsset: async (audio) => {
      calls.push(`prepare:${audio.translationId}:${audio.bookId}:${audio.chapter}`);
      return { uri: 'file:///cache/everybible-audio-share/bsb/GEN/1.mp3', mimeType: 'audio/mpeg' };
    },
    shareFile: async (uri, mimeType) => {
      calls.push(`file:${uri}:${mimeType}`);
    },
    shareMessage: async (payload) => {
      calls.push(`message:${JSON.stringify(payload)}`);
    },
    os: 'ios',
    ...overrides,
  };
  return { calls, deps };
};

test('share audio sends the chapter recording itself when the file can be prepared', async () => {
  const { calls, deps } = recordingDeps();

  assert.equal(await shareLessonAudio(source, 'Creation · Genesis 1', deps), 'file');
  assert.deepEqual(calls, [
    'prepare:bsb:GEN:1',
    'file:file:///cache/everybible-audio-share/bsb/GEN/1.mp3:audio/mpeg',
  ]);
});

test('share audio falls back to the recording URL when files cannot be shared', async () => {
  const { calls, deps } = recordingDeps({ shareFile: null });

  assert.equal(await shareLessonAudio(source, 'Creation · Genesis 1', deps), 'link');
  assert.deepEqual(calls, [
    `message:${JSON.stringify({ message: 'Creation · Genesis 1', url: source.url })}`,
  ]);
});

test('share audio falls back to the URL when preparing the file fails', async () => {
  const { calls, deps } = recordingDeps({
    prepareAsset: async () => {
      throw new Error('disk full');
    },
    os: 'android',
  });

  assert.equal(await shareLessonAudio(source, 'Creation', deps), 'link');
  assert.deepEqual(calls, [`message:${JSON.stringify({ message: `Creation\n${source.url}` })}`]);
});

test('a downloaded-only recording is never shared as a meaningless local file path', async () => {
  const { calls, deps } = recordingDeps({ shareFile: null });

  const result = await shareLessonAudio(
    { ...source, url: 'file:///documents/audio/bsb/GEN/1.mp3' },
    'Creation',
    deps
  );

  assert.equal(result, 'link');
  assert.deepEqual(calls, [`message:${JSON.stringify({ message: 'Creation' })}`]);
});
