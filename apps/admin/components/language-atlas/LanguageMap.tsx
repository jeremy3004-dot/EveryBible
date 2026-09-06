'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import maplibregl, { type GeoJSONSource, type Map as LibreMap } from 'maplibre-gl';
import { loadAtlasBasemap } from '../../lib/atlas-basemap';
import { normalizeAdminTheme } from '../../lib/theme';
import {
  buildFeatures,
  formatCount,
  KIND_LABELS,
  PRECISION_LABELS,
  recordLocations,
  resolveMapHitRecords,
  scriptureStatus,
  scriptureLabel,
  atlasBiography,
} from '../../lib/language-atlas/model';
import { SCRIPTURE_COLORS, scriptureVisualCategory } from '../../lib/language-atlas/presentation';
import type {
  AtlasDisplayMode,
  AtlasMapPadding,
  AtlasProjection,
  AtlasRecord,
} from '../../lib/language-atlas/types';
import {
  ATLAS_BASEMAP_COLORS,
  ATLAS_SOURCE_ID,
  EMPTY_ATLAS_FEATURES,
  applyAtlasBasemapContrast,
  applyAtlasDisplayMode,
  atlasControlInsets,
  atlasScriptureColorExpression,
  atlasSourceOptions,
  resolveReadyAtlasMap,
} from './map-rendering';
import { SpreadDots } from './SpreadDots';
import { representativePoints } from './spread-layout';

const DOTS = 'language-atlas-dots';
const CLUSTERS = 'language-atlas-clusters';
const COUNTS = 'language-atlas-counts';
const SELECTED = 'language-atlas-selected';
const HIT = 'language-atlas-hit';
const INITIAL_CAMERA = { center: [65, 25] as [number, number], zoom: 2.75 };
const duration = () => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450);

interface Props {
  records: AtlasRecord[];
  selected: AtlasRecord | null;
  onSelect: (id: string) => void;
  displayMode: AtlasDisplayMode;
  projection: AtlasProjection;
  padding: AtlasMapPadding;
  /** Undefined keeps the default toolbar; null hides it until a target mounts. */
  controlsTarget?: HTMLElement | null;
  onSelectGroup?: (ids: string[]) => void;
  showHoverSummary?: boolean;
}

export function LanguageMap({
  records,
  selected,
  onSelect,
  displayMode,
  projection,
  padding,
  controlsTarget,
  onSelectGroup,
  showHoverSummary = true,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LibreMap | null>(null);
  const readyMapRef = useRef<LibreMap | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const clickedLocation = useRef<{ id: string; coordinates: [number, number] } | null>(null);
  const data = useMemo(() => buildFeatures(records), [records]);
  const byId = useMemo(() => new Map(records.map((record) => [record.id, record])), [records]);
  const current = useRef({ data, byId, onSelect, displayMode, onSelectGroup, showHoverSummary });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const projectionRef = useRef(projection);
  const displayModeRef = useRef(displayMode);
  const appliedDisplayModeRef = useRef(displayMode);
  const paddingRef = useRef(padding);
  const [group, setGroup] = useState<{ data: typeof data; records: AtlasRecord[] } | null>(null);
  const [groupPage, setGroupPage] = useState(0);
  const [groupError, setGroupError] = useState(false);
  const visibleGroup = group?.data === data ? group.records : null;
  const controlInsets = atlasControlInsets(padding);
  const selectSpreadPoint = useCallback(
    (id: string) => {
      setGroup(null);
      setGroupError(false);
      clickedLocation.current = null;
      onSelect(id);
    },
    [onSelect]
  );

  useEffect(() => {
    current.current = { data, byId, onSelect, displayMode, onSelectGroup, showHoverSummary };
    if (!showHoverSummary) popupRef.current?.remove();
  }, [data, byId, onSelect, displayMode, onSelectGroup, showHoverSummary]);
  useEffect(() => {
    projectionRef.current = projection;
  }, [projection]);
  useEffect(() => {
    displayModeRef.current = displayMode;
  }, [displayMode]);
  useEffect(() => {
    paddingRef.current = padding;
    mapRef.current?.setPadding(padding);
  }, [padding]);

  const fit = useCallback(() => {
    const map = resolveReadyAtlasMap(mapRef.current, readyMapRef.current);
    if (!map || !data.features.length) return;
    const bounds = new maplibregl.LngLatBounds();
    if (displayMode === 'spread') {
      representativePoints(records).forEach(({ location }) =>
        bounds.extend([location.longitude, location.latitude])
      );
      // A co-located group needs a useful regional view, not an extreme zero-area fit.
      if (bounds.getEast() - bounds.getWest() < 1 && bounds.getNorth() - bounds.getSouth() < 1) {
        map.easeTo({
          center: bounds.getCenter(),
          zoom: 6,
          padding: paddingRef.current,
          duration: duration(),
        });
        return;
      }
    } else {
      data.features.forEach((feature) =>
        bounds.extend(feature.geometry.coordinates as [number, number])
      );
    }
    map.fitBounds(bounds, { padding: paddingRef.current, maxZoom: 8, duration: duration() });
  }, [data, displayMode, records]);

  useEffect(() => {
    if (!container.current) return;
    readyMapRef.current = null;
    setReady(false);
    let alive = true;
    let styleReady = false;
    const styleRequest = new AbortController();
    let selectionRequest = 0;
    let map: LibreMap;
    const theme = () => normalizeAdminTheme(document.documentElement.dataset.theme);
    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: true,
      maxWidth: '280px',
      className: 'language-atlas-popup',
    });
    try {
      map = new maplibregl.Map({
        container: container.current,
        ...INITIAL_CAMERA,
        minZoom: 0.6,
        maxZoom: 18,
        renderWorldCopies: false,
        attributionControl: { compact: true },
      });
    } catch {
      // WebGL can be unavailable; the complete accessible list stays usable.
      setFailed(true);
      return;
    }
    mapRef.current = map;
    popupRef.current = popup;
    map.setPadding(paddingRef.current);
    const paint = () => {
      if (!alive || !styleReady || mapRef.current !== map) return;
      if (!map.getLayer(DOTS)) return;
      const currentTheme = theme();
      const colors = ATLAS_BASEMAP_COLORS[currentTheme];
      applyAtlasBasemapContrast(map, currentTheme);
      map.setPaintProperty(DOTS, 'circle-color', atlasScriptureColorExpression(currentTheme));
      map.setPaintProperty(DOTS, 'circle-stroke-color', colors.canvas);
      map.setPaintProperty(CLUSTERS, 'circle-color', SCRIPTURE_COLORS[currentTheme].unknown);
      map.setPaintProperty(CLUSTERS, 'circle-stroke-color', colors.canvas);
      map.setPaintProperty(COUNTS, 'text-color', colors.canvas);
      map.setPaintProperty(SELECTED, 'circle-stroke-color', colors.label);
    };
    map.on('style.load', () => {
      if (!alive || mapRef.current !== map) return;
      map.addSource(
        ATLAS_SOURCE_ID,
        atlasSourceOptions(current.current.data, displayModeRef.current)
      );
      appliedDisplayModeRef.current = displayModeRef.current;
      map.addLayer({
        id: CLUSTERS,
        type: 'circle',
        source: ATLAS_SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-radius': ['step', ['get', 'point_count'], 17, 100, 22, 1000, 28],
          'circle-stroke-width': 1.2,
          'circle-opacity': 0.94,
        },
      });
      map.addLayer({
        id: COUNTS,
        type: 'symbol',
        source: ATLAS_SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 12,
          'text-font': ['Open Sans Regular'],
          'text-allow-overlap': true,
        },
      });
      map.addLayer({
        id: DOTS,
        type: 'circle',
        source: ATLAS_SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 3, 7, 4, 15, 5],
          'circle-stroke-width': 1,
          'circle-opacity': 0.92,
        },
      });
      map.addLayer({
        id: SELECTED,
        type: 'circle',
        source: ATLAS_SOURCE_ID,
        filter: ['==', ['get', 'recordId'], ''],
        paint: {
          'circle-radius': 9,
          'circle-opacity': 0,
          'circle-stroke-width': 3,
        },
      });
      map.addLayer({
        id: HIT,
        type: 'circle',
        source: ATLAS_SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: { 'circle-radius': 14, 'circle-opacity': 0 },
      });
      styleReady = true;
      paint();
      map.setProjection({ type: projectionRef.current });
      map.setPadding(paddingRef.current);
      readyMapRef.current = map;
      setReady(true);
      setFailed(false);
    });
    map.on('error', () => {
      if (alive && mapRef.current === map) setFailed(true);
    });
    const showGroup = (rows: AtlasRecord[], snapshot: typeof data) => {
      if (current.current.onSelectGroup) {
        setGroup(null);
        current.current.onSelectGroup(rows.map((record) => record.id));
        return;
      }
      setGroup({ records: rows, data: snapshot });
      setGroupPage(0);
      setGroupError(false);
    };
    map.on('click', CLUSTERS, async (event) => {
      if (current.current.displayMode !== 'clustered') return;
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== 'Point') return;
      const source = map.getSource(ATLAS_SOURCE_ID) as GeoJSONSource;
      const clusterId = Number(feature.properties.cluster_id);
      const request = ++selectionRequest;
      const snapshot = current.current;
      popup.remove();
      try {
        const [zoom, leaves] = await Promise.all([
          source.getClusterExpansionZoom(clusterId),
          source.getClusterLeaves(clusterId, Number(feature.properties.point_count), 0),
        ]);
        if (
          !alive ||
          request !== selectionRequest ||
          snapshot.data !== current.current.data ||
          snapshot.displayMode !== current.current.displayMode
        )
          return;
        const ids = new Set(leaves.map((leaf) => String(leaf.properties?.recordId)));
        showGroup(
          [...ids].flatMap((id) => (snapshot.byId.get(id) ? [snapshot.byId.get(id)!] : [])),
          snapshot.data
        );
        map.easeTo({
          center: feature.geometry.coordinates as [number, number],
          zoom: Math.min(zoom, 17),
          padding: paddingRef.current,
          duration: duration(),
        });
      } catch {
        if (alive && request === selectionRequest) setGroupError(true);
      }
    });
    map.on('click', HIT, (event) => {
      if (current.current.displayMode === 'spread') return;
      selectionRequest++;
      popup.remove();
      const nearbyFeatures = map.queryRenderedFeatures(
        [
          [event.point.x - 5, event.point.y - 5],
          [event.point.x + 5, event.point.y + 5],
        ],
        { layers: [DOTS] }
      );
      const hitFeatures = event.features ?? [];
      const features = [...hitFeatures, ...nearbyFeatures];
      const rows = resolveMapHitRecords(
        hitFeatures.map((feature) => String(feature.properties.recordId)),
        nearbyFeatures.map((feature) => String(feature.properties.recordId)),
        current.current.byId
      );
      if (rows.length > 1) showGroup(rows, current.current.data);
      else setGroup(null);
      if (rows.length > 1 && current.current.onSelectGroup) return;
      if (rows[0]) {
        const hit = features.find((feature) => feature.properties.recordId === rows[0].id);
        if (hit?.geometry.type === 'Point')
          clickedLocation.current = {
            id: rows[0].id,
            coordinates: hit.geometry.coordinates as [number, number],
          };
        current.current.onSelect(rows[0].id);
      }
    });
    map.on('mousemove', HIT, (event) => {
      if (current.current.displayMode === 'spread' || !current.current.showHoverSummary) return;
      const feature = event.features?.[0];
      const record = current.current.byId.get(String(feature?.properties.recordId));
      if (!record || feature?.geometry.type !== 'Point') return;
      const node = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = record.name;
      const category = document.createElement('small');
      category.textContent = `${KIND_LABELS[record.kind]} · ${scriptureLabel(record)}${record.kind === 'people-group' ? ' (primary language)' : ''}`;
      const bio = document.createElement('p');
      bio.textContent = atlasBiography(record);
      node.append(title, category, bio);
      const location = recordLocations(record)[Number(feature.properties.locationIndex)];
      if (location) {
        const geography = document.createElement('small');
        geography.textContent = `${PRECISION_LABELS[location.precision]} · ${location.label}`;
        node.append(geography);
      }
      popup
        .setLngLat(feature.geometry.coordinates as [number, number])
        .setDOMContent(node)
        .addTo(map);
    });
    for (const layer of [HIT, CLUSTERS]) {
      map.on('mouseenter', layer, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', layer, () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
      });
    }
    const resize = new ResizeObserver(() => {
      if (alive && mapRef.current === map) map.resize();
    });
    resize.observe(container.current);
    const observer = new MutationObserver(paint);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    void loadAtlasBasemap(map, theme(), styleRequest.signal).catch(() => {
      if (alive && mapRef.current === map) setFailed(true);
    });
    return () => {
      alive = false;
      styleReady = false;
      if (readyMapRef.current === map) readyMapRef.current = null;
      if (mapRef.current === map) mapRef.current = null;
      if (popupRef.current === popup) popupRef.current = null;
      styleRequest.abort();
      selectionRequest++;
      resize.disconnect();
      observer.disconnect();
      popup.remove();
      map.remove();
    };
  }, [retry]);

  useEffect(() => {
    if (!ready) return;
    const map = resolveReadyAtlasMap(mapRef.current, readyMapRef.current);
    if (!map) return;
    const source = map.getSource(ATLAS_SOURCE_ID) as GeoJSONSource | undefined;
    popupRef.current?.remove();
    source?.setData(displayMode === 'spread' ? EMPTY_ATLAS_FEATURES : data);
  }, [data, ready, displayMode]);
  useEffect(() => {
    if (!ready) return;
    const map = resolveReadyAtlasMap(mapRef.current, readyMapRef.current);
    if (!map) return;
    const source = map.getSource(ATLAS_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    if (!applyAtlasDisplayMode(source, appliedDisplayModeRef.current, displayMode)) return;
    appliedDisplayModeRef.current = displayMode;
    popupRef.current?.remove();
    setGroup(null);
    setGroupError(false);
  }, [displayMode, ready]);
  useEffect(() => {
    if (!ready) return;
    const map = resolveReadyAtlasMap(mapRef.current, readyMapRef.current);
    if (!map) return;
    for (const layer of [DOTS, HIT, SELECTED, CLUSTERS, COUNTS]) {
      if (map.getLayer(layer))
        map.setLayoutProperty(layer, 'visibility', displayMode === 'spread' ? 'none' : 'visible');
    }
  }, [displayMode, ready]);
  useEffect(() => {
    if (!ready) return;
    resolveReadyAtlasMap(mapRef.current, readyMapRef.current)?.setProjection({ type: projection });
  }, [projection, ready]);
  useEffect(() => {
    if (!ready) return;
    const map = resolveReadyAtlasMap(mapRef.current, readyMapRef.current);
    if (!map || !map.getLayer(SELECTED)) return;
    map.setFilter(SELECTED, ['==', ['get', 'recordId'], selected?.id ?? '']);
    const location = selected ? recordLocations(selected)[0] : null;
    const clicked = clickedLocation.current;
    const center =
      clicked?.id === selected?.id
        ? clicked?.coordinates
        : location
          ? ([location.longitude, location.latitude] as [number, number])
          : null;
    clickedLocation.current = null;
    if (center)
      map.easeTo({
        center,
        zoom: Math.max(map.getZoom(), 5),
        padding: paddingRef.current,
        duration: duration(),
      });
  }, [selected, ready]);

  const controls = (
    <div
      className="la-map-actions la-map-actions--floating"
      role="group"
      aria-label="Map view actions"
      style={controlInsets}
    >
      <button
        className="la-text-button"
        type="button"
        title="Zoom in"
        aria-label="Zoom in"
        disabled={!ready}
        onClick={() =>
          resolveReadyAtlasMap(mapRef.current, readyMapRef.current)?.zoomIn({
            duration: duration(),
          })
        }
      >
        +
      </button>
      <button
        className="la-text-button"
        type="button"
        title="Zoom out"
        aria-label="Zoom out"
        disabled={!ready}
        onClick={() =>
          resolveReadyAtlasMap(mapRef.current, readyMapRef.current)?.zoomOut({
            duration: duration(),
          })
        }
      >
        −
      </button>
      <button
        className="la-text-button"
        type="button"
        disabled={!ready || !data.features.length}
        onClick={fit}
      >
        Fit results
      </button>
      <button
        className="la-text-button"
        type="button"
        disabled={!ready}
        onClick={() => {
          setGroup(null);
          resolveReadyAtlasMap(mapRef.current, readyMapRef.current)?.easeTo({
            ...INITIAL_CAMERA,
            bearing: 0,
            pitch: 0,
            padding: paddingRef.current,
            duration: duration(),
          });
        }}
      >
        Reset view
      </button>
    </div>
  );

  return (
    <section className="la-map-panel" aria-label="Language atlas map">
      <div className="la-map-view">
        <div
          ref={container}
          className="la-map-canvas"
          role="region"
          aria-label="Interactive language map. Use the Records panel for keyboard access to every record."
        />
        {ready && mapRef.current && displayMode === 'spread' && (
          <SpreadDots
            map={mapRef.current}
            records={records}
            selectedId={selected?.id ?? null}
            onSelect={selectSpreadPoint}
            inset={controlInsets}
            showHoverSummary={showHoverSummary}
          />
        )}
        {controlsTarget === undefined
          ? controls
          : controlsTarget
            ? createPortal(controls, controlsTarget)
            : null}
        {!ready && !failed && (
          <p className="la-map-message" role="status">
            Opening the atlas…
          </p>
        )}
        {failed && (
          <div className="la-map-message" role="status">
            <p>The basemap could not fully load. All records remain in the list.</p>
            <button
              type="button"
              onClick={() => {
                setReady(false);
                setFailed(false);
                setRetry((value) => value + 1);
              }}
            >
              Retry map
            </button>
          </div>
        )}
        {ready && !failed && !data.features.length && (
          <p className="la-map-message">
            No mapped records in this selection. Explore the Records panel.
          </p>
        )}
        {groupError && (
          <p className="la-map-note" role="status">
            That group changed while the map updated. Select it again to browse.
          </p>
        )}
        {visibleGroup && !onSelectGroup && (
          <div className="la-map-group" role="region" aria-label="Selected map records">
            <div className="la-section-heading">
              <div>
                <span className="eyebrow">Selected map group</span>
                <h3>{formatCount(visibleGroup.length)} records to explore</h3>
              </div>
              <button className="la-text-button" type="button" onClick={() => setGroup(null)}>
                Close
              </button>
            </div>
            <div className="la-group-records">
              {visibleGroup.slice(groupPage * 12, (groupPage + 1) * 12).map((record) => (
                <button
                  type="button"
                  key={record.id}
                  aria-pressed={selected?.id === record.id}
                  onClick={() => onSelect(record.id)}
                >
                  <i
                    className={`la-dot la-dot--${scriptureVisualCategory(scriptureStatus(record))}`}
                  />
                  <span>
                    {record.name}
                    <small>
                      {KIND_LABELS[record.kind]} ·{' '}
                      {record.iso6393 ?? record.rolvCode ?? record.glottocode ?? record.id}
                    </small>
                  </span>
                </button>
              ))}
            </div>
            {visibleGroup.length > 12 && (
              <div className="la-pagination">
                <button
                  type="button"
                  disabled={groupPage === 0}
                  onClick={() => setGroupPage((page) => page - 1)}
                >
                  Previous
                </button>
                <span>
                  {groupPage + 1} / {Math.ceil(visibleGroup.length / 12)}
                </span>
                <button
                  type="button"
                  disabled={(groupPage + 1) * 12 >= visibleGroup.length}
                  onClick={() => setGroupPage((page) => page + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
