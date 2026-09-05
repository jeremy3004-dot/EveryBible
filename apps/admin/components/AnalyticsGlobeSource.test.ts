import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (file: string) => readFile(new URL(file, import.meta.url), 'utf8');

test('atlas retains MapLibre and theme-aware basemaps with accessible alternative detail', async () => {
  const source = await read('./AnalyticsGlobe.tsx');
  assert.match(source, /from 'maplibre-gl'/);
  const basemap = await read('../lib/atlas-basemap.ts');
  assert.match(source, /from '@\/lib\/atlas-basemap'/);
  assert.match(basemap, /positron-gl-style/);
  assert.match(basemap, /dark-matter-gl-style/);
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

test('shared basemap theme repaint preserves GeoJSON data-layer colors', async () => {
  const { applyBasemapContrast, GLOBE_CHROME } = await import('../lib/atlas-basemap');
  const paint: [string, string, string][] = [];
  const map = {
    getStyle: () => ({
      layers: [
        { id: 'water', type: 'fill', source: 'carto' },
        { id: 'land', type: 'background' },
        { id: 'country-label', type: 'symbol', source: 'carto' },
        { id: 'language-count', type: 'symbol', source: 'language-data' },
      ],
    }),
    getSource: (id: string) => ({ type: id === 'language-data' ? 'geojson' : 'vector' }),
    setPaintProperty: (id: string, property: string, value: string) =>
      paint.push([id, property, value]),
  };
  applyBasemapContrast(map as unknown as Parameters<typeof applyBasemapContrast>[0], 'dark');
  assert.ok(
    paint.some(
      ([id, property, value]) =>
        id === 'water' && property === 'fill-color' && value === GLOBE_CHROME.dark.water
    )
  );
  assert.ok(
    paint.some(
      ([id, property, value]) =>
        id === 'land' && property === 'background-color' && value === GLOBE_CHROME.dark.land
    )
  );
  assert.ok(paint.some(([id]) => id === 'country-label'));
  assert.ok(paint.every(([id]) => id !== 'language-count'));
});
