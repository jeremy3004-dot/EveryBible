import type { SupabaseClient } from '@supabase/supabase-js';

import {
  TEAM_PASSCODE_HASH_ALGORITHM,
  generateTeamPasscode,
  hashTeamPasscode,
  newTeamPasscodeSalt,
} from '@/lib/translator-access-crypto';
import { createAdminServiceClient } from '@/lib/supabase/service';

/**
 * Translator review access: one passcode per translation team, stored hashed in
 * public.translator_team_passcodes and checked by the review-chapter-feedback edge function.
 * A passcode opens only the translations its row lists.
 */
export const TEAM_LABEL_MAX_LENGTH = 120;
export const TEAM_MAX_TRANSLATIONS = 50;
// Translation ids are case-sensitive (the catalog holds both `BSB` and `bsb`), so they are
// stored exactly as entered.
const TRANSLATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
// With six-digit codes a random clash with another active team is possible, if rare.
const MAX_GENERATION_ATTEMPTS = 20;

export interface TeamPasscodeActionResult {
  ok: boolean;
  error: string | null;
  /** The plaintext code. Present only in the response that created it; never stored. */
  passcode: string | null;
  label: string | null;
  translationIds: string[];
}

export interface TranslatorTeamSummary {
  id: string;
  label: string;
  translationIds: string[];
  createdAt: string;
  revokedAt: string | null;
}

export function parseTeamTranslationIds(
  raw: FormDataEntryValue | null
): { ids: string[] } | { error: string } {
  const entries = typeof raw === 'string' ? raw.split(/[,\n]/) : [];
  const ids = Array.from(new Set(entries.map((entry) => entry.trim()).filter(Boolean)));
  if (ids.length === 0) return { error: 'Enter at least one translation ID' };
  if (ids.length > TEAM_MAX_TRANSLATIONS) {
    return { error: `A passcode can cover at most ${TEAM_MAX_TRANSLATIONS} translations` };
  }
  const invalid = ids.find((id) => !TRANSLATION_ID_PATTERN.test(id));
  return invalid ? { error: `Invalid translation ID: ${invalid}` } : { ids };
}

interface ActiveHashRow {
  passcode_salt: string;
  passcode_hash: string;
}

/**
 * Generates a code that no other active team already uses, stores only its salt and hash,
 * and returns the plaintext once for the operator to hand to the team.
 */
export async function issueTeamPasscode(
  service: SupabaseClient,
  input: { label: string; translationIds: string[]; createdBy: string }
): Promise<{ ok: true; id: string; passcode: string } | { ok: false; error: string }> {
  const { data: active, error: activeError } = await service
    .from('translator_team_passcodes')
    .select('passcode_salt, passcode_hash')
    .is('revoked_at', null);
  if (activeError) return { ok: false, error: activeError.message };

  const activeRows = (active ?? []) as ActiveHashRow[];
  let passcode: string | null = null;
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS && passcode === null; attempt += 1) {
    const candidate = generateTeamPasscode();
    const clashes = activeRows.some(
      (row) => hashTeamPasscode(row.passcode_salt, candidate) === row.passcode_hash
    );
    if (!clashes) passcode = candidate;
  }
  if (passcode === null) return { ok: false, error: 'Could not generate a unique passcode' };

  const salt = newTeamPasscodeSalt();
  const { data, error } = await service
    .from('translator_team_passcodes')
    .insert({
      label: input.label,
      translation_ids: input.translationIds,
      passcode_salt: salt,
      passcode_hash: hashTeamPasscode(salt, passcode),
      hash_algorithm: TEAM_PASSCODE_HASH_ALGORITHM,
      created_by: input.createdBy,
    })
    .select('id')
    .single<{ id: string }>();
  if (error || !data) return { ok: false, error: error?.message ?? 'Unable to save the passcode' };

  return { ok: true, id: data.id, passcode };
}

/** Active teams first, newest first. Never selects the salt or hash. */
export async function getTranslatorTeams(): Promise<TranslatorTeamSummary[]> {
  const service = createAdminServiceClient();
  const { data, error } = await service
    .from('translator_team_passcodes')
    .select('id, label, translation_ids, created_at, revoked_at')
    .order('revoked_at', { ascending: false, nullsFirst: true })
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`Unable to load translator teams: ${error.message}`);
  }

  return (
    (data ?? []) as Array<{
      id: string;
      label: string;
      translation_ids: string[];
      created_at: string;
      revoked_at: string | null;
    }>
  ).map((row) => ({
    id: row.id,
    label: row.label,
    translationIds: row.translation_ids ?? [],
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  }));
}

/**
 * Translation ids that already have chapter feedback, i.e. ids exactly as the app sends them.
 * Shown as a hint when choosing what a new passcode covers.
 */
export async function getTranslationIdsWithFeedback(): Promise<string[]> {
  const service = createAdminServiceClient();
  const { data, error } = await service
    .from('chapter_feedback_submissions')
    .select('translation_id')
    .order('translation_id', { ascending: true })
    .limit(5000);

  if (error) {
    throw new Error(`Unable to load feedback translations: ${error.message}`);
  }

  return Array.from(
    new Set(((data ?? []) as Array<{ translation_id: string }>).map((row) => row.translation_id))
  );
}
