import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const readScript = (name: string): string =>
  readFileSync(path.join(process.cwd(), 'scripts', name), 'utf8');

const exportSource = readScript('export-i18n-tolgee.ts');
const importSource = readScript('import-i18n-tolgee.ts');
const combinedSource = `${exportSource}\n${importSource}`;

test('Tolgee workflow scripts do not import a Tolgee SDK or runtime package', () => {
  assert.doesNotMatch(combinedSource, /from ['"]@?tolgee(?:\/|['"])/i);
  assert.doesNotMatch(combinedSource, /from ['"]@tolgee\//i);
  assert.doesNotMatch(combinedSource, /require\(['"]@?tolgee/i);
});

test('Tolgee import script writes generated files outside runtime locales by default', () => {
  assert.match(
    importSource,
    /const DEFAULT_OUT_DIR = path\.join\('tmp', 'tolgee-generated'\)/,
    'Default import output should be tmp/tolgee-generated'
  );
  assert.doesNotMatch(
    importSource,
    /const DEFAULT_OUT_DIR = .*src[/\\]i18n[/\\]locales/,
    'Import default must not target src/i18n/locales'
  );
  assert.match(
    importSource,
    /Pass --out src\/i18n\/locales explicitly/,
    'Usage text should make runtime locale overwrite an explicit reviewed choice'
  );
});

test('Tolgee scripts generate reversible files using the existing locale code pattern', () => {
  assert.match(
    exportSource,
    /path\.join\(absoluteOutDir, `\$\{language\.code\}\.json`\)/,
    'Export should write one JSON file per supported language code'
  );
  assert.match(
    importSource,
    /path\.join\(absoluteOutDir, `\$\{language\.code\}\.ts`\)/,
    'Import should preserve the generated {code}.ts locale-file pattern'
  );
  assert.match(
    importSource,
    /export const \$\{code\} = \$\{json\} as const;/,
    'Generated TypeScript should preserve export const {code} = ... as const'
  );
});

test('Tolgee scripts source language coverage from the repo language list and locale index', () => {
  assert.match(exportSource, /SUPPORTED_LANGUAGES/);
  assert.match(importSource, /SUPPORTED_LANGUAGES/);
  assert.match(exportSource, /from '\.\.\/src\/i18n\/locales'/);
});
