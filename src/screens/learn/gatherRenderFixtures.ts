/**
 * Shared fixtures for the Gather screens' render tests (`*.render.test.tsx` in
 * this folder). Not imported by production code.
 */
import type { MockTracker } from 'node:test';
import type { i18n as I18nInstance } from 'i18next';
import type { ReactTestInstance } from 'react-test-renderer';
import { create } from 'zustand';
import { gatherArtworkXml } from '../../data/gatherArtwork';
import { mockPackage } from '../../testing/mockModules';
import { createSvgFake } from '../../testing/nativePackageFakes';

/**
 * The harness's react-native-svg fake has a component as its default export.
 * Node's CommonJS module mocks refuse named exports beside a non-object
 * default, and GatherIconBadge (which also calls `require()`) loads as
 * CommonJS under tsx. Install the harness with `skip: ['react-native-svg']`
 * and call this instead: same host components, object default.
 */
export function mockSvgForCommonJs(mocker: MockTracker): void {
  const named: Record<string, unknown> = { ...createSvgFake() };
  delete named.default;
  mockPackage(mocker, 'react-native-svg', { ...named, default: { ...named } });
}

export interface FakeGatherState {
  completedLessons: Record<string, string[]>;
  markLessonComplete: (parentId: string, lessonId: string) => void;
  unmarkLessonComplete: (parentId: string, lessonId: string) => void;
  isLessonComplete: (parentId: string, lessonId: string) => boolean;
  getCompletedCount: (parentId: string) => number;
}

/** A real Zustand store with the gather store's completion API, minus persistence. */
export function createFakeGatherStore() {
  return create<FakeGatherState>()((set, get) => ({
    completedLessons: {},
    markLessonComplete: (parentId, lessonId) =>
      set((state) => {
        const done = state.completedLessons[parentId] ?? [];
        if (done.includes(lessonId)) return state;
        return { completedLessons: { ...state.completedLessons, [parentId]: [...done, lessonId] } };
      }),
    unmarkLessonComplete: (parentId, lessonId) =>
      set((state) => ({
        completedLessons: {
          ...state.completedLessons,
          [parentId]: (state.completedLessons[parentId] ?? []).filter((id) => id !== lessonId),
        },
      })),
    isLessonComplete: (parentId, lessonId) =>
      (get().completedLessons[parentId] ?? []).includes(lessonId),
    getCompletedCount: (parentId) => (get().completedLessons[parentId] ?? []).length,
  }));
}

/**
 * Something in the rendered artwork that only this key's registry entry
 * produces: the embedded bitmap for wrapped exports, otherwise the first path.
 */
export function artworkFingerprint(key: string): string {
  const xml = gatherArtworkXml[key];
  if (!xml) throw new Error(`no gather artwork registered for ${key}`);
  const bitmap = xml.match(/(?:xlink:href|href)="(data:image\/[^"]+)"/i);
  if (bitmap) return bitmap[1];
  const path = xml.match(/\sd="([^"]{24,})"/);
  if (!path) throw new Error(`gather artwork ${key} has no path to fingerprint`);
  return path[1];
}

/** The artwork a GatherIconBadge drew: its SVG markup or its bitmap URI. */
export function renderedArtwork(node: ReactTestInstance): string | null {
  const svg = node.findAll((entry) => (entry.type as unknown) === 'SvgXml');
  if (svg.length > 0) return svg[0].props.xml as string;
  const image = node.findAll((entry) => (entry.type as unknown) === 'Image');
  if (image.length > 0) return (image[0].props.source as { uri: string }).uri;
  return null;
}

/** True when `node` (a badge or anything containing one) draws `key`'s artwork. */
export function drawsArtwork(node: ReactTestInstance, key: string): boolean {
  const drawn = renderedArtwork(node);
  return drawn !== null && drawn.includes(artworkFingerprint(key));
}

/**
 * Give each key's English copy a suffix no data file carries, so a screen that
 * shows a data-file title instead of `t(key)` fails a test that looks the copy
 * up with `t(key)`. Call once at module scope with the harness's i18n.
 */
export function distinguishTranslatedCopy(i18n: I18nInstance, keys: Iterable<string>): void {
  for (const key of keys) {
    i18n.addResource('en', 'translation', key, `${i18n.t(key)} (t)`);
  }
}
