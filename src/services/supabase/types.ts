import type { AppearancePaletteId } from '../../constants/appearancePalettes';
import type { LanguageCode } from '../../constants/languages';
import type { TranslationCatalog } from '../../types';

// Database types for Supabase

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserProgress {
  id: string;
  user_id: string;
  chapters_read: Record<string, number>; // "GEN_1": timestamp
  streak_days: number;
  last_read_date: string | null;
  current_book: string;
  current_chapter: number;
  synced_at: string;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  font_size: 'small' | 'medium' | 'large';
  theme: 'dark' | 'light' | 'low-light';
  appearance_palette: AppearancePaletteId;
  language: LanguageCode;
  country_code: string | null;
  country_name: string | null;
  content_language_code: string | null;
  content_language_name: string | null;
  content_language_native_name: string | null;
  chapter_feedback_name: string | null;
  chapter_feedback_role: string | null;
  chapter_feedback_id_number: string | null;
  onboarding_completed: boolean;
  chapter_feedback_enabled: boolean;
  notifications_enabled: boolean;
  reminder_time: string | null;
  synced_at: string;
}

export interface ChapterFeedbackSubmission {
  id: string;
  user_id: string | null;
  translation_id: string;
  translation_language: string;
  interface_language: string;
  content_language_code: string | null;
  content_language_name: string | null;
  participant_name: string | null;
  participant_role: string | null;
  participant_id_number: string | null;
  book_id: string;
  chapter: number;
  sentiment: 'up' | 'down';
  comment: string | null;
  source_screen: string;
  app_platform: string | null;
  app_version: string | null;
  export_status: 'pending' | 'exported' | 'failed';
  exported_at: string | null;
  export_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroupRecord {
  id: string;
  name: string;
  join_code: string;
  leader_id: string;
  current_course_id: string;
  current_lesson_id: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroupMemberRecord {
  group_id: string;
  user_id: string;
  role: 'leader' | 'member';
  joined_at: string;
}

export interface GroupSessionRecord {
  id: string;
  group_id: string;
  course_id: string;
  lesson_id: string;
  notes: Record<string, string>;
  created_by: string;
  completed_at: string;
  created_at: string;
}

// Phase 16: User devices for push notifications
export interface UserDevice {
  id: string;
  user_id: string;
  push_token: string;
  platform: 'ios' | 'android';
  device_id: string | null;
  app_version: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Phase 17: Bookmarks, Highlights & Notes
export interface UserAnnotation {
  id: string;
  user_id: string;
  book: string;
  chapter: number;
  verse_start: number;
  verse_end: number | null;
  type: 'bookmark' | 'highlight' | 'note';
  color: string | null;
  content: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string;
  deleted_at: string | null;
}

// Phase 18: Reading Plans
export interface ReadingPlan {
  id: string;
  slug: string;
  title_key: string;
  description_key: string | null;
  duration_days: number;
  category: 'chronological' | 'topical' | 'book-study' | 'devotional' | 'custom' | null;
  is_active: boolean;
  sort_order: number;
  cover_image_url: string | null;
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
  plan_id: string | null;
  plan_slug: string | null;
  started_at: string;
  completed_entries: Record<string, string>; // {"1": "2026-03-22T...", "5": "2026-03-26T..."}
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

// Phase 19: Prayer Community
export interface PrayerRequest {
  id: string;
  group_id: string;
  user_id: string;
  content: string;
  is_answered: boolean;
  answered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrayerInteraction {
  id: string;
  request_id: string;
  user_id: string;
  type: 'prayed' | 'encouraged';
  created_at: string;
}

// Phase 20: Analytics & Engagement
export interface AnalyticsEvent {
  id: string;
  user_id: string | null;
  event_name: string;
  event_properties: Record<string, unknown>;
  session_id: string | null;
  device_platform: string | null;
  app_version: string | null;
  geo_accuracy_km: number | null;
  geo_city: string | null;
  geo_country_code: string | null;
  geo_latitude: number | null;
  geo_longitude: number | null;
  geo_region_code: string | null;
  geo_region_name: string | null;
  geo_source: string | null;
  geo_timezone: string | null;
  created_at: string;
}

export interface UserEngagementSummary {
  user_id: string;
  total_chapters_read: number;
  total_listening_minutes: number;
  total_reading_minutes: number;
  total_sessions: number;
  avg_session_minutes: number;
  current_streak_days: number;
  longest_streak_days: number;
  last_active_date: string | null;
  engagement_score: number;
  plans_completed: number;
  prayers_submitted: number;
  annotations_created: number;
  updated_at: string;
}

// Phase 28: Cloud Bible verses
export interface BibleVerseRow {
  id: number;
  translation_id: string;
  book_id: string;
  chapter: number;
  verse: number;
  text: string;
  heading: string | null;
  formatting?: unknown | null;
}

// Phase 21: Content Versioning
export interface TranslationCatalogEntry {
  id: string;
  translation_id: string;
  name: string;
  abbreviation: string;
  language_code: string;
  language_name: string;
  license_type: string | null;
  license_url: string | null;
  source_url: string | null;
  has_audio: boolean;
  has_text: boolean;
  is_bundled: boolean;
  is_available: boolean;
  sort_order: number;
  catalog: TranslationCatalog | null;
  text_direction?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TranslationVersion {
  id: string;
  translation_id: string;
  version_number: number;
  changelog: string | null;
  data_checksum: string | null;
  total_books: number | null;
  total_chapters: number | null;
  total_verses: number | null;
  published_at: string;
  is_current: boolean;
}

export interface UserTranslationPreferences {
  id: string;
  user_id: string;
  primary_translation: string;
  secondary_translation: string | null;
  audio_translation: string | null;
  synced_at: string;
}

export interface Database {
  public: {
    CompositeTypes: Record<string, never>;
    Enums: Record<string, never>;
    Functions: {
      delete_my_account: {
        Args: Record<PropertyKey, never>;
        Returns: void;
      };
      join_group_by_code: {
        Args: {
          group_join_code: string;
        };
        Returns: string;
      };
      leave_group: {
        Args: {
          target_group_id: string;
        };
        Returns: void;
      };
      batch_track_events: {
        Args: {
          events: unknown;
        };
        Returns: void;
      };
      refresh_my_engagement: {
        Args: Record<PropertyKey, never>;
        Returns: void;
      };
    };
    Tables: {
      groups: {
        Row: GroupRecord;
        Insert: Omit<GroupRecord, 'id' | 'created_at' | 'updated_at' | 'archived_at'> & {
          archived_at?: string | null;
        };
        Update: Partial<Omit<GroupRecord, 'id' | 'created_at'>>;
        Relationships: [];
      };
      group_members: {
        Row: GroupMemberRecord;
        Insert: GroupMemberRecord;
        Update: Partial<Omit<GroupMemberRecord, 'group_id' | 'user_id'>>;
        Relationships: [];
      };
      group_sessions: {
        Row: GroupSessionRecord;
        Insert: Omit<GroupSessionRecord, 'id' | 'created_at' | 'completed_at'> & {
          completed_at?: string;
          notes?: Record<string, string>;
        };
        Update: Partial<Omit<GroupSessionRecord, 'id' | 'group_id' | 'created_by' | 'created_at'>>;
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Profile, 'id'>>;
        Relationships: [];
      };
      user_progress: {
        Row: UserProgress;
        Insert: Omit<UserProgress, 'id' | 'synced_at'>;
        Update: Partial<Omit<UserProgress, 'id' | 'user_id'>>;
        Relationships: [];
      };
      user_preferences: {
        Row: UserPreferences;
        Insert: Omit<UserPreferences, 'id' | 'synced_at'>;
        Update: Partial<Omit<UserPreferences, 'id' | 'user_id'>>;
        Relationships: [];
      };
      chapter_feedback_submissions: {
        Row: ChapterFeedbackSubmission;
        Insert: Omit<ChapterFeedbackSubmission, 'id' | 'created_at' | 'updated_at'> & {
          export_status?: ChapterFeedbackSubmission['export_status'];
          source_screen?: string;
        };
        Update: Partial<Omit<ChapterFeedbackSubmission, 'id' | 'created_at'>>;
        Relationships: [];
      };
      user_devices: {
        Row: UserDevice;
        Insert: Omit<UserDevice, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<UserDevice, 'id' | 'user_id'>>;
        Relationships: [];
      };
      user_annotations: {
        Row: UserAnnotation;
        Insert: Omit<UserAnnotation, 'id' | 'created_at' | 'updated_at' | 'synced_at'>;
        Update: Partial<Omit<UserAnnotation, 'id' | 'user_id'>>;
        Relationships: [];
      };
      reading_plans: {
        Row: ReadingPlan;
        Insert: Omit<ReadingPlan, 'id' | 'created_at'>;
        Update: Partial<Omit<ReadingPlan, 'id'>>;
        Relationships: [];
      };
      reading_plan_entries: {
        Row: ReadingPlanEntry;
        Insert: Omit<ReadingPlanEntry, 'id'>;
        Update: Partial<Omit<ReadingPlanEntry, 'id'>>;
        Relationships: [];
      };
      user_reading_plan_progress: {
        Row: UserReadingPlanProgress;
        Insert: Omit<UserReadingPlanProgress, 'id' | 'synced_at'>;
        Update: Partial<Omit<UserReadingPlanProgress, 'id' | 'user_id'>>;
        Relationships: [];
      };
      group_reading_plans: {
        Row: GroupReadingPlan;
        Insert: Omit<GroupReadingPlan, 'id'>;
        Update: Partial<Omit<GroupReadingPlan, 'id'>>;
        Relationships: [];
      };
      user_saved_plans: {
        Row: UserSavedPlan;
        Insert: Omit<UserSavedPlan, 'id' | 'saved_at'>;
        Update: Partial<Omit<UserSavedPlan, 'id' | 'user_id'>>;
        Relationships: [];
      };
      prayer_requests: {
        Row: PrayerRequest;
        Insert: Omit<PrayerRequest, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<PrayerRequest, 'id' | 'group_id' | 'user_id'>>;
        Relationships: [];
      };
      prayer_interactions: {
        Row: PrayerInteraction;
        Insert: Omit<PrayerInteraction, 'id' | 'created_at'>;
        Update: never;
        Relationships: [];
      };
      analytics_events: {
        Row: AnalyticsEvent;
        Insert: Omit<AnalyticsEvent, 'id' | 'created_at'>;
        Update: never;
        Relationships: [];
      };
      user_engagement_summary: {
        Row: UserEngagementSummary;
        Insert: UserEngagementSummary;
        Update: Partial<Omit<UserEngagementSummary, 'user_id'>>;
        Relationships: [];
      };
      translation_catalog: {
        Row: TranslationCatalogEntry;
        Insert: Omit<TranslationCatalogEntry, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<TranslationCatalogEntry, 'id'>>;
        Relationships: [];
      };
      translation_versions: {
        Row: TranslationVersion;
        Insert: Omit<TranslationVersion, 'id'>;
        Update: Partial<Omit<TranslationVersion, 'id'>>;
        Relationships: [];
      };
      user_translation_preferences: {
        Row: UserTranslationPreferences;
        Insert: Omit<UserTranslationPreferences, 'id' | 'synced_at'>;
        Update: Partial<Omit<UserTranslationPreferences, 'id' | 'user_id'>>;
        Relationships: [];
      };
      bible_verses: {
        Row: BibleVerseRow;
        Insert: Omit<BibleVerseRow, 'id'>;
        Update: Partial<Omit<BibleVerseRow, 'id'>>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
  };
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
