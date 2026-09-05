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
  resolveReadyAtlasMap,
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

test('ready work is rejected when React has installed a replacement map instance', () => {
  const removedMap = { id: 'removed' };
  const replacementMap = { id: 'replacement' };

  assert.equal(resolveReadyAtlasMap(removedMap, removedMap), removedMap);
  assert.equal(resolveReadyAtlasMap(replacementMap, removedMap), null);
  assert.equal(resolveReadyAtlasMap(replacementMap, null), null);
  assert.equal(resolveReadyAtlasMap(null, removedMap), null);
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

  assert.deepEqual(ATLAS_BASEMAP_COLORS.light, {
    canvas: '#f0ece5',
    land: '#edece8',
    water: '#d5dde2',
    border: '#d2cec6',
    label: '#69624f',
  });
  assert.deepEqual(ATLAS_BASEMAP_COLORS.dark, {
    canvas: '#11110d',
    land: '#1d1b16',
    water: '#0a0d0f',
    border: '#3d382e',
    label: '#b0a99b',
  });
  assert.deepEqual(updates, [
    ['background', 'background-color', '#edece8'],
    ['water-fill', 'fill-color', '#d5dde2'],
    ['land-fill', 'fill-color', '#edece8'],
  ]);
  assert.deepEqual(skies, [
    {
      'sky-color': '#f0ece5',
      'horizon-color': '#f0ece5',
      'fog-color': '#f0ece5',
      'sky-horizon-blend': 0,
      'horizon-fog-blend': 0,
      'atmosphere-blend': 0,
    },
  ]);
});

test('map dots read exact FIELD Scripture colors for each theme', () => {
  assert.deepEqual(atlasScriptureColorExpression('light'), [
    'match',
    ['get', 'category'],
    'bible',
    '#1e8a7a',
    'nt',
    '#db9b1a',
    'portions',
    '#bf6d3b',
    'no-scripture',
    '#c62a3a',
    'unknown',
    '#7e7972',
    '#7e7972',
  ]);
  assert.deepEqual(atlasScriptureColorExpression('dark'), [
    'match',
    ['get', 'category'],
    'bible',
    '#36c9b3',
    'nt',
    '#efb748',
    'portions',
    '#d68b5c',
    'no-scripture',
    '#e34f5b',
    'unknown',
    '#a39b8a',
    '#a39b8a',
  ]);
});
