import { createHash, randomBytes, randomInt } from 'node:crypto';

/**
 * Team passcodes are digits only and six long because every installed app build unlocks
 * translator mode with a 10-digit keypad that stops at six digits (SettingsScreen). A longer
 * code needs an app release that lifts that limit first.
 *
 * Six digits is a small space (one million codes). What keeps guessing impractical is the
 * per-client lockout in review-chapter-feedback (10 failures per 15 minutes), plus rotating
 * a team's code when someone leaves.
 */
export const TEAM_PASSCODE_LENGTH = 6;

/** Must match TEAM_PASSCODE_HASH_ALGORITHM in supabase/functions/review-chapter-feedback. */
export const TEAM_PASSCODE_HASH_ALGORITHM = 'sha256-salt-v1';

/** Uniform random digits from the OS CSPRNG. */
export function generateTeamPasscode(): string {
  let passcode = '';
  for (let index = 0; index < TEAM_PASSCODE_LENGTH; index += 1) {
    passcode += String(randomInt(0, 10));
  }
  return passcode;
}

/** 16 random bytes as 32 lowercase hex characters, one per row. */
export function newTeamPasscodeSalt(): string {
  return randomBytes(16).toString('hex');
}

/** sha256-salt-v1: lowercase hex SHA-256 of UTF-8 `${saltHex}:${passcode}`. */
export function hashTeamPasscode(saltHex: string, passcode: string): string {
  return createHash('sha256').update(`${saltHex}:${passcode}`, 'utf8').digest('hex');
}
