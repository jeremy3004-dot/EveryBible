import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('PrivacyLockScreen imports the privacy store directly', () => {
  const source = readRelativeSource('./PrivacyLockScreen.tsx');

  assert.equal(
    source.includes("from '../../stores';"),
    false,
    'PrivacyLockScreen should avoid the stores barrel on the startup privacy path'
  );

  assert.match(
    source,
    /import \{ usePrivacyStore \} from '\.\.\/\.\.\/stores\/privacyStore';/,
    'PrivacyLockScreen should import the privacy store directly'
  );
});
