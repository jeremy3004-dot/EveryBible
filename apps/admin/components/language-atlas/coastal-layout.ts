import type { ScreenAnchor, SpreadPoint } from './spread-layout';

export const MAX_SPREAD_DISTANCE = 24;
export interface CoastalPoint extends SpreadPoint {
  ids: string[];
}

/** Keep reference locations intact when coast data is unavailable or the camera moves. */
export function compactAnchors(anchors: ScreenAnchor[]): CoastalPoint[] {
  const groups = new Map<string, CoastalPoint>();
  for (const anchor of anchors) {
    const key = `${anchor.x},${anchor.y}`;
    const group = groups.get(key);
    if (group) group.ids.push(anchor.id);
    else
      groups.set(key, {
        ...anchor,
        anchorX: anchor.x,
        anchorY: anchor.y,
        spacing: 8.5,
        ids: [anchor.id],
      });
  }
  return [...groups.values()];
}

/** Only short paths entirely on land can move a dot. Overflow shares a nearby marker. */
export function coastalLayout(
  anchors: ScreenAnchor[],
  width: number,
  height: number,
  isLand: (x: number, y: number) => boolean,
  spacing = 7
): CoastalPoint[] {
  const occupied = new Map<string, CoastalPoint>();
  const groups: CoastalPoint[] = [];
  const offsets: { x: number; y: number; distance: number }[] = [];
  const reach = Math.ceil(MAX_SPREAD_DISTANCE / spacing);
  for (let y = -reach; y <= reach; y++)
    for (let x = -reach; x <= reach; x++) {
      const distance = Math.hypot(x * spacing, y * spacing);
      if (distance <= MAX_SPREAD_DISTANCE) offsets.push({ x, y, distance });
    }
  offsets.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);
  const onLand = (x: number, y: number) =>
    x >= 3 &&
    y >= 3 &&
    x <= width - 3 &&
    y <= height - 3 &&
    isLand(x, y) &&
    isLand(x - 3, y) &&
    isLand(x + 3, y) &&
    isLand(x, y - 3) &&
    isLand(x, y + 3);
  const reachable = (a: ScreenAnchor, x: number, y: number) => {
    const distance = Math.hypot(x - a.x, y - a.y);
    if (distance > MAX_SPREAD_DISTANCE || !onLand(x, y)) return false;
    const steps = Math.max(1, Math.ceil(distance));
    for (let i = 0; i <= steps; i++)
      if (!isLand(a.x + ((x - a.x) * i) / steps, a.y + ((y - a.y) * i) / steps)) return false;
    return true;
  };
  for (const anchorGroup of compactAnchors([...anchors].sort((a, b) => a.id.localeCompare(b.id)))) {
    const candidates = isLand(anchorGroup.x, anchorGroup.y)
      ? offsets.flatMap((offset) => {
          const col = Math.round(anchorGroup.x / spacing) + offset.x;
          const row = Math.round(anchorGroup.y / spacing) + offset.y;
          const x = col * spacing,
            y = row * spacing;
          return reachable(anchorGroup, x, y) ? [{ x, y, key: `${col},${row}` }] : [];
        })
      : [];
    for (const id of anchorGroup.ids) {
      const anchor = { ...anchorGroup, id };
      let fallback: CoastalPoint | undefined;
      let placed = false;
      for (const { x, y, key } of candidates) {
        const existing = occupied.get(key);
        if (existing) {
          fallback ??= existing;
          continue;
        }
        const point = {
          ...anchor,
          x,
          y,
          anchorX: anchor.x,
          anchorY: anchor.y,
          spacing,
          ids: [id],
        };
        occupied.set(key, point);
        groups.push(point);
        placed = true;
        break;
      }
      if (placed) continue;
      // A source point already offshore is retained, never silently relocated onto an island.
      if (!fallback)
        fallback = groups.find(
          (p) =>
            p.anchorX === anchor.x && p.anchorY === anchor.y && p.x === anchor.x && p.y === anchor.y
        );
      if (fallback) fallback.ids.push(id);
      else groups.push({ ...anchor, anchorX: anchor.x, anchorY: anchor.y, spacing, ids: [id] });
    }
  }
  return groups;
}
