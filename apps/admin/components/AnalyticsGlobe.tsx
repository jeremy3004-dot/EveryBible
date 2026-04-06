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
  translationBreakdown?: TranslationBreakdownEntry[];
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
    0,
    'rgba(8, 16, 24, 0)',
    0.08,
    'rgba(59, 130, 246, 0.18)',
    0.22,
    'rgba(56, 189, 248, 0.32)',
    0.4,
    'rgba(52, 211, 153, 0.48)',
    0.58,
    'rgba(250, 204, 21, 0.58)',
    0.76,
    'rgba(251, 146, 60, 0.74)',
    0.92,
    'rgba(248, 113, 113, 0.86)',
    1,
    'rgba(185, 28, 28, 0.92)',
  ]);

  map.setPaintProperty(CIRCLE_LAYER_ID, 'circle-radius', [
    'interpolate',
    ['linear'],
    ['to-number', ['get', metricProperty]],
    0,
    8,
    safeMax * 0.25,
    14,
    safeMax * 0.6,
    24,
    safeMax,
    34,
  ]);
  map.setPaintProperty(CIRCLE_LAYER_ID, 'circle-color', [
    'interpolate',
    ['linear'],
    ['to-number', ['get', metricProperty]],
    0,
    '#dbeafe',
    safeMax * 0.2,
    '#7dd3fc',
    safeMax * 0.4,
    '#34d399',
    safeMax * 0.65,
    '#fde047',
    safeMax * 0.85,
    '#fb923c',
    safeMax,
    '#ef4444',
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
  translationBreakdown,
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
  const [theme, setTheme] = useState<AdminThemeMode>(getDocumentTheme);
  const [mode, setMode] = useState<MapMetricMode>('listeningMinutes');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [selectedTranslation, setSelectedTranslation] = useState<string | null>(null);

  const activeBreakdown = useMemo(() => {
    if (!selectedTranslation || !translationBreakdown?.length) return null;
    return translationBreakdown.find((entry) => entry.translationId === selectedTranslation) ?? null;
  }, [selectedTranslation, translationBreakdown]);

  // Use filtered metrics when a translation is selected
  const effectiveMetrics = activeBreakdown?.countryMetrics ?? metrics;
  const effectiveHeatmapPoints =
    activeBreakdown?.locationMetrics ?? (heatmapPoints && heatmapPoints.length > 0 ? heatmapPoints : metrics);
  const effectiveListeningTotal = activeBreakdown?.listeningMinutes ?? listeningTotalMinutes;

  // Use actual listening location points for the map when available;
  // fall back to country centroids so the map is never empty.
  const mapPoints = effectiveHeatmapPoints;

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
      const activeCountryCount = activeBreakdown.countryMetrics.filter(
        (metric) => metric.listeningMinutes > 0 || metric.downloadUnits > 0
      ).length;
      return {
        activeCountryCount,
        listeningMinutes: activeBreakdown.listeningMinutes,
        listenerCount: activeBreakdown.countryMetrics.reduce((sum, m) => sum + m.listenerCount, 0),
        downloadUnits: activeBreakdown.downloadUnits,
      };
    }

    const activeCountryCount = effectiveMetrics.filter(
      (metric) => metric.listeningMinutes > 0 || metric.downloadUnits > 0
    ).length;

    return {
      activeCountryCount,
      // Use the true total (includes anonymous events with no geo data) when
      // available. Falling back to the country sum makes unattributed minutes
      // invisible even though they are real listening time.
      listeningMinutes:
        effectiveListeningTotal ??
        effectiveMetrics.reduce((sum, metric) => sum + metric.listeningMinutes, 0),
      listenerCount: effectiveMetrics.reduce((sum, metric) => sum + metric.listenerCount, 0),
      downloadUnits: effectiveMetrics.reduce((sum, metric) => sum + metric.downloadUnits, 0),
    };
  }, [effectiveMetrics, effectiveListeningTotal, activeBreakdown]);

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
      dragRotate: false,
      maxBounds: WORLD_BOUNDS,
      pitch: 12,
      minZoom: 1,
      pitchWithRotate: false,
      renderWorldCopies: false,
      style: initialStyle,
      zoom: INITIAL_ZOOM,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('style.load', () => {
      readyRef.current = true;
      syncVisualizationLayers(map);
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
        )}
      </div>

      <div className="globe-card__content">
        <div
          ref={containerRef}
          className="globe-card__viewer"
          aria-label="Global usage heatmap"
        />

        <aside className="globe-card__panel">
          <div className="globe-card__summary">
            <p className="eyebrow">Coverage snapshot</p>
            <div className="globe-card__summary-grid" aria-label="Coverage summary">
              <div>
                <span>Countries</span>
                <strong>{overviewMetrics.activeCountryCount}</strong>
              </div>
              <div>
                <span>Listeners</span>
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
