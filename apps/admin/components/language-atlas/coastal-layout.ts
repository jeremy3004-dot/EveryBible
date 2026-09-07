import type { ScreenAnchor, SpreadPoint } from './spread-layout';

export const MAX_SPREAD_DISTANCE = 24;
interface CoastalPoint extends SpreadPoint {
  ids: string[];
}

/** Keep reference locations intact when coast data is unavailable or the camera moves. */
function compactAnchors(anchors: ScreenAnchor[]): CoastalPoint[] {
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

/** Only short paths entirely on land can move a dot. Overflow stays at its original anchor and may overlap. */
export function coastalLayout(
  anchors: ScreenAnchor[],
  width: number,
  height: number,
  isLand: (x: number, y: number) => boolean,
  spacing = 7
): SpreadPoint[] {
  const occupied = new Set<string>();
  const groups: SpreadPoint[] = [];
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
      let placed = false;
      for (const { x, y, key } of candidates) {
        if (occupied.has(key)) continue;
        const point = {
          id,
          x,
          y,
          anchorX: anchor.x,
          anchorY: anchor.y,
          spacing,
        };
        occupied.add(key);
        groups.push(point);
        placed = true;
        break;
      }
      if (placed) continue;
      // Keep overflow at its reference rather than creating a group or moving farther.
      groups.push({ id, x: anchor.x, y: anchor.y, anchorX: anchor.x, anchorY: anchor.y, spacing });
    }
  }
  return groups;
}

/** Each record stays an individual colored dot, even when coordinates overlap. */
export function referenceDots(anchors: ScreenAnchor[]): SpreadPoint[] {
  return anchors.map((anchor) => ({
    ...anchor,
    anchorX: anchor.x,
    anchorY: anchor.y,
    spacing: 8.5,
  }));
}
