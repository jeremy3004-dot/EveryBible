import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// UI-only source check for AnalyticsGlobe.tsx (a MapLibre client component, no renderer
// here); the basemap helpers are exercised on the real lib/atlas-basemap module below.
const read = (file: string) => readFile(new URL(file, import.meta.url), 'utf8');

test('atlas retains MapLibre and theme-aware basemaps with accessible alternative detail', async () => {
  const source = await read('./AnalyticsGlobe.tsx');
  assert.match(source, /from 'maplibre-gl'/);
  assert.match(source, /from '@\/lib\/atlas-basemap'/);
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

test('the basemap loads Positron for light and Dark Matter for dark', async (t) => {
  const { loadAtlasBasemap } = await import('../lib/atlas-basemap');
  const requested: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    requested.push(url);
    return Response.json({ version: 8, sources: {}, layers: [] });
  });
  const styles: unknown[] = [];
  const map = { setStyle: (style: unknown) => styles.push(style) };

  await loadAtlasBasemap(
    map as Parameters<typeof loadAtlasBasemap>[0],
    'light',
    new AbortController().signal
  );
  await loadAtlasBasemap(
    map as Parameters<typeof loadAtlasBasemap>[0],
    'dark',
    new AbortController().signal
  );

  assert.match(requested[0], /positron-gl-style/);
  assert.match(requested[1], /dark-matter-gl-style/);
  assert.equal(styles.length, 2);
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
