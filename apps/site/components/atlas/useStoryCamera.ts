'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { Map as LibreMap } from 'maplibre-gl';

import { globeFitZoom, STORY_SPIN_SPEED, type StoryPadding } from '../../lib/atlas-story';

/* Gestures that would catch the page's own scrolling: the wheel, and every
   touch gesture. Mouse dragging stays on so the globe can still be turned. */
const SCROLL_GESTURES = ['scrollZoom', 'touchZoomRotate', 'touchPitch', 'doubleClickZoom'] as const;
const ALL_GESTURES = [...SCROLL_GESTURES, 'dragPan', 'dragRotate', 'boxZoom', 'keyboard'] as const;

/* Latitude the globe tilts toward: most of the world's languages sit north
   of the equator. */
const HERO_LATITUDE = 18;
/* Start a little closer than a whole-globe fit, so the dots read as places. */
const HERO_ZOOM_IN = 0.45;
const SPIN_FRAME_MS = 66;
/* Phone-sized maps keep a still globe: every turn re-projects ~26k dots. */
const PHONE_WIDTH = 760;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Drives the homepage globe while it sits behind the headline: fits it beside
 * the copy, turns it slowly until someone zooms or drags it, and keeps the
 * page scrollable. Explore mode hands every gesture back to the map.
 * Returns zoom handlers for the hero's + and − buttons.
 */
export function useStoryCamera(
  map: LibreMap | null,
  {
    active,
    padding,
    running,
  }: {
    active: boolean;
    padding: StoryPadding;
    /** False while the globe is scrolled out of view, so it stops drawing. */
    running: boolean;
  }
) {
  const handled = useRef(false);

  useEffect(() => {
    if (!map) return;
    const touchOnly = !window.matchMedia('(pointer: fine)').matches;
    for (const gesture of ALL_GESTURES) {
      const off =
        active &&
        ((SCROLL_GESTURES as readonly string[]).includes(gesture) ||
          (touchOnly && (gesture === 'dragPan' || gesture === 'dragRotate')));
      if (off) map[gesture].disable();
      else map[gesture].enable();
    }
    const stop = () => {
      handled.current = true;
    };
    map.on('dragstart', stop);
    map.on('rotatestart', stop);
    return () => {
      map.off('dragstart', stop);
      map.off('rotatestart', stop);
    };
  }, [map, active]);

  // Fit the whole globe beside the headline.
  useEffect(() => {
    if (!map || !active) return;
    const canvas = map.getCanvas();
    const width = canvas.clientWidth - padding.left - padding.right;
    const height = canvas.clientHeight - padding.top - padding.bottom;
    handled.current = false;
    map.jumpTo({
      center: [map.getCenter().lng, HERO_LATITUDE],
      zoom: globeFitZoom(width, height, HERO_LATITUDE) + HERO_ZOOM_IN,
      bearing: 0,
      pitch: 0,
      padding,
    });
  }, [map, active, padding]);

  // Turn slowly at 15 fps until someone takes hold of the globe.
  useEffect(() => {
    if (!map || !active || !running || reducedMotion()) return;
    if (map.getCanvas().clientWidth <= PHONE_WIDTH) return;
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (handled.current || document.hidden || map.isMoving()) {
        last = 0;
        return;
      }
      if (!last) {
        last = now;
        return;
      }
      if (now - last < SPIN_FRAME_MS) return;
      const center = map.getCenter();
      // The Earth turns west to east, so the land drifts right: the camera's
      // longitude falls.
      map.setCenter([center.lng - ((now - last) / 1000) * STORY_SPIN_SPEED, center.lat]);
      last = now;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [map, active, running]);

  const zoomIn = useCallback(() => {
    handled.current = true;
    map?.zoomIn();
  }, [map]);
  const zoomOut = useCallback(() => {
    handled.current = true;
    map?.zoomOut();
  }, [map]);
  return { zoomIn, zoomOut };
}
