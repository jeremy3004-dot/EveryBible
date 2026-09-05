'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import type { CountryMetric } from '@/lib/analytics-reporting';
import {
  buildAtlasFeatures,
  formatNumber,
  metricLabel,
  pointId,
  type AtlasMetric,
} from '@/lib/analytics-atlas';
import { normalizeAdminTheme, type AdminThemeMode } from '@/lib/theme';

import {
  LIGHT_MAP_STYLE_URL,
  DARK_MAP_STYLE_URL,
  GLOBE_CHROME,
  applyBasemapContrast,
} from '@/lib/atlas-basemap';
const METRIC_SOURCE_ID = 'country-metrics';
const HEAT_LAYER_ID = 'country-metrics-heat';
const CIRCLE_LAYER_ID = 'country-metrics-circles';
const HIT_LAYER_ID = 'country-metrics-hit-area';
const INITIAL_CENTER: [number, number] = [12, 18];
const INITIAL_ZOOM = 1.4;
const WORLD_BOUNDS: [[number, number], [number, number]] = [
  [-170, -58],
  [180, 82],
];

// Intensity ramp, low → high: blue → teal → yellow → orange → red. Hex mirror
// of --heat-1..5 in app/globals.css; the legend bar in el-field.css draws the
// same five stops, so the bar and the map always agree. Red is the highest
// value, not a brand or error colour.
const GLOBE_HEAT = {
  light: ['#0099e6', '#239f8c', '#db9b1a', '#db6a24', '#c32232'],
  dark: ['#35a7e9', '#36c9b3', '#efb748', '#eb8647', '#e34f5b'],
} as const;

interface AtlasProps {
  points: CountryMetric[];
  countries: CountryMetric[];
  mode: AtlasMetric;
  selectedCountry: string | null;
  onSelectCountry: (code: string | null) => void;
}

export function AnalyticsGlobe({
  points,
  countries,
  mode,
  selectedCountry,
  onSelectCountry,
}: AtlasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const styleReadyRef = useRef(false);
  const lastFittedPointsRef = useRef<CountryMetric[] | null>(null);
  const [theme, setTheme] = useState<AdminThemeMode>('light');
  const [projection, setProjection] = useState<'mercator' | 'globe'>('mercator');
  const [layer, setLayer] = useState<'heat' | 'points'>('heat');
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const scopedPoints = useMemo(
    () => (selectedCountry ? points.filter((point) => point.code === selectedCountry) : points),
    [points, selectedCountry]
  );
  const data = useMemo(() => buildAtlasFeatures(scopedPoints, mode), [scopedPoints, mode]);
  const state = useRef({ data, theme, projection, layer, points, onSelectCountry });
  const selectedPoint = scopedPoints.find((point) => pointId(point) === selectedPointId);
  const selected = countries.find((country) => country.code === selectedCountry);
  const ranked = [...countries]
    .filter((country) => country[mode] > 0)
    .sort((a, b) => b[mode] - a[mode]);
  const visibleCountries = ranked.filter((country) =>
    `${country.name} ${country.code} ${country.region ?? ''}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );
  const countryTotal = countries.reduce((sum, country) => sum + country[mode], 0);
  const maximum = Math.max(1, ...scopedPoints.map((point) => point[mode]));

  // Keep the event handlers and asynchronous style loads on the latest filter.
  useEffect(() => {
    state.current = { data, theme, projection, layer, points, onSelectCountry };
  }, [data, theme, projection, layer, points, onSelectCountry]);

  const syncLayers = useCallback((map: MapLibreMap) => {
    const current = state.current;
    const heat = GLOBE_HEAT[current.theme === 'dark' ? 'dark' : 'light'];
    if (!map.getSource(METRIC_SOURCE_ID))
      map.addSource(METRIC_SOURCE_ID, { type: 'geojson', data: current.data });
    else (map.getSource(METRIC_SOURCE_ID) as GeoJSONSource).setData(current.data);
    const before = map.getStyle().layers?.find((item) => item.type === 'symbol')?.id;
    if (!map.getLayer(HEAT_LAYER_ID))
      map.addLayer(
        {
          id: HEAT_LAYER_ID,
          source: METRIC_SOURCE_ID,
          type: 'heatmap',
          paint: {
            'heatmap-weight': ['get', 'weight'],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 18, 3, 34, 6, 48, 10, 60],
            'heatmap-intensity': 1.15,
            'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.85, 6, 0.65, 9, 0.25],
          },
        },
        before
      );
    map.setPaintProperty(HEAT_LAYER_ID, 'heatmap-color', [
      'interpolate',
      ['linear'],
      ['heatmap-density'],
      0,
      'rgba(0,0,0,0)',
      0.12,
      heat[0],
      0.35,
      heat[1],
      0.55,
      heat[2],
      0.8,
      heat[3],
      1,
      heat[4],
    ]);
    if (!map.getLayer(CIRCLE_LAYER_ID))
      map.addLayer(
        {
          id: CIRCLE_LAYER_ID,
          source: METRIC_SOURCE_ID,
          type: 'circle',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['get', 'weight'], 0, 3, 1, 16],
            'circle-stroke-width': 1.5,
          },
        },
        before
      );
    map.setPaintProperty(CIRCLE_LAYER_ID, 'circle-color', [
      'interpolate',
      ['linear'],
      ['get', 'weight'],
      0,
      heat[0],
      0.25,
      heat[1],
      0.5,
      heat[2],
      0.75,
      heat[3],
      1,
      heat[4],
    ]);
    map.setPaintProperty(CIRCLE_LAYER_ID, 'circle-stroke-color', GLOBE_CHROME[current.theme].land);
    map.setPaintProperty(
      CIRCLE_LAYER_ID,
      'circle-opacity',
      current.layer === 'points'
        ? 0.85
        : ['interpolate', ['linear'], ['zoom'], 0, 0.15, 4, 0.45, 7, 0.85]
    );
    map.setPaintProperty(
      CIRCLE_LAYER_ID,
      'circle-stroke-opacity',
      current.layer === 'points' ? 0.9 : 0.35
    );
    map.setLayoutProperty(
      HEAT_LAYER_ID,
      'visibility',
      current.layer === 'heat' ? 'visible' : 'none'
    );
    if (!map.getLayer(HIT_LAYER_ID))
      map.addLayer({
        id: HIT_LAYER_ID,
        source: METRIC_SOURCE_ID,
        type: 'circle',
        paint: { 'circle-radius': 18, 'circle-opacity': 0 },
      });
    map.setProjection({ type: current.projection });
  }, []);

  const fitPoints = useCallback((rows: CountryMetric[]) => {
    const map = mapRef.current;
    if (!map || !rows.length) return;
    const bounds = new maplibregl.LngLatBounds();
    rows.forEach((point) => bounds.extend([point.longitude, point.latitude]));
    map.fitBounds(bounds, {
      padding: 60,
      maxZoom: rows.every((row) => row.locationKind === 'country') ? 4 : 7,
      duration: 650,
    });
  }, []);

  useEffect(() => {
    const update = () => setTheme(normalizeAdminTheme(document.documentElement.dataset.theme));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    let map: MapLibreMap;
    try {
      const initialTheme = normalizeAdminTheme(document.documentElement.dataset.theme);
      map = new maplibregl.Map({
        container: containerRef.current,
        style: initialTheme === 'dark' ? DARK_MAP_STYLE_URL : LIGHT_MAP_STYLE_URL,
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
        bearing: 0,
        pitch: 0,
        minZoom: 0.6,
        maxZoom: 10,
        renderWorldCopies: false,
        attributionControl: { compact: true },
      });
    } catch {
      // Map construction can fail synchronously when WebGL is unavailable.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMapError(true);
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 100 }), 'bottom-left');
    map.on('style.load', () => {
      styleReadyRef.current = true;
      applyBasemapContrast(map, state.current.theme);
      syncLayers(map);
      setReady(true);
      setMapError(false);
    });
    map.on('error', () => setMapError(true));
    map.on('idle', () => setMapError(false));
    map.on('click', HIT_LAYER_ID, (event) => {
      const id = event.features?.[0]?.properties?.pointId;
      const point = state.current.points.find((item) => pointId(item) === id);
      if (!point) return;
      setSelectedPointId(id);
      state.current.onSelectCountry(point.code);
    });
    map.on('mouseenter', HIT_LAYER_ID, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', HIT_LAYER_ID, () => {
      map.getCanvas().style.cursor = '';
    });
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      styleReadyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, [syncLayers]);

  // Repaint the existing vector style instead of replacing it. This keeps the
  // camera and sources intact, including when themes change during tile loads.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    applyBasemapContrast(map, theme);
    syncLayers(map);
  }, [theme, ready, syncLayers]);

  useEffect(() => {
    if (mapRef.current && ready && styleReadyRef.current) syncLayers(mapRef.current);
  }, [data, projection, layer, ready, syncLayers]);

  useEffect(() => {
    if (ready && lastFittedPointsRef.current !== scopedPoints) {
      lastFittedPointsRef.current = scopedPoints;
      fitPoints(scopedPoints);
    }
  }, [selectedCountry, scopedPoints, ready, fitPoints]);

  return (
    <div className="atlas-body">
      <div className="atlas-map-column">
        <div className="atlas-map-toolbar">
          <div className="atlas-toggle" role="group" aria-label="Map projection">
            <button
              type="button"
              aria-pressed={projection === 'mercator'}
              onClick={() => setProjection('mercator')}
            >
              Map
            </button>
            <button
              type="button"
              aria-pressed={projection === 'globe'}
              onClick={() => {
                setProjection('globe');
                const focus = selected ?? ranked[0] ?? scopedPoints[0];
                if (focus)
                  mapRef.current?.flyTo({
                    center: [focus.longitude, focus.latitude],
                    zoom: 1.7,
                    bearing: 0,
                    pitch: 0,
                    duration: 650,
                  });
              }}
            >
              Globe
            </button>
          </div>
          <div className="atlas-toggle" role="group" aria-label="Map display">
            <button type="button" aria-pressed={layer === 'heat'} onClick={() => setLayer('heat')}>
              Heat
            </button>
            <button
              type="button"
              aria-pressed={layer === 'points'}
              onClick={() => setLayer('points')}
            >
              Points
            </button>
          </div>
          <button
            className="atlas-text-button"
            type="button"
            disabled={!ready || !scopedPoints.length}
            onClick={() => fitPoints(scopedPoints)}
          >
            Fit activity
          </button>
          <button
            className="atlas-text-button"
            type="button"
            disabled={!ready}
            onClick={() => {
              onSelectCountry(null);
              setSelectedPointId(null);
              mapRef.current?.fitBounds(WORLD_BOUNDS, { padding: 20, duration: 650 });
            }}
          >
            Reset view
          </button>
        </div>
        <div className="atlas-viewer">
          <div
            ref={containerRef}
            className="atlas-map"
            role="region"
            aria-label="Global activity map"
          />
          {!ready && !mapError && (
            <p className="atlas-map-message" role="status">
              Loading map…
            </p>
          )}
          {mapError && (
            <p className="atlas-map-message" role="status">
              Some map tiles could not load. Country and location data remain available beside the
              map.
            </p>
          )}
          {ready && !data.features.length && (
            <p className="atlas-map-message">
              No mapped {metricLabel(mode)} for this selection. Check the totals and tables below.
            </p>
          )}
          {selectedCountry && (
            <button
              className="atlas-map-selection"
              type="button"
              onClick={() => {
                onSelectCountry(null);
                setSelectedPointId(null);
              }}
            >
              {selected?.name ?? selectedCountry} · Clear selection
            </button>
          )}
        </div>
        <div className="atlas-legend">
          <div>
            <span>{layer === 'heat' ? 'Relative density' : 'Activity per point'}</span>
            <div className="globe-card__legend-bar" />
            <div className="atlas-legend-labels">
              <span>{layer === 'heat' ? 'Low' : '0'}</span>
              <span>{layer === 'heat' ? 'High' : formatNumber(maximum)}</span>
            </div>
          </div>
          <p>
            {layer === 'heat'
              ? 'Overlapping activity, weighted on a log scale.'
              : `Log scale · ${metricLabel(mode)}.`}
            <br />
            Approximate IP locations; country centers where coordinates are unavailable. Not GPS.
          </p>
        </div>
      </div>
      <aside className="atlas-inspector" aria-label="Geographic detail">
        {selectedCountry ? (
          <>
            <div className="atlas-inspector-heading">
              <div>
                <p className="eyebrow">Country detail</p>
                <h3>{selected?.name ?? scopedPoints[0]?.name ?? selectedCountry}</h3>
              </div>
              <button
                type="button"
                className="atlas-text-button"
                onClick={() => {
                  onSelectCountry(null);
                  setSelectedPointId(null);
                }}
              >
                Back
              </button>
            </div>
            <p className="atlas-muted">
              {[selected?.subregion, selected?.region, selectedCountry].filter(Boolean).join(' · ')}
            </p>
            {selected ? (
              <>
                <dl className="atlas-country-metrics">
                  <div>
                    <dt>Listening min</dt>
                    <dd>{formatNumber(selected.listeningMinutes)}</dd>
                  </div>
                  <div>
                    <dt>Reading min</dt>
                    <dd>{formatNumber(selected.readingMinutes)}</dd>
                  </div>
                  <div>
                    <dt>Download units</dt>
                    <dd>{formatNumber(selected.downloadUnits)}</dd>
                  </div>
                  <div>
                    <dt>Listeners</dt>
                    <dd>{formatNumber(selected.listenerCount)}</dd>
                  </div>
                </dl>
                <p className="atlas-muted">
                  {countryTotal ? formatNumber((selected[mode] / countryTotal) * 100) : 0}% of
                  country-attributed {metricLabel(mode)}.
                </p>
              </>
            ) : (
              <p className="atlas-muted">
                Country totals are unavailable for this translation. Location values below cover
                individual buckets.
              </p>
            )}
            <h4>
              {scopedPoints.length} mapped {scopedPoints.length === 1 ? 'location' : 'locations'}
            </h4>
            <div className="atlas-location-list">
              {[...scopedPoints]
                .sort((a, b) => b[mode] - a[mode])
                .map((point) => (
                  <button
                    type="button"
                    key={pointId(point)}
                    aria-pressed={pointId(point) === selectedPointId}
                    onClick={() => {
                      setSelectedPointId(pointId(point));
                      fitPoints([point]);
                    }}
                  >
                    <span>
                      {point.locationKind === 'country'
                        ? 'Country center'
                        : `${point.latitude.toFixed(1)}°, ${point.longitude.toFixed(1)}°`}
                    </span>
                    <strong>{formatNumber(point[mode])}</strong>
                  </button>
                ))}
            </div>
            {selectedPoint && (
              <div className="atlas-location-detail" aria-live="polite">
                <strong>
                  {selectedPoint.locationKind === 'country'
                    ? 'Country-level placement'
                    : 'Approximate location'}
                </strong>
                <p>
                  {formatNumber(selectedPoint[mode])} {metricLabel(mode)} at{' '}
                  {selectedPoint.latitude.toFixed(1)}°, {selectedPoint.longitude.toFixed(1)}°.
                </p>
                <p>Coordinates identify a reporting bucket, not a person or an exact address.</p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="atlas-inspector-heading">
              <h3>Countries</h3>
              <span className="atlas-count">{ranked.length}</span>
            </div>
            <p className="atlas-muted">Ranked by {metricLabel(mode)}. Select to explore.</p>
            <input
              className="atlas-search"
              type="search"
              aria-label="Search countries on map"
              placeholder="Find a country or region…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="atlas-country-list">
              {visibleCountries.map((country, index) => (
                <button
                  type="button"
                  key={country.code}
                  onClick={() => {
                    onSelectCountry(country.code);
                    setSelectedPointId(null);
                  }}
                >
                  <span className="atlas-rank">{index + 1}</span>
                  <span className="atlas-country-name">
                    {country.name}
                    <span className="atlas-rank-track">
                      <span
                        style={{
                          width: `${(country[mode] / Math.max(ranked[0]?.[mode] ?? 1, 1)) * 100}%`,
                        }}
                      />
                    </span>
                  </span>
                  <strong>{formatNumber(country[mode])}</strong>
                </button>
              ))}
            </div>
            {!visibleCountries.length && (
              <p className="atlas-muted">
                {query
                  ? 'No countries match your search.'
                  : 'No country totals for this metric. Available locations remain on the map.'}
              </p>
            )}
            <p className="atlas-inspector-footnote">
              Country totals can include activity without map coordinates. Listeners are distinct
              within each country and cannot be added across countries.
            </p>
          </>
        )}
      </aside>
    </div>
  );
}
