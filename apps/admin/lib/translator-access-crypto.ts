import { createHash, randomBytes, randomInt } from 'node:crypto';

import {
  DEFAULT_TEAM_PASSCODE_LENGTH,
  TEAM_PASSCODE_LENGTHS,
  type TeamPasscodeLength,
} from './translator-access-options';

export { DEFAULT_TEAM_PASSCODE_LENGTH, TEAM_PASSCODE_LENGTHS, type TeamPasscodeLength };

/** Must match TEAM_PASSCODE_HASH_ALGORITHM in supabase/functions/review-chapter-feedback. */
export const TEAM_PASSCODE_HASH_ALGORITHM = 'sha256-salt-v1';

/** Uniform random digits from the OS CSPRNG. */
export function generateTeamPasscode(
  length: TeamPasscodeLength = DEFAULT_TEAM_PASSCODE_LENGTH
): string {
  let passcode = '';
  for (let index = 0; index < length; index += 1) {
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
