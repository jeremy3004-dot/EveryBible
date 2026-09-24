import type {
  ReadingPlanRhythm,
  ReadingPlanRhythmInput,
  ReadingPlansStoreState,
} from '../../services/plans/types';
import { normalizeRhythmSlot } from '../../services/plans/rhythmSlots';
import {
  buildRhythmMutationResult,
  createRhythmId,
  getRhythmPlanIds,
  moveRhythmItemByIndex,
  normalizeRhythmCollections,
  normalizeRhythmItems,
  resolveRhythmTitle,
  RHYTHM_MUTATION_ERROR_CODES,
  validateRhythmItems,
} from './rhythmModel';
import type { ReadingPlansSet, ReadingPlansSliceCreator } from './readingPlansSliceTypes';

type RhythmSlice = Pick<
  ReadingPlansStoreState,
  | 'createRhythm'
  | 'updateRhythm'
  | 'deleteRhythm'
  | 'reorderRhythms'
  | 'moveRhythmItem'
  | 'moveRhythmPlan'
  | 'getRhythm'
  | 'getRhythmForPlan'
>;

/** Moves the item a finder picks one place up or down, stamping the rhythm as updated. */
const moveItemInRhythm = (
  set: ReadingPlansSet,
  rhythmId: string,
  findIndex: (rhythm: ReadingPlanRhythm) => number,
  direction: 'up' | 'down'
): void => {
  set((state) => {
    const rhythm = state.rhythmsById[rhythmId];
    if (!rhythm) {
      return state;
    }

    const items = moveRhythmItemByIndex(rhythm.items, findIndex(rhythm), direction);
    if (!items) {
      return state;
    }

    return {
      ...state,
      rhythmsById: {
        ...state.rhythmsById,
        [rhythmId]: {
          ...rhythm,
          items,
          updatedAt: new Date().toISOString(),
        },
      },
    };
  });
};

/** Reading rhythms: named groups of plans and passages read together in a time-of-day slot. */
export const createRhythmSlice: ReadingPlansSliceCreator<RhythmSlice> = (set, get) => ({
  createRhythm: (input: ReadingPlanRhythmInput = {}) => {
    const items = normalizeRhythmItems(input);
    if (items.length === 0) {
      return buildRhythmMutationResult(false, undefined, RHYTHM_MUTATION_ERROR_CODES.emptyItems);
    }

    const state = get();
    const validationError = validateRhythmItems(state.rhythmsById, items);
    if (validationError) {
      return buildRhythmMutationResult(false, undefined, validationError);
    }

    const now = new Date().toISOString();
    const slot = normalizeRhythmSlot(input.slot);
    const rhythm: ReadingPlanRhythm = {
      id: createRhythmId(),
      title: resolveRhythmTitle(input.title, state.rhythmsById, undefined, slot),
      slot,
      items,
      createdAt: now,
      updatedAt: now,
    };

    set((currentState) => ({
      ...currentState,
      ...normalizeRhythmCollections(
        {
          ...currentState.rhythmsById,
          [rhythm.id]: rhythm,
        },
        [...currentState.rhythmOrder, rhythm.id]
      ),
    }));

    return buildRhythmMutationResult(true, rhythm);
  },

  updateRhythm: (rhythmId, input = {}) => {
    const existingRhythm = get().rhythmsById[rhythmId];
    if (!existingRhythm) {
      return buildRhythmMutationResult(false, undefined, RHYTHM_MUTATION_ERROR_CODES.notFound);
    }

    const nextItems =
      input.items !== undefined || input.planIds !== undefined
        ? normalizeRhythmItems({
            items: input.items,
            planIds: input.planIds,
          })
        : existingRhythm.items;

    if (nextItems.length === 0) {
      return buildRhythmMutationResult(false, undefined, RHYTHM_MUTATION_ERROR_CODES.emptyItems);
    }

    const state = get();
    const validationError = validateRhythmItems(state.rhythmsById, nextItems, rhythmId);
    if (validationError) {
      return buildRhythmMutationResult(false, undefined, validationError);
    }

    const slot = input.slot === undefined ? existingRhythm.slot : normalizeRhythmSlot(input.slot);
    const rhythm: ReadingPlanRhythm = {
      ...existingRhythm,
      title: resolveRhythmTitle(input.title, state.rhythmsById, rhythmId, slot),
      slot,
      items: nextItems,
      updatedAt: new Date().toISOString(),
    };

    set((currentState) => ({
      ...currentState,
      ...normalizeRhythmCollections(
        {
          ...currentState.rhythmsById,
          [rhythmId]: rhythm,
        },
        currentState.rhythmOrder
      ),
    }));

    return buildRhythmMutationResult(true, rhythm);
  },

  deleteRhythm: (rhythmId) => {
    set((state) => {
      if (!state.rhythmsById[rhythmId]) {
        return state;
      }

      const rhythmsById = { ...state.rhythmsById };
      delete rhythmsById[rhythmId];
      return {
        ...state,
        ...normalizeRhythmCollections(
          rhythmsById,
          state.rhythmOrder.filter((id) => id !== rhythmId)
        ),
      };
    });
  },

  reorderRhythms: (rhythmOrder) => {
    set((state) => ({
      ...state,
      ...normalizeRhythmCollections(state.rhythmsById, rhythmOrder),
    }));
  },

  moveRhythmItem: (rhythmId, itemId, direction) => {
    moveItemInRhythm(
      set,
      rhythmId,
      (rhythm) => rhythm.items.findIndex((item) => item.id === itemId),
      direction
    );
  },

  moveRhythmPlan: (rhythmId, planId, direction) => {
    moveItemInRhythm(
      set,
      rhythmId,
      (rhythm) => rhythm.items.findIndex((item) => item.type === 'plan' && item.planId === planId),
      direction
    );
  },

  getRhythm: (rhythmId) => get().rhythmsById[rhythmId] ?? null,

  getRhythmForPlan: (planId) =>
    get()
      .rhythmOrder.map((rhythmId) => get().rhythmsById[rhythmId] ?? null)
      .find(
        (rhythm): rhythm is ReadingPlanRhythm =>
          rhythm !== null && getRhythmPlanIds(rhythm).includes(planId)
      ) ?? null,
});
