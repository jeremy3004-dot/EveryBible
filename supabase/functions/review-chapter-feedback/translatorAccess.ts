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
export const DEFAULT_SHARED_PASSCODE_TRANSLATIONS: readonly string[] = ['bsb'];

export interface TranslatorAccess {
  kind: 'team' | 'shared';
  teamId: string | null;
  translationIds: string[];
}

export type TranslatorAccessResult =
  | { status: 'granted'; access: TranslatorAccess }
  | { status: 'denied' }
  | { status: 'unavailable' };

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
  const sharedGrant: TranslatorAccessResult = {
    status: 'granted',
    access: { kind: 'shared', teamId: null, translationIds: shared.translationIds },
  };

  const { data, error } = await service
    .from('translator_team_passcodes')
    .select('id, translation_ids, passcode_salt, passcode_hash, hash_algorithm, revoked_at')
    .is('revoked_at', null)
    .limit(TEAM_ROW_LIMIT);

  if (error) {
    console.error('[review-chapter-feedback] translator_team_passcodes lookup failed', error);
    // The shared code does not depend on the table. Any other code cannot be checked, so the
    // caller refuses with 503 and does not count it as a wrong guess.
    return sharedMatches ? sharedGrant : { status: 'unavailable' };
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

  return sharedMatches ? sharedGrant : { status: 'denied' };
}
