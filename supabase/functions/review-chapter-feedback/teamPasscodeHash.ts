// Hash format for public.translator_team_passcodes. The admin dashboard computes the same
// digest with node:crypto when it creates a code (apps/admin/lib/translator-access-crypto.ts);
// a parity test there pins both implementations to the same output.
//
// sha256-salt-v1: lowercase hex SHA-256 of UTF-8 `${saltHex}:${passcode}`, where saltHex is
// 16 random bytes as 32 lowercase hex characters, unique per row.
export const TEAM_PASSCODE_HASH_ALGORITHM = 'sha256-salt-v1';

export async function hashTeamPasscode(saltHex: string, passcode: string): Promise<string> {
  const data = new TextEncoder().encode(`${saltHex}:${passcode}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
