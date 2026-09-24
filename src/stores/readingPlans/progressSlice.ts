import type { ReadingPlansStoreState } from '../../services/plans/types';
import {
  applyProgressUpdate,
  buildPlanDayResumeKey,
  completeDay,
  completeRecurringDay,
  completeSession,
  createProgressRecord,
  getRejoinNotBeforeMs,
  replaceProgressCollections,
  withoutKey,
} from './planProgressModel';
import type { ReadingPlansSliceCreator } from './readingPlansSliceTypes';

type ProgressSlice = Pick<
  ReadingPlansStoreState,
  | 'enrollPlan'
  | 'upsertProgress'
  | 'replaceProgress'
  | 'setPlanDayResume'
  | 'getPlanDayResume'
  | 'clearPlanDayResume'
  | 'markDayComplete'
  | 'markSessionComplete'
  | 'isSessionComplete'
  | 'markRecurringDayComplete'
  | 'getProgress'
>;

/** Enrolment rows, day and session completion, and where each plan day was left off. */
export const createProgressSlice: ReadingPlansSliceCreator<ProgressSlice> = (set, get) => ({
  enrollPlan: (planId) => {
    // A leave that has not reached the server yet stays queued: dropping it
    // let the server's pre-leave row merge back into the re-join, reviving
    // its start date and completed days. The sync sends the leave first
    // (which deletes that row) and pushes this enrolment after it, so the
    // re-join must start strictly after the leave or the leave would end it.
    // A leave the server already confirmed is judged as it stored it, on its
    // clock: on a phone running slow, now can still be at or before it.
    const { pendingUnenrollAtByPlanId, serverLeftAtByPlanId } = get();
    const progress = createProgressRecord(
      planId,
      getRejoinNotBeforeMs(pendingUnenrollAtByPlanId[planId], serverLeftAtByPlanId[planId])
    );
    set((state) => ({
      ...state,
      ...applyProgressUpdate(state, progress),
      // Used up: the start now carries it.
      serverLeftAtByPlanId: withoutKey(state.serverLeftAtByPlanId, planId),
    }));
    return progress;
  },

  upsertProgress: (progress) => {
    set((state) => ({
      ...state,
      ...applyProgressUpdate(state, progress),
    }));
    return progress;
  },

  replaceProgress: (progressList) => {
    set((state) => ({
      ...state,
      ...replaceProgressCollections(progressList),
    }));
  },

  setPlanDayResume: (planId, dayNumber, bookId, chapter) => {
    if (!bookId || !Number.isInteger(chapter) || chapter < 1) {
      return;
    }

    const resumeKey = buildPlanDayResumeKey(planId, dayNumber);
    set((state) => ({
      ...state,
      planDayResumeByKey: {
        ...state.planDayResumeByKey,
        [resumeKey]: { bookId, chapter },
      },
    }));
  },

  getPlanDayResume: (planId, dayNumber) =>
    get().planDayResumeByKey[buildPlanDayResumeKey(planId, dayNumber)] ?? null,

  clearPlanDayResume: (planId, dayNumber) => {
    const resumeKey = buildPlanDayResumeKey(planId, dayNumber);
    set((state) => ({
      ...state,
      planDayResumeByKey: Object.fromEntries(
        Object.entries(state.planDayResumeByKey).filter(([key]) => key !== resumeKey)
      ),
    }));
  },

  markDayComplete: (planId, dayNumber, totalDays) => {
    const existing = get().progressByPlanId[planId];
    if (!existing) {
      return null;
    }

    const updatedProgress = completeDay(existing, dayNumber, totalDays, new Date().toISOString());
    set((state) => ({
      ...state,
      ...applyProgressUpdate(state, updatedProgress),
    }));

    return updatedProgress;
  },

  markSessionComplete: (planId, dayNumber, sessionKey, options) => {
    const existing = get().progressByPlanId[planId];
    if (!existing || !options.completionKey.trim()) {
      return null;
    }

    const updatedProgress = completeSession(
      existing,
      dayNumber,
      sessionKey,
      options,
      new Date().toISOString()
    );
    set((state) => ({
      ...state,
      ...applyProgressUpdate(state, updatedProgress),
    }));

    return updatedProgress;
  },

  isSessionComplete: (planId, completionKey) =>
    Boolean(get().progressByPlanId[planId]?.completed_sessions?.[completionKey]),

  markRecurringDayComplete: (planId, completionKey, dayNumber) => {
    const existing = get().progressByPlanId[planId];
    if (!existing || !completionKey.trim()) {
      return null;
    }

    const updatedProgress = completeRecurringDay(
      existing,
      completionKey,
      dayNumber,
      new Date().toISOString()
    );
    set((state) => ({
      ...state,
      ...applyProgressUpdate(state, updatedProgress),
    }));

    return updatedProgress;
  },

  getProgress: (planId) => get().progressByPlanId[planId] ?? null,
});
