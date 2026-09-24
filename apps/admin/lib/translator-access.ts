import type { SupabaseClient } from '@supabase/supabase-js';

import {
  DEFAULT_TEAM_PASSCODE_LENGTH,
  TEAM_PASSCODE_HASH_ALGORITHM,
  TEAM_PASSCODE_LENGTHS,
  generateTeamPasscode,
  hashTeamPasscode,
  newTeamPasscodeSalt,
  type TeamPasscodeLength,
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

const CODE_LENGTH_ERROR = `Choose a code length of ${TEAM_PASSCODE_LENGTHS.slice(0, -1).join(
  ', '
)} or ${TEAM_PASSCODE_LENGTHS[TEAM_PASSCODE_LENGTHS.length - 1]} digits`;

/** The form's code length; absent means the default every installed app build accepts. */
export function parseTeamPasscodeLength(
  raw: FormDataEntryValue | null
): { length: TeamPasscodeLength } | { error: string } {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value === '') return { length: DEFAULT_TEAM_PASSCODE_LENGTH };
  const length = TEAM_PASSCODE_LENGTHS.find((option) => String(option) === value);
  return length ? { length } : { error: CODE_LENGTH_ERROR };
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
  input: {
    label: string;
    translationIds: string[];
    createdBy: string;
    codeLength: TeamPasscodeLength;
  }
): Promise<{ ok: true; id: string; passcode: string } | { ok: false; error: string }> {
  const { data: active, error: activeError } = await service
    .from('translator_team_passcodes')
    .select('passcode_salt, passcode_hash')
    .is('revoked_at', null);
  if (activeError) return { ok: false, error: activeError.message };

  const activeRows = (active ?? []) as ActiveHashRow[];
  let passcode: string | null = null;
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS && passcode === null; attempt += 1) {
    const candidate = generateTeamPasscode(input.codeLength);
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

// ---------------------------------------------------------------------------
// Retiring the old shared passcode (TRANSLATOR_REVIEW_PASSCODE)
// ---------------------------------------------------------------------------

// PostgREST and Postgres codes for "this table does not exist" (migration not applied yet).
const MISSING_TABLE_CODES = new Set(['PGRST205', '42P01']);
const isMissingTable = (error: { code?: string | null } | null) =>
  MISSING_TABLE_CODES.has(String(error?.code ?? ''));

/** Translations that have feedback but no active team code: they still need the shared code. */
export function translationsWithoutTeamCode(
  feedbackTranslationIds: string[],
  teams: TranslatorTeamSummary[]
): string[] {
  const covered = new Set(
    teams.filter((team) => team.revokedAt === null).flatMap((team) => team.translationIds)
  );
  return feedbackTranslationIds.filter((id) => !covered.has(id));
}

export interface SharedPasscodeSetting {
  /** False until the 20260924035827 migration is applied; the switch cannot be used before. */
  installed: boolean;
  /** Whether review-chapter-feedback still accepts the shared passcode. */
  allowed: boolean;
  updatedAt: string | null;
}

/** The switch review-chapter-feedback reads. A missing row means "allowed", as in the function. */
export async function getSharedPasscodeSetting(): Promise<SharedPasscodeSetting> {
  const service = createAdminServiceClient();
  const { data, error } = await service
    .from('translator_access_settings')
    .select('shared_passcode_enabled, updated_at')
    .eq('id', true)
    .maybeSingle<{ shared_passcode_enabled: boolean; updated_at: string }>();

  if (error) {
    if (isMissingTable(error)) return { installed: false, allowed: true, updatedAt: null };
    throw new Error(`Unable to load the shared passcode setting: ${error.message}`);
  }
  return {
    installed: true,
    allowed: data?.shared_passcode_enabled !== false,
    updatedAt: data?.updated_at ?? null,
  };
}

export interface SharedPasscodeTranslationUsage {
  /** Null when the request named no translation (e.g. unlocking from Settings). */
  translationId: string | null;
  allowed: number;
  refused: number;
  lastUsedAt: string;
}

export interface SharedPasscodeUsage {
  installed: boolean;
  since: string;
  total: number;
  lastUsedAt: string | null;
  /** True when the window held more rows than were read; counts are then a lower bound. */
  truncated: boolean;
  byTranslation: SharedPasscodeTranslationUsage[];
}

const USAGE_ROW_LIMIT = 5000;
export const SHARED_PASSCODE_USAGE_WINDOW_DAYS = 30;

/**
 * Requests that presented the shared passcode in the last `windowDays`, grouped by the
 * translation they asked for, most recently used first. The log holds no passcode or address.
 */
export async function getSharedPasscodeUsage(
  now: Date = new Date(),
  windowDays: number = SHARED_PASSCODE_USAGE_WINDOW_DAYS
): Promise<SharedPasscodeUsage> {
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const empty: SharedPasscodeUsage = {
    installed: false,
    since,
    total: 0,
    lastUsedAt: null,
    truncated: false,
    byTranslation: [],
  };
  const service = createAdminServiceClient();
  const { data, error } = await service
    .from('translator_shared_passcode_uses')
    .select('translation_id, outcome, used_at')
    .gte('used_at', since)
    .order('used_at', { ascending: false })
    .limit(USAGE_ROW_LIMIT);

  if (error) {
    if (isMissingTable(error)) return empty;
    throw new Error(`Unable to load shared passcode uses: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{
    translation_id: string | null;
    outcome: 'allowed' | 'refused';
    used_at: string;
  }>;
  const byTranslation = new Map<string | null, SharedPasscodeTranslationUsage>();
  for (const row of rows) {
    const entry = byTranslation.get(row.translation_id) ?? {
      translationId: row.translation_id,
      allowed: 0,
      refused: 0,
      lastUsedAt: row.used_at,
    };
    if (row.outcome === 'refused') entry.refused += 1;
    else entry.allowed += 1;
    if (row.used_at > entry.lastUsedAt) entry.lastUsedAt = row.used_at;
    byTranslation.set(row.translation_id, entry);
  }

  return {
    installed: true,
    since,
    total: rows.length,
    lastUsedAt: rows[0]?.used_at ?? null,
    truncated: rows.length >= USAGE_ROW_LIMIT,
    byTranslation: [...byTranslation.values()].sort((a, b) =>
      b.lastUsedAt.localeCompare(a.lastUsedAt)
    ),
  };
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
