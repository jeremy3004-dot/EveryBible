import assert from 'node:assert/strict';
import test from 'node:test';

import type { LngLat } from 'maplibre-gl';

import { isLocationOccluded, type OcclusionMap } from './location-occlusion';

// The occlusion code reads only lng and lat.
const point = (lng: number, lat: number) => ({ lng, lat }) as LngLat;

function fakeMap({
  projection = 'globe',
  center = point(0, 0),
  camera,
}: {
  projection?: string;
  center?: LngLat;
  camera?: unknown;
}): OcclusionMap {
  return {
    getCenter: () => center,
    getProjection: () => ({ type: projection }),
    ...(camera === undefined ? {} : { _camera: camera }),
  } as unknown as OcclusionMap;
}

test("MapLibre's own occlusion test is used while it is reachable", () => {
  const asked: unknown[] = [];
  const map = fakeMap({
    camera: {
      transform: {
        isLocationOccluded: (lngLat: unknown) => {
          asked.push(lngLat);
          return true;
        },
      },
    },
  });

  assert.equal(isLocationOccluded(map, point(1, 1)), true);
  assert.deepEqual(asked, [point(1, 1)]);
});

for (const [name, camera] of [
  ['no _camera', undefined],
  ['no transform', {}],
  ['no isLocationOccluded', { transform: {} }],
] as const) {
  test(`a MapLibre upgrade that moves the private API (${name}) falls back instead of throwing`, () => {
    // SpreadDots calls this every animation frame; a throw would stop the dot layer for good.
    const map = fakeMap({ camera, center: point(85, 28) });

    assert.equal(isLocationOccluded(map, point(86, 27)), false, 'near the centre is visible');
    assert.equal(isLocationOccluded(map, point(-95, -28)), true, 'the antipode is hidden');
  });
}

test('the fallback hides only the far hemisphere of a globe', () => {
  const map = fakeMap({ camera: {}, center: point(0, 0) });

  assert.equal(isLocationOccluded(map, point(80, 0)), false);
  assert.equal(isLocationOccluded(map, point(100, 0)), true);
  assert.equal(isLocationOccluded(map, point(0, 85)), false);
  assert.equal(isLocationOccluded(map, point(179, 10)), true);
});

test('the fallback hides nothing on a flat map', () => {
  const map = fakeMap({ camera: {}, projection: 'mercator', center: point(0, 0) });

  assert.equal(isLocationOccluded(map, point(180, 0)), false);
});
