import { referenceDots } from './coastal-layout';
import type { ScreenAnchor, SpreadPoint } from './spread-layout';

type Coordinate = { lng: number; lat: number };
type Positions = ReadonlyMap<string, { coordinate: Coordinate; spacing: number }>;

/** Presentation coordinates only; source locations remain unchanged. */
export function captureSpreadPositions(
  points: SpreadPoint[],
  unproject: (point: { x: number; y: number }) => Coordinate
): Positions {
  return new Map(
    points.map((point) => [
      point.id,
      {
        coordinate: unproject(point),
        spacing: point.spacing,
      },
    ])
  );
}

/** Carry the settled arrangement with the camera instead of collapsing it during gestures. */
export function movingSpreadPoints(
  anchors: ScreenAnchor[],
  positions: Positions,
  project: (coordinate: Coordinate) => { x: number; y: number }
): SpreadPoint[] {
  return referenceDots(anchors).map((point) => {
    const saved = positions.get(point.id);
    if (!saved) return point;
    const screen = project(saved.coordinate);
    if (!Number.isFinite(screen.x) || !Number.isFinite(screen.y)) return point;
    return { ...point, x: screen.x, y: screen.y, spacing: saved.spacing };
  });
}
