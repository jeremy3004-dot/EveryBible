import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import Module from 'node:module';

/**
 * gatherIcons.ts is a registry of static `require()`d PNGs. Node cannot compile a
 * PNG, so a CommonJS extension handler stands in for Metro's asset transformer and
 * resolves each require to the absolute path Metro would have bundled. That keeps
 * the registry itself real: the keys, the mapping, and the file each key points at.
 */
const assetPaths = new Map<string, string>();
const registerAssetLoader = () => {
  const extensions = (Module as unknown as { _extensions: Record<string, unknown> })._extensions;
  for (const extension of ['.png', '.jpg', '.jpeg']) {
    extensions[extension] = (mod: { exports: unknown }, filename: string) => {
      mod.exports = { testAssetPath: filename };
    };
  }
};
registerAssetLoader();

const pathOf = (source: unknown): string => {
  assert.ok(source && typeof source === 'object', 'asset did not resolve to a module object');
  const resolved = (source as { testAssetPath?: string }).testAssetPath;
  assert.ok(typeof resolved === 'string', 'asset did not resolve to a bundled file');
  return resolved;
};

const load = async () => {
  const icons = await import('./gatherIcons');
  const foundations = await import('./gatherFoundations');
  const wisdom = await import('./gatherWisdom');
  for (const [key, source] of Object.entries(icons.gatherIconImages)) {
    assetPaths.set(key, pathOf(source));
  }
  return { icons, foundations, wisdom };
};

const usedIconKeys = (
  foundations: Awaited<ReturnType<typeof load>>['foundations'],
  wisdom: Awaited<ReturnType<typeof load>>['wisdom']
): Set<string> => {
  const keys = new Set<string>();
  for (const foundation of foundations.gatherFoundations) {
    if (foundation.iconImage) {
      keys.add(foundation.iconImage);
    }
  }
  for (const category of wisdom.gatherWisdomCategories) {
    if (category.iconImage) {
      keys.add(category.iconImage);
    }
    for (const entry of category.wisdoms) {
      if (entry.iconImage) {
        keys.add(entry.iconImage);
      }
    }
  }
  return keys;
};

test('every icon key used by a foundation, category or wisdom resolves in the registry', async () => {
  const { icons, foundations, wisdom } = await load();
  const missing = [...usedIconKeys(foundations, wisdom)].filter(
    (key) => !(key in icons.gatherIconImages)
  );
  assert.deepEqual(missing, []);
});

test('the registry has no orphan entries that nothing references', async () => {
  const { icons, foundations, wisdom } = await load();
  const used = usedIconKeys(foundations, wisdom);
  const orphans = Object.keys(icons.gatherIconImages).filter((key) => !used.has(key));
  assert.deepEqual(orphans, []);
});

test('every registered icon points at a PNG that exists on disk', async () => {
  await load();
  const missing = [...assetPaths.entries()]
    .filter(([, filePath]) => !existsSync(filePath))
    .map(([key]) => key);
  assert.deepEqual(missing, []);
  for (const filePath of assetPaths.values()) {
    assert.match(filePath, /\/assets\/icons\/gather\/[^/]+\.png$/);
  }
});

test('no two icon keys share the same artwork file', async () => {
  await load();
  const byPath = new Map<string, string[]>();
  for (const [key, filePath] of assetPaths) {
    byPath.set(filePath, [...(byPath.get(filePath) ?? []), key]);
  }
  const shared = [...byPath.entries()].filter(([, keys]) => keys.length > 1);
  assert.deepEqual(shared, []);
});

test('icon keys follow the foundation/category/topic naming the data objects use', async () => {
  const { icons } = await load();
  for (const key of Object.keys(icons.gatherIconImages)) {
    assert.match(key, /^(foundation-\d+|category-[a-z-]+|topic-[a-z-]+)$/, `unexpected key ${key}`);
  }
});
