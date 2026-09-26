import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { create } from 'zustand';
import { mockModule, sourcePath } from '../../testing/mockModules';
import { flattenStyle, hostAncestors } from '../../testing/render';
import { installReaderRenderFixture } from './BibleReaderScreen.renderFixture';

// Selah on the reader: the button beside the listen screen's transport, and the chip
// above the player bar on the text screen. The Selah lane owns the behaviour behind
// useSelah; here it is a store the test drives.
let selahToggles = 0;
const selahStore = create(() => ({
  isSelahActive: false,
  canSelah: false,
  toggleSelah: () => {
    selahToggles += 1;
  },
}));
mockModule(mock, sourcePath('hooks/audioPlayer/useSelah.ts'), { useSelah: () => selahStore() });

const reader = installReaderRenderFixture(mock);
const { t, chapters, renderReader, setAudio, audioCalls } = reader;

afterEach(() => {
  selahStore.setState(selahStore.getInitialState(), true);
  selahToggles = 0;
});

const pausedInSelah = async () => {
  await setAudio({
    status: 'paused',
    currentTranslationId: 'bsb',
    currentBookId: 'JHN',
    currentChapter: 3,
    backgroundMusicChoice: 'rain',
  });
  await act(async () => {
    selahStore.setState({ canSelah: true, isSelahActive: true });
  });
};

test('the listen screen offers Selah beside its transport only while a sound can carry on', async () => {
  chapters.set('JHN:3', []); // audio-only: the listen screen
  const view = await renderReader();
  assert.equal(view.queryByRole('button', { name: t('audio.playerBar.selah') }), null);

  await act(async () => {
    selahStore.setState({ canSelah: true });
  });
  const selah = view.getByRole('button', { name: t('audio.playerBar.selah'), selected: false });
  const play = view.getByRole('button', { name: t('interface.playChapterAudio') });
  // Same row as play, in the trailing slot.
  assert.equal(hostAncestors(hostAncestors(selah)[0])[0], hostAncestors(play)[0]);
  await view.press(selah);
  assert.equal(selahToggles, 1);
  // The bar shows only its tab row here: the listen screen has its own transport.
  assert.equal(view.queryByTestId('player-bar-row'), null);
});

test('during Selah the listen screen shows Play, and Play brings the reading back through Selah', async () => {
  chapters.set('JHN:3', []);
  await pausedInSelah();
  const view = await renderReader();

  assert.ok(view.getByRole('button', { name: t('audio.playerBar.selah'), selected: true }));
  await view.press(view.getByRole('button', { name: t('interface.playChapterAudio') }));
  assert.equal(selahToggles, 1);
  assert.deepEqual(
    audioCalls.filter(([name]) => name === 'togglePlayPause' || name === 'playChapter'),
    []
  );
});

test('on the text screen Selah shows no caption over the text', async () => {
  const { PLAYER_BAR_SECTION_HEIGHT } = await import('../../navigation/readerTabBarMotion');
  const view = await renderReader();
  const bottomPadding = () =>
    flattenStyle(reader.readerList(view).props.contentContainerStyle)?.paddingBottom;
  assert.equal(view.queryByTestId('selah-chip'), null);
  const resting = bottomPadding();
  assert.equal(resting, 22 + 64 + PLAYER_BAR_SECTION_HEIGHT + 16);

  await pausedInSelah();

  // No caption appears over the text while Selah is on, so the text keeps its padding.
  assert.equal(view.queryByTestId('selah-chip'), null);
  assert.equal(bottomPadding(), resting);
  // On the bar, Play also leaves Selah rather than toggling the player.
  await view.press(view.getByRole('button', { name: t('interface.playChapterAudio') }));
  assert.equal(selahToggles, 1);
});
