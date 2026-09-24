// Startup import-graph guard: i18n/index.ts must import only the English locale statically
// (every other locale is lazy); allowed by docs/testing.md. Loading behaviour is in
// i18nStartup.persisted.test.ts and i18nStartup.device.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('i18n startup keeps only English on the synchronous import path', () => {
  const source = readRelativeSource('./index.ts');

  assert.equal(
    source.includes("import * as locales from './locales'"),
    false,
    'i18n startup should not import the locale barrel because that pulls every locale into startup'
  );
  assert.equal(
    source.includes("from './locales';"),
    false,
    'i18n startup should not import from the locale barrel'
  );
  assert.match(
    source,
    /import \{ en \} from '\.\/locales\/en';/,
    'i18n startup should synchronously import only the English fallback locale'
  );
  assert.match(
    source,
    /resources = \{\s*en:\s*\{\s*translation:\s*en,\s*\},\s*\};/s,
    'i18n should initialize with only English resources'
  );
});
