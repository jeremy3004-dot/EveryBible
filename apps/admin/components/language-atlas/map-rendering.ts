import type { ExpressionSpecification, Map as LibreMap } from 'maplibre-gl';
import type { AtlasFeatures } from '../../lib/language-atlas/model';
import { SCRIPTURE_PRESENTATION } from '../../lib/language-atlas/presentation';
import type { AtlasDisplayMode, AtlasMapPadding } from '../../lib/language-atlas/types';
import type { AdminThemeMode } from '../../lib/theme';

export const ATLAS_SOURCE_ID = 'language-atlas-records';
export const ATLAS_CLUSTER_RADIUS = 50;
export const ATLAS_CLUSTER_MAX_ZOOM = 4;
export const ATLAS_BASEMAP_COLORS = {
  light: {
    canvas: '#ffffff',
    water: '#dbe3e8',
    border: '#cbd5e1',
    label: '#475569',
  },
  dark: {
    canvas: '#09090b',
    water: '#1e293b',
    border: '#334155',
    label: '#cbd5e1',
  },
} as const;

export function atlasSourceOptions(data: AtlasFeatures, displayMode: AtlasDisplayMode) {
  return {
    type: 'geojson' as const,
    data,
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

export function atlasScriptureColorExpression(): ExpressionSpecification {
  return [
    'match',
    ['get', 'category'],
    'bible',
    SCRIPTURE_PRESENTATION.bible.color,
    'nt',
    SCRIPTURE_PRESENTATION.nt.color,
    'portions',
    SCRIPTURE_PRESENTATION.portions.color,
    'no-scripture',
    SCRIPTURE_PRESENTATION['no-scripture'].color,
    'unknown',
    SCRIPTURE_PRESENTATION.unknown.color,
    SCRIPTURE_PRESENTATION.unknown.color,
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
        map.setPaintProperty(layer.id, 'background-color', colors.canvas);
      } else if (layer.type === 'fill' && /water|ocean|sea|marine|bathym/i.test(layer.id)) {
        map.setPaintProperty(layer.id, 'fill-color', colors.water);
      } else if (layer.type === 'fill') {
        map.setPaintProperty(layer.id, 'fill-color', colors.canvas);
      } else if (layer.type === 'line') {
        map.setPaintProperty(layer.id, 'line-color', colors.border);
      } else if (layer.type === 'symbol') {
        map.setPaintProperty(layer.id, 'text-color', colors.label);
        map.setPaintProperty(layer.id, 'text-halo-color', colors.canvas);
      }
    } catch {
      // Basemap styles do not all support every paint property.
    }
  }
}
