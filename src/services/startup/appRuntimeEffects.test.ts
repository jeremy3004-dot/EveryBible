import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('AppRuntimeEffects wires the auth deep-link listener alongside sync and privacy lock', () => {
  const source = readRelativeSource('./AppRuntimeEffects.tsx');

  assert.match(
    source,
    /import \{ useAuthDeepLink \} from '\.\.\/\.\.\/hooks\/useAuthDeepLink';/,
    'AppRuntimeEffects should import useAuthDeepLink'
  );

  assert.match(
    source,
    /export function AppRuntimeEffects\(\) \{\s*\n\s*useSync\(\);\s*\n\s*usePrivacyLock\(\);\s*\n\s*useAuthDeepLink\(\);/,
    'AppRuntimeEffects should call useAuthDeepLink so password-reset deep links are handled once runtime effects are loaded post-boot'
  );
});
