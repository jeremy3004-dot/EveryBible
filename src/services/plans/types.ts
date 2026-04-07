export type ReadingPlanCategory =
  | 'chronological'
  | 'topical'
  | 'book-study'
  | 'devotional'
  | 'custom'
  | null;

export interface ReadingPlan {
  id: string;
  slug: string;
  title_key: string;
  description_key: string | null;
  duration_days: number;
  category: ReadingPlanCategory;
  is_active: boolean;
  sort_order: number;
  cover_image_url: string | null;
  cover_image_key?: string | null;
  featured: boolean;
  completion_count: number;
  created_at: string;
}

export interface ReadingPlanEntry {
  id: string;
  plan_id: string;
  day_number: number;
  book: string;
  chapter_start: number;
  chapter_end: number | null;
}

export interface UserReadingPlanProgress {
  id: string;
  user_id: string;
  plan_id: string;
  started_at: string;
  completed_entries: Record<string, string>;
  current_day: number;
  is_completed: boolean;
  completed_at: string | null;
  synced_at: string;
}

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

