export type ReadingPlanCategory =
  | 'chronological'
  | 'topical'
  | 'book-study'
  | 'devotional'
  | 'custom';

export type ReadingPlanScheduleMode = 'relative' | 'calendar-day-of-month' | 'calendar-day-of-week';
export type ReadingPlanFormat = 'single-session' | 'multi-session';
export type PlanSessionKey = 'morning' | 'midday' | 'evening';
export type ReadingPlanWeekStartsOn = 'sunday' | 'monday';

export type ReadingPlansTabKey = 'myPlans' | 'findPlans' | 'savedPlans' | 'completedPlans';
export type ReadingPlanCoverKey =
  | 'dunes'
  | 'faithObedience'
  | 'field'
  | 'gospelFoundations'
  | 'greatCommission'
  | 'hearingGodVoice'
  | 'holinessSanctification'
  | 'identityInChrist'
  | 'kingdomOfGod'
  | 'forest'
  | 'prayerIntimacy'
  | 'riverForest'
  | 'sandDune'
  | 'spiritualWarfare'
  | 'mountains'
  | 'pineSky'
  | 'river'
  | 'stars'
  | 'seashore'
  | 'lakeLandscape'
  | 'kathisma'
  | 'sunrise'
  | 'valley'
  | 'desert';

export interface ReadingPlan {
  id: string;
  slug: string;
  title_key: string;
  description_key: string | null;
  duration_days: number;
  category: ReadingPlanCategory | null;
  is_active: boolean;
  sort_order: number;
  coverKey: ReadingPlanCoverKey;
  cover_key?: ReadingPlanCoverKey;
  cover_image_key?: ReadingPlanCoverKey | null;
  cover_image_url?: string | null;
  featured?: boolean;
  completion_count?: number;
  created_at?: string;
  scheduleMode?: ReadingPlanScheduleMode;
  weekStartsOn?: ReadingPlanWeekStartsOn;
  format?: ReadingPlanFormat;
  sessionOrder?: PlanSessionKey[];
}

export interface ReadingPlanEntry {
  id: string;
  plan_id: string;
  day_number: number;
  session_key?: PlanSessionKey | null;
  session_title?: string | null;
  session_order?: number | null;
  book: string;
  chapter_start: number;
  chapter_end: number | null;
  verse_start?: number | null;
  verse_end?: number | null;
}

export interface ReadingPlanProgress {
  id: string;
  user_id?: string;
  plan_id: string;
  started_at: string;
  completed_entries: Record<string, string>;
  completed_sessions?: Record<string, string>;
  current_day: number;
  current_session?: PlanSessionKey | null;
  is_completed: boolean;
  completed_at: string | null;
  synced_at: string;
}

export type UserReadingPlanProgress = ReadingPlanProgress;

export interface ReadingPlanDayResume {
  bookId: string;
  chapter: number;
}

export type RhythmId = string;
export type RhythmItemId = string;
export type RhythmSlot = 'morning' | 'afternoon' | 'evening';

export interface ReadingPlanRhythmPlanItem {
  id: RhythmItemId;
  type: 'plan';
  planId: string;
}

export interface ReadingPlanRhythmPassageItem {
  id: RhythmItemId;
  type: 'passage';
  title: string;
  bookId: string;
  startChapter: number;
  endChapter: number;
}

export type ReadingPlanRhythmItem = ReadingPlanRhythmPlanItem | ReadingPlanRhythmPassageItem;

export interface ReadingPlanRhythm {
  id: RhythmId;
  title: string;
  slot?: RhythmSlot;
  items: ReadingPlanRhythmItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ReadingPlanRhythmInput {
  title?: string | null;
  slot?: RhythmSlot | null;
  items?: ReadingPlanRhythmItem[];
  planIds?: string[];
}

export interface ReadingPlanRhythmMutationResult {
  success: boolean;
  rhythm?: ReadingPlanRhythm;
  error?: string;
}

export interface ReadingPlanRhythmSessionSegment {
  itemId: RhythmItemId;
  type: 'plan' | 'passage';
  title: string;
  startIndex: number;
  endIndex: number;
  chapterKeys: string[];
  isComplete: boolean;
  planId?: string;
  dayNumber?: number;
  bookId?: string;
  startChapter?: number;
  endChapter?: number;
}

export interface RhythmSessionContext {
  type: 'rhythm';
  rhythmId: RhythmId;
  title: string;
  itemIds: RhythmItemId[];
  planIds: string[];
  chapterKeys: string[];
  segments: ReadingPlanRhythmSessionSegment[];
}

export type ReadingPlanRhythmSession = RhythmSessionContext;
export interface GroupReadingPlan {
  id: string;
  group_id: string;
  plan_id: string;
  assigned_by: string;
  started_at: string;
}

export interface UserSavedPlan {
  id: string;
  user_id: string;
  plan_id: string;
  saved_at: string;
}

export interface ReadingPlansPersistedState {
  enrolledPlanIds: string[];
  savedPlanIds: string[];
  completedPlanIds: string[];
  progressByPlanId: Record<string, ReadingPlanProgress>;
  planDayResumeByKey: Record<string, ReadingPlanDayResume>;
  groupPlansByGroupId: Record<string, GroupReadingPlan[]>;
  rhythmsById: Record<RhythmId, ReadingPlanRhythm>;
  rhythmOrder: RhythmId[];
  /**
   * Plans the user has unenrolled from locally whose remote delete has not yet
   * been confirmed. Used to prevent zombie re-enrollment on the next full fetch
   * and to retry the remote delete during sync (see M12).
   */
  pendingUnenrollPlanIds: string[];
}

export interface ReadingPlansStoreState extends ReadingPlansPersistedState {
  createRhythm: (input?: ReadingPlanRhythmInput) => ReadingPlanRhythmMutationResult;
  updateRhythm: (
    rhythmId: RhythmId,
    input?: ReadingPlanRhythmInput
  ) => ReadingPlanRhythmMutationResult;
  deleteRhythm: (rhythmId: RhythmId) => void;
  reorderRhythms: (rhythmOrder: RhythmId[]) => void;
  moveRhythmItem: (rhythmId: RhythmId, itemId: RhythmItemId, direction: 'up' | 'down') => void;
  moveRhythmPlan: (rhythmId: RhythmId, planId: string, direction: 'up' | 'down') => void;
  getRhythm: (rhythmId: RhythmId) => ReadingPlanRhythm | null;
  getRhythmForPlan: (planId: string) => ReadingPlanRhythm | null;
  enrollPlan: (planId: string) => ReadingPlanProgress;
  savePlan: (planId: string) => void;
  unsavePlan: (planId: string) => void;
  upsertProgress: (progress: ReadingPlanProgress) => ReadingPlanProgress;
  replaceProgress: (progressList: ReadingPlanProgress[]) => void;
  setPlanDayResume: (planId: string, dayNumber: number, bookId: string, chapter: number) => void;
  getPlanDayResume: (planId: string, dayNumber: number) => ReadingPlanDayResume | null;
  clearPlanDayResume: (planId: string, dayNumber: number) => void;
  markDayComplete: (
    planId: string,
    dayNumber: number,
    totalDays: number
  ) => ReadingPlanProgress | null;
  markSessionComplete: (
    planId: string,
    dayNumber: number,
    sessionKey: PlanSessionKey,
    options: {
      completionKey: string;
      dayCompletionKey: string;
      totalDays: number;
      isFinalSession: boolean;
      advanceDayOnCompletion: boolean;
      nextSessionKey?: PlanSessionKey | null;
    }
  ) => ReadingPlanProgress | null;
  isSessionComplete: (planId: string, completionKey: string) => boolean;
  markRecurringDayComplete: (
    planId: string,
    completionKey: string,
    dayNumber: number
  ) => ReadingPlanProgress | null;
  unenrollPlan: (planId: string) => void;
  getProgress: (planId: string) => ReadingPlanProgress | null;
  assignGroupPlan: (groupId: string, planId: string, assignedBy?: string) => GroupReadingPlan;
  getGroupPlans: (groupId: string) => GroupReadingPlan[];
  /** Records a pending unenroll tombstone so an unconfirmed remote delete can be retried (M12). */
  addPendingUnenroll: (planId: string) => void;
  /** Clears a tombstone once the remote delete is confirmed (or the plan is re-enrolled) (M12). */
  clearPendingUnenroll: (planId: string) => void;
  /** Consumes guest-only tombstones before the first authenticated sync. */
  clearPendingUnenrolls: () => void;
  resetAll: () => void;
  /**
   * Clears all per-user plan progress, rhythms, and tombstones back to the initial
   * empty state. Called on sign-out to prevent cross-account data leakage (H2).
   */
  resetForSignOut: () => void;
}
