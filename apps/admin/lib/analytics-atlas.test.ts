import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAtlasFeatures,
  getAtlasScope,
  getAtlasPoints,
  getMetricWeight,
  toCsv,
  buildDailySeries,
} from './analytics-atlas';
import { mapLocationRollupsToMetrics, type CountryMetric } from './analytics-reporting';

const country: CountryMetric = {
  code: 'NP',
  name: 'Nepal',
  latitude: 28,
  longitude: 84,
  listeningMinutes: 100,
  readingMinutes: 30,
  downloadUnits: 4,
  listenerCount: 5,
};
const location = {
  ...country,
  latitude: 27.7,
  longitude: 85.3,
  listeningMinutes: 20,
  readingMinutes: 0,
  listenerCount: 3,
};
const analytics = {
  countryMetrics: [country],
  locationMetrics: [location],
  translationBreakdown: [
    {
      translationId: 'test',
      listeningMinutes: 12,
      readingMinutes: 5,
      downloadUnits: 2,
      listenerCount: 2,
      countryMetrics: [location],
      countryTableMetrics: [],
      locationMetrics: [location],
    },
  ],
};

test('country details use country totals, never a location fallback', () => {
  assert.equal(getAtlasScope(analytics, null).countries[0].listeningMinutes, 100);
  assert.deepEqual(getAtlasScope(analytics, 'test').countries, []);
  assert.equal(getAtlasScope(analytics, 'test').locations.length, 1);
});
test('reading maps country totals and listening maps approximate locations', () => {
  const scope = getAtlasScope(analytics, null);
  assert.equal(getAtlasPoints(scope, 'readingMinutes')[0].readingMinutes, 30);
  assert.equal(getAtlasPoints(scope, 'listeningMinutes')[0].listeningMinutes, 20);
  assert.equal(getAtlasPoints(scope, 'readingMinutes')[0].locationKind, 'country');
});
test('each coordinate has its own feature id so clicks resolve the right bucket', () => {
  const features = buildAtlasFeatures(
    [location, { ...location, latitude: 28.2 }],
    'listeningMinutes'
  ).features;
  assert.notEqual(features[0].properties.pointId, features[1].properties.pointId);
  assert.equal(features[0].properties.readingMinutes, 0);
});
test('zero activity and invalid coordinates never create heatmap dots', () => {
  assert.equal(
    buildAtlasFeatures(
      [
        { ...location, listeningMinutes: 0 },
        { ...location, latitude: NaN },
        { ...location, longitude: 190 },
      ],
      'listeningMinutes'
    ).features.length,
    0
  );
});
test('heat scaling retains smaller hotspots without treating zero as activity', () => {
  assert.equal(getMetricWeight(0, 10000), 0);
  assert.equal(getMetricWeight(10000, 10000), 1);
  assert.ok(getMetricWeight(10, 10000) > 0.2);
  assert.ok(getMetricWeight(100, 10000) < getMetricWeight(1000, 10000));
});
test('location rollups reject invalid coordinates and distinguish country fallback', () => {
  const base = { countryCode: 'NP', downloadUnits: 0, listenerCount: 1, listeningMinutes: 2 };
  const rows = mapLocationRollupsToMetrics([
    { ...base, latitude: 91, longitude: 84 },
    { ...base, latitude: NaN, longitude: 84 },
    base,
    { ...base, latitude: 28, longitude: 84 },
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    new Set(rows.map((row) => row.locationKind)),
    new Set(['country', 'approximate'])
  );
});
test('daily series includes missing dates as zero and preserves UTC date labels', () => {
  const series = buildDailySeries(
    [
      { day: '2026-09-01', minutes: 2 },
      { day: '2026-09-03', minutes: 6 },
    ],
    [],
    []
  );
  assert.deepEqual(
    series.map((row) => [row.day, row.listeningMinutes]),
    [
      ['2026-09-01', 2],
      ['2026-09-02', 0],
      ['2026-09-03', 6],
    ]
  );
});
test('CSV escapes quotes and disables spreadsheet formulas in text', () => {
  assert.equal(
    toCsv([
      ['Country', 'Minutes'],
      ['=1+1', 2],
      ['a,"b', 3],
    ]),
    '"Country","Minutes"\r\n"\'=1+1",2\r\n"a,""b",3'
  );
});

test('country-only activity stays visible alongside approximate locations without double-counting', () => {
  const points = getAtlasPoints({ countries: [country], locations: [location] }, 'listeningMinutes');
  assert.equal(points.reduce((sum, point) => sum + point.listeningMinutes, 0), 100);
  assert.equal(points.find(point => point.locationKind === 'country')?.listeningMinutes, 80);
});

test('reading uses collected approximate coordinates when available', () => {
  const points = getAtlasPoints({ countries: [country], locations: [{ ...location, readingMinutes: 30 }] }, 'readingMinutes');
  assert.equal(points.length, 1);
  assert.equal(points[0].latitude, 27.7);
});
