import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { BSB, installReaderRenderFixture } from './BibleReaderScreen.renderFixture';
const {
  bibleStore,
  renderReader,
  t,
  chapterResponses,
  chapterRequests,
  audioCalls,
  harness,
  setAudio,
  chapters,
} = installReaderRenderFixture(mock);
test('audio-only to text-only loading never retains a playable audio surface', async () => {
  const audio = { ...BSB, id: 'audio', abbreviation: 'AUD', hasText: false };
  const text = { ...BSB, id: 'text', abbreviation: 'TXT', hasAudio: false };
  bibleStore.setState({ currentTranslation: 'audio', translations: [audio, text] });
  const view = await renderReader({ preferredMode: 'read', focusVerse: 16 });
  assert.ok(view.getByRole('button', { name: t('interface.playChapterAudio') }));
  let resolve!: (rows: import('../../types').Verse[]) => void;
  chapterResponses.set('text:JHN:3', new Promise((r) => (resolve = r)));
  await act(async () => bibleStore.setState({ currentTranslation: 'text' }));
  for (let i = 0; i < 200 && !chapterRequests.includes('text:JHN:3'); i++)
    await act(async () => new Promise((r) => setImmediate(r)));
  assert.ok(chapterRequests.includes('text:JHN:3'));
  assert.equal(view.queryByRole('button', { name: t('interface.playChapterAudio') }), null);
  await act(async () =>
    resolve([{ id: 1, bookId: 'JHN', chapter: 3, verse: 16, text: 'Current text translation.' }])
  );
  await view.flush();
  assert.ok(view.getByText(/Current text translation/));
  assert.ok(view.getByRole('button', { name: t('audio.previousChapter') }));
  assert.ok(view.getByRole('button', { name: t('bible.nextChapterHint') }));
  assert.equal(view.queryByRole('button', { name: t('interface.playChapterAudio') }), null);
});
test('text to translation with no chapter content clears Scripture and hides play', async () => {
  const view = await renderReader({ preferredMode: 'listen', focusVerse: 16 });
  const unavailable = { ...BSB, id: 'none', abbreviation: 'NONE', hasText: false, hasAudio: false };
  await act(async () =>
    bibleStore.setState({ currentTranslation: 'none', translations: [BSB, unavailable] })
  );
  await view.flush();
  assert.equal(view.queryByText(/Now there was a Pharisee/), null);
  assert.equal(view.queryByRole('button', { name: t('interface.playChapterAudio') }), null);
  assert.equal(chapterRequests.includes('none:JHN:3'), false);
});

for (const hasAudio of [false, true]) {
  test(`plan preference override respects audio availability ${hasAudio}`, async () => {
    harness.authStore.getState().setPreferences({ hidePlayButtonFromReadingTab: true });
    bibleStore.setState({ translations: [{ ...BSB, hasAudio }] });
    chapters.set('MAT:1', [{ id: 1, bookId: 'MAT', chapter: 1, verse: 1, text: 'Plan chapter.' }]);
    const view = await renderReader({
      bookId: 'MAT',
      chapter: 1,
      planId: 'gospels-60-days',
      planDayNumber: 1,
      returnToPlanOnComplete: true,
    });
    assert.equal(view.queryByTestId('reader-play-pause') !== null, hasAudio);
  });
}
test('available audio-only translation still plays with a read route preference', async () => {
  bibleStore.setState({ translations: [{ ...BSB, hasText: false }] });
  const view = await renderReader({ preferredMode: 'read' });
  await view.press(view.getByRole('button', { name: t('interface.playChapterAudio') }));
  assert.deepEqual(audioCalls, [['playChapter', 'JHN', 3]]);
});
test('playing downloaded chapter retains Pause', async () => {
  bibleStore.setState({ translations: [{ ...BSB, downloadedAudioBooks: ['JHN'] }] });
  await setAudio({
    status: 'playing',
    currentTranslationId: 'bsb',
    currentBookId: 'JHN',
    currentChapter: 3,
  });
  const view = await renderReader();
  await view.press(view.getByRole('button', { name: t('interface.pauseChapterAudio') }));
  assert.deepEqual(audioCalls, [['togglePlayPause']]);
});

for (const status of ['playing', 'loading'] as const) {
  test(`catalog availability loss retains control of the current ${status} chapter`, async () => {
    await setAudio({
      status,
      currentTranslationId: 'bsb',
      currentBookId: 'JHN',
      currentChapter: 3,
    });
    const view = await renderReader();
    assert.ok(view.getByTestId('reader-play-pause'));
    await act(async () => bibleStore.setState({ translations: [{ ...BSB, hasAudio: false }] }));
    await view.press(view.getByTestId('reader-play-pause'));
    assert.deepEqual(audioCalls, [['togglePlayPause']]);
    await setAudio({ status: 'paused' });
    assert.equal(
      view.queryByTestId('reader-play-pause'),
      null,
      'unavailable audio cannot be restarted'
    );
  });
}
