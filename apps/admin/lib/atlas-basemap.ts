import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';
import type { AdminThemeMode } from './theme';

export const LIGHT_MAP_STYLE_URL = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
export const DARK_MAP_STYLE_URL =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
// Every Language map chrome. Hex mirrors of the --map-* tokens in
// packages/brand/tokens.css: MapLibre's colour parser predates the
// space-separated hsl() syntax the stylesheets use, so the values are resolved
// here. Land sits a clear step above water in both themes so continents read at
// arm's length instead of dissolving into the sphere.
export const GLOBE_CHROME = {
  light: {
    water: '#d5dde2', // --map-water hsl(200 18% 86%)
    land: '#edece8', //  --map-land  hsl(45 13% 92%)
    border: '#d2cec6', // --border   hsl(42 12% 80%)
    label: '#69624f', //  --muted-foreground hsl(45 14% 36%)
    sky: '#f0ece5', //    --background hsl(40 26% 92%)
    horizon: '#0099e6', //--primary    hsl(200 100% 45%)
  },
  dark: {
    water: '#0a0d0f', // --map-water hsl(210 20% 5%)
    land: '#1d1b16', //  --map-land  hsl(40 12% 10%)
    border: '#3d382e', // --border   hsl(40 14% 21%)
    label: '#b0a99b', //  --muted-foreground hsl(40 12% 65%)
    sky: '#11110d', //    --background hsl(48 14% 6%)
    horizon: '#35a7e9', //--primary    hsl(202 80% 56%)
  },
} as const;

export function applyBasemapContrast(map: MapLibreMap, theme: AdminThemeMode) {
  const chrome = GLOBE_CHROME[theme === 'dark' ? 'dark' : 'light'];
  const GLOBE_OCEAN = chrome.water;
  const GLOBE_LAND = chrome.land;
  const GLOBE_BORDER = chrome.border;
  const GLOBE_LABEL = chrome.label;
  const style = map.getStyle();
  if (!style?.layers) return;

  for (const layer of style.layers) {
    const id = layer.id;
    // Only repaint basemap layers; keep data-layer colors intact.
    if (
      'source' in layer &&
      typeof layer.source === 'string' &&
      map.getSource(layer.source)?.type === 'geojson'
    )
      continue;
    try {
      if (layer.type === 'background') {
        // Background is the land base showing through where there is no water.
        map.setPaintProperty(id, 'background-color', GLOBE_LAND);
      } else if (layer.type === 'fill' && /water|ocean|sea|marine|bathym/i.test(id)) {
        map.setPaintProperty(id, 'fill-color', GLOBE_OCEAN);
      } else if (layer.type === 'fill') {
        map.setPaintProperty(id, 'fill-color', GLOBE_LAND);
      } else if (layer.type === 'line') {
        map.setPaintProperty(id, 'line-color', GLOBE_BORDER);
      } else if (layer.type === 'symbol') {
        map.setPaintProperty(id, 'text-color', GLOBE_LABEL);
        map.setPaintProperty(id, 'text-halo-color', GLOBE_LAND);
      }
    } catch {
      // Some layers don't carry the property we tried to set — safe to skip.
    }
  }
}

/**
 * Own cancellation before starting a style request. MapLibre 5.21's URL loader
 * creates its controller after an await, allowing a StrictMode teardown to miss
 * it. Its JSON loader installs frame cancellation synchronously instead.
 */
export async function loadAtlasBasemap(
  map: { setStyle: (style: StyleSpecification) => unknown },
  theme: AdminThemeMode,
  signal: AbortSignal
): Promise<void> {
  if (signal.aborted) return;
  const response = await fetch(theme === 'dark' ? DARK_MAP_STYLE_URL : LIGHT_MAP_STYLE_URL, {
    signal,
  });
  if (!response.ok) throw new Error('The basemap style could not load.');
  const style = (await response.json()) as StyleSpecification;
  if (!signal.aborted) map.setStyle(style);
}
