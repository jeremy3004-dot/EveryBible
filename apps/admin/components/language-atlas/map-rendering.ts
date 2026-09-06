import type { ExpressionSpecification, Map as LibreMap } from 'maplibre-gl';
import type { AtlasFeatures } from '../../lib/language-atlas/model';
import { SCRIPTURE_COLORS } from '../../lib/language-atlas/presentation';
import type { AtlasDisplayMode, AtlasMapPadding } from '../../lib/language-atlas/types';
import type { AdminThemeMode } from '../../lib/theme';

export const ATLAS_SOURCE_ID = 'language-atlas-records';
export const EMPTY_ATLAS_FEATURES: AtlasFeatures = { type: 'FeatureCollection', features: [] };
export const ATLAS_CLUSTER_RADIUS = 50;
export const ATLAS_CLUSTER_MAX_ZOOM = 4;
// FIELD chrome mirrored from the canonical --background, --map-land,
// --map-water, --border, and --muted-foreground tokens for MapLibre.
export const ATLAS_BASEMAP_COLORS = {
  light: {
    canvas: '#f0ece5',
    land: '#edece8',
    water: '#d5dde2',
    border: '#d2cec6',
    label: '#69624f',
  },
  dark: {
    canvas: '#11110d',
    land: '#1d1b16',
    water: '#0a0d0f',
    border: '#3d382e',
    label: '#b0a99b',
  },
} as const;

export function atlasSourceOptions(data: AtlasFeatures, displayMode: AtlasDisplayMode) {
  return {
    type: 'geojson' as const,
    data: displayMode === 'spread' ? EMPTY_ATLAS_FEATURES : data,
    cluster: displayMode === 'clustered',
    clusterRadius: ATLAS_CLUSTER_RADIUS,
    clusterMaxZoom: ATLAS_CLUSTER_MAX_ZOOM,
  };
}

export function applyAtlasDisplayMode(
  source: { setClusterOptions: (options: { cluster?: boolean }) => unknown },
  currentMode: AtlasDisplayMode,
  nextMode: AtlasDisplayMode
) {
  if (currentMode === nextMode) return false;
  source.setClusterOptions({ cluster: nextMode === 'clustered' });
  return true;
}

export function atlasControlInsets(padding: AtlasMapPadding) {
  return {
    left: padding.left + 14,
    bottom: padding.bottom + 14,
  };
}

export function resolveReadyAtlasMap<T>(activeMap: T | null, readyMap: T | null): T | null {
  return activeMap !== null && activeMap === readyMap ? activeMap : null;
}

export function atlasScriptureColorExpression(
  theme: AdminThemeMode = 'light'
): ExpressionSpecification {
  const colors = SCRIPTURE_COLORS[theme];
  return [
    'match',
    ['get', 'category'],
    'bible',
    colors.bible,
    'nt',
    colors.nt,
    'portions',
    colors.portions,
    'no-scripture',
    colors['no-scripture'],
    'unknown',
    colors.unknown,
    colors.unknown,
  ];
}

export function applyAtlasBasemapContrast(
  map: Pick<LibreMap, 'getSource' | 'getStyle' | 'setPaintProperty' | 'setSky'>,
  theme: AdminThemeMode
) {
  const colors = ATLAS_BASEMAP_COLORS[theme === 'dark' ? 'dark' : 'light'];
  map.setSky({
    'sky-color': colors.canvas,
    'horizon-color': colors.canvas,
    'fog-color': colors.canvas,
    'sky-horizon-blend': 0,
    'horizon-fog-blend': 0,
    'atmosphere-blend': 0,
  });
  const style = map.getStyle();
  if (!style?.layers) return;

  for (const layer of style.layers) {
    if (
      'source' in layer &&
      typeof layer.source === 'string' &&
      map.getSource(layer.source)?.type === 'geojson'
    )
      continue;
    try {
      if (layer.type === 'background') {
        map.setPaintProperty(layer.id, 'background-color', colors.land);
      } else if (layer.type === 'fill' && /water|ocean|sea|marine|bathym/i.test(layer.id)) {
        map.setPaintProperty(layer.id, 'fill-color', colors.water);
      } else if (layer.type === 'fill') {
        map.setPaintProperty(layer.id, 'fill-color', colors.land);
      } else if (layer.type === 'line') {
        map.setPaintProperty(layer.id, 'line-color', colors.border);
      } else if (layer.type === 'symbol') {
        map.setPaintProperty(layer.id, 'text-color', colors.label);
        map.setPaintProperty(layer.id, 'text-halo-color', colors.land);
      }
    } catch {
      // Basemap styles do not all support every paint property.
    }
  }
}
