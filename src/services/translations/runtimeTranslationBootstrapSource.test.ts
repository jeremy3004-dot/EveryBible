import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('ensureRuntimeCatalogLoaded refreshes once per launch instead of stopping at any persisted runtime row', () => {
  const source = readRelativeSource('./runtimeTranslationBootstrap.ts');

  assert.equal(
    source.includes('let hasHydratedRuntimeCatalogThisLaunch = false;'),
    true,
    'Runtime catalog bootstrap should track a per-launch hydration flag so new remote translations can appear on existing installs'
  );

  assert.equal(
    source.includes('if (hasRuntimeCatalogTranslations(useBibleStore.getState().translations))'),
    false,
    'ensureRuntimeCatalogLoaded should not stop just because persisted runtime translations already exist in the store'
  );

  assert.equal(
    source.includes('hasHydratedRuntimeCatalogThisLaunch = true;'),
    true,
    'bootstrapRuntimeTranslations should mark the launch-scoped hydration flag once the remote catalog has been applied'
  );
});
