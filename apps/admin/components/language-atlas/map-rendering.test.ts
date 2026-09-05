import assert from 'node:assert/strict';
import test from 'node:test';
import type { AtlasFeatures } from '../../lib/language-atlas/model';
import {
  ATLAS_CLUSTER_MAX_ZOOM,
  ATLAS_CLUSTER_RADIUS,
  ATLAS_BASEMAP_COLORS,
  ATLAS_SOURCE_ID,
  applyAtlasBasemapContrast,
  applyAtlasDisplayMode,
  atlasControlInsets,
  atlasScriptureColorExpression,
  atlasSourceOptions,
} from './map-rendering';

const data: AtlasFeatures = { type: 'FeatureCollection', features: [] };

test('the initial individual source keeps the complete feature collection unclustered', () => {
  const source = atlasSourceOptions(data, 'individual');

  assert.equal(source.data, data);
  assert.equal(source.cluster, false);
  assert.equal(source.clusterRadius, 50);
  assert.equal(source.clusterMaxZoom, 4);
});

test('display mode changes reindex only the existing source', () => {
  const updates: unknown[] = [];
  const source = {
    setClusterOptions: (options: unknown) => {
      updates.push(options);
      return source;
    },
  };

  assert.equal(applyAtlasDisplayMode(source, 'individual', 'clustered'), true);
  assert.equal(applyAtlasDisplayMode(source, 'clustered', 'clustered'), false);
  assert.equal(applyAtlasDisplayMode(source, 'clustered', 'individual'), true);

  assert.equal(ATLAS_SOURCE_ID, 'language-atlas-records');
  assert.equal(ATLAS_CLUSTER_RADIUS, 50);
  assert.equal(ATLAS_CLUSTER_MAX_ZOOM, 4);
  assert.deepEqual(updates, [{ cluster: true }, { cluster: false }]);
});

test('map controls stay inside the parent-provided visible map padding', () => {
  assert.deepEqual(
    atlasControlInsets({ top: 80, right: 496, bottom: 16, left: 16 }),
    { left: 30, bottom: 30 }
  );
  assert.deepEqual(
    atlasControlInsets({ top: 72, right: 16, bottom: 620, left: 16 }),
    { left: 30, bottom: 634 }
  );
});

test('atlas basemap repaint is neutral and never overwrites GeoJSON data colors', () => {
  const updates: Array<[string, string, unknown]> = [];
  const skies: unknown[] = [];
  const layers = [
    { id: 'background', type: 'background' },
    { id: 'water-fill', type: 'fill', source: 'carto' },
    { id: 'land-fill', type: 'fill', source: 'carto' },
    { id: 'language-atlas-dots', type: 'circle', source: ATLAS_SOURCE_ID },
  ];
  const map = {
    getStyle: () => ({ layers }),
    getSource: (id: string) => ({ type: id === ATLAS_SOURCE_ID ? 'geojson' : 'vector' }),
    setPaintProperty: (layer: string, property: string, value: unknown) => {
      updates.push([layer, property, value]);
    },
    setSky: (sky: unknown) => {
      skies.push(sky);
    },
  };

  applyAtlasBasemapContrast(
    map as unknown as Parameters<typeof applyAtlasBasemapContrast>[0],
    'light'
  );

  assert.equal(ATLAS_BASEMAP_COLORS.light.canvas, '#ffffff');
  assert.equal(ATLAS_BASEMAP_COLORS.dark.canvas, '#09090b');
  assert.deepEqual(updates, [
    ['background', 'background-color', '#ffffff'],
    ['water-fill', 'fill-color', '#dbe3e8'],
    ['land-fill', 'fill-color', '#ffffff'],
  ]);
  assert.deepEqual(skies, [
    {
      'sky-color': '#ffffff',
      'horizon-color': '#ffffff',
      'fog-color': '#ffffff',
      'sky-horizon-blend': 0,
      'horizon-fog-blend': 0,
      'atmosphere-blend': 0,
    },
  ]);
});

test('map dots read exact Scripture colors from the shared presentation categories', () => {
  assert.deepEqual(atlasScriptureColorExpression(), [
    'match',
    ['get', 'category'],
    'bible',
    '#10b981',
    'nt',
    '#eab308',
    'portions',
    '#eb6a38',
    'no-scripture',
    '#ef4444',
    'unknown',
    '#94a3b8',
    '#94a3b8',
  ]);
});
