import { recordLocations } from '../../lib/language-atlas/model';
import type { AtlasLocation, AtlasRecord } from '../../lib/language-atlas/types';

export interface RepresentativePoint {
  id: string;
  record: AtlasRecord;
  location: AtlasLocation;
}
export interface ScreenAnchor {
  id: string;
  x: number;
  y: number;
}
export interface SpreadPoint extends ScreenAnchor {
  anchorX: number;
  anchorY: number;
  spacing: number;
}

/** Source geography is never modified; extra source placements remain in the inspector. */
export function representativePoints(records: AtlasRecord[]): RepresentativePoint[] {
  return records.flatMap((record) => {
    const location = recordLocations(record)[0];
    return location ? [{ id: record.id, record, location }] : [];
  });
}

export function projectSpreadPoints(
  points: RepresentativePoint[],
  project: (point: RepresentativePoint) => { x: number; y: number; occluded: boolean },
  width: number,
  height: number
): ScreenAnchor[] {
  return points.flatMap((point) => {
    const { x, y, occluded } = project(point);
    return !occluded &&
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      x >= 0 &&
      y >= 0 &&
      x <= width &&
      y <= height
      ? [{ id: point.id, x, y }]
      : [];
  });
}

/**
 * Find the nearest free position on a fine hexagonal lattice. Per-row successor
 * links skip occupied runs, so dense regions do not repeat a spiral search for
 * every slightly different source coordinate. Source anchors remain unchanged.
 */
export function layoutSpreadPoints(
  anchors: ScreenAnchor[],
  width: number,
  height: number,
  preferredSpacing = 8.5
): SpreadPoint[] {
  if (!anchors.length || width <= 6 || height <= 6) return [];
  const spacing = Math.min(
    preferredSpacing,
    Math.sqrt(((width - 6) * (height - 6)) / anchors.length) * 0.55
  );
  const rowStep = (spacing * Math.sqrt(3)) / 2;
  const rows = Array.from({ length: Math.floor((height - 6) / rowStep) + 1 }, (_, index) => {
    const x = 3 + ((index % 2) * spacing) / 2;
    const count = Math.floor((width - 3 - x) / spacing) + 1;
    const right = new Int32Array(count + 1);
    const left = new Int32Array(count);
    for (let i = 0; i <= count; i++) right[i] = i;
    for (let i = 0; i < count; i++) left[i] = i;
    return { x, y: 3 + index * rowStep, count, right, left };
  });
  const findRight = (row: (typeof rows)[number], start: number) => {
    let column = Math.max(0, Math.min(row.count, start));
    while (row.right[column] !== column) {
      row.right[column] = row.right[row.right[column]];
      column = row.right[column];
    }
    return column;
  };
  const findLeft = (row: (typeof rows)[number], start: number) => {
    let column = Math.min(row.count - 1, start);
    while (column >= 0 && row.left[column] !== column) {
      const parent = row.left[column];
      row.left[column] = parent < 0 ? -1 : row.left[parent];
      column = row.left[column];
    }
    return column;
  };
  const priority = (id: string) => {
    let hash = 2166136261;
    for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
    return hash >>> 0;
  };
  return anchors
    .map((anchor) => ({ ...anchor, priority: priority(anchor.id) }))
    .sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((anchor) => {
      const origin = Math.max(0, Math.min(rows.length - 1, Math.round((anchor.y - 3) / rowStep)));
      let bestDistance = Infinity;
      let bestRow = origin;
      let bestColumn = 0;
      const inspect = (index: number) => {
        if (index < 0 || index >= rows.length) return;
        const row = rows[index];
        const dy = row.y - anchor.y;
        if (dy * dy > bestDistance) return;
        const target = (anchor.x - row.x) / spacing;
        const candidates = [findLeft(row, Math.floor(target)), findRight(row, Math.ceil(target))];
        for (const column of candidates) {
          if (column < 0 || column >= row.count) continue;
          const dx = row.x + column * spacing - anchor.x;
          const distance = dx * dx + dy * dy;
          if (distance < bestDistance) {
            bestDistance = distance;
            bestRow = index;
            bestColumn = column;
          }
        }
      };
      inspect(origin);
      for (let delta = 1; delta < rows.length; delta++) {
        // No farther row can improve the nearest free position.
        if ((delta - 0.5) * rowStep > Math.sqrt(bestDistance)) break;
        inspect(origin - delta);
        inspect(origin + delta);
      }
      const row = rows[bestRow];
      row.right[bestColumn] = findRight(row, bestColumn + 1);
      row.left[bestColumn] = findLeft(row, bestColumn - 1);
      return {
        id: anchor.id,
        x: row.x + bestColumn * spacing,
        y: row.y,
        anchorX: anchor.x,
        anchorY: anchor.y,
        spacing,
      };
    });
}

export function nearestSpreadPoint(
  points: SpreadPoint[],
  x: number,
  y: number
): SpreadPoint | null {
  let nearest: SpreadPoint | null = null;
  let distance = 9;
  for (const point of points) {
    const candidate = Math.hypot(point.x - x, point.y - y);
    if (candidate < distance) {
      distance = candidate;
      nearest = point;
    }
  }
  return nearest;
}
