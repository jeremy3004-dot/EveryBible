import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { create } from 'zustand';
import { mockBarrel, mockModule, mockPackage, sourcePath } from '../../testing/mockModules';
import { installRenderHarness } from '../../testing/render';
import type { PassageBlock } from '../../services/gather/gatherBibleService';
import type { GatherLesson } from '../../types/gather';

const harness = installRenderHarness(mock, { os: 'ios' });
const t = (key: string) => harness.i18n.t(key);

const useBibleStore = create(() => ({
  currentTranslation: 'npi',
  translations: [
    { id: 'npi', name: 'Nepali Bible' },
    { id: 'bsb', name: 'Berean Standard Bible' },
  ],
}));
mockModule(mock, sourcePath('stores/bibleStore.ts'), { useBibleStore });
mockBarrel(mock, 'constants/index.ts', { real: ['getTranslatedBookName'] });

const passage = {
  blocks: [] as PassageBlock[],
  requests: [] as unknown[][],
};
mockModule(mock, sourcePath('services/gather/gatherBibleService.ts'), {
  LESSON_FALLBACK_TRANSLATION_ID: 'bsb',
  getPassageText: async (...args: unknown[]) => {
    passage.requests.push(args);
    return passage.blocks;
  },
});

// Which translations have a recording for the lesson's chapter.
const audio = { urls: {} as Record<string, string> };
mockModule(mock, sourcePath('services/audio/audioService.ts'), {
  getChapterAudioUrl: async (translationId: string) =>
    audio.urls[translationId] ? { url: audio.urls[translationId] } : null,
});

// "Share audio" loads the native share path on demand.
const nativeShares: unknown[][] = [];
mockPackage(mock, 'expo-sharing', {
  isAvailableAsync: async () => true,
  shareAsync: async (...args: unknown[]) => {
    nativeShares.push(args);
  },
});
mockPackage(mock, 'expo-file-system/legacy', {
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///documents/',
});
mockModule(mock, sourcePath('services/audio/audioDownloadStorage.ts'), {
  expoAudioFileSystemAdapter: {},
  AUDIO_DOWNLOAD_ROOT_URI: 'file:///documents/audio/',
});
mockModule(mock, sourcePath('services/audio/audioDownloadService.ts'), {
  getDownloadedChapterAudioUri: async () => null,
});
mockModule(mock, sourcePath('services/audio/audioRemote.ts'), {
  fetchRemoteChapterAudio: async () => null,
});
mockModule(mock, sourcePath('services/audio/audioShareService.ts'), {
  prepareChapterAudioShareAsset: async (input: { translationId: string; rootUri: string }) => ({
    uri: `${input.rootUri}${input.translationId}-GEN-1.mp3`,
    mimeType: 'audio/mpeg',
  }),
});

const lesson: GatherLesson = {
  id: 'f1-01',
  number: 1,
  title: 'Creation (untranslated)',
  references: [{ bookId: 'GEN', chapter: 1, startVerse: 1, endVerse: 2 }],
  referenceLabel: 'Genesis 1:1-2',
};

const verse = (number: number, text: string) => ({
  id: 1000 + number,
  bookId: 'GEN',
  chapter: 1,
  verse: number,
  text,
});

const sheet = { closes: 0, toggles: 0 };

beforeEach(() => {
  passage.blocks = [];
  passage.requests = [];
  audio.urls = {};
  nativeShares.length = 0;
  sheet.closes = 0;
  sheet.toggles = 0;
});

async function renderSheet(props: { visible?: boolean; isComplete?: boolean } = {}) {
  const { LessonBottomSheet } = await import('./LessonBottomSheet');
  const view = await harness.render(
    <LessonBottomSheet
      visible={props.visible ?? true}
      lesson={lesson}
      parentId="foundation-1"
      isComplete={props.isComplete ?? false}
      onClose={() => {
        sheet.closes += 1;
      }}
      onToggleComplete={() => {
        sheet.toggles += 1;
      }}
    />
  );
  await view.flush();
  return view;
}

test('the sheet names the lesson in the interface language with its passage reference', async () => {
  const view = await renderSheet();

  assert.ok(view.getByText(t('gather.lessons.f101')));
  assert.equal(view.queryByText(lesson.title), null);
  assert.ok(view.getByText('Genesis 1:1-2'));
  // The passage is read in the reader's translation, falling back to the bundled BSB.
  assert.equal(passage.requests.length, 1);
  assert.deepEqual(passage.requests[0].slice(0, 2), [lesson.references, 'npi']);
  assert.equal(
    (passage.requests[0][2] as { fallbackTranslationId: string }).fallbackTranslationId,
    'bsb'
  );
});

test('a hidden sheet loads nothing', async () => {
  await renderSheet({ visible: false });

  assert.deepEqual(passage.requests, []);
});

test('share text sends the passage labelled with the translation it came from, then closes', async () => {
  passage.blocks = [
    {
      label: 'Genesis 1:1-2',
      translationId: 'bsb',
      verses: [verse(1, 'In the beginning God created. '), verse(2, 'Now the earth was formless.')],
    },
  ];
  const view = await renderSheet();

  await view.press(view.getByRole('button', { name: t('gather.shareText') }));

  assert.deepEqual(harness.rn.__recorded.shares, [
    {
      message: [
        t('gather.lessons.f101'),
        'Genesis 1:1-2 (Berean Standard Bible)\nIn the beginning God created. Now the earth was formless.',
      ].join('\n\n'),
    },
  ]);
  assert.equal(sheet.closes, 1);
});

test('share link sends the reader link for the first passage as the iOS share url', async () => {
  const view = await renderSheet();

  await view.press(view.getByRole('button', { name: t('gather.shareLink') }));

  assert.deepEqual(harness.rn.__recorded.shares, [
    {
      message: `${t('gather.lessons.f101')} · Genesis 1:1-2`,
      url: 'com.everybible.app://bible/genesis/1/1',
    },
  ]);
  assert.equal(sheet.closes, 1);
});

test('without a recording in any candidate translation there is no share-audio row', async () => {
  const view = await renderSheet();

  assert.equal(view.queryByRole('button', { name: t('gather.shareAudio') }), null);
});

test('when only the borrowed BSB passage has audio, share audio attaches that recording', async () => {
  passage.blocks = [{ label: 'Genesis 1:1-2', translationId: 'bsb', verses: [verse(1, 'In')] }];
  audio.urls = { bsb: 'https://audio.test/bsb/GEN/1.mp3' };
  const view = await renderSheet();

  await view.press(view.getByRole('button', { name: t('gather.shareAudio') }));
  await view.flush();

  assert.deepEqual(nativeShares, [
    [
      'file:///cache/everybible-audio-share/bsb-GEN-1.mp3',
      { dialogTitle: t('groups.share'), mimeType: 'audio/mpeg', UTI: 'public.audio' },
    ],
  ]);
  assert.equal(sheet.closes, 1);
});

test('marking complete toggles the lesson and closes; a complete lesson offers to undo', async () => {
  const view = await renderSheet();

  await view.press(view.getByRole('button', { name: t('gather.markComplete') }));
  assert.deepEqual(sheet, { closes: 1, toggles: 1 });

  const complete = await renderSheet({ isComplete: true });
  assert.ok(complete.getByRole('button', { name: t('gather.markIncomplete') }));
});

test('rows for features that are not built yet are announced as disabled', async () => {
  const view = await renderSheet();

  assert.ok(view.getByRole('button', { name: t('gather.download'), disabled: true }));
  assert.ok(view.getByRole('button', { name: t('gather.manageBookmarks'), disabled: true }));
});
