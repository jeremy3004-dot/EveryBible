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

test('analytics explorer: globe hero before metrics + tables, and translation filter syncs the tables', async () => {
  const explorer = await read('apps/admin/components/AnalyticsExplorer.tsx');

  const globeIndex = explorer.indexOf('<AnalyticsGlobe');
  const metricsIndex = explorer.indexOf('<section className="metric-grid analytics-page__metrics">');
  const dailyTrendsIndex = explorer.indexOf('<DailyTrendsPanel');
  const translationTableIndex = explorer.indexOf('<p className="eyebrow">By translation</p>');
  const countryTableIndex = explorer.indexOf('<p className="eyebrow">Top countries</p>');

  assert.ok(globeIndex >= 0, 'expected globe component to be present');
  assert.match(explorer, /metrics=\{analytics\.locationMetrics\}/, 'globe should use locationMetrics for markers');
  assert.ok(
    globeIndex < metricsIndex &&
      metricsIndex < dailyTrendsIndex &&
      dailyTrendsIndex < translationTableIndex &&
      translationTableIndex < countryTableIndex,
    'sections must be ordered: globe → metrics → daily trends → translation table → country table'
  );

  // Filter sync (P3 S17): the in-globe selection drives the country table.
  assert.match(
    explorer,
    /onSelectedTranslationChange=\{setSelectedTranslation\}/,
    'globe selection must be lifted into the explorer state'
  );
  assert.match(
    explorer,
    /const countryRows = activeEntry \? activeEntry\.countryMetrics : analytics\.countryMetrics/,
    'the country table must filter by the selected translation'
  );

  // S16 additions.
  assert.match(explorer, /Reading min/, 'country table should show reading minutes');
  assert.match(explorer, /country\.readingMinutes/, 'reading minutes must be wired into the country row');
  assert.match(explorer, /engagementScoreComputedAt/, 'engagement computed-at timestamp should be shown');
  assert.match(explorer, /Translation engagement/, 'translation table present');
});
