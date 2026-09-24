import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import {
  clearScreenReaderTrace,
  getScreenReaderTrace,
  MAX_SCREEN_READER_TRACE_ENTRIES,
  traceReaderVerseLayout,
  traceScreenReaderSignal,
} from './screenReaderTrace';

// A React Native bundle defines `__DEV__` (false in release); the trace only logs there.
Object.assign(globalThis, { __DEV__: false });
const info = mock.method(console, 'info', () => {});

afterEach(() => {
  clearScreenReaderTrace();
  info.mock.resetCalls();
});

const loggedLines = () => info.mock.calls.map((call) => String(call.arguments[0]));

test('a screen-reader signal is kept and written as one tagged logcat line', () => {
  traceScreenReaderSignal(true, 'query', 100);
  traceScreenReaderSignal(false, 'event', 200);

  assert.deepEqual(getScreenReaderTrace(), [
    { kind: 'signal', at: 100, enabled: true, source: 'query' },
    { kind: 'signal', at: 200, enabled: false, source: 'event' },
  ]);
  assert.deepEqual(loggedLines(), [
    '[EB-A11Y] screenReader=on source=query at=100',
    '[EB-A11Y] screenReader=off source=event at=200',
  ]);
});

test('a reader layout is recorded when it changes, not on every render', () => {
  const sighted = { virtualized: true, screenReaderEnabled: false };
  const talkBack = { virtualized: true, screenReaderEnabled: true };
  traceReaderVerseLayout('inlineParagraphs', sighted, 1);
  traceReaderVerseLayout('inlineParagraphs', sighted, 2);
  traceScreenReaderSignal(true, 'query', 3);
  traceReaderVerseLayout('perVerse', talkBack, 4);
  traceReaderVerseLayout('perVerse', talkBack, 5);

  assert.deepEqual(
    getScreenReaderTrace().map((entry) => [entry.kind, entry.at]),
    [
      ['layout', 1],
      ['signal', 3],
      ['layout', 4],
    ]
  );
  assert.equal(
    loggedLines().at(-1),
    '[EB-A11Y] readerLayout=perVerse virtualized=1 screenReader=on at=4'
  );
});

test('only the most recent entries are kept', () => {
  for (let at = 0; at < MAX_SCREEN_READER_TRACE_ENTRIES + 5; at += 1) {
    traceScreenReaderSignal(at % 2 === 0, 'event', at);
  }
  const trace = getScreenReaderTrace();
  assert.equal(trace.length, MAX_SCREEN_READER_TRACE_ENTRIES);
  assert.equal(trace[0]?.at, 5);
});

test('outside a React Native bundle the trace is kept but nothing is logged', () => {
  Reflect.deleteProperty(globalThis, '__DEV__');
  try {
    traceScreenReaderSignal(true, 'query', 1);
  } finally {
    Object.assign(globalThis, { __DEV__: false });
  }
  assert.equal(getScreenReaderTrace().length, 1);
  assert.equal(info.mock.callCount(), 0);
});

test('a console that throws never breaks the caller', () => {
  info.mock.mockImplementationOnce(() => {
    throw new Error('console unavailable');
  });
  assert.doesNotThrow(() => traceScreenReaderSignal(true, 'event', 1));
  assert.equal(getScreenReaderTrace().length, 1);
});
