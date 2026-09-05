'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, {
  type ExpressionSpecification,
  type GeoJSONSource,
  type Map as LibreMap,
} from 'maplibre-gl';
import { applyBasemapContrast, GLOBE_CHROME, loadAtlasBasemap } from '@/lib/atlas-basemap';
import { normalizeAdminTheme } from '@/lib/theme';
import {
  buildFeatures,
  formatCount,
  KIND_LABELS,
  PRECISION_LABELS,
  recordLocations,
  resolveMapHitRecords,
  SCRIPTURE_LABELS,
  scriptureStatus,
} from '@/lib/language-atlas/model';
import type { AtlasRecord, ScriptureStatus } from '@/lib/language-atlas/types';

const SOURCE = 'language-atlas-records';
const DOTS = 'language-atlas-dots';
const CLUSTERS = 'language-atlas-clusters';
const COUNTS = 'language-atlas-counts';
const SELECTED = 'language-atlas-selected';
const HIT = 'language-atlas-hit';
const statuses = Object.keys(SCRIPTURE_LABELS) as ScriptureStatus[];
const duration = () => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450);

interface Props {
  records: AtlasRecord[];
  selected: AtlasRecord | null;
  onSelect: (id: string) => void;
}

export function LanguageMap({ records, selected, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LibreMap | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const clickedLocation = useRef<{ id: string; coordinates: [number, number] } | null>(null);
  const data = useMemo(() => buildFeatures(records), [records]);
  const byId = useMemo(() => new Map(records.map((record) => [record.id, record])), [records]);
  const current = useRef({ data, byId, onSelect });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [projection, setProjection] = useState<'globe' | 'mercator'>('globe');
  const projectionRef = useRef(projection);
  const [group, setGroup] = useState<{ data: typeof data; records: AtlasRecord[] } | null>(null);
  const [groupPage, setGroupPage] = useState(0);
  const [groupError, setGroupError] = useState(false);
  const visibleGroup = group?.data === data ? group.records : null;

  useEffect(() => {
    current.current = { data, byId, onSelect };
  }, [data, byId, onSelect]);
  useEffect(() => {
    projectionRef.current = projection;
  }, [projection]);

  const fit = useCallback(() => {
    const map = mapRef.current;
    if (!map || !data.features.length) return;
    const bounds = new maplibregl.LngLatBounds();
    data.features.forEach((feature) =>
      bounds.extend(feature.geometry.coordinates as [number, number])
    );
    map.fitBounds(bounds, { padding: 56, maxZoom: 8, duration: duration() });
  }, [data]);

  useEffect(() => {
    if (!container.current) return;
    let alive = true;
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
        center: [35, 20],
        zoom: 1.5,
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
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    const paint = () => {
      if (!map.getLayer(DOTS)) return;
      applyBasemapContrast(map, theme());
      const css = getComputedStyle(document.documentElement);
      const colors = statuses.map(
        (_, index) =>
          `hsl(${css
            .getPropertyValue(`--series-${index + 1}`)
            .trim()
            .split(/\s+/)
            .join(',')})`
      );
      const expression: ExpressionSpecification = [
        'match',
        ['get', 'status'],
        'bible',
        colors[0],
        'nt',
        colors[1],
        'portions',
        colors[2],
        'started',
        colors[3],
        'needed',
        colors[4],
        colors[5],
      ];
      map.setPaintProperty(DOTS, 'circle-color', expression);
      map.setPaintProperty(DOTS, 'circle-stroke-color', GLOBE_CHROME[theme()].land);
      map.setPaintProperty(CLUSTERS, 'circle-color', GLOBE_CHROME[theme()].land);
      map.setPaintProperty(CLUSTERS, 'circle-stroke-color', GLOBE_CHROME[theme()].label);
      map.setPaintProperty(COUNTS, 'text-color', GLOBE_CHROME[theme()].label);
      map.setPaintProperty(SELECTED, 'circle-stroke-color', GLOBE_CHROME[theme()].horizon);
    };
    map.on('style.load', () => {
      if (!alive) return;
      map.addSource(SOURCE, {
        type: 'geojson',
        data: current.current.data,
        cluster: true,
        clusterRadius: 42,
        clusterMaxZoom: 16,
      });
      map.addLayer({
        id: CLUSTERS,
        type: 'circle',
        source: SOURCE,
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
        source: SOURCE,
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
        source: SOURCE,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 4, 7, 6, 15, 8],
          'circle-stroke-width': 1.5,
          'circle-opacity': 0.94,
        },
      });
      map.addLayer({
        id: SELECTED,
        type: 'circle',
        source: SOURCE,
        filter: ['==', ['get', 'recordId'], ''],
        paint: {
          'circle-radius': 12,
          'circle-opacity': 0,
          'circle-stroke-width': 3,
        },
      });
      map.addLayer({
        id: HIT,
        type: 'circle',
        source: SOURCE,
        filter: ['!', ['has', 'point_count']],
        paint: { 'circle-radius': 14, 'circle-opacity': 0 },
      });
      paint();
      map.setProjection({ type: projectionRef.current });
      setReady(true);
      setFailed(false);
    });
    map.on('error', () => {
      if (alive) setFailed(true);
    });
    const showGroup = (rows: AtlasRecord[], snapshot: typeof data) => {
      setGroup({ records: rows, data: snapshot });
      setGroupPage(0);
      setGroupError(false);
    };
    map.on('click', CLUSTERS, async (event) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== 'Point') return;
      const source = map.getSource(SOURCE) as GeoJSONSource;
      const clusterId = Number(feature.properties.cluster_id);
      const request = ++selectionRequest;
      const snapshot = current.current;
      popup.remove();
      try {
        const [zoom, leaves] = await Promise.all([
          source.getClusterExpansionZoom(clusterId),
          source.getClusterLeaves(clusterId, Number(feature.properties.point_count), 0),
        ]);
        if (!alive || request !== selectionRequest || snapshot.data !== current.current.data)
          return;
        const ids = new Set(leaves.map((leaf) => String(leaf.properties?.recordId)));
        showGroup(
          [...ids].flatMap((id) => (snapshot.byId.get(id) ? [snapshot.byId.get(id)!] : [])),
          snapshot.data
        );
        map.easeTo({
          center: feature.geometry.coordinates as [number, number],
          zoom: Math.min(zoom, 17),
          duration: duration(),
        });
      } catch {
        if (alive && request === selectionRequest) setGroupError(true);
      }
    });
    map.on('click', HIT, (event) => {
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
      const feature = event.features?.[0];
      const record = current.current.byId.get(String(feature?.properties.recordId));
      if (!record || feature?.geometry.type !== 'Point') return;
      const node = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = record.name;
      const category = document.createElement('small');
      category.textContent = `${KIND_LABELS[record.kind]} · ${SCRIPTURE_LABELS[scriptureStatus(record)]}${record.kind === 'people-group' ? ' (primary language)' : ''}`;
      const bio = document.createElement('p');
      bio.textContent = record.summary;
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
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(container.current);
    const observer = new MutationObserver(paint);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    void loadAtlasBasemap(map, theme(), styleRequest.signal).catch(() => {
      if (alive) setFailed(true);
    });
    return () => {
      alive = false;
      styleRequest.abort();
      selectionRequest++;
      resize.disconnect();
      observer.disconnect();
      popup.remove();
      map.remove();
      mapRef.current = null;
      popupRef.current = null;
    };
  }, [retry]);

  useEffect(() => {
    if (!ready) return;
    const source = mapRef.current?.getSource(SOURCE) as GeoJSONSource | undefined;
    popupRef.current?.remove();
    source?.setData(data);
  }, [data, ready]);
  useEffect(() => {
    if (ready) mapRef.current?.setProjection({ type: projection });
  }, [projection, ready]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer(SELECTED)) return;
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
    if (center) map.easeTo({ center, zoom: Math.max(map.getZoom(), 5), duration: duration() });
  }, [selected, ready]);

  return (
    <section className="la-map-panel" aria-label="Language atlas map">
      <div className="la-map-toolbar">
        <div className="la-segment" role="group" aria-label="Map projection">
          <button
            type="button"
            aria-pressed={projection === 'globe'}
            onClick={() => setProjection('globe')}
          >
            Globe
          </button>
          <button
            type="button"
            aria-pressed={projection === 'mercator'}
            onClick={() => setProjection('mercator')}
          >
            Map
          </button>
        </div>
        <div className="la-map-actions">
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
              mapRef.current?.easeTo({
                center: [35, 20],
                zoom: 1.5,
                bearing: 0,
                pitch: 0,
                duration: duration(),
              });
            }}
          >
            Reset view
          </button>
        </div>
      </div>
      <div className="la-map-view">
        <div
          ref={container}
          className="la-map-canvas"
          role="region"
          aria-label="Interactive language map. Use the results list below for keyboard access to every record."
        />
        <div className="la-map-caption">
          <span className="eyebrow">The language landscape</span>
          <span>{formatCount(data.features.length)} reference points</span>
        </div>
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
            No mapped records in this selection. Explore the results below.
          </p>
        )}
      </div>
      <div className="la-legend" aria-label="Scripture status legend">
        {statuses.map((status) => (
          <span key={status}>
            <i className={`la-dot la-dot--${status}`} />
            {SCRIPTURE_LABELS[status]}
          </span>
        ))}
      </div>
      <p className="la-map-note">
        Reference areas, not settlement boundaries. Numbers group nearby points. Select a group to
        zoom in and browse its records.
      </p>
      {groupError && (
        <p className="la-map-note" role="status">
          That group changed while the map updated. Select it again to browse.
        </p>
      )}
      {visibleGroup && (
        <div className="la-map-group">
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
                <i className={`la-dot la-dot--${scriptureStatus(record)}`} />
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
    </section>
  );
}
