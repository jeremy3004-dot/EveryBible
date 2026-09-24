import { getRhythmSlotDefaultTitle, RHYTHM_SLOT_ORDER } from '../../services/plans/rhythmSlots';
import type {
  ReadingPlanRhythm,
  ReadingPlanRhythmItem,
  ReadingPlanRhythmMutationResult,
  ReadingPlansPersistedState,
  RhythmId,
  RhythmItemId,
  RhythmSlot,
} from '../../services/plans/types';

/**
 * Stable, translation-safe error codes returned by rhythm mutations.
 * Screens map these to i18n keys via `t()` (see H9) — never surface them raw.
 */
export const RHYTHM_MUTATION_ERROR_CODES = {
  emptyItems: 'RHYTHM_EMPTY_ITEMS',
  planInAnotherRhythm: 'RHYTHM_PLAN_IN_ANOTHER',
  notFound: 'RHYTHM_NOT_FOUND',
} as const;

export type RhythmMutationErrorCode =
  (typeof RHYTHM_MUTATION_ERROR_CODES)[keyof typeof RHYTHM_MUTATION_ERROR_CODES];

type RhythmCollections = Pick<ReadingPlansPersistedState, 'rhythmsById' | 'rhythmOrder'>;

let rhythmSequence = 0;
let rhythmItemSequence = 0;

export const createRhythmId = (): RhythmId =>
  `reading-plan-rhythm-${Date.now()}-${(rhythmSequence += 1)}`;
const createRhythmItemId = (): RhythmItemId =>
  `reading-plan-rhythm-item-${Date.now()}-${(rhythmItemSequence += 1)}`;

const normalizeRhythmPlanIds = (planIds: string[] = []): string[] => {
  const seen = new Set<string>();

  return planIds.reduce<string[]>((accumulator, planId) => {
    const trimmedPlanId = planId.trim();
    if (!trimmedPlanId || seen.has(trimmedPlanId)) {
      return accumulator;
    }

    seen.add(trimmedPlanId);
    accumulator.push(trimmedPlanId);
    return accumulator;
  }, []);
};

const buildPassageTitle = (bookId: string, startChapter: number, endChapter: number): string =>
  startChapter === endChapter
    ? `${bookId} ${startChapter}`
    : `${bookId} ${startChapter}-${endChapter}`;

/**
 * Trims and de-duplicates rhythm items (a plan appears once, item ids are unique), filling a
 * missing id or passage title. Falls back to `planIds` when no items are given.
 */
export const normalizeRhythmItems = (input: {
  items?: ReadingPlanRhythmItem[];
  planIds?: string[];
}): ReadingPlanRhythmItem[] => {
  if (Array.isArray(input.items) && input.items.length > 0) {
    const seenItemIds = new Set<RhythmItemId>();
    const seenPlanIds = new Set<string>();

    return input.items.reduce<ReadingPlanRhythmItem[]>((accumulator, item) => {
      if (!item) {
        return accumulator;
      }

      if (item.type === 'plan') {
        const planId = item.planId.trim();
        if (!planId || seenPlanIds.has(planId)) {
          return accumulator;
        }

        seenPlanIds.add(planId);
        const itemId = item.id?.trim() || createRhythmItemId();
        if (seenItemIds.has(itemId)) {
          return accumulator;
        }

        seenItemIds.add(itemId);
        accumulator.push({
          id: itemId,
          type: 'plan',
          planId,
        });
        return accumulator;
      }

      const bookId = item.bookId.trim();
      const startChapter = Math.max(1, Math.trunc(item.startChapter));
      const endChapter = Math.max(startChapter, Math.trunc(item.endChapter));
      if (!bookId) {
        return accumulator;
      }

      const itemId = item.id?.trim() || createRhythmItemId();
      if (seenItemIds.has(itemId)) {
        return accumulator;
      }

      seenItemIds.add(itemId);
      accumulator.push({
        id: itemId,
        type: 'passage',
        title: item.title.trim() || buildPassageTitle(bookId, startChapter, endChapter),
        bookId,
        startChapter,
        endChapter,
      });
      return accumulator;
    }, []);
  }

  return normalizeRhythmPlanIds(input.planIds).map((planId) => ({
    id: createRhythmItemId(),
    type: 'plan',
    planId,
  }));
};

export const getRhythmPlanIds = (rhythm: ReadingPlanRhythm): string[] =>
  rhythm.items
    .filter(
      (item): item is Extract<ReadingPlanRhythmItem, { type: 'plan' }> => item.type === 'plan'
    )
    .map((item) => item.planId);

const findRhythmIdForPlan = (
  rhythmsById: Record<RhythmId, ReadingPlanRhythm>,
  planId: string,
  excludeRhythmId?: RhythmId
): RhythmId | null => {
  for (const rhythm of Object.values(rhythmsById)) {
    if (rhythm.id === excludeRhythmId) {
      continue;
    }

    if (getRhythmPlanIds(rhythm).includes(planId)) {
      return rhythm.id;
    }
  }

  return null;
};

const getFallbackRhythmTitle = (
  rhythmsById: Record<RhythmId, ReadingPlanRhythm>,
  excludeRhythmId?: RhythmId,
  preferredSlot?: RhythmSlot
): string => {
  const usedTitles = new Set(
    Object.values(rhythmsById)
      .filter((rhythm) => rhythm.id !== excludeRhythmId)
      .map((rhythm) => rhythm.title.trim().toLowerCase())
      .filter(Boolean)
  );

  if (preferredSlot) {
    const preferredTitle = getRhythmSlotDefaultTitle(preferredSlot);
    if (!usedTitles.has(preferredTitle.toLowerCase())) {
      return preferredTitle;
    }
  }

  for (const slot of RHYTHM_SLOT_ORDER) {
    const presetTitle = getRhythmSlotDefaultTitle(slot);
    if (!usedTitles.has(presetTitle.toLowerCase())) {
      return presetTitle;
    }
  }

  let fallbackIndex = 1;
  while (usedTitles.has(`rhythm ${fallbackIndex}`)) {
    fallbackIndex += 1;
  }

  return `Rhythm ${fallbackIndex}`;
};

/** The trimmed title, or the first unused slot/"Rhythm N" default when it is blank. */
export const resolveRhythmTitle = (
  title: string | null | undefined,
  rhythmsById: Record<RhythmId, ReadingPlanRhythm>,
  excludeRhythmId?: RhythmId,
  preferredSlot?: RhythmSlot
): string => {
  const trimmedTitle = title?.trim();
  return trimmedTitle
    ? trimmedTitle
    : getFallbackRhythmTitle(rhythmsById, excludeRhythmId, preferredSlot);
};

const normalizeRhythmOrder = (
  candidateOrder: RhythmId[],
  rhythmsById: Record<RhythmId, ReadingPlanRhythm>
): RhythmId[] => {
  const nextOrder: RhythmId[] = [];
  const seen = new Set<RhythmId>();

  for (const rhythmId of candidateOrder) {
    if (!rhythmsById[rhythmId] || seen.has(rhythmId)) {
      continue;
    }

    seen.add(rhythmId);
    nextOrder.push(rhythmId);
  }

  for (const rhythmId of Object.keys(rhythmsById)) {
    if (seen.has(rhythmId)) {
      continue;
    }

    seen.add(rhythmId);
    nextOrder.push(rhythmId);
  }

  return nextOrder;
};

/** Keeps the order to existing rhythms, each once, appending any rhythm the order omits. */
export const normalizeRhythmCollections = (
  rhythmsById: Record<RhythmId, ReadingPlanRhythm>,
  rhythmOrder: RhythmId[]
): RhythmCollections => {
  const nextRhythmsById = { ...rhythmsById };
  const nextRhythmOrder = normalizeRhythmOrder(rhythmOrder, nextRhythmsById);

  return {
    rhythmsById: nextRhythmsById,
    rhythmOrder: nextRhythmOrder,
  };
};

export const buildRhythmMutationResult = (
  success: boolean,
  rhythm?: ReadingPlanRhythm,
  error?: string
): ReadingPlanRhythmMutationResult => ({ success, rhythm, error });

/** A plan may belong to one rhythm only; returns the error code when another rhythm has one. */
export const validateRhythmItems = (
  rhythmsById: Record<RhythmId, ReadingPlanRhythm>,
  items: ReadingPlanRhythmItem[],
  excludeRhythmId?: RhythmId
): string | null => {
  for (const item of items) {
    if (item.type !== 'plan') {
      continue;
    }

    const planId = item.planId;
    const ownerRhythmId = findRhythmIdForPlan(rhythmsById, planId, excludeRhythmId);
    if (ownerRhythmId) {
      return RHYTHM_MUTATION_ERROR_CODES.planInAnotherRhythm;
    }
  }

  return null;
};

/**
 * The items with the one at `currentIndex` moved one place up or down, or null when the index is
 * out of range or the move would leave the list.
 */
export const moveRhythmItemByIndex = (
  items: ReadingPlanRhythmItem[],
  currentIndex: number,
  direction: 'up' | 'down'
): ReadingPlanRhythmItem[] | null => {
  const movedItem = items[currentIndex];
  if (currentIndex < 0 || movedItem === undefined) {
    return null;
  }

  const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= items.length) {
    return null;
  }

  const nextItems = [...items];
  nextItems.splice(currentIndex, 1);
  nextItems.splice(nextIndex, 0, movedItem);
  return nextItems;
};

/** Drops a plan from every rhythm, deleting a rhythm it leaves empty. */
export const removePlanFromRhythms = (
  collections: RhythmCollections,
  planId: string
): RhythmCollections => {
  const rhythmsById = Object.fromEntries(
    Object.entries(collections.rhythmsById)
      .map(([rhythmId, rhythm]) => {
        const nextItems = rhythm.items.filter(
          (item) => !(item.type === 'plan' && item.planId === planId)
        );
        if (nextItems.length === 0) {
          return null;
        }

        return [
          rhythmId,
          nextItems.length === rhythm.items.length
            ? rhythm
            : { ...rhythm, items: nextItems, updatedAt: new Date().toISOString() },
        ];
      })
      .filter((entry): entry is [RhythmId, ReadingPlanRhythm] => entry !== null)
  );

  return normalizeRhythmCollections(
    rhythmsById,
    collections.rhythmOrder.filter((id) => rhythmsById[id])
  );
};
