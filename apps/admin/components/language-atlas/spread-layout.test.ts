import assert from 'node:assert/strict';
import test from 'node:test';
import {
  layoutSpreadPoints,
  projectSpreadPoints,
  representativePoints,
  nearestSpreadPoint,
} from './spread-layout';
import type { AtlasRecord } from '../../lib/language-atlas/types';

const record = (id: string): AtlasRecord => ({
  id,
  name: id,
  kind: 'dialect',
  aliases: [],
  iso6393: 'agh',
  glottocode: null,
  rolvCode: id,
  parentId: 'iso:agh',
  family: null,
  countryCodes: ['CD'],
  population: null,
  scriptureStatus: 'unknown',
  scriptureScope: 'unknown',
  languageContextStatus: 'started',
  location: {
    latitude: 1.81314,
    longitude: 24.8754,
    precision: 'parent-language',
    sourceId: 'glottolog',
    label: 'Parent reference',
    countryCode: 'CD',
  },
  sourceIds: ['grn'],
  summary: '',
  needsReview: false,
});

test('one representative point per record preserves source placements and separate ROLV identities', () => {
  const first = record('01423');
  first.locations = [
    first.location!,
    { ...first.location!, longitude: 25, sourceId: 'everylanguage' },
  ];
  const records = [first, record('31691')];
  const before = JSON.stringify(records);
  const points = representativePoints(records);
  assert.equal(points.length, 2);
  assert.deepEqual(
    points.map((point) => point.id),
    ['01423', '31691']
  );
  assert.equal(points[0].location.longitude, 24.8754);
  assert.equal(JSON.stringify(records), before);
});

test('projection rejects globe backside, offscreen and invalid points', () => {
  const points = representativePoints(['visible', 'back', 'outside', 'invalid'].map(record));
  const result = projectSpreadPoints(
    points,
    (point) => ({
      x: point.id === 'outside' ? -50 : point.id === 'invalid' ? NaN : 100,
      y: 100,
      occluded: point.id === 'back',
    }),
    500,
    500
  );
  assert.deepEqual(
    result.map((point) => point.id),
    ['visible']
  );
});

test('co-located varieties get unique, individually selectable positions without moving anchors', () => {
  const anchors = Array.from({ length: 13 }, (_, i) => ({ id: String(i), x: 250, y: 250 }));
  const points = layoutSpreadPoints(anchors, 500, 500);
  assert.equal(points.length, 13);
  assert.equal(new Set(points.map((point) => `${point.x},${point.y}`)).size, 13);
  for (const point of points) {
    assert.equal(point.anchorX, 250);
    assert.equal(point.anchorY, 250);
    assert.equal(nearestSpreadPoint(points, point.x, point.y)?.id, point.id);
    for (const other of points) {
      if (other.id !== point.id) assert.ok(Math.hypot(point.x - other.x, point.y - other.y) >= 7.5);
    }
  }
  assert.deepEqual(layoutSpreadPoints([...anchors].reverse(), 500, 500), points);
});

test('dense and edge groups keep all IDs and remain within the viewport', () => {
  const anchors = Array.from({ length: 3000 }, (_, i) => ({
    id: String(i).padStart(5, '0'),
    x: i % 2 ? 2 : 350,
    y: i % 2 ? 2 : 350,
  }));
  const points = layoutSpreadPoints(anchors, 800, 700);
  assert.equal(new Set(points.map((point) => point.id)).size, 3000);
  assert.equal(new Set(points.map((point) => `${point.x},${point.y}`)).size, 3000);
  for (const point of points)
    assert.ok(point.x >= 3 && point.x <= 797 && point.y >= 3 && point.y <= 697);
  assert.equal(nearestSpreadPoint(points, -100, -100), null);
});

test('a full atlas of nearby but distinct anchors settles within an interactive budget', () => {
  const anchors = Array.from({ length: 30000 }, (_, i) => ({
    id: `variety:${i}`,
    x: 300 + ((i * 7919) % 40000) / 100,
    y: 200 + ((i * 1543) % 24000) / 100,
  }));
  const started = performance.now();
  const points = layoutSpreadPoints(anchors, 1440, 884, 2.85);
  assert.equal(points.length, anchors.length);
  assert.equal(new Set(points.map((point) => `${point.x},${point.y}`)).size, anchors.length);
  // Generous enough for CI; catches repeated multi-second spiral searches.
  assert.ok(performance.now() - started < 1500);
});
