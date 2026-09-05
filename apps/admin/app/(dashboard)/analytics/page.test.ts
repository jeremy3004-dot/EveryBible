import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../');

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

test('analytics page renders a whitelisted time-range picker + client explorer', async () => {
  const page = await read('apps/admin/app/(dashboard)/analytics/page.tsx');

  assert.match(
    page,
    /normalizeAnalyticsWindow\(\(await searchParams\)\.window\)/,
    'the window must come from a whitelisted search param (P3 S14)'
  );
  assert.match(page, /getAnalyticsOverview\(windowDays\)/, 'the overview fetch is parameterized by the selected window');
  assert.match(page, /<AnalyticsTimeRangePicker/, 'time-range picker present');
  assert.match(
    page,
    /<AnalyticsExplorer analytics=\{analytics\} windowDays=\{windowDays\}/,
    'the client explorer receives the overview + window'
  );
  // Globe + tables live in the client explorer now (for filter sync), not inline.
  assert.doesNotMatch(page, /<AnalyticsGlobe/, 'globe should render inside the explorer, not the page');
});

test('analytics explorer distinguishes global totals from linked geographic filters', async () => {
  const explorer = await read('apps/admin/components/AnalyticsExplorer.tsx');
  assert.ok(explorer.indexOf('className="atlas-kpis"') < explorer.indexOf('<AnalyticsGlobe'));
  assert.match(explorer, /getAtlasScope\(analytics, selectedTranslation\)/);
  assert.match(explorer, /countries=\{scope.countries\}/);
  assert.match(explorer, /onSelectCountry=\{setSelectedCountry\}/);
  assert.match(explorer, /The totals above and daily trends\s+cover all translations/);
  assert.match(explorer, /engagementScoreComputedAt/);
  assert.match(explorer, /<AnalyticsTables/);
});
