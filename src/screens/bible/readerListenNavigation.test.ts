import assert from 'node:assert/strict';
import test from 'node:test';
import type { AudioStatus } from '../../types/audio';
import { navigateListenChapter, type ReaderChapterRef } from './readerListenNavigation';

function arrows(options: {
  isCurrentAudioChapter: boolean;
  status?: AudioStatus;
  playerTarget?: ReaderChapterRef | null;
  fallbackTarget?: ReaderChapterRef | null;
}) {
  const played: ReaderChapterRef[] = [];
  const shown: ReaderChapterRef[] = [];
  let playerSteps = 0;
  let status: AudioStatus = options.status ?? 'playing';
  const navigate = () =>
    navigateListenChapter({
      isCurrentAudioChapter: options.isCurrentAudioChapter,
      stepPlayer: async () => {
        playerSteps += 1;
        return options.playerTarget ?? null;
      },
      fallbackTarget: options.fallbackTarget ?? null,
      getAudioStatus: () => status,
      playChapter: async (bookId, chapter) => {
        played.push({ bookId, chapter });
      },
      syncReaderReference: (bookId, chapter) => shown.push({ bookId, chapter }),
    });
  return {
    navigate,
    played,
    shown,
    playerSteps: () => playerSteps,
    setStatus: (next: AudioStatus) => {
      status = next;
    },
  };
}

for (const direction of ['Next', 'Previous']) {
  const target = { bookId: 'JHN', chapter: direction === 'Next' ? 5 : 3 };
  for (const status of ['paused', 'playing'] as const) {
    test(`${direction} listen arrow with another chapter displayed ${status === 'paused' ? 'stays silent' : 'keeps playing'} while moving the reader`, async () => {
      const h = arrows({ isCurrentAudioChapter: false, status, fallbackTarget: target });

      await h.navigate();

      assert.deepEqual(h.played, status === 'paused' ? [] : [target]);
      assert.deepEqual(h.shown, [target]);
      assert.equal(h.playerSteps(), 0);
    });
  }
}

test('on the playing chapter the arrow hands off to the player and the reader follows', async () => {
  const next = { bookId: 'PRO', chapter: 9 };
  const h = arrows({ isCurrentAudioChapter: true, playerTarget: next, fallbackTarget: null });

  await h.navigate();

  assert.equal(h.playerSteps(), 1);
  assert.deepEqual(h.played, []);
  assert.deepEqual(h.shown, [next]);
});

test('when the player has nowhere to go the reader stays put', async () => {
  const h = arrows({ isCurrentAudioChapter: true, playerTarget: null });

  await h.navigate();

  assert.deepEqual(h.shown, []);
});

test('with no chapter in that direction nothing plays or moves', async () => {
  const h = arrows({ isCurrentAudioChapter: false, fallbackTarget: null });

  await h.navigate();

  assert.deepEqual(h.played, []);
  assert.deepEqual(h.shown, []);
});

test('the pause state is read when the arrow is pressed, not when it rendered', async () => {
  const target = { bookId: 'JHN', chapter: 5 };
  const h = arrows({ isCurrentAudioChapter: false, status: 'playing', fallbackTarget: target });

  h.setStatus('paused');
  await h.navigate();

  assert.deepEqual(h.played, []);
  assert.deepEqual(h.shown, [target]);
});
