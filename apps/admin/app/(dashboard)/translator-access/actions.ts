'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireAdminIdentity, type AdminIdentity } from '@/lib/admin-auth';
import { writeAdminAuditLog } from '@/lib/audit-log';
import { normalizeOptionalString } from '@/lib/format';
import { createAdminServiceClient } from '@/lib/supabase/service';
import {
  TEAM_LABEL_MAX_LENGTH,
  issueTeamPasscode,
  parseTeamPasscodeLength,
  parseTeamTranslationIds,
  type TeamPasscodeActionResult,
} from '@/lib/translator-access';

// The plaintext passcode leaves these actions only in the return value of create/rotate,
// which the page renders once. It is never put in a URL, the audit log, or the database.

const PAGE = '/translator-access';
const NOT_ACTIVE = 'That passcode is already revoked or does not exist';

function failure(error: string): TeamPasscodeActionResult {
  return { ok: false, error, passcode: null, label: null, translationIds: [] };
}

function describeTeam(label: string, translationIds: string[]) {
  return `${label} (${translationIds.join(', ')})`;
}

interface RevokedRow {
  id: string;
  label: string;
  translation_ids: string[];
}

async function revokeActiveTeamPasscode(admin: AdminIdentity, teamId: string) {
  const service = createAdminServiceClient();
  return service
    .from('translator_team_passcodes')
    .update({ revoked_at: new Date().toISOString(), revoked_by: admin.id })
    .eq('id', teamId)
    .is('revoked_at', null)
    .select('id, label, translation_ids')
    .maybeSingle<RevokedRow>();
}

async function auditRevoke(admin: AdminIdentity, row: RevokedRow) {
  await writeAdminAuditLog({
    action: 'translator_access.team_passcode.revoke',
    actorEmail: admin.email,
    actorUserId: admin.id,
    entityId: row.id,
    entityType: 'translator_team_passcode',
    metadata: { label: row.label, translationIds: row.translation_ids },
    summary: `Revoked the translator passcode for ${describeTeam(row.label, row.translation_ids)}.`,
  });
}

export async function createTranslatorTeamPasscodeAction(
  formData: FormData
): Promise<TeamPasscodeActionResult> {
  const admin = await requireAdminIdentity();
  const label = normalizeOptionalString(formData.get('label'));
  if (!label || label.length > TEAM_LABEL_MAX_LENGTH) {
    return failure(`A team name of at most ${TEAM_LABEL_MAX_LENGTH} characters is required`);
  }
  const parsed = parseTeamTranslationIds(formData.get('translationIds'));
  if ('error' in parsed) return failure(parsed.error);
  const codeLength = parseTeamPasscodeLength(formData.get('codeLength'));
  if ('error' in codeLength) return failure(codeLength.error);

  const issued = await issueTeamPasscode(createAdminServiceClient(), {
    label,
    translationIds: parsed.ids,
    createdBy: admin.id,
    codeLength: codeLength.length,
  });
  if (!issued.ok) return failure(issued.error);

  await writeAdminAuditLog({
    action: 'translator_access.team_passcode.create',
    actorEmail: admin.email,
    actorUserId: admin.id,
    entityId: issued.id,
    entityType: 'translator_team_passcode',
    metadata: { codeLength: codeLength.length, label, translationIds: parsed.ids },
    summary: `Created a translator passcode for ${describeTeam(label, parsed.ids)}.`,
  });

  revalidatePath(PAGE);
  return {
    ok: true,
    error: null,
    passcode: issued.passcode,
    label,
    translationIds: parsed.ids,
  };
}

export async function revokeTranslatorTeamPasscodeAction(formData: FormData) {
  const admin = await requireAdminIdentity();
  const teamId = normalizeOptionalString(formData.get('teamId'));
  if (!teamId) {
    redirect(`${PAGE}?error=Missing team id`);
  }

  const { data, error } = await revokeActiveTeamPasscode(admin, teamId);
  if (error || !data) {
    redirect(`${PAGE}?error=${encodeURIComponent(error?.message ?? NOT_ACTIVE)}`);
  }

  await auditRevoke(admin, data);
  revalidatePath(PAGE);
  redirect(`${PAGE}?notice=${encodeURIComponent(`Passcode revoked for ${data.label}`)}`);
}

/**
 * Revokes a team's code and issues a new one for the same label and translations. The old
 * code is revoked first, so a failure part-way leaves the team with no working code (the
 * safe outcome) rather than two.
 */
export async function rotateTranslatorTeamPasscodeAction(
  formData: FormData
): Promise<TeamPasscodeActionResult> {
  const admin = await requireAdminIdentity();
  const teamId = normalizeOptionalString(formData.get('teamId'));
  if (!teamId) return failure('Missing team id');
  // Checked before the revoke so a bad choice leaves the team's current code working.
  const codeLength = parseTeamPasscodeLength(formData.get('codeLength'));
  if ('error' in codeLength) return failure(codeLength.error);

  const { data: revoked, error: revokeError } = await revokeActiveTeamPasscode(admin, teamId);
  if (revokeError) return failure(revokeError.message);
  if (!revoked) return failure(NOT_ACTIVE);

  const issued = await issueTeamPasscode(createAdminServiceClient(), {
    label: revoked.label,
    translationIds: revoked.translation_ids,
    createdBy: admin.id,
    codeLength: codeLength.length,
  });
  if (!issued.ok) {
    await auditRevoke(admin, revoked);
    revalidatePath(PAGE);
    return failure(
      `The old passcode was revoked, but a new one could not be created: ${issued.error}. ` +
        'Create a new passcode for this team.'
    );
  }

  await writeAdminAuditLog({
    action: 'translator_access.team_passcode.rotate',
    actorEmail: admin.email,
    actorUserId: admin.id,
    entityId: issued.id,
    entityType: 'translator_team_passcode',
    metadata: {
      codeLength: codeLength.length,
      label: revoked.label,
      previousTeamPasscodeId: revoked.id,
      translationIds: revoked.translation_ids,
    },
    summary: `Rotated the translator passcode for ${describeTeam(
      revoked.label,
      revoked.translation_ids
    )}.`,
  });

  revalidatePath(PAGE);
  return {
    ok: true,
    error: null,
    passcode: issued.passcode,
    label: revoked.label,
    translationIds: revoked.translation_ids,
  };
}
