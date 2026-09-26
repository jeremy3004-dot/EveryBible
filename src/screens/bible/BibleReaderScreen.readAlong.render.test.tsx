import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { hostAncestors, within } from '../../testing/render';
import { BSB, installReaderRenderFixture } from './BibleReaderScreen.renderFixture';

// Read Along opens from the reader's Audio sheet and from the listen page's artwork,
// and drives the reader's own chapter transport.
const reader = installReaderRenderFixture(mock);
const { t, renderReader } = reader;

const playingJohn3 = () =>
  reader.setAudio({
    status: 'playing',
    currentTranslationId: 'bsb',
    currentBookId: 'JHN',
    currentChapter: 3,
    currentPosition: 6_000,
    duration: 60_000,
  });

const readAlongModal = (view: Awaited<ReturnType<typeof renderReader>>) =>
  view.queryByTestId('read-along');

test('the Audio sheet’s Read along closes the sheet and opens the chapter in Read Along', async () => {
  reader.setTimestamps({ 1: 0, 2: 5, 3: 12 });
  await playingJohn3();
  const view = await renderReader();

  await view.press(view.getByRole('button', { name: t('audio.nowPlaying') }));
  await view.press(view.getByRole('button', { name: t('audio.readAlong') }));
  await view.flush();

  assert.equal(view.queryByRole('header', { name: t('audio.sheetTitle') }), null);
  const modal = readAlongModal(view);
  assert.ok(modal, 'Read Along is open');
  const readAlong = within(modal);
  assert.ok(readAlong.getByRole('header', { name: 'John 3' }));
  // The verse being spoken (6s: verse 2) is the one marked.
  const current = readAlong
    .queryAllByType('Text')
    .filter((node) => node.props.accessibilityState?.selected === true);
  assert.equal(current.length, 1);
  assert.ok(within(current[0]).getByText(/He came to Jesus at night/));

  await view.press(readAlong.getByRole('button', { name: t('interface.close') }));
  assert.equal(readAlongModal(view), null);
});

test('Read Along’s transport is the reader’s: play/pause and the chapter arrows', async () => {
  await playingJohn3();
  const view = await renderReader();
  await view.press(view.getByRole('button', { name: t('audio.nowPlaying') }));
  await view.press(view.getByRole('button', { name: t('audio.readAlong') }));
  await view.flush();
  const modal = readAlongModal(view);
  assert.ok(modal);
  const readAlong = within(modal);
  reader.audioCalls.length = 0;

  await view.press(readAlong.getByRole('button', { name: t('interface.pauseChapterAudio') }));
  await view.press(readAlong.getByRole('button', { name: t('audio.nextChapter') }));
  await view.flush();

  assert.deepEqual(
    reader.audioCalls.map(([name]) => name),
    ['togglePlayPause', 'nextChapter']
  );
  // Still open: Read Along stays with the listener across a chapter change.
  assert.ok(readAlongModal(view));
});

test('on the listen page, tapping the book artwork opens Read Along', async () => {
  // An audio-only translation: the reader shows the listen page, and Read Along reads
  // along in the bundled BSB.
  const audioOnly = { ...BSB, id: 'npi', abbreviation: 'NPI', language: 'Nepali', hasText: false };
  await act(async () => {
    reader.bibleStore.setState({ translations: [audioOnly, BSB], currentTranslation: 'npi' });
  });
  const view = await renderReader();

  const artwork = view.getByRole('button', { name: t('audio.readAlong') });
  assert.ok(
    hostAncestors(artwork).every((node) => (node.type as string) !== 'Modal'),
    'the artwork is on the listen page itself'
  );
  await view.press(artwork);
  await view.flush();

  const modal = readAlongModal(view);
  assert.ok(modal, 'Read Along is open');
  const readAlong = within(modal);
  assert.ok(readAlong.getByText(t('audio.readAlongOtherTranslation', { translation: 'BSB' })));
  assert.ok(readAlong.getByText(/Nicodemus/));
  assert.ok(reader.chapterRequests.includes('bsb:JHN:3'));
});
