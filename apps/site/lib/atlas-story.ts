/**
 * The homepage tells one short story over the globe before anyone touches the
 * atlas tools: the world's languages, the ones with no known Scripture, and
 * the ones EveryBible already speaks. Each scroll step maps to one scene.
 */
export type StoryStep = 0 | 1 | 2 | 3;

export interface StoryScene {
  /** Which records the globe shows. */
  scripture: 'all' | 'no-scripture';
  /** Light up the languages in the app and fade the rest. */
  highlightApp: boolean;
  /** Slowly turn the globe. Off once we stop on a region. */
  spin: boolean;
  /** Where to turn to when entering the step; null keeps the current view. */
  center: [number, number] | null;
  /** Zoom added on top of the zoom that fits the whole globe. */
  zoomBoost: number;
}

/* Africa and the Himalayas, where the app's languages are, both in view. */
const APP_REGION: [number, number] = [62, 14];

const SCENES: Record<StoryStep, StoryScene> = {
  0: { scripture: 'all', highlightApp: false, spin: true, center: null, zoomBoost: 0 },
  1: { scripture: 'all', highlightApp: false, spin: true, center: null, zoomBoost: 0 },
  2: { scripture: 'no-scripture', highlightApp: false, spin: true, center: null, zoomBoost: 0 },
  3: { scripture: 'all', highlightApp: true, spin: false, center: APP_REGION, zoomBoost: 0.35 },
};

export function storyScene(step: StoryStep): StoryScene {
  return SCENES[step];
}

export function toStoryStep(value: string | number | undefined): StoryStep {
  const step = Number(value);
  return step === 1 || step === 2 || step === 3 ? step : 0;
}

/** Degrees of longitude per second for the idle spin. */
export const STORY_SPIN_SPEED = 3;

/**
 * Zoom at which the globe's diameter is `fraction` of the smaller side of the
 * area left after padding. MapLibre draws the globe so its scale at the map
 * centre matches Web Mercator there, so the radius in pixels is about
 * worldSize · cos(latitude) / (2π); this solves that for zoom. Its perspective
 * camera draws the visible edge at roughly 0.8 of that radius, which the
 * default fraction allows for.
 */
export function globeFitZoom(
  availableWidth: number,
  availableHeight: number,
  latitude: number,
  fraction = 1.05
): number {
  const radius = (Math.max(1, Math.min(availableWidth, availableHeight)) * fraction) / 2;
  const cos = Math.cos((latitude * Math.PI) / 180);
  return Math.log2((2 * Math.PI * radius * cos) / 512);
}

export interface StoryPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Desktop: the copy holds the left column and the globe sits to its right.
 * Phone: the globe holds the top of the screen and the copy sits below it.
 * Right-to-left pages put the copy on the right, so the globe mirrors to the left.
 */
export function storyPadding(
  width: number,
  height: number,
  headerHeight: number,
  rtl = false
): StoryPadding {
  if (width <= 760) {
    return { top: headerHeight + 8, right: 12, bottom: Math.round(height * 0.42), left: 12 };
  }
  const copySide = Math.round(Math.min(width * 0.44, 640));
  const farSide = Math.round(width * 0.04);
  return {
    top: headerHeight + 24,
    right: rtl ? copySide : farSide,
    bottom: 48,
    left: rtl ? farSide : copySide,
  };
}

/**
 * Story counts from the build-time language pages meta, so the numbers are in
 * the server HTML. "No known Scripture" follows the map's own colours: no
 * record, a translation only started, or one still needed.
 */
export function storyStats(
  meta: { languageCount: number; statusCounts: Partial<Record<string, number>> },
  inApp: number
): { languages: number; noScripture: number; inApp: number } {
  const { unknown = 0, started = 0, needed = 0 } = meta.statusCounts;
  return { languages: meta.languageCount, noScripture: unknown + started + needed, inApp };
}
