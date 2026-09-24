'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireAdminIdentity, type AdminIdentity } from '@/lib/admin-auth';
import { writeAdminAuditLog } from '@/lib/audit-log';
import { normalizeOptionalString, normalizeUuid } from '@/lib/format';
import { parseFilterTermInput } from '@/lib/prayer-moderation';
import { createAdminServiceClient } from '@/lib/supabase/service';

// Prayer wall moderation (docs/research/prayer-wall-moderation-2026-09-24.md). Every action
// writes an admin_audit_logs row. The service role may set hidden_at / hidden_reason, which
// the protect_prayer_request_moderation trigger refuses to client roles.

const PAGE = '/prayer-reports';
const BAN_REASON_MAX = 500;
const UNIQUE_VIOLATION = '23505';

interface RequestRow {
  id: string;
  group_id: string;
  user_id: string;
  content: string;
}

function normalizeReturnTo(value: string | null): string {
  return value && (value === PAGE || value.startsWith(`${PAGE}?`)) ? value : PAGE;
}

function withParam(returnTo: string, key: 'notice' | 'error', message: string): string {
  return `${returnTo}${returnTo.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(message)}`;
}

function done(returnTo: string, notice: string): never {
  revalidatePath(PAGE);
  redirect(withParam(returnTo, 'notice', notice));
}

function fail(returnTo: string, message: string): never {
  redirect(withParam(returnTo, 'error', message));
}

async function closeOpenReports(
  admin: AdminIdentity,
  column: 'request_id' | 'request_author_id',
  value: string,
  status: 'actioned' | 'dismissed'
) {
  return createAdminServiceClient()
    .from('prayer_request_reports')
    .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: admin.id })
    .eq(column, value)
    .eq('status', 'open');
}

async function setRequestHidden(formData: FormData, hidden: boolean) {
  const admin = await requireAdminIdentity();
  const returnTo = normalizeReturnTo(normalizeOptionalString(formData.get('returnTo')));
  const requestId = normalizeUuid(formData.get('requestId'));
  if (!requestId) fail(returnTo, 'Missing request id');

  const { data, error } = await createAdminServiceClient()
    .from('prayer_requests')
    .update(
      hidden
        ? { hidden_at: new Date().toISOString(), hidden_reason: 'admin' }
        : { hidden_at: null, hidden_reason: null }
    )
    .eq('id', requestId)
    .select('id, group_id, user_id, content')
    .maybeSingle<RequestRow>();
  if (error) fail(returnTo, error.message);
  if (!data) fail(returnTo, 'That request no longer exists');

  const reports = await closeOpenReports(
    admin,
    'request_id',
    data.id,
    hidden ? 'actioned' : 'dismissed'
  );
  await writeAdminAuditLog({
    action: hidden ? 'prayer_wall.request.hide' : 'prayer_wall.request.restore',
    actorEmail: admin.email,
    actorUserId: admin.id,
    entityId: data.id,
    entityType: 'prayer_request',
    metadata: { authorId: data.user_id, groupId: data.group_id },
    summary: `${hidden ? 'Hid' : 'Restored'} prayer request ${data.id} by ${data.user_id}.`,
  });
  if (reports.error) {
    fail(returnTo, `The request was updated, but its reports were not: ${reports.error.message}`);
  }

  done(returnTo, hidden ? 'Request hidden' : 'Request restored');
}

export async function hidePrayerRequestAction(formData: FormData) {
  await setRequestHidden(formData, true);
}

export async function restorePrayerRequestAction(formData: FormData) {
  await setRequestHidden(formData, false);
}

export async function deletePrayerRequestAction(formData: FormData) {
  const admin = await requireAdminIdentity();
  const returnTo = normalizeReturnTo(normalizeOptionalString(formData.get('returnTo')));
  const requestId = normalizeUuid(formData.get('requestId'));
  if (!requestId) fail(returnTo, 'Missing request id');
  if (formData.get('confirm') !== 'yes') fail(returnTo, 'Tick the box to confirm the delete');

  // Its reports go with it (ON DELETE CASCADE); the audit row keeps the text as evidence.
  const { data, error } = await createAdminServiceClient()
    .from('prayer_requests')
    .delete()
    .eq('id', requestId)
    .select('id, group_id, user_id, content')
    .maybeSingle<RequestRow>();
  if (error) fail(returnTo, error.message);
  if (!data) fail(returnTo, 'That request no longer exists');

  await writeAdminAuditLog({
    action: 'prayer_wall.request.delete',
    actorEmail: admin.email,
    actorUserId: admin.id,
    entityId: data.id,
    entityType: 'prayer_request',
    metadata: { authorId: data.user_id, content: data.content, groupId: data.group_id },
    summary: `Deleted prayer request ${data.id} by ${data.user_id}.`,
  });
  done(returnTo, 'Request deleted');
}

export async function banPrayerAuthorAction(formData: FormData) {
  const admin = await requireAdminIdentity();
  const returnTo = normalizeReturnTo(normalizeOptionalString(formData.get('returnTo')));
  const userId = normalizeUuid(formData.get('userId'));
  const reason = normalizeOptionalString(formData.get('reason'));
  if (!userId) fail(returnTo, 'Missing author id');
  // A ban hides every request the author has posted, and lifting it does not restore them.
  if (formData.get('confirm') !== 'yes') fail(returnTo, 'Tick the box to confirm the ban');
  if (reason && reason.length > BAN_REASON_MAX) {
    fail(returnTo, `The reason can be at most ${BAN_REASON_MAX} characters`);
  }

  const service = createAdminServiceClient();
  const ban = await service
    .from('prayer_wall_bans')
    .upsert({ user_id: userId, reason, banned_by: admin.id }, { onConflict: 'user_id' });
  if (ban.error) fail(returnTo, ban.error.message);

  // A ban also takes the author's visible requests off every wall.
  const hidden = await service
    .from('prayer_requests')
    .update({ hidden_at: new Date().toISOString(), hidden_reason: 'admin' })
    .eq('user_id', userId)
    .is('hidden_at', null)
    .select('id');
  const hiddenRequestCount = (hidden.data as Array<{ id: string }> | null)?.length ?? 0;
  const reports = await closeOpenReports(admin, 'request_author_id', userId, 'actioned');

  await writeAdminAuditLog({
    action: 'prayer_wall.author.ban',
    actorEmail: admin.email,
    actorUserId: admin.id,
    entityId: userId,
    entityType: 'profile',
    metadata: { hiddenRequestCount, reason: reason ?? undefined },
    summary: `Banned ${userId} from the prayer wall and hid ${hiddenRequestCount} of their requests.`,
  });
  const followUpError = hidden.error ?? reports.error;
  if (followUpError) {
    fail(returnTo, `The author is banned, but cleanup failed: ${followUpError.message}`);
  }

  done(returnTo, 'Author banned from the prayer wall');
}

export async function unbanPrayerAuthorAction(formData: FormData) {
  const admin = await requireAdminIdentity();
  const returnTo = normalizeReturnTo(normalizeOptionalString(formData.get('returnTo')));
  const userId = normalizeUuid(formData.get('userId'));
  if (!userId) fail(returnTo, 'Missing author id');

  const { data, error } = await createAdminServiceClient()
    .from('prayer_wall_bans')
    .delete()
    .eq('user_id', userId)
    .select('user_id')
    .maybeSingle<{ user_id: string }>();
  if (error) fail(returnTo, error.message);
  if (!data) fail(returnTo, 'That author is not banned');

  await writeAdminAuditLog({
    action: 'prayer_wall.author.unban',
    actorEmail: admin.email,
    actorUserId: admin.id,
    entityId: userId,
    entityType: 'profile',
    summary: `Lifted the prayer wall ban on ${userId}. Their hidden requests stay hidden.`,
  });
  done(returnTo, 'Author can post again');
}

export async function addPrayerFilterTermAction(formData: FormData) {
  const admin = await requireAdminIdentity();
  const returnTo = normalizeReturnTo(normalizeOptionalString(formData.get('returnTo')));
  const parsed = parseFilterTermInput(formData);
  if ('error' in parsed) fail(returnTo, parsed.error);

  const { data, error } = await createAdminServiceClient()
    .from('prayer_content_filter_terms')
    .insert({
      term: parsed.term,
      match_mode: parsed.matchMode,
      language: parsed.language,
      created_by: admin.id,
    })
    .select('id')
    .single<{ id: number }>();
  if (error?.code === UNIQUE_VIOLATION) {
    // The unique index is on (lower(term), match_mode).
    const mode = parsed.matchMode === 'word' ? 'whole-word' : 'substring';
    fail(returnTo, `"${parsed.term}" is already a ${mode} term`);
  }
  if (error || !data) fail(returnTo, error?.message ?? 'Unable to add the term');

  await writeAdminAuditLog({
    action: 'prayer_wall.filter_term.add',
    actorEmail: admin.email,
    actorUserId: admin.id,
    entityId: String(data.id),
    entityType: 'prayer_content_filter_term',
    metadata: { language: parsed.language, matchMode: parsed.matchMode, term: parsed.term },
    summary: 'Added a prayer wall filter term.',
  });
  done(returnTo, 'Filter term added');
}

export async function removePrayerFilterTermAction(formData: FormData) {
  const admin = await requireAdminIdentity();
  const returnTo = normalizeReturnTo(normalizeOptionalString(formData.get('returnTo')));
  const termId = Number.parseInt(normalizeOptionalString(formData.get('termId')) ?? '', 10);
  if (!Number.isInteger(termId) || termId <= 0) fail(returnTo, 'Missing term id');

  const { data, error } = await createAdminServiceClient()
    .from('prayer_content_filter_terms')
    .delete()
    .eq('id', termId)
    .select('id, term, match_mode, language')
    .maybeSingle<{ id: number; term: string; match_mode: string; language: string | null }>();
  if (error) fail(returnTo, error.message);
  if (!data) fail(returnTo, 'That term no longer exists');

  await writeAdminAuditLog({
    action: 'prayer_wall.filter_term.remove',
    actorEmail: admin.email,
    actorUserId: admin.id,
    entityId: String(data.id),
    entityType: 'prayer_content_filter_term',
    metadata: { language: data.language, matchMode: data.match_mode, term: data.term },
    summary: 'Removed a prayer wall filter term.',
  });
  done(returnTo, 'Filter term removed');
}
