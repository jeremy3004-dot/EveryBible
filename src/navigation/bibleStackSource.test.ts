import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('BibleStack registers the modal BiblePicker route for the reader chapter pill', () => {
  const source = readRelativeSource('./BibleStack.tsx');

  assert.match(
    source,
    /name="BiblePicker"/,
    'BibleStack should register a dedicated picker route that the reader can push as a modal'
  );

  assert.match(
    source,
    /options=\{\s*\{\s*presentation:\s*'modal'\s*\}\s*\}/,
    'BibleStack should present the picker route as a modal sheet instead of a normal stack page'
  );

  assert.match(
    source,
    /BibleBrowserScreen/,
    'BibleStack should reuse the browser screen implementation for the picker modal'
  );
});
