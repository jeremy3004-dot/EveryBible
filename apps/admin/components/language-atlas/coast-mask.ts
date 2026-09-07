import type { Map as LibreMap } from 'maplibre-gl';

/** Rasterize the basemap's visible water polygons once per settled view, not per dot. */
export function createCoastMask(map: LibreMap, width: number, height: number) {
  const layers =
    map
      .getStyle()
      ?.layers.filter(
        (layer) => layer.type === 'fill' && /water|ocean|sea|marine|bathym/i.test(layer.id)
      )
      .map((layer) => layer.id) ?? [];
  // Missing tiles are not evidence of land. Keep records at their reference until ready.
  if (!layers.length || !map.areTilesLoaded()) return null;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  const center = map.getCenter().lng;
  const wrap = (lng: number) => lng + 360 * Math.round((center - lng) / 360);
  for (const feature of map.queryRenderedFeatures(undefined, { layers })) {
    const geometry = feature.geometry;
    const polygons =
      geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : geometry.type === 'MultiPolygon'
          ? geometry.coordinates
          : [];
    for (const polygon of polygons) {
      context.beginPath();
      for (const ring of polygon) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i],
            b = ring[(i + 1) % ring.length];
          const lng = wrap(a[0]);
          const nextLng = b[0] + 360 * Math.round((lng - b[0]) / 360);
          // Subdivide long tile edges so globe coast masks follow projected curves.
          const steps = Math.max(
            1,
            Math.ceil(Math.max(Math.abs(nextLng - lng), Math.abs(b[1] - a[1])) / 0.25)
          );
          for (let j = 0; j < steps; j++) {
            const p = map.project([
              lng + ((nextLng - lng) * j) / steps,
              a[1] + ((b[1] - a[1]) * j) / steps,
            ]);
            if (i === 0 && j === 0) context.moveTo(p.x, p.y);
            else context.lineTo(p.x, p.y);
          }
        }
        context.closePath();
      }
      context.fill('evenodd');
    }
  }
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  return (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < canvas.width &&
    y < canvas.height &&
    pixels[(Math.floor(y) * canvas.width + Math.floor(x)) * 4 + 3] === 0;
}
