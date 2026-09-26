import test from 'node:test';
import assert from 'node:assert/strict';
import type { BackgroundMusicChoice } from '../../types';
import type { BackgroundMusicOption } from './backgroundMusicCatalog';
import type { BackgroundSoundAvailability } from './backgroundSoundCache';
import {
  IDLE_SHUFFLE_SESSION,
  endShuffleSession,
  listShuffleCandidates,
  pickShuffleSound,
  shuffleForChapter,
} from './backgroundSoundShuffleModel';

const option = (
  id: BackgroundMusicChoice,
  source: BackgroundMusicOption['source'] = { kind: 'bundled' }
): BackgroundMusicOption => ({
  id,
  label: id,
  description: '',
  workTitle: '',
  license: 'CC0',
  credit: '',
  sourceUrl: '',
  defaultVolume: 0.2,
  source,
});

/** A scripted Math.random: returns each value in turn, then repeats the last. */
const sequence = (...values: number[]) => {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
};

const CANDIDATES: BackgroundMusicChoice[] = ['piano', 'harp', 'rain'];

test('shuffle candidates are the bundled and downloaded sounds, never off or shuffle itself', () => {
  const availability: Partial<Record<BackgroundMusicChoice, BackgroundSoundAvailability>> = {
    off: 'bundled',
    shuffle: 'bundled',
    piano: 'bundled',
    rain: 'cached',
    birdsong: 'remote',
    shore: 'downloading',
    garden: 'failed',
  };
  const options = (Object.keys(availability) as BackgroundMusicChoice[]).map((id) =>
    option(id, id === 'piano' ? { kind: 'bundled' } : { kind: 'remote', path: `${id}.m4a` })
  );

  assert.deepEqual(
    listShuffleCandidates(options, (candidate) => availability[candidate.id] ?? 'failed'),
    ['piano', 'rain']
  );
});

test('a pick is drawn uniformly from the candidates', () => {
  assert.equal(
    pickShuffleSound(CANDIDATES, null, () => 0),
    'piano'
  );
  assert.equal(
    pickShuffleSound(CANDIDATES, null, () => 0.5),
    'harp'
  );
  assert.equal(
    pickShuffleSound(CANDIDATES, null, () => 0.99),
    'rain'
  );
});

test('a pick never repeats the sound to avoid while another is available', () => {
  for (const roll of [0, 0.3, 0.6, 0.99]) {
    assert.notEqual(
      pickShuffleSound(CANDIDATES, 'harp', () => roll),
      'harp'
    );
  }
});

test('the only candidate is picked even when it is the one to avoid', () => {
  assert.equal(
    pickShuffleSound(['piano'], 'piano', () => 0.4),
    'piano'
  );
});

test('nothing is picked when no sound can play', () => {
  assert.equal(
    pickShuffleSound([], null, () => 0.4),
    null
  );
});

test('a random source that returns 1 still picks a candidate', () => {
  assert.equal(
    pickShuffleSound(CANDIDATES, null, () => 1),
    'rain'
  );
});

test('the first chapter of a session gets a pick', () => {
  const session = shuffleForChapter(IDLE_SHUFFLE_SESSION, 'bsb:GEN:1', CANDIDATES, () => 0);

  assert.deepEqual(session, { current: 'piano', chapterKey: 'bsb:GEN:1', previous: null });
});

test('the same chapter keeps its sound, so a pause and resume does not change it', () => {
  const first = shuffleForChapter(IDLE_SHUFFLE_SESSION, 'bsb:GEN:1', CANDIDATES, () => 0);

  const resumed = shuffleForChapter(first, 'bsb:GEN:1', CANDIDATES, () => 0.99);

  assert.equal(resumed, first);
});

test('each new chapter gets a different sound from the one before', () => {
  const random = sequence(0, 0, 0);
  let session = shuffleForChapter(IDLE_SHUFFLE_SESSION, 'bsb:GEN:1', CANDIDATES, random);
  const heard = [session.current];
  for (const chapter of [2, 3]) {
    session = shuffleForChapter(session, `bsb:GEN:${chapter}`, CANDIDATES, random);
    heard.push(session.current);
  }

  assert.deepEqual(heard, ['piano', 'harp', 'piano']);
});

test('a new session starts with a new pick that is not the last sound heard', () => {
  const playing = shuffleForChapter(IDLE_SHUFFLE_SESSION, 'bsb:GEN:1', CANDIDATES, () => 0);

  const ended = endShuffleSession(playing);
  const next = shuffleForChapter(ended, 'bsb:GEN:1', CANDIDATES, () => 0);

  assert.deepEqual(ended, { current: null, chapterKey: null, previous: 'piano' });
  assert.deepEqual(next, { current: 'harp', chapterKey: 'bsb:GEN:1', previous: 'piano' });
});

test('ending a session that never picked leaves it as it was', () => {
  const ended = endShuffleSession(IDLE_SHUFFLE_SESSION);

  assert.equal(ended, IDLE_SHUFFLE_SESSION);
});

test('a session with nothing playable has no sound and tries again next chapter', () => {
  const empty = shuffleForChapter(IDLE_SHUFFLE_SESSION, 'bsb:GEN:1', [], () => 0);
  const later = shuffleForChapter(empty, 'bsb:GEN:1', CANDIDATES, () => 0);

  assert.equal(empty.current, null);
  assert.equal(later.current, 'piano');
});
