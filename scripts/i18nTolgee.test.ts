import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SUPPORTED_LANGUAGES } from '../src/constants/languages';
import * as locales from '../src/i18n/locales';
// Both scripts load without any Tolgee SDK installed, which is the point: the workflow
// is plain JSON files, not a runtime dependency.
import { exportLocales } from './export-i18n-tolgee';
import { importLocales, parseArgs, usage } from './import-i18n-tolgee';

mock.method(console, 'log', () => undefined);

const codes = SUPPORTED_LANGUAGES.map((language) => language.code).sort();

test('the import script writes to tmp/tolgee-generated unless src/i18n/locales is asked for', () => {
  assert.equal(parseArgs([]).outDir, path.join('tmp', 'tolgee-generated'));
  assert.doesNotMatch(parseArgs([]).outDir, /src[/\\]i18n[/\\]locales/);
  assert.equal(parseArgs(['--out', 'src/i18n/locales']).outDir, 'src/i18n/locales');
  assert.match(usage, /Pass --out src\/i18n\/locales explicitly/);
});

test('export then import reproduces every supported locale as a {code}.ts module', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'tolgee-round-trip-'));
  try {
    const jsonDir = path.join(root, 'json');
    const tsDir = path.join(root, 'ts');

    await exportLocales({ outDir: jsonDir, help: false });
    assert.deepEqual(
      (await readdir(jsonDir)).sort(),
      codes.map((code) => `${code}.json`)
    );

    await importLocales({ inDir: jsonDir, outDir: tsDir, help: false });
    assert.deepEqual(
      (await readdir(tsDir)).sort(),
      codes.map((code) => `${code}.ts`)
    );

    for (const code of ['en', 'ne', 'ar']) {
      const source = await readFile(path.join(tsDir, `${code}.ts`), 'utf8');
      assert.match(source, new RegExp(`^export const ${code} = \\{`), code);
      assert.match(source, / as const;/, code);
      const generated = (await import(
        pathToFileURL(path.join(tsDir, `${code}.ts`)).href
      )) as Record<string, unknown>;
      assert.deepEqual(generated[code], (locales as Record<string, unknown>)[code], code);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
