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
  const announced: ReaderChapterRef[] = [];
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
      announceTarget: (target) => announced.push(target),
    });
  return {
    navigate,
    played,
    shown,
    announced,
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

test('on the playing chapter the screen reader hears the chapter the player moved to, not the reader guess', async () => {
  // A queued chapter from another book comes next in the player, while the reader's own
  // next-chapter guess is simply the following chapter.
  const queued = { bookId: 'PSA', chapter: 23 };
  const h = arrows({
    isCurrentAudioChapter: true,
    playerTarget: queued,
    fallbackTarget: { bookId: 'JHN', chapter: 5 },
  });

  await h.navigate();

  assert.deepEqual(h.announced, [queued]);
});

test('with another chapter displayed the screen reader hears the chapter the reader moved to', async () => {
  const target = { bookId: 'JHN', chapter: 5 };
  const h = arrows({ isCurrentAudioChapter: false, status: 'paused', fallbackTarget: target });

  await h.navigate();

  assert.deepEqual(h.announced, [target]);
});

test('nothing is announced when the arrow has nowhere to go', async () => {
  const onPlayer = arrows({ isCurrentAudioChapter: true, playerTarget: null });
  const onOther = arrows({ isCurrentAudioChapter: false, fallbackTarget: null });

  await onPlayer.navigate();
  await onOther.navigate();

  assert.deepEqual(onPlayer.announced, []);
  assert.deepEqual(onOther.announced, []);
});
