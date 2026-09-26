import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { BSB, installReaderRenderFixture } from './BibleReaderScreen.renderFixture';

const reader = installReaderRenderFixture(mock);
const { renderReader, navigateReader } = reader;
const plays = () => reader.audioCalls.filter(([name]) => name === 'playChapter');
const consumedRequests = () =>
  reader.setParamsCalls().filter((params) => params.autoplayAudio === false);

test('a fresh daily-audio request plays the same chapter again after Stop', async () => {
  const view = await renderReader({ autoplayAudio: true, focusVerse: 2 });
  assert.equal(plays().length, 1);
  assert.equal(consumedRequests().length, 1);

  // React Navigation applies the consumed one-shot param to the existing route.
  await navigateReader(view, { autoplayAudio: false });
  await reader.setAudio({ status: 'idle', currentBookId: null, currentChapter: null });
  await navigateReader(view, { autoplayAudio: true });

  assert.deepEqual(plays(), [
    ['playChapter', 'JHN', 3, undefined],
    ['playChapter', 'JHN', 3, undefined],
  ]);
  assert.equal(consumedRequests().length, 2);
});

for (const status of ['paused', 'idle', 'error'] as const) {
  test(`an explicit daily-audio request plays a matching chapter with ${status} status`, async () => {
    await reader.setAudio({
      status,
      currentTranslationId: 'bsb',
      currentBookId: 'JHN',
      currentChapter: 3,
    });

    await renderReader({ autoplayAudio: true });

    assert.deepEqual(plays(), [['playChapter', 'JHN', 3, undefined]]);
    assert.equal(consumedRequests().length, 1);
  });
}

for (const status of ['playing', 'loading'] as const) {
  test(`a matching chapter already ${status} consumes the request without restarting`, async () => {
    await reader.setAudio({
      status,
      currentTranslationId: 'bsb',
      currentBookId: 'JHN',
      currentChapter: 3,
    });
    const view = await renderReader({ autoplayAudio: true });

    assert.deepEqual(plays(), []);
    assert.equal(consumedRequests().length, 1);
    await navigateReader(view, { autoplayAudio: false });
    await reader.setAudio({ status: 'paused' });
    await act(async () => {
      reader.bibleStore.setState({
        currentTranslation: 'web',
        translations: [BSB, { ...BSB, id: 'web', abbreviation: 'WEB' }],
      });
    });
    await view.flush();

    assert.deepEqual(plays(), [], 'the old request cannot start a later translation');
  });
}

test('rerenders before or after request consumption never repeat autoplay', async () => {
  const view = await renderReader({ autoplayAudio: true });
  await navigateReader(view, { focusVerse: 2 });
  assert.equal(plays().length, 1, 'a pending consumed param is still the same request');

  await navigateReader(view, { autoplayAudio: false });
  await navigateReader(view, { focusVerse: 3 });
  await reader.setAudio({ status: 'paused' });

  assert.equal(plays().length, 1);
});
