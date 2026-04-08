export type ReadingPlanCategory =
  | 'chronological'
  | 'topical'
  | 'book-study'
  | 'devotional'
  | 'custom';

export type ReadingPlansTabKey = 'myPlans' | 'findPlans' | 'savedPlans' | 'completedPlans';
export type ReadingPlanCoverKey =
  | 'dunes'
  | 'forest'
  | 'mountains'
  | 'river'
  | 'stars'
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
}

export interface ReadingPlanEntry {
  id: string;
  plan_id: string;
  day_number: number;
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
  current_day: number;
  is_completed: boolean;
  completed_at: string | null;
  synced_at: string;
}

export type UserReadingPlanProgress = ReadingPlanProgress;

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
  groupPlansByGroupId: Record<string, GroupReadingPlan[]>;
}

export interface ReadingPlansStoreState extends ReadingPlansPersistedState {
  enrollPlan: (planId: string) => ReadingPlanProgress;
  savePlan: (planId: string) => void;
  unsavePlan: (planId: string) => void;
  upsertProgress: (progress: ReadingPlanProgress) => ReadingPlanProgress;
  markDayComplete: (planId: string, dayNumber: number, totalDays: number) => ReadingPlanProgress | null;
  unenrollPlan: (planId: string) => void;
  getProgress: (planId: string) => ReadingPlanProgress | null;
  assignGroupPlan: (groupId: string, planId: string, assignedBy?: string) => GroupReadingPlan;
  getGroupPlans: (groupId: string) => GroupReadingPlan[];
  resetAll: () => void;
}
