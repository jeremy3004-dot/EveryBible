'use client';

import { useEffect, useRef } from 'react';
import type { Map as LibreMap } from 'maplibre-gl';

import {
  globeFitZoom,
  STORY_SPIN_SPEED,
  storyScene,
  type StoryPadding,
  type StoryStep,
} from '../../lib/atlas-story';

const HANDLERS = [
  'scrollZoom',
  'boxZoom',
  'dragRotate',
  'dragPan',
  'keyboard',
  'doubleClickZoom',
  'touchZoomRotate',
] as const;

/* Latitude the globe tilts toward while it turns: most of the world's
   languages sit north of the equator. */
const STORY_LATITUDE = 18;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * While the homepage tells its story the globe is scenery: wheel and touch
 * gestures scroll the page instead of zooming the map, the globe turns on its
 * own, and each step eases to its scene. Explore mode hands control back.
 */
export function useStoryCamera(
  map: LibreMap | null,
  {
    active,
    step,
    padding,
    running,
  }: {
    active: boolean;
    step: StoryStep;
    padding: StoryPadding;
    /** False while the globe is scrolled out of view, so it stops drawing. */
    running: boolean;
  }
) {
  useEffect(() => {
    if (!map) return;
    for (const handler of HANDLERS) {
      if (active) map[handler].disable();
      else map[handler].enable();
    }
  }, [map, active]);

  // The first fit happens the moment the map appears: jump, don't zoom out.
  const placed = useRef<LibreMap | null>(null);
  useEffect(() => {
    if (!map || !active) return;
    const first = placed.current !== map;
    placed.current = map;
    const scene = storyScene(step);
    const canvas = map.getCanvas();
    const width = canvas.clientWidth - padding.left - padding.right;
    const height = canvas.clientHeight - padding.top - padding.bottom;
    const latitude = scene.center?.[1] ?? STORY_LATITUDE;
    map.easeTo({
      center: scene.center ?? [map.getCenter().lng, latitude],
      // On a phone the globe is already small; leaning in would crop Africa.
      zoom:
        globeFitZoom(width, height, latitude) + (canvas.clientWidth > 760 ? scene.zoomBoost : 0),
      bearing: 0,
      pitch: 0,
      padding,
      duration: first || reducedMotion() ? 0 : 1400,
    });
  }, [map, active, step, padding]);

  useEffect(() => {
    if (!map || !active || !running || !storyScene(step).spin || reducedMotion()) return;
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      // Let a step's own camera move finish before turning again.
      if (document.hidden || map.isMoving()) {
        last = 0;
        return;
      }
      if (last) {
        const center = map.getCenter();
        map.setCenter([center.lng + ((now - last) / 1000) * STORY_SPIN_SPEED, center.lat]);
      }
      last = now;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [map, active, running, step]);
}
