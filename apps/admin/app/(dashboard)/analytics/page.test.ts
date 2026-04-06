import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../');

test('analytics page puts the globe hero before secondary analytics sections', async () => {
  const pageSource = await readFile(
    path.join(repoRoot, 'apps/admin/app/(dashboard)/analytics/page.tsx'),
    'utf8'
  );

  const globeIndex = pageSource.indexOf('<AnalyticsGlobe');
  const metricsIndex = pageSource.indexOf('<section className="metric-grid analytics-page__metrics">');
  const dailyTrendsIndex = pageSource.indexOf('<DailyTrendsPanel');
  const oldTrendIndex = pageSource.indexOf('<section className="two-column analytics-page__trends">');
  const tableIndex = pageSource.indexOf('<section className="card">');

  assert.ok(globeIndex >= 0, 'expected globe component to be present');
  assert.match(pageSource, /metrics=\{analytics\.locationMetrics\}/, 'globe should use locationMetrics for markers');
  assert.doesNotMatch(pageSource, /countryMetrics/, 'analytics page should not reference countryMetrics');
  assert.ok(metricsIndex >= 0, 'expected metric grid to be present');
  assert.ok(dailyTrendsIndex >= 0, 'expected compact daily trends panel to be present');
  assert.ok(
    pageSource.includes('dailyListeningMinutes={analytics.dailyListeningMinutes}') &&
      pageSource.includes('dailyDownloadUnits={analytics.dailyDownloadUnits}'),
    'expected daily trends panel props to be wired'
  );
  assert.equal(oldTrendIndex, -1, 'expected old two-column trend section to be removed');
  assert.ok(globeIndex < metricsIndex, 'globe should appear before the metrics grid');
  assert.ok(globeIndex < dailyTrendsIndex, 'globe should appear before the daily trends panel');
  assert.ok(dailyTrendsIndex < tableIndex, 'daily trends should appear before the location table');
  assert.match(pageSource, /Active locations/);
  assert.match(pageSource, /Top locations/);
  assert.match(pageSource, /Location totals/);
  assert.match(pageSource, /analytics\.locationMetrics\.map/);
});
