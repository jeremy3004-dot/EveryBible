import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (file: string) => readFile(new URL(file, import.meta.url), 'utf8');

test('atlas retains MapLibre and theme-aware basemaps with accessible alternative detail', async () => {
  const source = await read('./AnalyticsGlobe.tsx');
  assert.match(source, /from 'maplibre-gl'/);
  assert.match(source, /positron-gl-style/);
  assert.match(source, /dark-matter-gl-style/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /ResizeObserver/);
  assert.match(source, /aria-label="Geographic detail"/);
  assert.match(source, /Approximate IP locations/);
  assert.match(source, /country centers where coordinates are unavailable/);
});

test('map clicks resolve a unique coordinate identity and layer updates follow current filters', async () => {
  const source = await read('./AnalyticsGlobe.tsx');
  assert.match(source, /pointId\(item\) === id/);
  assert.doesNotMatch(source, /entry\.code === countryCode/);
  assert.match(source, /source: METRIC_SOURCE_ID/);
  assert.match(source, /map\.on\('style.load'/);
  assert.match(source, /syncLayers\(map\)/);
  assert.match(source, /map\.remove\(\)/);
});
