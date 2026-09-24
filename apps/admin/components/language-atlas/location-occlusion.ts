import type { LngLat, Map as LibreMap } from 'maplibre-gl';

// MapLibre 6 keeps its occlusion test on the camera transform behind the private `_camera`
// and exposes no public equivalent yet. It is the same test MapLibre's own Marker uses, so it
// is used while it is there; everything below keeps the atlas working if an upgrade moves it.

interface PrivateCamera {
  transform?: { isLocationOccluded?: (lngLat: LngLat) => boolean };
}

export type OcclusionMap = Pick<LibreMap, 'getCenter' | 'getProjection'> & {
  _camera?: PrivateCamera;
};

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** The cosine of the arc between two points on the sphere; negative beyond 90 degrees. */
function arcCosine(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const [latA, latB] = [toRadians(a.lat), toRadians(b.lat)];
  return (
    Math.sin(latA) * Math.sin(latB) +
    Math.cos(latA) * Math.cos(latB) * Math.cos(toRadians(a.lng - b.lng))
  );
}

/**
 * Whether the globe lies between the camera and `lngLat`. Without MapLibre's private test it
 * hides the hemisphere facing away from the view centre: exact at the far side, and it lets
 * through a thin band just past the horizon, which is drawn rather than lost.
 */
export function isLocationOccluded(map: OcclusionMap, lngLat: LngLat): boolean {
  const privateTest = map._camera?.transform?.isLocationOccluded;
  if (typeof privateTest === 'function') {
    return privateTest.call(map._camera?.transform, lngLat);
  }
  if (map.getProjection()?.type !== 'globe') return false;
  return arcCosine(map.getCenter(), lngLat) < 0;
}
