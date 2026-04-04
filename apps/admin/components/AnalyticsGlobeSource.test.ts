import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('admin analytics map uses MapLibre instead of Cesium runtime wiring', async () => {
  const componentSource = await readFile(
    path.join(repoRoot, 'apps/admin/components/AnalyticsGlobe.tsx'),
    'utf8'
  );
  const layoutSource = await readFile(
    path.join(repoRoot, 'apps/admin/app/layout.tsx'),
    'utf8'
  );
  const packageSource = await readFile(
    path.join(repoRoot, 'apps/admin/package.json'),
    'utf8'
  );

  assert.match(componentSource, /from 'maplibre-gl'/);
  assert.doesNotMatch(componentSource, /cesium/i);
  assert.match(componentSource, /useState<string \| null>\(null\)/);
  assert.doesNotMatch(componentSource, /metrics\[0\]\?\.code \?\? null/);
  assert.match(componentSource, /const INITIAL_ZOOM = 3\.3;/);
  assert.match(componentSource, /const WORLD_BOUNDS: \[\[number, number\], \[number, number\]\] = \[\s*\[-170, -58\],\s*\[180, 82\],\s*\];/m);
  assert.match(componentSource, /setProjection\(\{\s*type:\s*'globe'\s*\}\)/s);
  assert.match(
    componentSource,
    /basemaps\.cartocdn\.com\/gl\/positron-gl-style\/style\.json/
  );
  assert.match(
    componentSource,
    /basemaps\.cartocdn\.com\/gl\/dark-matter-gl-style\/style\.json/
  );
  assert.match(componentSource, /MutationObserver/);
  assert.match(componentSource, /globe-card__back-link/);
  assert.match(componentSource, /globe-card__summary/);
  assert.match(componentSource, /globe-card__explore/);
  assert.match(componentSource, /Click a country bubble to open the detailed country card/);
  assert.match(componentSource, /#34d399/);
  assert.match(componentSource, /#fb923c/);
  assert.match(componentSource, /#ef4444/);
  assert.doesNotMatch(componentSource, /<button\b/);
  assert.doesNotMatch(componentSource, /segmented-control__button/);
  assert.doesNotMatch(componentSource, /globe-card__toplist/);
  assert.doesNotMatch(componentSource, /openfreemap/i);
  assert.match(layoutSource, /maplibre-gl\/dist\/maplibre-gl\.css/);
  assert.match(packageSource, /"maplibre-gl":/);
  assert.doesNotMatch(packageSource, /"cesium":/);
});
