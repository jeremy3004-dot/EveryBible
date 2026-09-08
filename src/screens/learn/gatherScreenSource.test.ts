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
    source.includes("t('gather.discoveryBibleStudy')"),
    true,
    'GatherScreen should use a translation key for the header eyebrow'
  );

  assert.equal(
    source.includes("t('gather.foundationsSummary'"),
    true,
    'GatherScreen should use a translation key for the foundations count eyebrow'
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

test('GatherScreen resumes the first incomplete lesson from the up-next card', () => {
  const source = readRelativeSource('./GatherScreen.tsx');

  assert.equal(
    source.includes("navigate('LessonDetail'"),
    true,
    'the up-next card should open the lesson itself, not the foundation index'
  );

  assert.equal(
    source.includes("t('gather.upNextLesson'"),
    true,
    'the up-next card should label its position in the path from a translation key'
  );

  assert.match(
    source,
    /completedLessons\[foundation\.id\]/,
    'up next should be derived from the gather store completion map'
  );
});

test('GatherScreen delegates the sub-tabs to the shared TabSwitch primitive', () => {
  const source = readRelativeSource('./GatherScreen.tsx');

  // TabSwitch owns accessibilityRole="tab" and the selected state for both
  // segments, so the screen must not hand-roll a second tab control beside it.
  assert.match(source, /<TabSwitch\b/, 'GatherScreen should render the shared TabSwitch');

  assert.equal(
    source.includes('accessibilityRole="tab"'),
    false,
    'GatherScreen should not hand-roll tab semantics alongside TabSwitch'
  );
});

test('GatherScreen renders the numbered path instead of tinted cards and rings', () => {
  const source = readRelativeSource('./GatherScreen.tsx');

  assert.equal(
    source.includes('ProgressRing'),
    false,
    'the redesigned Gather path uses segmented lesson ledgers, not progress rings'
  );

  assert.equal(
    source.includes("accentPrimary + '15'"),
    false,
    'the first foundation card no longer gets a tinted background'
  );

  assert.match(
    source,
    /accentRule/,
    'the up-next card should carry the 3pt accent rule that marks "you are here"'
  );

  assert.match(
    source,
    /pressEffect="translate"/,
    'path rows press with a 1pt translate, never a scale-down'
  );

  assert.match(
    source,
    /contentClearance/,
    'the path must clear the floating tab bar via useTabBarHeight()'
  );
});
