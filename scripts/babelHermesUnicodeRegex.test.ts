import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = process.cwd();
const babel = require('@babel/core') as typeof import('@babel/core');

// Runs the app's real Babel config (Expo preset included) with the caller Metro
// passes, so the assertions are about what each platform's bundle contains.
function transformLikeMetro(
  source: string,
  caller: { platform: string; engine?: string },
  filename = path.join(repoRoot, 'src/fixture.ts')
): string {
  return (
    babel.transformSync(source, {
      filename,
      cwd: repoRoot,
      caller: { name: 'metro', bundler: 'metro', isDev: false, ...caller } as never,
    })?.code ?? ''
  );
}

const HERMES_IOS = { platform: 'ios', engine: 'hermes' };
const HERMES_ANDROID = { platform: 'android', engine: 'hermes' };
const JSC_IOS = { platform: 'ios' };

test('Hermes bundles keep u-flag regexes as written', () => {
  for (const caller of [HERMES_IOS, HERMES_ANDROID]) {
    const output = transformLikeMetro(
      'export const word = /[^\\p{L}\\p{N}]+/giu;\nexport const digit = /\\p{Nd}$/u;\n',
      caller
    );

    assert.match(output, /\/\[\^\\p\{L\}\\p\{N\}\]\+\/giu/, `${caller.platform}: ${output}`);
    assert.match(output, /\/\\p\{Nd\}\$\/u/, `${caller.platform}: ${output}`);
  }
});

test('non-Hermes native bundles still lower u-flag regexes', () => {
  const output = transformLikeMetro('export const word = /[^\\p{L}\\p{N}]+/giu;\n', JSC_IOS);

  assert.doesNotMatch(output, /\\p\{L\}/);
  assert.doesNotMatch(output, /\/giu/);
});

test('Hermes bundles still lower named capture groups', () => {
  // Only the u-flag lowering is dropped; the preset's named-group transform still runs.
  const output = transformLikeMetro('export const year = /(?<year>\\d{4})/u;\n', HERMES_IOS);

  assert.match(output, /wrapRegExp/);
  assert.doesNotMatch(output, /\(\?<year>/);
  assert.match(output, /\/\(\\d\{4\}\)\/u/);
});

// Size guard: the reference parser's grammars use \p{L}-style escapes in every
// regex. Lowered, each language file grew from ~70 KB to ~900 KB of minified JS.
test('the Bible reference grammar ships at roughly its source size on Hermes', () => {
  const grammarPath = path.join(
    repoRoot,
    'node_modules/bible-passage-reference-parser/esm/lang/en.js'
  );
  const source = readFileSync(grammarPath, 'utf8');
  const output = transformLikeMetro(source, HERMES_IOS, grammarPath);

  assert.ok(
    output.length < source.length * 1.5,
    `en.js grew from ${source.length} to ${output.length} characters`
  );
});
