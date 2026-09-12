import assert from 'node:assert/strict';
import test from 'node:test';
import { createReaderFocusScroll } from './readerFocusScroll';

test('a requested verse waits for its layout and scrolls exactly once', () => {
  const focus = createReaderFocusScroll();
  const scrolls: number[] = [];
  focus.request(16);
  assert.equal(
    focus.flush(
      () => null,
      (offset) => scrolls.push(offset)
    ),
    false
  );
  assert.equal(focus.pendingVerse, 16);
  assert.equal(
    focus.flush(
      (verse) => (verse === 16 ? 840 : null),
      (offset) => scrolls.push(offset)
    ),
    true
  );
  focus.flush(
    () => 900,
    (offset) => scrolls.push(offset)
  );
  assert.deepEqual(scrolls, [840]);
});

test('changing chapters replaces a pending focus request', () => {
  const focus = createReaderFocusScroll();
  const requested: number[] = [];
  focus.request(16);
  focus.request(3);
  focus.flush(
    (verse) => {
      requested.push(verse);
      return 120;
    },
    () => {}
  );
  assert.deepEqual(requested, [3]);
});

test('ordinary chapter navigation cancels an earlier pending focus', () => {
  const focus = createReaderFocusScroll();
  focus.request(16);
  focus.request(null);
  focus.flush(
    () => {
      assert.fail('a cancelled request must not read layout');
    },
    () => {}
  );
  assert.equal(focus.pendingVerse, null);
});

test('a measured offset of zero is a valid focus target', () => {
  const focus = createReaderFocusScroll();
  const scrolls: number[] = [];
  focus.request(1);
  assert.equal(
    focus.flush(
      () => 0,
      (offset) => scrolls.push(offset)
    ),
    true
  );
  assert.deepEqual(scrolls, [0]);
});
