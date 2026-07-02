import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// rtlPolicy.ts imports I18nManager from react-native, which breaks tsx/esbuild's
// transform the same way other RN-dependent modules in this project do.
// Source-regex assertions verify the policy instead.
function readSource(): string {
  return readFileSync(fileURLToPath(new URL('./rtlPolicy.ts', import.meta.url).href), 'utf8');
}

test('enforceLtrLayoutPolicy forces LTR layout back off if native already flipped to RTL', () => {
  const source = readSource();

  assert.match(
    source,
    /if \(I18nManager\.isRTL\) \{\s*\n\s*I18nManager\.forceRTL\(false\);\s*\n\s*\}/,
    'must correct layout direction if native already applied RTL from the device locale at launch'
  );
});

test('enforceLtrLayoutPolicy disallows RTL going forward', () => {
  const source = readSource();

  assert.match(
    source,
    /I18nManager\.allowRTL\(false\);/,
    'must call allowRTL(false) so RTL is not re-applied on a future native re-check'
  );
});
