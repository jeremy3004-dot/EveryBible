import assert from 'node:assert/strict';
import test from 'node:test';
import { coastalLayout, referenceDots, MAX_SPREAD_DISTANCE } from './coastal-layout';
const anchors = Array.from({ length: 300 }, (_, i) => ({ id: String(i), x: 96, y: 100 }));
test('coastal overflow stays on land and nearby, retaining overlapping individual dots', () => {
  const before = JSON.stringify(anchors);
  const points = coastalLayout(anchors, 300, 200, (x) => x < 100);
  assert.equal(points.map((p) => p.id).length, 300);
  assert.equal(new Set(points.map((p) => p.id)).size, 300);
  assert.equal(points.length, 300);
  assert.ok(points.filter((p) => p.x === 96 && p.y === 100).length > 1);
  for (const p of points) {
    assert.ok(p.x < 100);
    assert.ok(Math.hypot(p.x - p.anchorX, p.y - p.anchorY) <= MAX_SPREAD_DISTANCE);
  }
  assert.equal(JSON.stringify(anchors), before);
});
test('a nearby island across a narrow water channel is never used for overflow', () => {
  const points = coastalLayout(anchors, 300, 200, (x) => x < 100 || x > 105);
  assert.ok(points.every((p) => p.x < 100));
});
test('offshore or unavailable coastal evidence leaves sources at their references', () => {
  const points = coastalLayout(anchors, 300, 200, () => false);
  assert.equal(points.length, 300);
  assert.equal(points[0].x, 96);
  assert.deepEqual(
    new Set(referenceDots(anchors).map((p) => p.id)),
    new Set(points.map((p) => p.id))
  );
});
test('zooming creates more land space and exposes individual records', () => {
  const small = coastalLayout(anchors.slice(0, 30), 300, 200, (x) => x < 100);
  const wide = coastalLayout(
    anchors
      .slice(0, 30)
      .map((p, i) => ({ ...p, x: 40 + (i % 6) * 12, y: 40 + Math.floor(i / 6) * 12 })),
    300,
    200,
    (x) => x < 100
  );
  assert.ok(
    new Set(wide.map((p) => `${p.x},${p.y}`)).size > new Set(small.map((p) => `${p.x},${p.y}`)).size
  );
});

test('mixed anchors retain each ID once and every dot stays within its movement budget', () => {
  const input = Array.from({ length: 2000 }, (_, i) => ({
    id: `id-${i}`,
    x: 50 + (i % 80),
    y: 50 + (i % 55),
  }));
  const byId = new Map(input.map((p) => [p.id, p]));
  const output = coastalLayout(input, 300, 250, (x) => x < 120);
  assert.equal(new Set(output.map((p) => p.id)).size, input.length);
  assert.equal(output.length, input.length);
  for (const point of output) {
    const source = byId.get(point.id)!;
    assert.ok(Math.hypot(point.x - source.x, point.y - source.y) <= MAX_SPREAD_DISTANCE);
    if (source.x < 120) assert.ok(point.x < 120);
    else assert.deepEqual([point.x, point.y], [source.x, source.y]);
  }
  assert.deepEqual(
    coastalLayout([...input].reverse(), 300, 250, (x) => x < 120),
    output
  );
});
