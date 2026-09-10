/**
 * `loadBSBData` pulls the processed BSB JSON in through Metro's CommonJS
 * `require` and memoises it on the module. The real file is 6.5 MB, so the
 * bundled JSON specifier itself is mocked: `mock.module` intercepts the
 * module's own `require`, which keeps the fixture tiny and the run instant
 * while still exercising the real lazy-load and caching code.
 *
 * The failure path lives in `bsbData.failure.test.ts` — the cache is module
 * state and one mock configuration per file is the rule, so a run that
 * succeeds can never also observe the throwing require.
 */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mockModule } from '../../testing/mockModules';
import type { ProcessedBSB } from './bsbData';

const payload: ProcessedBSB = {
  translation: { id: 'bsb', name: 'Berean Standard Bible', totalVerses: 2 },
  verses: [
    { b: 'GEN', c: 1, v: 1, t: 'In the beginning' },
    {
      b: 'PSA',
      c: 23,
      v: 1,
      t: 'The LORD is my shepherd',
      h: 'The LORD Is My Shepherd',
      f: { mode: 'poetry', lines: [{ text: 'The LORD is my shepherd', indentLevel: 1 }] },
    },
  ],
};

/** How many times the bundled JSON module's value has actually been read. */
let bundleReads = 0;

mockModule(mock, fileURLToPath(new URL('../../../data/bsb_processed.json', import.meta.url).href), {
  get default() {
    bundleReads += 1;
    return payload;
  },
});

test('the processed BSB payload is loaded from the bundled JSON file', async () => {
  const { loadBSBData } = await import('./bsbData');

  assert.deepEqual(await loadBSBData(), payload);
});

test('a second load is served from memory rather than re-read', async () => {
  const { loadBSBData } = await import('./bsbData');

  const first = await loadBSBData();
  const second = await loadBSBData();

  assert.equal(second, first, 'both loads must return the very same cached object');
  assert.equal(bundleReads, 1);
});
