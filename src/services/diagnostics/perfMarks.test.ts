import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import { arePerfMarksEnabled, perfMark, perfMarkAfterFrame } from './perfMarks';

const log = mock.method(console, 'log', () => {});
const frames: Array<() => void> = [];
Object.assign(globalThis, {
  requestAnimationFrame: (callback: () => void) => {
    frames.push(callback);
    return frames.length;
  },
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_EB_PERF_MARKS;
  log.mock.resetCalls();
  frames.length = 0;
});

const loggedLines = () => log.mock.calls.map((call) => call.arguments.join(' '));

test('marks are silent unless the bundle was built with EXPO_PUBLIC_EB_PERF_MARKS=1', () => {
  perfMark('reader:painted', 'PSA:119', 1000);
  perfMarkAfterFrame('audioSheet:painted');
  process.env.EXPO_PUBLIC_EB_PERF_MARKS = 'true';
  perfMark('reader:painted', undefined, 1000);

  assert.equal(arePerfMarksEnabled(), false);
  assert.deepEqual(loggedLines(), []);
  assert.equal(frames.length, 0);
});

test('an enabled mark is one tagged line with its epoch time and optional detail', () => {
  process.env.EXPO_PUBLIC_EB_PERF_MARKS = '1';
  perfMark('touch:end', undefined, 1000);
  perfMark('reader:painted', 'PSA:119', 2000);

  assert.deepEqual(loggedLines(), ['[EB-P] touch:end 1000', '[EB-P] reader:painted 2000 PSA:119']);
});

test('an after-frame mark is written when the next frame runs, not when it is requested', () => {
  process.env.EXPO_PUBLIC_EB_PERF_MARKS = '1';
  perfMarkAfterFrame('tab:focus', 'Plans');

  assert.deepEqual(loggedLines(), []);
  assert.equal(frames.length, 1);
  frames[0]?.();
  assert.equal(loggedLines().length, 1);
  assert.match(loggedLines()[0] ?? '', /^\[EB-P\] tab:focus \d+ Plans$/);
});
