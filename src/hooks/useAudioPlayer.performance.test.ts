import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { shallow } from 'zustand/shallow';

const source = readFileSync(new URL('./useAudioPlayer.ts', import.meta.url), 'utf8');
// Evaluate the production selector, without importing native audio modules.
const selectorSource = source.match(/useShallow\((\(state\) => \(\{[\s\S]*?\}\))\)/)?.[1];
assert.ok(selectorSource);
const select = runInNewContext(selectorSource) as (
  state: Record<string, unknown>
) => Record<string, unknown>;

test('transport subscription ignores 240 position ticks and twelve resume checkpoints', () => {
  const state = { currentPosition: 0, lastPosition: 0, duration: 90_000, status: 'playing' };
  let previous = select(state);
  let updates = 0;
  for (let position = 250; position <= 60_000; position += 250) {
    state.currentPosition = position;
    if (position % 5000 === 0) state.lastPosition = position;
    const next = select(state);
    if (!shallow(previous, next)) updates += 1;
    previous = next;
  }
  assert.equal(updates, 0);
  assert.equal(state.currentPosition, 60_000);
  assert.equal(state.lastPosition, 60_000);
});

test('transport subscription preserves status, track and playback settings updates', () => {
  const state: Record<string, unknown> = {};
  for (const [key, value] of Object.entries({
    status: 'paused',
    currentBookId: 'JHN',
    currentChapter: 4,
    currentTranslationId: 'bsb',
    playbackRate: 1.5,
    repeatMode: 'chapter',
    backgroundMusicChoice: 'off',
    sleepTimerEndTime: 60_000,
  })) {
    const before = select(state);
    state[key] = value;
    assert.equal(shallow(before, select(state)), false, key);
  }
});
