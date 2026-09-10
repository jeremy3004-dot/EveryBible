/**
 * The unavailable-bundle path of `loadBSBData`. It lives apart from
 * `bsbData.test.ts` because the module memoises its payload: once a successful
 * load has filled the cache, no later call can reach the `require` at all.
 */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mockModule } from '../../testing/mockModules';

mockModule(mock, fileURLToPath(new URL('../../../data/bsb_processed.json', import.meta.url).href), {
  get default(): never {
    throw new Error('bundled asset missing');
  },
});

test('a missing bundled data file surfaces as an unavailable-data error', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { loadBSBData } = await import('./bsbData');

  await assert.rejects(() => loadBSBData(), { message: 'Bible data not available' });
});

test('the underlying load failure is reported to the console for diagnostics', async (t) => {
  const error = t.mock.method(console, 'error', () => {});
  const { loadBSBData } = await import('./bsbData');

  await loadBSBData().catch(() => {});

  assert.equal(error.mock.callCount(), 1);
  assert.equal(error.mock.calls[0].arguments[0], 'Failed to load BSB data:');
});
