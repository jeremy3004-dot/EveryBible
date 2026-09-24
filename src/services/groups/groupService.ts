import { supabase, isSupabaseConfigured } from '../supabase';
import type { GroupMemberRecord, GroupRecord, GroupSessionRecord, InsertTables } from '../supabase';
import { assertSyncedGroupServiceReady } from './groupServiceGuards';

export interface SyncedGroup extends GroupRecord {
  group_members: GroupMemberRecord[];
}

const JOIN_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** PostgREST's code for an RPC missing from its schema cache (migration not applied yet). */
const CREATE_GROUP_RPC_MISSING = 'PGRST202';

async function requireSignedInUserForSyncedGroupAction(action: string) {
  const backendConfigured = isSupabaseConfigured();
  const {
    data: { user },
    error: authError,
  } = backendConfigured ? await supabase.auth.getUser() : { data: { user: null }, error: null };

  if (authError) {
    throw new Error(authError.message);
  }

  assertSyncedGroupServiceReady({
    backendConfigured,
    signedIn: Boolean(user),
    action,
  });

  if (!user) {
    throw new Error(`You must be signed in to ${action}`);
  }

  return user;
}

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
    throw new Error('EveryBible backend is not configured for this build yet.');
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

  const groupName = name.trim();
  const startingCourseId = options?.currentCourseId ?? 'entry-course';
  const startingLessonId = options?.currentLessonId ?? 'entry-1';

  // One transaction on the server: the group, the leader's membership and a join code drawn
  // with strong randomness (groups health check G9/G6).
  const { data: created, error: rpcError } = await supabase.rpc('create_group', {
    group_name: groupName,
    starting_course_id: startingCourseId,
    starting_lesson_id: startingLessonId,
  });

  if (rpcError?.code !== CREATE_GROUP_RPC_MISSING) {
    if (rpcError || !created) {
      throw new Error(rpcError?.message ?? 'Unable to create group');
    }
    const group: GroupRecord = created;
    return {
      ...group,
      group_members: [
        { group_id: group.id, user_id: user.id, role: 'leader', joined_at: group.created_at },
      ],
    };
  }

  // Fallback while the create_group migration is not applied: two requests, so a client
  // killed in between can leave a group without its leader membership.
  const baseInsert: Omit<InsertTables<'groups'>, 'join_code'> = {
    leader_id: user.id,
    name: groupName,
    current_course_id: startingCourseId,
    current_lesson_id: startingLessonId,
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
    throw new Error('EveryBible backend is not configured for this build yet.');
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
    throw new Error('EveryBible backend is not configured for this build yet.');
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
  await requireSignedInUserForSyncedGroupAction('update a group lesson');

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
  const user = await requireSignedInUserForSyncedGroupAction('record a session');

  const insert: InsertTables<'group_sessions'> = {
    group_id: values.groupId,
    course_id: values.courseId,
    lesson_id: values.lessonId,
    created_by: user.id,
    notes: values.notes ?? {},
  };

  const { data, error } = await supabase.from('group_sessions').insert(insert).select('*').single();

  if (error) {
    throw new Error(error.message);
  }

  // Fire-and-forget: tell the other members about this session. It runs only after the
  // insert succeeded, and a failed or refused push never affects the saved session. The
  // server checks the session and writes the text in each recipient's language; the client
  // sends no text of its own (groups health check G5).
  if (data?.id) {
    void supabase.functions
      .invoke('send-group-notification', {
        body: { group_id: values.groupId, session_id: data.id },
      })
      .catch(() => {
        // Non-fatal: push notification failure must not surface to the caller
      });
  }

  return data as GroupSessionRecord;
}

export type SyncedGroupSessionCompletion = {
  // 'saved-lesson-unchanged': the session row exists, but the leader's move to
  // the next lesson failed. Callers must not offer a retry of the whole save,
  // which would record the session (and notify every member) a second time.
  status: 'saved' | 'saved-lesson-unchanged';
};

/**
 * Records a finished group session and, for the leader only, moves the group to
 * the next lesson. Any member may record a session, but only the leader may
 * update the group row (RLS "Leaders can update groups"), so a member never
 * attempts the move. Throws only when the session itself was not recorded.
 */
export async function completeSyncedGroupSession(values: {
  groupId: string;
  courseId: string;
  lessonId: string;
  isLeader: boolean;
  nextLesson: { courseId: string; lessonId: string } | null;
}): Promise<SyncedGroupSessionCompletion> {
  await recordSyncedGroupSession({
    groupId: values.groupId,
    courseId: values.courseId,
    lessonId: values.lessonId,
  });

  if (!values.isLeader || values.nextLesson === null) {
    return { status: 'saved' };
  }

  try {
    await updateSyncedGroupLesson(values.groupId, {
      current_course_id: values.nextLesson.courseId,
      current_lesson_id: values.nextLesson.lessonId,
    });
    return { status: 'saved' };
  } catch {
    return { status: 'saved-lesson-unchanged' };
  }
}
