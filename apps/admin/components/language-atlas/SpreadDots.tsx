'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type Map as LibreMap, type MapMouseEvent } from 'maplibre-gl';
import {
  formatCount,
  KIND_LABELS,
  PRECISION_LABELS,
  SCRIPTURE_LABELS,
  scriptureStatus,
} from '../../lib/language-atlas/model';
import {
  SCRIPTURE_COLORS,
  SCRIPTURE_VISUAL_ORDER,
  scriptureVisualCategory,
} from '../../lib/language-atlas/presentation';
import { normalizeAdminTheme } from '../../lib/theme';
import type { AtlasRecord } from '../../lib/language-atlas/types';
import { ATLAS_BASEMAP_COLORS } from './map-rendering';
import {
  layoutSpreadPointsAtZoom,
  nearestSpreadPoint,
  projectSpreadPoints,
  representativePoints,
  type SpreadPoint,
} from './spread-layout';

interface Props {
  map: LibreMap;
  records: AtlasRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  inset: { left: number; bottom: number };
  showHoverSummary?: boolean;
}

/** Screen-space presentation; all source coordinates and map camera targets stay intact. */
export function SpreadDots({ map, records, selectedId, onSelect, inset, showHoverSummary = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const points = useMemo(() => representativePoints(records), [records]);
  const selectedRef = useRef(selectedId);
  const selectRef = useRef(onSelect);
  const hoverSummaryRef = useRef(showHoverSummary);
  const repaint = useRef<() => void>(() => {});
  const [visibleCount, setVisibleCount] = useState(0);
  const [separating, setSeparating] = useState(false);
  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    hoverSummaryRef.current = showHoverSummary;
  }, [showHoverSummary]);

  useEffect(() => {
    selectedRef.current = selectedId;
    repaint.current();
  }, [selectedId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const byId = new Map(points.map((point) => [point.id, point]));
    const coordinates = new Map(
      points.map((point) => [
        point.id,
        new maplibregl.LngLat(point.location.longitude, point.location.latitude),
      ])
    );
    const categories = new Map(
      points.map((point) => [point.id, scriptureVisualCategory(scriptureStatus(point.record), point.record.kind)])
    );
    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: true,
      maxWidth: '290px',
      className: 'language-atlas-popup',
    });
    let displayed: SpreadPoint[] = [];
    let offsets = new Map<string, { x: number; y: number; spacing: number }>();
    let hovered: string | null = null;
    let frame = 0;
    let dirtyLayout = true;
    let alive = true;
    let lastFrame = 0;
    let lastView = '';
    let wasSeparating = false;
    const viewKey = () => {
      // Projection probes include animated globe/flat transitions while stationary.
      const a = map.project([0, 0]);
      const b = map.project([90, 45]);
      return [
        map.getZoom(),
        map.getBearing(),
        map.getPitch(),
        a.x,
        a.y,
        b.x,
        b.y,
        map.getCanvas().clientWidth,
        map.getCanvas().clientHeight,
      ].join(',');
    };
    const draw = (now: number) => {
      frame = 0;
      if (!alive) return;
      if (!dirtyLayout && now - lastFrame < 33) {
        frame = requestAnimationFrame(draw);
        return;
      }
      lastFrame = now;
      lastView = viewKey();
      const started = performance.now();
      const separate = map.getZoom() >= 5;
      if (separate !== wasSeparating) dirtyLayout = true;
      wasSeparating = separate;
      setSeparating(separate);
      const { width, height } = map.getCanvas().getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;
      if (
        canvas.width !== Math.round(width * pixelRatio) ||
        canvas.height !== Math.round(height * pixelRatio)
      ) {
        canvas.width = Math.round(width * pixelRatio);
        canvas.height = Math.round(height * pixelRatio);
        dirtyLayout = true;
      }
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      const anchors = projectSpreadPoints(
        points,
        (point) => {
          const coordinate = coordinates.get(point.id)!;
          const screen = map.project(coordinate);
          // Use the same occlusion test as MapLibre's own Marker implementation.
          return { ...screen, occluded: map.transform.isLocationOccluded(coordinate) };
        },
        width,
        height
      );
      if (dirtyLayout) {
        displayed = layoutSpreadPointsAtZoom(anchors, width, height, map.getZoom());
        offsets = new Map(
          displayed.map((point) => [
            point.id,
            { x: point.x - point.anchorX, y: point.y - point.anchorY, spacing: point.spacing },
          ])
        );
        dirtyLayout = false;
      } else {
        displayed = anchors.map((anchor) => {
          const offset = offsets.get(anchor.id);
          return {
            id: anchor.id,
            anchorX: anchor.x,
            anchorY: anchor.y,
            x: anchor.x + (offset?.x ?? 0),
            y: anchor.y + (offset?.y ?? 0),
            spacing: offset?.spacing ?? 8.5,
          };
        });
      }
      setVisibleCount((count) => (count === displayed.length ? count : displayed.length));
      canvas.dataset.pointCount = String(displayed.length);
      const theme = normalizeAdminTheme(document.documentElement.dataset.theme);
      const colors = SCRIPTURE_COLORS[theme];
      const basemap = ATLAS_BASEMAP_COLORS[theme];
      for (const category of SCRIPTURE_VISUAL_ORDER) {
        context.beginPath();
        for (const point of displayed) {
          if (categories.get(point.id) !== category) continue;
          const radius = Math.min(3.05, point.spacing * 0.36);
          context.moveTo(point.x + radius, point.y);
          context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        }
        context.fillStyle = colors[category];
        context.fill();
        context.strokeStyle = basemap.canvas;
        context.lineWidth = 0.65;
        context.stroke();
      }
      for (const point of displayed) {
        if (point.id !== hovered && point.id !== selectedRef.current) continue;
        context.strokeStyle = basemap.label;
        context.lineWidth = 1;
        context.setLineDash([3, 3]);
        context.beginPath();
        context.moveTo(point.x, point.y);
        context.lineTo(point.anchorX, point.anchorY);
        context.stroke();
        context.setLineDash([]);
        context.beginPath();
        context.arc(point.anchorX, point.anchorY, 2, 0, Math.PI * 2);
        context.stroke();
        context.lineWidth = 1.5;
        context.beginPath();
        context.arc(point.x, point.y, 5.5, 0, Math.PI * 2);
        context.stroke();
      }
      canvas.dataset.renderMs = (performance.now() - started).toFixed(1);
    };
    const request = (layout = false) => {
      dirtyLayout ||= layout;
      if (!frame && alive) frame = requestAnimationFrame(draw);
    };
    const render = () => {
      if (dirtyLayout || lastView !== viewKey()) request();
    };
    const settle = () => request(true);
    repaint.current = () => request();
    const leave = () => {
      hovered = null;
      popup.remove();
      map.getCanvas().style.cursor = '';
      request();
    };
    const hover = (event: MapMouseEvent) => {
      if (map.isMoving()) return;
      const hit = nearestSpreadPoint(displayed, event.point.x, event.point.y);
      if (!hit) {
        if (hovered) leave();
        return;
      }
      if (hovered === hit.id) return;
      hovered = hit.id;
      map.getCanvas().style.cursor = 'pointer';
      if (!hoverSummaryRef.current) {
        request();
        return;
      }
      const { record, location } = byId.get(hit.id)!;
      const node = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = record.name;
      const status = document.createElement('small');
      status.textContent = `${KIND_LABELS[record.kind]} · ${SCRIPTURE_LABELS[scriptureStatus(record)]}${record.kind === 'people-group' ? ' (primary language)' : ''}`;
      const bio = document.createElement('p');
      bio.textContent = record.summary;
      const position = document.createElement('small');
      position.textContent = `${wasSeparating ? 'Spaced for visibility' : 'Recorded reference location'} · ${PRECISION_LABELS[location.precision]}. Reference: ${location.latitude.toFixed(3)}°, ${location.longitude.toFixed(3)}°.`;
      node.append(title, status, bio, position);
      popup
        .setLngLat([location.longitude, location.latitude])
        .setOffset([hit.x - hit.anchorX, hit.y - hit.anchorY])
        .setDOMContent(node)
        .addTo(map);
      request();
    };
    const click = (event: MapMouseEvent) => {
      const hit = nearestSpreadPoint(displayed, event.point.x, event.point.y);
      if (hit) {
        leave();
        selectRef.current(hit.id);
      }
    };
    map.on('render', render);
    map.on('moveend', settle);
    map.on('idle', settle);
    map.on('resize', settle);
    map.on('movestart', leave);
    map.on('mousemove', hover);
    map.on('click', click);
    map.getCanvas().addEventListener('mouseleave', leave);
    const observer = new MutationObserver(() => request());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    request(true);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      repaint.current = () => {};
      map.off('render', render);
      map.off('moveend', settle);
      map.off('idle', settle);
      map.off('resize', settle);
      map.off('movestart', leave);
      map.off('mousemove', hover);
      map.off('click', click);
      map.getCanvas().removeEventListener('mouseleave', leave);
      map.getCanvas().style.cursor = '';
      observer.disconnect();
      popup.remove();
    };
  }, [map, points]);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="la-spread-canvas"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
      <div
        className="la-spread-caption"
        style={{
          position: 'absolute',
          left: inset.left,
          bottom: inset.bottom + 53,
          pointerEvents: 'none',
          maxWidth: 'calc(100% - 32px)',
          background: 'hsl(var(--background) / .88)',
          color: 'hsl(var(--foreground))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 9,
          padding: '9px 12px',
          fontSize: 12,
          lineHeight: 1.5,
        }}
      >
        <strong>{formatCount(visibleCount)} records in view</strong>
        <br />
        {separating ? 'One dot per record · Spaced for visibility' : 'Overlaps retained · Zoom in to separate'}
      </div>
    </>
  );
}
