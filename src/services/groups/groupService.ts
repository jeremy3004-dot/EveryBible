import { supabase, isSupabaseConfigured } from '../supabase';
import type { GroupMemberRecord, GroupRecord, GroupSessionRecord, InsertTables } from '../supabase';

export interface SyncedGroup extends GroupRecord {
  group_members: GroupMemberRecord[];
}

const JOIN_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateJoinCode(): string {
  let code = '';

  for (let index = 0; index < 6; index += 1) {
    const randomIndex = Math.floor(Math.random() * JOIN_CODE_CHARS.length);
    code += JOIN_CODE_CHARS.charAt(randomIndex);
  }

  return code;
}

export async function listSyncedGroups(): Promise<SyncedGroup[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const { data, error } = await supabase
    .from('groups')
    .select('*, group_members(*)')
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as SyncedGroup[];
}

export async function getSyncedGroup(groupId: string): Promise<SyncedGroup | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const { data, error } = await supabase
    .from('groups')
    .select('*, group_members(*)')
    .eq('id', groupId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as SyncedGroup | null) ?? null;
}

export async function createSyncedGroup(
  name: string,
  options?: {
    currentCourseId?: string;
    currentLessonId?: string;
  }
): Promise<SyncedGroup> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured');
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    throw new Error(authError.message);
  }

  if (!user) {
    throw new Error('You must be signed in to create a group');
  }

  const baseInsert: Omit<InsertTables<'groups'>, 'join_code'> = {
    leader_id: user.id,
    name: name.trim(),
    current_course_id: options?.currentCourseId ?? 'entry-course',
    current_lesson_id: options?.currentLessonId ?? 'entry-1',
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const joinCode = generateJoinCode();
    const groupInsert: InsertTables<'groups'> = { ...baseInsert, join_code: joinCode };
    const { data: group, error: createError } = await supabase
      .from('groups')
      .insert(groupInsert)
      .select('*')
      .single();

    if (createError?.code === '23505') {
      continue;
    }

    if (createError || !group) {
      throw new Error(createError?.message ?? 'Unable to create group');
    }

    const memberInsert: InsertTables<'group_members'> = {
      group_id: group.id,
      user_id: user.id,
      role: 'leader',
      joined_at: new Date().toISOString(),
    };

    const { error: memberError } = await supabase.from('group_members').insert(memberInsert);

    if (memberError) {
      await supabase.from('groups').delete().eq('id', group.id);
      throw new Error(memberError.message);
    }

    return {
      ...(group as GroupRecord),
      group_members: [memberInsert],
    };
  }

  throw new Error('Unable to reserve a unique join code');
}

export async function joinSyncedGroup(joinCode: string): Promise<SyncedGroup | null> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured');
  }

  const normalizedCode = joinCode.trim().toUpperCase();
  const { data, error } = await supabase.rpc('join_group_by_code', {
    group_join_code: normalizedCode,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return getSyncedGroup(data);
}

export async function leaveSyncedGroup(groupId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured');
  }

  const { error } = await supabase.rpc('leave_group', {
    target_group_id: groupId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateSyncedGroupLesson(
  groupId: string,
  values: Pick<GroupRecord, 'current_course_id' | 'current_lesson_id'>
): Promise<GroupRecord> {
  const { data, error } = await supabase
    .from('groups')
    .update(values)
    .eq('id', groupId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as GroupRecord;
}

export async function recordSyncedGroupSession(values: {
  groupId: string;
  courseId: string;
  lessonId: string;
  notes?: Record<string, string>;
}): Promise<GroupSessionRecord> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    throw new Error(authError.message);
  }

  if (!user) {
    throw new Error('You must be signed in to record a session');
  }

  const insert: InsertTables<'group_sessions'> = {
    group_id: values.groupId,
    course_id: values.courseId,
    lesson_id: values.lessonId,
    created_by: user.id,
    notes: values.notes ?? {},
  };

  const { data, error } = await supabase
    .from('group_sessions')
    .insert(insert)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as GroupSessionRecord;
}
