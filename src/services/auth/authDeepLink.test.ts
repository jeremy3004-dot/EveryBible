import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// authDeepLink.ts transitively imports supabase/client.ts, which imports
// expo-secure-store and react-native at module scope — that breaks the
// tsx/esbuild transform used by this node test runner, so behavior is
// asserted against the raw source text instead, matching the pattern used
// elsewhere for RN/Expo-native modules (see useAudioPlayerSource.test.ts).
function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('handleAuthDeepLinkUrl establishes a Supabase session from recovery tokens and navigates to ResetPassword', () => {
  const source = readRelativeSource('./authDeepLink.ts');

  assert.match(
    source,
    /const tokens = parseAuthRecoveryTokens\(url\);\s*\n\s*if \(!tokens \|\| !isSupabaseConfigured\(\)\) \{\s*\n\s*return false;/,
    'handleAuthDeepLinkUrl should bail out early for URLs that are not a valid Supabase recovery link, or when Supabase is not configured for this build'
  );

  assert.match(
    source,
    /await supabase\.auth\.setSession\(\{\s*\n\s*access_token: tokens\.accessToken,\s*\n\s*refresh_token: tokens\.refreshToken,/,
    'handleAuthDeepLinkUrl should establish the recovery session via supabase.auth.setSession using the parsed fragment tokens'
  );

  assert.match(
    source,
    /rootNavigationRef\.navigate\('More', \{\s*\n\s*screen: 'Auth',\s*\n\s*params: \{\s*\n\s*screen: 'ResetPassword',/,
    'handleAuthDeepLinkUrl should navigate into the ResetPassword screen nested inside the Auth stack inside the More tab'
  );

  assert.match(
    source,
    /navigateToResetPassword\(\);\s*\n\s*return true;/,
    'handleAuthDeepLinkUrl should navigate to ResetPassword even if establishing the session failed, so the screen itself can surface the invalid/expired-link state'
  );
});
