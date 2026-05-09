import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const source = readFileSync(resolve(__dirname, 'readingPlanAssets.ts'), 'utf8');

test('reading plan covers use PNG assets for React Native image require reliability on iOS', () => {
  assert.doesNotMatch(
    source,
    /assets\/plans\/covers\/[^'"]+\.webp/,
    'reading plan cover requires should not use WebP because iOS simulator has failed to render those bundled images'
  );
});
