import type { StateStorage } from 'zustand/middleware';

import { normalizeRhythmSlot } from '../../services/plans/rhythmSlots';
import type {
  GroupReadingPlan,
  ReadingPlanProgress,
  ReadingPlanRhythm,
  ReadingPlanRhythmInput,
  ReadingPlansPersistedState,
  ReadingPlansStoreState,
  RhythmId,
} from '../../services/plans/types';
import {
  asRecord,
  asStringArray,
  isPlainRecord,
  mapRecordValues,
  mergeSanitizedState,
  type PersistedRecord,
} from '../persistedShapeGuards';
import { normalizeProgressRecord } from './planProgressModel';
import { normalizeRhythmCollections, normalizeRhythmItems } from './rhythmModel';

export const READING_PLANS_STORAGE_NAME = 'reading-plans-storage';

// A null entry used to throw inside merge, which left the store empty; the next
// write then replaced every plan's real progress with that empty state.
const normalizeProgressByPlanId = (
  progressByPlanId: unknown
): Record<string, ReadingPlanProgress> =>
  mapRecordValues(progressByPlanId, (progress) =>
    normalizeProgressRecord(progress as unknown as ReadingPlanProgress)
  );

const asRecordOfLists = <T>(value: unknown): Record<string, T[]> =>
  Object.fromEntries(
    Object.entries(asRecord(value)).map(([key, entries]) => [
      key,
      Array.isArray(entries) ? (entries.filter(isPlainRecord) as T[]) : [],
    ])
  );

// Persisted before these leave times existed (or corrupted): keep only real timestamps.
const normalizeLeaveTimes = (value: unknown): Record<string, string> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(
          (entry): entry is [string, string] =>
            typeof entry[1] === 'string' && Number.isFinite(Date.parse(entry[1]))
        )
      )
    : {};

const normalizePersistedRhythmsById = (
  rhythmsById: Record<RhythmId, ReadingPlanRhythm> | undefined
): Record<RhythmId, ReadingPlanRhythm> =>
  Object.fromEntries(
    Object.entries(asRecord(rhythmsById))
      .filter((entry): entry is [RhythmId, ReadingPlanRhythm] => isPlainRecord(entry[1]))
      .map(([rhythmId, rhythm]) => [
        rhythmId,
        {
          ...rhythm,
          slot: normalizeRhythmSlot(rhythm.slot),
          items: normalizeRhythmItems({
            items: Array.isArray((rhythm as ReadingPlanRhythm).items)
              ? (rhythm as ReadingPlanRhythm).items
              : undefined,
            planIds: Array.isArray((rhythm as ReadingPlanRhythmInput).planIds)
              ? (rhythm as ReadingPlanRhythmInput).planIds
              : [],
          }),
        },
      ])
  );

/**
 * MMKV loaded on first use, so importing the store does not pull the native storage module
 * into the startup graph.
 */
export const lazyDefaultStorage: StateStorage = {
  setItem: async (name, value) => {
    const { zustandStorage } = await import('../mmkvStorage');
    return zustandStorage.setItem(name, value);
  },
  getItem: async (name) => {
    const { zustandStorage } = await import('../mmkvStorage');
    return zustandStorage.getItem(name);
  },
  removeItem: async (name) => {
    const { zustandStorage } = await import('../mmkvStorage');
    return zustandStorage.removeItem(name);
  },
};

/**
 * The persisted fields, in the key order every installed blob was written with; fields added
 * since go last, so an older blob keeps its bytes up to them.
 */
export const partializeReadingPlans = (
  state: ReadingPlansStoreState
): ReadingPlansPersistedState => ({
  enrolledPlanIds: state.enrolledPlanIds,
  savedPlanIds: state.savedPlanIds,
  completedPlanIds: state.completedPlanIds,
  progressByPlanId: state.progressByPlanId,
  planDayResumeByKey: state.planDayResumeByKey,
  groupPlansByGroupId: state.groupPlansByGroupId,
  rhythmsById: state.rhythmsById,
  rhythmOrder: state.rhythmOrder,
  pendingUnenrollPlanIds: state.pendingUnenrollPlanIds,
  pendingUnenrollAtByPlanId: state.pendingUnenrollAtByPlanId,
  serverLeftAtByPlanId: state.serverLeftAtByPlanId,
});

/** Folds a stored blob into the fresh state, sanitising each field so corrupt data cannot throw. */
export const mergePersistedReadingPlans = (
  persistedState: unknown,
  currentState: ReadingPlansStoreState
): ReadingPlansStoreState => {
  const persisted = asRecord(persistedState);
  const mergedState = {
    ...mergeSanitizedState<ReadingPlansStoreState>(persistedState, currentState, {
      enrolledPlanIds: asStringArray,
      savedPlanIds: asStringArray,
      completedPlanIds: asStringArray,
      pendingUnenrollPlanIds: asStringArray,
      rhythmOrder: (value) => asStringArray(value) as RhythmId[],
      planDayResumeByKey: (value) =>
        mapRecordValues(
          value,
          (resume: PersistedRecord) =>
            resume as unknown as ReadingPlansPersistedState['planDayResumeByKey'][string]
        ),
      groupPlansByGroupId: (value) => asRecordOfLists<GroupReadingPlan>(value),
    }),
    progressByPlanId: normalizeProgressByPlanId(persisted.progressByPlanId),
    pendingUnenrollAtByPlanId: normalizeLeaveTimes(persisted.pendingUnenrollAtByPlanId),
    serverLeftAtByPlanId: normalizeLeaveTimes(persisted.serverLeftAtByPlanId),
    rhythmsById: normalizePersistedRhythmsById(
      persisted.rhythmsById as ReadingPlansPersistedState['rhythmsById'] | undefined
    ),
  };

  return {
    ...mergedState,
    ...normalizeRhythmCollections(mergedState.rhythmsById, mergedState.rhythmOrder),
  };
};
