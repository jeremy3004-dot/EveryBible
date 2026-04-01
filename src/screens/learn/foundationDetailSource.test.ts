import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('FoundationDetailScreen shows the full foundation description without a toggle', () => {
  const source = readRelativeSource('./FoundationDetailScreen.tsx');

  assert.equal(
    source.includes('descriptionExpanded'),
    false,
    'FoundationDetailScreen should no longer track collapsed description state'
  );

  assert.equal(
    source.includes('showMoreText'),
    false,
    'FoundationDetailScreen should no longer render a show-more/show-less control'
  );

  assert.equal(
    source.includes("t('gather.showMore')"),
    false,
    'FoundationDetailScreen should not reference the removed show-more translation key'
  );

  assert.equal(
    source.includes("t('gather.showLess')"),
    false,
    'FoundationDetailScreen should not reference the removed show-less translation key'
  );
});
