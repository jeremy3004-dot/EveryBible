'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import maplibregl, {
  type GeoJSONSource,
  type Map as MapLibreMap,
  type Popup as MapLibrePopup,
} from 'maplibre-gl';

import type { CountryMetric, TranslationBreakdownEntry } from '@/lib/analytics-reporting';
import { normalizeAdminTheme, type AdminThemeMode } from '@/lib/theme';

type MapMetricMode = 'listeningMinutes' | 'downloadUnits';

interface AnalyticsGlobeProps {
  heatmapPoints?: CountryMetric[];
  metrics: CountryMetric[];
  listeningTotalMinutes?: number;
  // Phase 1 (metric truth): authoritative counts from the RPC for the unfiltered
  // coverage snapshot, so the globe never derives them from map buckets. Countries
  // = distinct ISO codes; located listeners = distinct listeners with geo.
  authoritativeCountryCount?: number;
  authoritativeLocatedListeners?: number;
  translationBreakdown?: TranslationBreakdownEntry[];
  // Controlled translation filter (P3 S17): when a parent supplies both of these
  // it owns the filter and sibling views (e.g. the country totals table) stay in
  // sync; when omitted the globe manages its own filter internally.
  selectedTranslation?: string | null;
  onSelectedTranslationChange?: (translationId: string | null) => void;
}

interface MetricFeatureProperties {
  countryCode: string;
  countryName: string;
  downloadUnits: number;
  listenerCount: number;
  listeningMinutes: number;
}

interface MetricFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: MetricFeatureProperties;
}

interface MetricFeatureCollection {
  type: 'FeatureCollection';
  features: MetricFeature[];
}

const LIGHT_MAP_STYLE_URL = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const DARK_MAP_STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const METRIC_SOURCE_ID = 'country-metrics';
const HEAT_LAYER_ID = 'country-metrics-heat';
const CIRCLE_LAYER_ID = 'country-metrics-circles';
const HIT_LAYER_ID = 'country-metrics-hit-area';
const INITIAL_CENTER: [number, number] = [12, 18];
const INITIAL_ZOOM = 3.3;
const WORLD_BOUNDS: [[number, number], [number, number]] = [
  [-170, -58],
  [180, 82],
];

// Warm-ink basemap contrast (Phase 2). CartoCDN Dark Matter renders land and
// ocean at almost the same near-black luminance, so continents are invisible
// against the dashboard. We lift land a full step above ocean in the brand's
// warm-ink family so the sphere reads at arm's length.
const GLOBE_OCEAN = '#141210';
const GLOBE_LAND = '#2a2521';
const GLOBE_BORDER = 'rgba(242, 237, 227, 0.16)';
const GLOBE_LABEL = '#a8a094';

function applyBasemapContrast(map: MapLibreMap, theme: AdminThemeMode) {
  if (theme !== 'dark') return;
  const style = map.getStyle();
  if (!style?.layers) return;

  for (const layer of style.layers) {
    const id = layer.id;
    try {
      if (layer.type === 'background') {
        // Background is the land base showing through where there is no water.
        map.setPaintProperty(id, 'background-color', GLOBE_LAND);
      } else if (layer.type === 'fill' && /water|ocean|sea|marine|bathym/i.test(id)) {
        map.setPaintProperty(id, 'fill-color', GLOBE_OCEAN);
      } else if (
        layer.type === 'fill' &&
        /(land|earth|park|wood|forest|grass|landcover|landuse|glacier|sand)/i.test(id)
      ) {
        map.setPaintProperty(id, 'fill-color', GLOBE_LAND);
      } else if (layer.type === 'line' && /(boundary|admin|border)/i.test(id)) {
        map.setPaintProperty(id, 'line-color', GLOBE_BORDER);
      } else if (layer.type === 'symbol') {
        map.setPaintProperty(id, 'text-color', GLOBE_LABEL);
      }
    } catch {
      // Some layers don't carry the property we tried to set — safe to skip.
    }
  }
}

// Faint warm atmosphere so the globe reads as a lit object floating on the page,
// not a hole in it. Wrapped defensively: setSky is a MapLibre 5.x surface and we
// never want an unsupported key to blank the map.
function applyGlobeAtmosphere(map: MapLibreMap) {
  try {
    (map as unknown as { setSky: (spec: Record<string, unknown>) => void }).setSky({
      'sky-color': '#161412',
      'horizon-color': '#3a2620',
      'fog-color': '#161412',
      'fog-ground-blend': 0.6,
      'horizon-fog-blend': 0.5,
      'sky-horizon-blend': 0.8,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.9, 5, 0.35],
    });
  } catch {
    // setSky unavailable in this build — the globe still renders fine without it.
  }
}

// Weighted (by listening minutes) centroid so the camera opens over where the
// data actually is (South-Asia-heavy today) rather than the mid-Atlantic/Sahara.
function computeWeightedCentroid(
  metrics: Array<{ latitude: number; longitude: number; listeningMinutes: number; downloadUnits: number }>
): [number, number] | null {
  let latAcc = 0;
  let lngAcc = 0;
  let weightAcc = 0;
  for (const metric of metrics) {
    const weight = Math.max(metric.listeningMinutes, metric.downloadUnits, 0);
    if (weight <= 0) continue;
    latAcc += metric.latitude * weight;
    lngAcc += metric.longitude * weight;
    weightAcc += weight;
  }
  if (weightAcc <= 0) return null;
  return [lngAcc / weightAcc, latAcc / weightAcc];
}

function getMapStyleUrl(theme: AdminThemeMode): string {
  return theme === 'dark' ? DARK_MAP_STYLE_URL : LIGHT_MAP_STYLE_URL;
}

function getDocumentTheme(): AdminThemeMode {
  if (typeof document === 'undefined') {
    return 'light';
  }

  return normalizeAdminTheme(document.documentElement.dataset.theme);
}

function getMetricProperty(mode: MapMetricMode): 'listeningMinutes' | 'downloadUnits' {
  return mode;
}

function getMetricValue(metric: CountryMetric, mode: MapMetricMode): number {
  return metric[getMetricProperty(mode)];
}

function formatMetricValue(metric: CountryMetric, mode: MapMetricMode): string {
  if (mode === 'downloadUnits') {
    return `${metric.downloadUnits} downloads`;
  }

  return `${Math.round(metric.listeningMinutes)} listening min`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(value));
}

function getModeLabel(mode: MapMetricMode): string {
  return mode === 'downloadUnits' ? 'downloads' : 'listening minutes';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildMetricsFeatureCollection(metrics: CountryMetric[]): MetricFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: metrics.map((metric) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [metric.longitude, metric.latitude],
      },
      properties: {
        countryCode: metric.code,
        countryName: metric.name,
        downloadUnits: metric.downloadUnits,
        listenerCount: metric.listenerCount,
        listeningMinutes: metric.listeningMinutes,
      },
    })),
  };
}

function updateVisualizationLayers(map: MapLibreMap, mode: MapMetricMode, maxMetricValue: number) {
  const metricProperty = getMetricProperty(mode);
  const safeMax = Math.max(maxMetricValue, 1);

  map.setPaintProperty(HEAT_LAYER_ID, 'heatmap-weight', [
    'interpolate',
    ['linear'],
    ['to-number', ['get', metricProperty]],
    0,
    0,
    safeMax,
    1,
  ]);
  map.setPaintProperty(HEAT_LAYER_ID, 'heatmap-radius', [
    'interpolate',
    ['linear'],
    ['zoom'],
    0,
    16,
    2,
    24,
    4,
    38,
  ]);
  map.setPaintProperty(HEAT_LAYER_ID, 'heatmap-intensity', [
    'interpolate',
    ['linear'],
    ['zoom'],
    0,
    0.45,
    3,
    0.9,
    5,
    1.2,
  ]);
  map.setPaintProperty(HEAT_LAYER_ID, 'heatmap-color', [
    'interpolate',
    ['linear'],
    ['heatmap-density'],
    // Ember heat ramp (brand-unified): transparent → parchment → amber → ember → deep.
    0,
    'rgba(20, 18, 16, 0)',
    0.1,
    'rgba(208, 194, 175, 0.22)',
    0.3,
    'rgba(208, 163, 90, 0.4)',
    0.55,
    'rgba(217, 108, 87, 0.6)',
    0.8,
    'rgba(217, 108, 87, 0.8)',
    1,
    'rgba(184, 84, 65, 0.92)',
  ]);

  map.setPaintProperty(CIRCLE_LAYER_ID, 'circle-radius', [
    'interpolate',
    ['linear'],
    ['to-number', ['get', metricProperty]],
    // Front-loaded (sqrt-like) stops so mid-tier countries read as mid-tier
    // instead of collapsing to the min dot under a linear scale on skewed data.
    0,
    7,
    safeMax * 0.04,
    13,
    safeMax * 0.15,
    19,
    safeMax * 0.45,
    27,
    safeMax,
    36,
  ]);
  map.setPaintProperty(CIRCLE_LAYER_ID, 'circle-color', [
    'interpolate',
    ['linear'],
    ['to-number', ['get', metricProperty]],
    // Ember heat ramp (brand-unified): parchment → amber → ember → deep.
    0,
    '#d0c2af',
    safeMax * 0.35,
    '#d0a35a',
    safeMax * 0.7,
    '#D96C57',
    safeMax,
    '#B85441',
  ]);
  map.setPaintProperty(HIT_LAYER_ID, 'circle-radius', [
    'interpolate',
    ['linear'],
    ['to-number', ['get', metricProperty]],
    0,
    18,
    safeMax,
    42,
  ]);
}

export function AnalyticsGlobe({
  heatmapPoints,
  metrics,
  listeningTotalMinutes,
  authoritativeCountryCount,
  authoritativeLocatedListeners,
  translationBreakdown,
  selectedTranslation: selectedTranslationProp,
  onSelectedTranslationChange,
}: AnalyticsGlobeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<MapLibrePopup | null>(null);
  const readyRef = useRef(false);
  const currentStyleUrlRef = useRef(getMapStyleUrl('light'));
  const latestMetricsRef = useRef(metrics);
  const latestFeatureCollectionRef = useRef<MetricFeatureCollection>(buildMetricsFeatureCollection(metrics));
  const latestMaxMetricValueRef = useRef(1);
  const modeRef = useRef<MapMetricMode>('listeningMinutes');
  const themeRef = useRef<AdminThemeMode>(getDocumentTheme());
  const hasFlownRef = useRef(false);
  const [theme, setTheme] = useState<AdminThemeMode>(getDocumentTheme);
  const [mode, setMode] = useState<MapMetricMode>('listeningMinutes');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [internalTranslation, setInternalTranslation] = useState<string | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [showAllTranslations, setShowAllTranslations] = useState(false);
  const selectedTranslation =
    selectedTranslationProp !== undefined ? selectedTranslationProp : internalTranslation;
  const setSelectedTranslation = useCallback(
    (value: string | null) => {
      if (onSelectedTranslationChange) {
        onSelectedTranslationChange(value);
      } else {
        setInternalTranslation(value);
      }
    },
    [onSelectedTranslationChange]
  );

  const activeBreakdown = useMemo(() => {
    if (!selectedTranslation || !translationBreakdown?.length) return null;
    return translationBreakdown.find((entry) => entry.translationId === selectedTranslation) ?? null;
  }, [selectedTranslation, translationBreakdown]);

  const isSingleTranslationWindow = (translationBreakdown?.length ?? 0) === 1;
  const selectedTranslationHasGeoMetrics = Boolean(
    activeBreakdown &&
      (activeBreakdown.locationMetrics.length > 0 || activeBreakdown.countryMetrics.length > 0)
  );
  const reuseOverallMapForSelectedTranslation = Boolean(
    activeBreakdown && isSingleTranslationWindow && !selectedTranslationHasGeoMetrics
  );

  // Use filtered metrics when a translation is selected. If the selected
  // translation is the only active one in the window, reuse the overall map so
  // the operator can still inspect its geography even when per-translation geo
  // rows were not persisted for that period.
  const effectiveMetrics = reuseOverallMapForSelectedTranslation
    ? metrics
    : activeBreakdown?.countryMetrics ?? metrics;
  const effectiveHeatmapPoints = reuseOverallMapForSelectedTranslation
    ? heatmapPoints && heatmapPoints.length > 0
      ? heatmapPoints
      : metrics
    : activeBreakdown?.locationMetrics ?? (heatmapPoints && heatmapPoints.length > 0 ? heatmapPoints : metrics);
  const effectiveListeningTotal = activeBreakdown?.listeningMinutes ?? listeningTotalMinutes;

  // Downloads mode uses country-level metrics (which carry downloadUnits).
  // Listening mode uses GPS heatmap points for finer spatial resolution.
  const mapPoints = mode === 'downloadUnits' ? effectiveMetrics : effectiveHeatmapPoints;

  const rankedMetrics = useMemo(() => {
    return [...effectiveMetrics]
      .filter((metric) => getMetricValue(metric, mode) > 0)
      .sort((left, right) => getMetricValue(right, mode) - getMetricValue(left, mode));
  }, [effectiveMetrics, mode]);

  const activeSelectedCode = useMemo(() => {
    if (!selectedCode) {
      return null;
    }

    return rankedMetrics.some((metric) => metric.code === selectedCode)
      ? selectedCode
      : null;
  }, [rankedMetrics, selectedCode]);

  const selectedMetric = useMemo(() => {
    if (!activeSelectedCode) {
      return null;
    }

    return rankedMetrics.find((metric) => metric.code === activeSelectedCode) ?? null;
  }, [activeSelectedCode, rankedMetrics]);

  const featureCollection = useMemo(() => buildMetricsFeatureCollection(mapPoints), [mapPoints]);
  const maxMetricValue = useMemo(() => {
    return mapPoints.reduce((max, metric) => Math.max(max, getMetricValue(metric, mode)), 1);
  }, [mapPoints, mode]);

  const overviewMetrics = useMemo(() => {
    if (activeBreakdown) {
      // Filtered to one translation: count genuine per-country rows (not map
      // buckets), and take the RPC's authoritative per-translation listener
      // count (buildTranslationBreakdown no longer max-merges country rows).
      const activeCountryCount = activeBreakdown.countryTableMetrics.filter(
        (metric) => metric.listeningMinutes > 0 || metric.downloadUnits > 0
      ).length;
      return {
        activeCountryCount,
        listeningMinutes: activeBreakdown.listeningMinutes,
        listenerCount: activeBreakdown.listenerCount,
        downloadUnits: activeBreakdown.downloadUnits,
      };
    }

    // Unfiltered: prefer the RPC's authoritative scalars. "Countries" is the
    // distinct ISO-country count (NOT the number of lat/lng map buckets), and
    // "Listeners (located)" is the deduped distinct listener count with geo.
    const derivedCountryCount = effectiveMetrics.filter(
      (metric) => metric.listeningMinutes > 0 || metric.downloadUnits > 0
    ).length;

    return {
      activeCountryCount: authoritativeCountryCount ?? derivedCountryCount,
      // Use the true total (includes anonymous events with no geo data) when
      // available. Falling back to the country sum makes unattributed minutes
      // invisible even though they are real listening time.
      listeningMinutes:
        effectiveListeningTotal ??
        effectiveMetrics.reduce((sum, metric) => sum + metric.listeningMinutes, 0),
      listenerCount:
        authoritativeLocatedListeners ??
        effectiveMetrics.reduce((sum, metric) => sum + metric.listenerCount, 0),
      downloadUnits: effectiveMetrics.reduce((sum, metric) => sum + metric.downloadUnits, 0),
    };
  }, [
    effectiveMetrics,
    effectiveListeningTotal,
    activeBreakdown,
    authoritativeCountryCount,
    authoritativeLocatedListeners,
  ]);

  const topCountry = rankedMetrics[0] ?? null;
  const modeLabel = getModeLabel(mode);

  const syncVisualizationLayers = useCallback(
    (map: MapLibreMap) => {
      const latestFeatureCollection = latestFeatureCollectionRef.current;
      const latestMaxValue = latestMaxMetricValueRef.current;
      const currentTheme = themeRef.current;

      if (!map.getSource(METRIC_SOURCE_ID)) {
        map.addSource(METRIC_SOURCE_ID, {
          type: 'geojson',
          data: latestFeatureCollection,
        });
      } else {
        const source = map.getSource(METRIC_SOURCE_ID) as GeoJSONSource | undefined;
        source?.setData(latestFeatureCollection);
      }

      if (!map.getLayer(HEAT_LAYER_ID)) {
        map.addLayer({
          id: HEAT_LAYER_ID,
          source: METRIC_SOURCE_ID,
          type: 'heatmap',
          maxzoom: 5,
          paint: {
            'heatmap-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              0,
              0.82,
              4,
              0.58,
              5,
              0,
            ],
          },
        });
      }

      if (!map.getLayer(CIRCLE_LAYER_ID)) {
        map.addLayer({
          id: CIRCLE_LAYER_ID,
          source: METRIC_SOURCE_ID,
          type: 'circle',
          minzoom: 1.2,
          paint: {
            'circle-blur': 0.12,
            'circle-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              1.2,
              0.34,
              3,
              0.72,
            ],
            'circle-stroke-color': currentTheme === 'dark' ? '#0f172a' : '#f8fafc',
            'circle-stroke-opacity': currentTheme === 'dark' ? 0.7 : 0.85,
            'circle-stroke-width': 1.25,
          },
        });
      }

      if (!map.getLayer(HIT_LAYER_ID)) {
        map.addLayer({
          id: HIT_LAYER_ID,
          source: METRIC_SOURCE_ID,
          type: 'circle',
          minzoom: 1,
          paint: {
            'circle-color': '#ffffff',
            'circle-opacity': 0,
          },
        });
      }

      map.setProjection({ type: 'globe' });
      updateVisualizationLayers(map, modeRef.current, latestMaxValue);
    },
    []
  );

  const showMetricPopup = useCallback((metric: CountryMetric, shouldFly = false) => {
    const map = mapRef.current;
    if (!map || !readyRef.current) {
      return;
    }

    const currentMode = modeRef.current;

    if (!popupRef.current) {
      popupRef.current = new maplibregl.Popup({
        className: 'analytics-map-popup',
        closeButton: false,
        maxWidth: '260px',
        offset: 18,
      });
    }

    const popupHtml = `
      <div class="analytics-map-popup__body">
        <p class="analytics-map-popup__eyebrow">${escapeHtml(metric.code)}</p>
        <h4>${escapeHtml(metric.name)}</h4>
        <p class="analytics-map-popup__value">${escapeHtml(formatMetricValue(metric, currentMode))}</p>
        <dl>
          <div><dt>Listening</dt><dd>${Math.round(metric.listeningMinutes)} min</dd></div>
          <div><dt>Downloads</dt><dd>${metric.downloadUnits}</dd></div>
          <div><dt>Listeners</dt><dd>${metric.listenerCount}</dd></div>
        </dl>
      </div>
    `;

    popupRef.current
      .setLngLat([metric.longitude, metric.latitude])
      .setHTML(popupHtml)
      .addTo(map);

    if (shouldFly) {
      map.flyTo({
        center: [metric.longitude, metric.latitude],
        duration: 900,
        essential: true,
        zoom: Math.max(map.getZoom(), 2.35),
      });
    }
  }, []);

  useEffect(() => {
    latestMetricsRef.current = effectiveMetrics;
  }, [effectiveMetrics]);

  useEffect(() => {
    latestFeatureCollectionRef.current = featureCollection;
  }, [featureCollection]);

  useEffect(() => {
    latestMaxMetricValueRef.current = maxMetricValue;
  }, [maxMetricValue]);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const root = document.documentElement;
    const updateTheme = () => {
      const nextTheme = normalizeAdminTheme(root.dataset.theme);
      setTheme((currentTheme) => (currentTheme === nextTheme ? currentTheme : nextTheme));
    };

    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(root, {
      attributeFilter: ['data-theme'],
      attributes: true,
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const initialStyle = getMapStyleUrl(theme);
    currentStyleUrlRef.current = initialStyle;

    const map = new maplibregl.Map({
      attributionControl: {
        compact: true,
      },
      bearing: -8,
      center: INITIAL_CENTER,
      container: containerRef.current,
      // Re-enabled (Phase 2): operators can spin the globe and zoom into a region.
      dragRotate: true,
      maxBounds: WORLD_BOUNDS,
      pitch: 12,
      minZoom: 1,
      pitchWithRotate: false,
      renderWorldCopies: false,
      scrollZoom: true,
      style: initialStyle,
      zoom: INITIAL_ZOOM,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('style.load', () => {
      readyRef.current = true;
      applyBasemapContrast(map, themeRef.current);
      applyGlobeAtmosphere(map);
      syncVisualizationLayers(map);
      setIsMapReady(true);
    });

    map.on('click', HIT_LAYER_ID, (event) => {
      const countryCode = event.features?.[0]?.properties?.countryCode;
      if (typeof countryCode !== 'string') {
        return;
      }

      const metric = latestMetricsRef.current.find((entry) => entry.code === countryCode);
      if (!metric) {
        return;
      }

      setSelectedCode(countryCode);
      showMetricPopup(metric, true);
    });

    map.on('mouseenter', HIT_LAYER_ID, () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', HIT_LAYER_ID, () => {
      map.getCanvas().style.cursor = '';
    });

    mapRef.current = map;

    return () => {
      readyRef.current = false;
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [showMetricPopup, syncVisualizationLayers, theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) {
      return;
    }

    const nextStyle = getMapStyleUrl(theme);
    if (currentStyleUrlRef.current === nextStyle) {
      return;
    }

    currentStyleUrlRef.current = nextStyle;
    map.setStyle(nextStyle);
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) {
      return;
    }

    const source = map.getSource(METRIC_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(featureCollection);
    updateVisualizationLayers(map, mode, maxMetricValue);
  }, [featureCollection, maxMetricValue, mode]);

  useEffect(() => {
    if (!selectedMetric) {
      popupRef.current?.remove();
      return;
    }

    showMetricPopup(selectedMetric);
  }, [selectedMetric, showMetricPopup]);

  // Open the camera over the data's weighted centroid once the first metrics are
  // ready, so the globe doesn't greet the operator with an empty ocean.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady || hasFlownRef.current) {
      return;
    }
    const centroid = computeWeightedCentroid(effectiveMetrics);
    if (!centroid) {
      return;
    }
    hasFlownRef.current = true;
    map.flyTo({ center: centroid, zoom: 3.1, duration: 2200, essential: true });
  }, [isMapReady, effectiveMetrics]);

  // Slow idle auto-rotate (~6°/min-ish) that pauses the moment the operator
  // interacts and resumes after 10s of stillness. Respects reduced-motion.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady) {
      return;
    }
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    let spinning = true;

    const spin = () => {
      if (!spinning || !mapRef.current) return;
      map.easeTo({ bearing: map.getBearing() + 6, duration: 6000, easing: (t) => t });
    };

    const pause = () => {
      spinning = false;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        spinning = true;
        spin();
      }, 10000);
    };

    const canvas = map.getCanvas();
    canvas.addEventListener('mousedown', pause);
    canvas.addEventListener('wheel', pause, { passive: true });
    canvas.addEventListener('touchstart', pause, { passive: true });

    // Hold off until the intro fly-to (2.2s) has settled so they don't fight.
    const startTimer = setTimeout(() => {
      spin();
      interval = setInterval(spin, 6000);
    }, 2800);

    return () => {
      clearTimeout(startTimer);
      if (interval) clearInterval(interval);
      if (idleTimer) clearTimeout(idleTimer);
      canvas.removeEventListener('mousedown', pause);
      canvas.removeEventListener('wheel', pause);
      canvas.removeEventListener('touchstart', pause);
    };
  }, [isMapReady]);

  if (!effectiveMetrics.length) {
    return (
      <section className="globe-card globe-card--empty">
        <p>No coarse geography data is available yet.</p>
      </section>
    );
  }

  return (
    <section className="globe-card">
      <div className="globe-card__header">
        <div className="globe-card__title-stack">
          <Link href="/" className="globe-card__back-link">
            <span aria-hidden="true">←</span>
            Back to overview
          </Link>
          <div>
            <p className="eyebrow">Global map</p>
            <h3>World reach globe</h3>
          </div>
        </div>

        <div
          className="segmented-control"
          role="group"
          aria-label="Select globe metric"
        >
          <button
            type="button"
            className={`segmented-control__button ${
              mode === 'listeningMinutes' ? 'segmented-control__button--active' : ''
            }`.trim()}
            aria-pressed={mode === 'listeningMinutes'}
            onClick={() => setMode('listeningMinutes')}
          >
            Listening
          </button>
          <button
            type="button"
            className={`segmented-control__button ${
              mode === 'downloadUnits' ? 'segmented-control__button--active' : ''
            }`.trim()}
            aria-pressed={mode === 'downloadUnits'}
            onClick={() => setMode('downloadUnits')}
          >
            Downloads
          </button>
        </div>

        {translationBreakdown && translationBreakdown.length > 0 && (
          <>
            <div className="translation-selector-wrap">
              <label htmlFor="translation-select" className="translation-selector__label">
                Translation
              </label>
              <select
                id="translation-select"
                className="translation-selector"
                value={selectedTranslation ?? ''}
                onChange={(e) => setSelectedTranslation(e.target.value || null)}
              >
                <option value="">All translations</option>
                {translationBreakdown.map((entry) => (
                  <option key={entry.translationId} value={entry.translationId}>
                    {entry.translationId.toUpperCase()} — {Math.round(entry.listeningMinutes)} listen min, {Math.round(entry.readingMinutes)} read min
                  </option>
                ))}
              </select>
            </div>

            <div className="translation-chip-list" role="group" aria-label="Select translation heatmap">
              <button
                type="button"
                className={`translation-chip ${selectedTranslation === null ? 'translation-chip--active' : ''}`.trim()}
                aria-pressed={selectedTranslation === null}
                onClick={() => setSelectedTranslation(null)}
              >
                <span>All translations</span>
                <small>{Math.round(listeningTotalMinutes ?? 0)} listen min</small>
              </button>
              {(() => {
                const active = translationBreakdown.filter(
                  (entry) => entry.listeningMinutes > 0 || entry.downloadUnits > 0
                );
                const zero = translationBreakdown.filter(
                  (entry) => entry.listeningMinutes <= 0 && entry.downloadUnits <= 0
                );
                // Zero-activity translations (often the majority) bury the signal;
                // keep them one click away behind a "+N more" toggle. Always show a
                // zero translation if it's the current selection.
                const visibleZero = showAllTranslations
                  ? zero
                  : zero.filter((entry) => entry.translationId === selectedTranslation);
                const chips = [...active, ...visibleZero];
                return (
                  <>
                    {chips.map((entry) => (
                      <button
                        key={entry.translationId}
                        type="button"
                        className={`translation-chip ${
                          selectedTranslation === entry.translationId ? 'translation-chip--active' : ''
                        }`.trim()}
                        aria-pressed={selectedTranslation === entry.translationId}
                        onClick={() => setSelectedTranslation(entry.translationId)}
                      >
                        <span>{entry.translationId.toUpperCase()}</span>
                        <small>
                          {Math.round(entry.listeningMinutes)} listen min, {Math.round(entry.downloadUnits)} downloads
                        </small>
                      </button>
                    ))}
                    {zero.length > 0 && !showAllTranslations && zero.length !== visibleZero.length && (
                      <button
                        type="button"
                        className="translation-chip translation-chip--more"
                        onClick={() => setShowAllTranslations(true)}
                      >
                        <span>+{zero.length - visibleZero.length} more</span>
                        <small>no activity this window</small>
                      </button>
                    )}
                    {showAllTranslations && zero.length > 0 && (
                      <button
                        type="button"
                        className="translation-chip translation-chip--more"
                        onClick={() => setShowAllTranslations(false)}
                      >
                        <span>Show less</span>
                        <small>hide inactive</small>
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          </>
        )}
      </div>

      <div className="globe-card__content">
        <div className="globe-card__viewer-wrap">
          <div
            ref={containerRef}
            className="globe-card__viewer"
            aria-label="Global usage heatmap"
          />
          {!isMapReady && (
            <div className="globe-card__skeleton" aria-hidden="true">
              <div className="globe-card__skeleton-orb" />
            </div>
          )}
        </div>

        <aside className="globe-card__panel">
          <div className="globe-card__summary">
            <p className="eyebrow">Coverage snapshot</p>
            <div className="globe-card__summary-grid" aria-label="Coverage summary">
              <div>
                <span>Countries</span>
                <strong>{overviewMetrics.activeCountryCount}</strong>
              </div>
              <div>
                <span>{activeBreakdown ? 'Listeners' : 'Listeners (located)'}</span>
                <strong>{formatNumber(overviewMetrics.listenerCount)}</strong>
              </div>
              <div>
                <span>Listening min</span>
                <strong>{formatNumber(overviewMetrics.listeningMinutes)}</strong>
              </div>
              <div>
                <span>Downloads</span>
                <strong>{formatNumber(overviewMetrics.downloadUnits)}</strong>
              </div>
            </div>
          </div>

          <div className="globe-card__legend-card">
            <div className="globe-card__legend" aria-hidden="true">
              <span>Lower</span>
              <div className="globe-card__legend-bar" />
              <span>Higher</span>
            </div>
            <p>Colors intensify from low to high values in the selected metric.</p>
          </div>

          {activeBreakdown ? (
            <div className="globe-card__notice" role="status">
              <p className="eyebrow">Translation focus</p>
              {reuseOverallMapForSelectedTranslation ? (
                <p>
                  {activeBreakdown.translationId.toUpperCase()} is the only active translation in this window, so the
                  globe is reusing the overall map while the per-translation geo rows catch up.
                </p>
              ) : selectedTranslationHasGeoMetrics ? (
                <p>
                  The globe and coverage cards are now filtered to {activeBreakdown.translationId.toUpperCase()}.
                </p>
              ) : (
                <p>
                  {activeBreakdown.translationId.toUpperCase()} has engagement totals, but no location-tagged events
                  were stored for this window yet.
                </p>
              )}
            </div>
          ) : null}

          <div className="globe-card__explore">
            <p className="eyebrow">Explore</p>
            {topCountry ? (
              <>
                <h4>
                  {topCountry.name} leads in {modeLabel}.
                </h4>
                <p>
                  Click a country bubble to open the detailed country card and compare listening,
                  downloads, and listeners.
                </p>
              </>
            ) : (
              <>
                <h4>Click any country to open its detail card.</h4>
                <p>Use the globe to drill into the geography data.</p>
              </>
            )}
          </div>

          {selectedMetric ? (
            <div className="globe-card__selected">
              <p className="eyebrow">Selected country</p>
              <h4>
                {selectedMetric.name} <span>{selectedMetric.code}</span>
              </h4>
              <p>{formatMetricValue(selectedMetric, mode)}</p>
              <dl>
                <div>
                  <dt>Listening</dt>
                  <dd>{Math.round(selectedMetric.listeningMinutes)} min</dd>
                </div>
                <div>
                  <dt>Downloads</dt>
                  <dd>{selectedMetric.downloadUnits}</dd>
                </div>
                <div>
                  <dt>Listeners</dt>
                  <dd>{selectedMetric.listenerCount}</dd>
                </div>
              </dl>
            </div>
          ) : null}

        </aside>
      </div>
    </section>
  );
}
