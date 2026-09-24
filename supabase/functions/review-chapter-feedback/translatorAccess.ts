import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { hashTeamPasscode, TEAM_PASSCODE_HASH_ALGORITHM } from './teamPasscodeHash.ts';

// Who a translator passcode belongs to and which translations it opens (owner decision
// 2026-09-24: one passcode per translation team).
//
// - Team passcodes live hashed in public.translator_team_passcodes (service role only) and
//   open exactly the translations their row lists. Admins create, list and revoke them in the
//   admin dashboard (/translator-access).
// - The old shared TRANSLATOR_REVIEW_PASSCODE secret keeps working during the transition,
//   but only for the translations in TRANSLATOR_REVIEW_PASSCODE_TRANSLATIONS (comma-separated).
//   Unset, that defaults to the translations that had feedback when team passcodes shipped.
//   Retire it by setting the scope to `none` or unsetting the secret.
// - An admin switch (public.translator_access_settings.shared_passcode_enabled, toggled in
//   /translator-access) turns the shared code off without a deploy. It defaults to "allowed",
//   and a missing table (function deployed before the migration) also means "allowed".
// - Every request that presents the shared code is recorded in
//   public.translator_shared_passcode_uses so the owner can see who still depends on it.
export const DEFAULT_SHARED_PASSCODE_TRANSLATIONS: readonly string[] = ['bsb'];

export interface TranslatorAccess {
  kind: 'team' | 'shared';
  teamId: string | null;
  translationIds: string[];
}

export type TranslatorAccessResult =
  | { status: 'granted'; access: TranslatorAccess }
  // sharedPasscodeRefused: the code was the shared one, but the admin switch has it turned off.
  // The caller answers exactly as for a wrong code and only records the refusal internally.
  | { status: 'denied'; sharedPasscodeRefused: boolean }
  | { status: 'unavailable' };

export type SharedPasscodeSwitch = 'enabled' | 'disabled';

// PostgREST and Postgres codes for "this table does not exist".
const MISSING_TABLE_CODES = new Set(['PGRST205', '42P01']);

/**
 * Whether the admin switch still allows the shared passcode. A missing row or table means
 * "allowed", so deploying this before the migration changes nothing. Any other read failure
 * turns the shared code off (fail closed) and leaves team codes alone.
 */
export async function readSharedPasscodeSwitch(
  service: SupabaseClient
): Promise<SharedPasscodeSwitch> {
  const { data, error } = await service
    .from('translator_access_settings')
    .select('shared_passcode_enabled')
    .eq('id', true)
    .maybeSingle();
  if (error) {
    if (MISSING_TABLE_CODES.has(String((error as { code?: unknown }).code))) return 'enabled';
    console.error('[review-chapter-feedback] translator_access_settings lookup failed', error);
    return 'disabled';
  }
  const enabled = (data as { shared_passcode_enabled?: unknown } | null)?.shared_passcode_enabled;
  return enabled === false ? 'disabled' : 'enabled';
}

export type SharedPasscodeRequestKind =
  | 'unlock'
  | 'read'
  | 'resolve'
  | 'reopen'
  | 'audio'
  | 'bulk_review';

export function sharedPasscodeRequestKind(body: {
  validateOnly?: unknown;
  action?: unknown;
}): SharedPasscodeRequestKind {
  if (body.validateOnly === true) return 'unlock';
  switch (body.action) {
    case 'resolve':
      return 'resolve';
    case 'reopen':
      return 'reopen';
    case 'audioUrl':
      return 'audio';
    case 'positivePreview':
    case 'reviewPositiveIds':
      return 'bulk_review';
    default:
      return 'read';
  }
}

// Same shape the admin dashboard accepts for a team's translation ids. Anything else the client
// sent is recorded as "no translation" rather than stored verbatim.
const LOGGED_TRANSLATION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/**
 * Records one use of the shared passcode: which translation it asked for, what kind of request,
 * and whether it was allowed. Never the passcode or the caller's address. Best effort: a failed
 * write is logged and the request carries on.
 */
export async function recordSharedPasscodeUse(
  service: SupabaseClient,
  use: {
    translationId: unknown;
    requestKind: SharedPasscodeRequestKind;
    outcome: 'allowed' | 'refused';
  }
): Promise<void> {
  const translationId =
    typeof use.translationId === 'string' && LOGGED_TRANSLATION_ID.test(use.translationId.trim())
      ? use.translationId.trim()
      : null;
  try {
    const { error } = await service.from('translator_shared_passcode_uses').insert({
      translation_id: translationId,
      request_kind: use.requestKind,
      outcome: use.outcome,
    });
    if (error) {
      console.error(
        '[review-chapter-feedback] translator_shared_passcode_uses insert failed',
        error
      );
    }
  } catch (error) {
    console.error('[review-chapter-feedback] translator_shared_passcode_uses insert failed', error);
  }
}

interface TeamPasscodeRow {
  id: string;
  translation_ids: string[] | null;
  passcode_salt: string;
  passcode_hash: string;
  hash_algorithm: string;
  revoked_at: string | null;
}

// Plenty for "one code per team"; a bound keeps a runaway table from making every request
// hash thousands of rows.
const TEAM_ROW_LIMIT = 500;

export function parseSharedPasscodeScope(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim() === '') return [...DEFAULT_SHARED_PASSCODE_TRANSLATIONS];
  if (raw.trim().toLowerCase() === 'none') return [];
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    )
  );
}

// Constant-time string comparison so a wrong passcode cannot be recovered via early-exit
// timing. Folds a length mismatch into the accumulator and always walks the full max length.
export function constantTimeEquals(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const length = Math.max(aBytes.length, bBytes.length);
  let mismatch = aBytes.length ^ bBytes.length;
  for (let i = 0; i < length; i += 1) {
    mismatch |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return mismatch === 0;
}

export function accessCoversTranslation(access: TranslatorAccess, translationId: string): boolean {
  return access.translationIds.includes(translationId);
}

export async function resolveTranslatorAccess(
  service: SupabaseClient,
  passcode: string,
  shared: { passcode: string | undefined; translationIds: string[] }
): Promise<TranslatorAccessResult> {
  // An empty shared scope is the same as no shared passcode: it opens nothing.
  const sharedMatches =
    shared.passcode !== undefined &&
    shared.translationIds.length > 0 &&
    constantTimeEquals(passcode, shared.passcode);
  // Both lookups run for every code, so whether the switch was read does not depend on the
  // guess and cannot reveal the shared code.
  const [teamLookup, sharedSwitch] = await Promise.all([
    service
      .from('translator_team_passcodes')
      .select('id, translation_ids, passcode_salt, passcode_hash, hash_algorithm, revoked_at')
      .is('revoked_at', null)
      .limit(TEAM_ROW_LIMIT),
    readSharedPasscodeSwitch(service),
  ]);
  const { data, error } = teamLookup;
  const sharedOutcome: TranslatorAccessResult = !sharedMatches
    ? { status: 'denied', sharedPasscodeRefused: false }
    : sharedSwitch === 'disabled'
      ? { status: 'denied', sharedPasscodeRefused: true }
      : {
          status: 'granted',
          access: { kind: 'shared', teamId: null, translationIds: shared.translationIds },
        };

  if (error) {
    console.error('[review-chapter-feedback] translator_team_passcodes lookup failed', error);
    // The shared code does not depend on the table. Any other code cannot be checked, so the
    // caller refuses with 503 and does not count it as a wrong guess.
    return sharedMatches ? sharedOutcome : { status: 'unavailable' };
  }

  // Hash against every active row with no early exit, so response time does not reveal which
  // row (if any) matched. Revoked rows are skipped here too, not only by the query filter.
  let matched: TeamPasscodeRow | null = null;
  for (const row of (data ?? []) as TeamPasscodeRow[]) {
    const candidate = await hashTeamPasscode(row.passcode_salt, passcode);
    const usable = row.revoked_at === null && row.hash_algorithm === TEAM_PASSCODE_HASH_ALGORITHM;
    if (constantTimeEquals(candidate, row.passcode_hash) && usable && matched === null) {
      matched = row;
    }
  }

  // A team code wins over an identical shared code: the narrower scope is the safe outcome.
  if (matched) {
    return {
      status: 'granted',
      access: {
        kind: 'team',
        teamId: matched.id,
        translationIds: (matched.translation_ids ?? []).filter(
          (id): id is string => typeof id === 'string' && id.length > 0
        ),
      },
    };
  }

  return sharedOutcome;
}
