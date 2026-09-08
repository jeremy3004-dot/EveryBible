import assert from 'node:assert/strict';
import test from 'node:test';
import { coastalLayout } from './coastal-layout';
import { captureSpreadPositions, movingSpreadPoints } from './spread-motion';

test('crowded dots retain their separation while panning back and forth and waiting for tiles', () => {
  const anchors = Array.from({ length: 12 }, (_, i) => ({ id: String(i), x: 100, y: 100 }));
  const settled = coastalLayout(anchors, 400, 400, () => true);
  const positions = captureSpreadPositions(settled, ({ x, y }) => ({ lng: x, lat: y }));
  for (const dx of [20, -15, 0, 20, 0]) {
    const moved = movingSpreadPoints(
      anchors.map((a) => ({ ...a, x: a.x + dx })),
      positions,
      ({ lng, lat }) => ({ x: lng + dx, y: lat })
    );
    for (const point of moved) {
      const original = settled.find((p) => p.id === point.id)!;
      assert.deepEqual([point.x - dx, point.y], [original.x, original.y]);
    }
    assert.equal(new Set(moved.map((p) => `${p.x},${p.y}`)).size, anchors.length);
    assert.ok(moved.every((p) => p.anchorX === 100 + dx));
  }
});

test('newly visible records retain references and invisible records are omitted', () => {
  const positions = captureSpreadPositions(
    [{ id: 'old', x: 107, y: 100, anchorX: 100, anchorY: 100, spacing: 7 }],
    ({ x, y }) => ({ lng: x, lat: y })
  );
  assert.deepEqual(
    movingSpreadPoints([{ id: 'new', x: 20, y: 30 }], positions, ({ lng, lat }) => ({
      x: lng,
      y: lat,
    })),
    [{ id: 'new', x: 20, y: 30, anchorX: 20, anchorY: 30, spacing: 8.5 }]
  );
});
