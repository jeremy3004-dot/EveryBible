import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('GatherScreen uses translation keys for all visible section labels', () => {
  const source = readRelativeSource('./GatherScreen.tsx');

  assert.equal(
    source.includes("t('gather.foundations')"),
    true,
    'GatherScreen should use a translation key for the foundations sub-tab label'
  );

  assert.equal(
    source.includes('gatherWisdomCategories'),
    true,
    'GatherScreen should import the wisdom category collection by its wisdom name'
  );

  assert.equal(
    source.includes("t('gather.wisdom')"),
    true,
    'GatherScreen should use a translation key for the wisdom sub-tab label'
  );

  assert.equal(
    source.includes("t('gather.getStarted')"),
    true,
    'GatherScreen should use a translation key for the get-started label'
  );

  assert.equal(
    source.includes('GatherIconBadge'),
    true,
    'GatherScreen should render gather icons through the shared vector badge'
  );

  assert.equal(
    source.includes('artworkKey={category.iconImage}'),
    true,
    'GatherScreen should map wisdom categories to theme-aware SVG artwork'
  );
});

test('GatherScreen navigates into FoundationDetail for both foundations and wisdom cards', () => {
  const source = readRelativeSource('./GatherScreen.tsx');

  const detailNavigationCount = (source.match(/navigate\('FoundationDetail'/g) || []).length;

  assert.ok(
    detailNavigationCount >= 2,
    'GatherScreen should navigate to FoundationDetail from both foundations and wisdom'
  );
});

test('GatherScreen renders accessible tab controls with role and selected state', () => {
  const source = readRelativeSource('./GatherScreen.tsx');

  assert.equal(
    source.includes('accessibilityRole="tab"'),
    true,
    'GatherScreen should mark the sub-tabs with accessibilityRole="tab"'
  );

  assert.equal(
    source.includes('accessibilityState={{ selected:'),
    true,
    'GatherScreen should report the selected tab for assistive technology'
  );
});
