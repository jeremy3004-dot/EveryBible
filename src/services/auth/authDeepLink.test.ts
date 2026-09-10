import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// authDeepLink.ts transitively imports supabase/client.ts, which imports
// expo-secure-store and react-native at module scope — that breaks the
// tsx/esbuild transform used by this node test runner, so behavior is
// asserted against the raw source text instead, matching the pattern used
// elsewhere for RN/Expo-native modules (see useAudioPlayerSource.test.ts).
// The pure URL/JWT/audience logic is covered for real in authRecoveryLink.test.ts.
function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

function extractFunction(source: string, signature: string): string {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `expected to find ${signature}`);
  const rest = source.slice(start);
  const end = rest.indexOf('\n}\n');
  assert.notEqual(end, -1, `expected a closing brace for ${signature}`);
  return rest.slice(0, end);
}

test('handleAuthDeepLinkUrl never establishes a session on link arrival', () => {
  const source = readRelativeSource('./authDeepLink.ts');
  const handler = extractFunction(source, 'export async function handleAuthDeepLinkUrl');

  assert.equal(
    handler.includes('auth.setSession('),
    false,
    'handleAuthDeepLinkUrl must not call supabase.auth.setSession — any app can fire the reset URL, so adopting the session before the user confirms would be session fixation'
  );

  assert.match(
    handler,
    /const tokens = parseAuthRecoveryTokens\(url\);\s*\n\s*if \(!tokens \|\| !isSupabaseConfigured\(\)\) \{\s*\n\s*return false;/,
    'handleAuthDeepLinkUrl should bail out early for URLs that are not a valid Supabase recovery link, or when Supabase is not configured for this build'
  );

  assert.match(
    handler,
    /pendingPasswordRecovery = \{/,
    'handleAuthDeepLinkUrl should park the tokens in the pending slot instead of consuming them'
  );

  assert.match(
    handler,
    /navigateToResetPassword\(\);\s*\n\s*return true;/,
    'handleAuthDeepLinkUrl should navigate to ResetPassword so the screen can ask the user to confirm the account'
  );
});

test('setSession is reached only through the explicit activation entry point', () => {
  const source = readRelativeSource('./authDeepLink.ts');
  const activate = extractFunction(source, 'export async function activatePendingPasswordRecovery');

  assert.match(
    activate,
    /await supabase\.auth\.setSession\(\{\s*\n\s*access_token: pending\.accessToken,\s*\n\s*refresh_token: pending\.refreshToken,/,
    'activatePendingPasswordRecovery should establish the recovery session from the parked tokens'
  );

  assert.equal(
    source.split('auth.setSession(').length - 1,
    1,
    'supabase.auth.setSession should be called exactly once in authDeepLink.ts, inside activatePendingPasswordRecovery'
  );

  assert.match(
    activate,
    /pendingPasswordRecovery = null;/,
    'activatePendingPasswordRecovery should consume the parked tokens so they cannot be replayed'
  );
});

test('deep link navigation still targets ResetPassword inside the Auth stack in the More tab', () => {
  const source = readRelativeSource('./authDeepLink.ts');

  assert.match(
    source,
    /rootNavigationRef\.navigate\('More', \{\s*\n\s*screen: 'Auth',\s*\n\s*params: \{\s*\n\s*screen: 'ResetPassword',/,
    'the reset deep link should land on the ResetPassword screen nested inside the Auth stack inside the More tab'
  );
});
