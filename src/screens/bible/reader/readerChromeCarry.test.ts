import test from 'node:test';
import assert from 'node:assert/strict';
import { markReaderChromeCarry, takeReaderChromeCarry } from './readerChromeCarry';

test('the chapter the reader stepped to carries the chrome, once', () => {
  const ref = { current: null as string | null };
  markReaderChromeCarry(ref, 'JHN', 4);
  assert.equal(takeReaderChromeCarry(ref, 'JHN', 4), true);
  assert.equal(takeReaderChromeCarry(ref, 'JHN', 4), false, 'consumed');
});

test('arriving anywhere else drops a pending step instead of carrying it later', () => {
  const ref = { current: null as string | null };
  markReaderChromeCarry(ref, 'JHN', 4);
  assert.equal(takeReaderChromeCarry(ref, 'ROM', 8), false);
  assert.equal(takeReaderChromeCarry(ref, 'JHN', 4), false);
});
