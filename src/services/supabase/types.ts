import type { LanguageCode } from '../../constants/languages';

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
  theme: 'dark' | 'light';
  language: LanguageCode;
  country_code: string | null;
  country_name: string | null;
  content_language_code: string | null;
  content_language_name: string | null;
  content_language_native_name: string | null;
  onboarding_completed: boolean;
  notifications_enabled: boolean;
  reminder_time: string | null;
  synced_at: string;
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
