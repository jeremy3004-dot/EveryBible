/**
 * HomeScreen imports readingPlanService for listReadingPlans(), which it calls from
 * an effect. Evaluating the bundled catalog expands every plan into its daily
 * entries, so importing the service must not load it; the first call does.
 *
 * Separate file: each test file runs in its own process, so the module cache starts
 * empty here.
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { mock } from 'node:test';
import { fileURLToPath } from 'node:url';
import { mockMmkvStorage, mockModule, sourcePath } from '../../testing/mockModules';
import { createSupabaseFake } from '../../testing/supabaseFake';

mockMmkvStorage(mock);
const supabaseExports = {
  supabase: createSupabaseFake().client,
  isSupabaseConfigured: () => false,
  getCurrentUserId: async () => null,
};
mockModule(mock, sourcePath('services/supabase/index.ts'), supabaseExports);
mockModule(mock, sourcePath('services/supabase/client.ts'), supabaseExports);

const requireFromTest = createRequire(import.meta.url);
const catalogPath = fileURLToPath(
  new URL('../../data/readingPlans.generated.ts', import.meta.url).href
);
const isCatalogLoaded = () => catalogPath in requireFromTest.cache;

test('importing the reading plan service loads no plan catalog', async () => {
  await import('./readingPlanService.js');

  assert.equal(isCatalogLoaded(), false);
});

test('listing plans loads the catalog and returns every bundled plan', async () => {
  const { listReadingPlans } = await import('./readingPlanService.js');

  const result = await listReadingPlans();

  assert.equal(isCatalogLoaded(), true);
  assert.equal(result.success, true);
  assert.equal(result.data?.length, 23);
  assert.equal(result.data?.[0]?.id, 'bible-in-1-year');
});
