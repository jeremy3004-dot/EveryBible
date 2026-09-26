import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  publishReaderPlayerBar,
  releaseReaderPlayerBar,
  useReaderPlayerBarStore,
  type ReaderPlayerBarControls,
} from './readerPlayerBarStore';

const controls: ReaderPlayerBarControls = {
  showsPlayer: true,
  showPlayButton: true,
  isPlaying: false,
  isLoading: false,
  errorMessage: null,
  hasPrevious: true,
  hasNext: true,
  nextIsCompletion: false,
  nextAccessibilityLabel: 'Next chapter',
  nextAccessibilityHint: null,
  showsProgress: false,
};
const actions = {
  playPause: () => {},
  previous: () => {},
  next: () => {},
  openAudioSheet: () => {},
};

beforeEach(() => {
  useReaderPlayerBarStore.setState(useReaderPlayerBarStore.getInitialState(), true);
});

test('a reader’s controls are published, and republishing the same values changes nothing', () => {
  let updates = 0;
  const unsubscribe = useReaderPlayerBarStore.subscribe(() => {
    updates += 1;
  });

  publishReaderPlayerBar('reader-a', controls, actions);
  publishReaderPlayerBar('reader-a', { ...controls }, actions);
  assert.equal(updates, 1, 'an unchanged render does not redraw the bar');

  publishReaderPlayerBar('reader-a', { ...controls, isPlaying: true }, actions);
  assert.equal(updates, 2);
  assert.equal(useReaderPlayerBarStore.getState().controls?.isPlaying, true);
  unsubscribe();
});

test('the store keeps its own copy, so a reader changing its object cannot change the bar', () => {
  const mine = { ...controls };
  publishReaderPlayerBar('reader-a', mine, actions);
  mine.hasNext = false;
  assert.equal(useReaderPlayerBarStore.getState().controls?.hasNext, true);
});

test('a blurred reader withdraws its controls, but never a newer reader’s', () => {
  publishReaderPlayerBar('reader-a', controls, actions);
  publishReaderPlayerBar('reader-b', { ...controls, hasPrevious: false }, actions);

  releaseReaderPlayerBar('reader-a');
  assert.equal(useReaderPlayerBarStore.getState().ownerKey, 'reader-b');
  assert.equal(useReaderPlayerBarStore.getState().controls?.hasPrevious, false);

  releaseReaderPlayerBar('reader-b');
  const { ownerKey, controls: left, actions: leftActions } = useReaderPlayerBarStore.getState();
  assert.deepEqual(
    { ownerKey, left, leftActions },
    { ownerKey: null, left: null, leftActions: null }
  );
});
