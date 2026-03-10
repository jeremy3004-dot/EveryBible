import test from 'node:test';
import assert from 'node:assert/strict';
import { createLazyClientAccessor } from './lazyClient';

test('lazy client accessor defers client creation until first access', () => {
  let createCalls = 0;
  const getClient = createLazyClientAccessor({
    createClient: () => {
      createCalls += 1;
      return { auth: { marker: 'ready' } };
    },
  });

  assert.equal(createCalls, 0);
  assert.deepEqual(getClient(), { auth: { marker: 'ready' } });
  assert.equal(createCalls, 1);
  assert.equal(getClient(), getClient());
  assert.equal(createCalls, 1);
});
