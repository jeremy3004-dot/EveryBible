import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { useState } from 'react';
import { mockMmkvStorage, mockModule, sourcePath } from '../../../testing/mockModules';
import { installRenderHarness } from '../../../testing/render';

mockMmkvStorage(mock);
const harness = installRenderHarness(mock);

type Timestamps = Record<number, number>;
const pendingLoads: Array<{ chapter: number; resolve: (value: Timestamps) => void }> = [];
mockModule(mock, sourcePath('services/bible/verseTimestamps.ts'), {
  getChapterTimestamps: (_translation: string, _book: string, chapter: number) =>
    new Promise<Timestamps>((resolve) => pendingLoads.push({ chapter, resolve })),
});

async function createProbe() {
  const { useReaderFollowAlongScroll } = await import('./useReaderFollowAlongScroll');
  const seen: Array<Timestamps | null> = [];
  function Probe({
    chapter,
    isCurrentAudioChapter,
  }: {
    chapter: number;
    isCurrentAudioChapter: boolean;
  }) {
    const [timestamps, setTimestamps] = useState<Timestamps | null>(null);
    seen.push(timestamps);
    useReaderFollowAlongScroll({
      bookId: 'JHN',
      chapter,
      currentTranslation: 'bsb',
      didRestartFollowAlongPlayback: false,
      flushPendingReaderFocus: () => true,
      focusVerse: undefined,
      isCurrentAudioChapter,
      isLoading: false,
      pendingReaderAutoScrollVerseRef: { current: null },
      readerFocusScrollRef: {
        current: { pendingVerse: null, request: () => {}, flush: () => true },
      },
      readerInlineActiveVerse: null,
      scrollReaderToMeasuredVerse: () => true,
      scrollReaderToOffset: () => {},
      scrollReaderToVerseParagraph: () => true,
      setChapterTimestamps: setTimestamps,
      showPremiumReadMode: false,
      verses: [{ verse: 1, text: 'x' }] as never,
    });
    return null;
  }
  return { Probe, seen };
}

test('timings from a chapter that stops being the playing one are dropped', async () => {
  pendingLoads.length = 0;
  const { Probe, seen } = await createProbe();
  const view = await harness.render(<Probe chapter={1} isCurrentAudioChapter />);
  await view.flush();
  assert.equal(pendingLoads.length, 1);
  pendingLoads[0]?.resolve({ 1: 0 });
  await view.flush();
  assert.deepEqual(seen.at(-1), { 1: 0 });

  await view.rerender(<Probe chapter={2} isCurrentAudioChapter={false} />);
  await view.flush();
  assert.equal(seen.at(-1), null);
});

test('a slow timestamp load for the previous chapter never lands after a chapter change', async () => {
  pendingLoads.length = 0;
  const { Probe, seen } = await createProbe();
  const view = await harness.render(<Probe chapter={1} isCurrentAudioChapter />);
  await view.flush();
  await view.rerender(<Probe chapter={2} isCurrentAudioChapter />);
  await view.flush();
  assert.deepEqual(
    pendingLoads.map((load) => load.chapter),
    [1, 2]
  );
  pendingLoads[0]?.resolve({ 1: 111 });
  await view.flush();
  assert.equal(seen.at(-1), null);
  pendingLoads[1]?.resolve({ 1: 222 });
  await view.flush();
  assert.deepEqual(seen.at(-1), { 1: 222 });
});
