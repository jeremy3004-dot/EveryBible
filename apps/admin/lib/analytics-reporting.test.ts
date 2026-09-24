import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTranslationBreakdown,
  mapCountryRollupsToMetrics,
  mapLocationRollupsToMetrics,
} from './analytics-reporting';

test('mapCountryRollupsToMetrics enriches backend country rollups with globe coordinates + reading minutes', () => {
  const metrics = mapCountryRollupsToMetrics([
    {
      code: 'US',
      name: 'United States',
      listeningMinutes: 24.4,
      readingMinutes: 12.6,
      downloadUnits: 5,
      listenerCount: 3,
    },
    {
      code: 'NP',
      name: 'Nepal',
      listeningMinutes: 40,
      downloadUnits: 1,
      listenerCount: 2,
    },
  ]);

  assert.equal(metrics.length, 2);
  assert.equal(metrics[0]?.code, 'NP');
  assert.equal((metrics[0]?.latitude ?? 0) > 0, true);
  assert.equal((metrics[0]?.longitude ?? 0) > 0, true);
  assert.equal(metrics[0]?.readingMinutes, 0);
  assert.equal(metrics[1]?.code, 'US');
  assert.equal(metrics[1]?.downloadUnits, 5);
  assert.equal(metrics[1]?.readingMinutes, 12.6);
});

test('mapLocationRollupsToMetrics buckets nearby approximate points before rendering the heatmap', () => {
  const metrics = mapLocationRollupsToMetrics([
    {
      countryCode: 'NP',
      countryName: 'Nepal',
      downloadUnits: 1,
      listenerCount: 1,
      listeningMinutes: 12.5,
      latitude: 27.7108,
      longitude: 85.3251,
    },
    {
      countryCode: 'NP',
      countryName: 'Nepal',
      downloadUnits: 2,
      listenerCount: 1,
      listeningMinutes: 7.5,
      latitude: 27.67658,
      longitude: 85.31417,
    },
    {
      countryCode: 'US',
      countryName: 'United States',
      downloadUnits: 4,
      listenerCount: 3,
      listeningMinutes: 24,
      latitude: 39.97979,
      longitude: -83.04074,
    },
  ]);

  assert.equal(metrics.length, 2);

  assert.equal(metrics[0]?.code, 'US');
  assert.equal(metrics[0]?.downloadUnits, 4);
  assert.equal(metrics[0]?.listenerCount, 3);
  assert.equal(metrics[1]?.code, 'NP');
  assert.equal(metrics[1]?.latitude, 27.7);
  assert.equal(metrics[1]?.longitude, 85.3);
  assert.equal(metrics[1]?.listeningMinutes, 20);
  assert.equal(metrics[1]?.downloadUnits, 3);
  assert.equal(metrics[1]?.listenerCount, 1);
});

test('buildTranslationBreakdown prefers explicit listening totals over country rollups', () => {
  const breakdown = buildTranslationBreakdown(
    [],
    [
      {
        translationId: 'nlt',
        countryCode: null,
        countryName: 'Unknown',
        downloadUnits: 0,
        listenerCount: 0,
        listeningMinutes: 18.4,
        latitude: 27.7,
        longitude: 85.3,
      },
    ],
    [
      {
        translationId: 'nlt',
        listeningMinutes: 18.4,
      },
    ]
  );

  assert.equal(breakdown.length, 1);
  assert.equal(breakdown[0]?.translationId, 'nlt');
  assert.equal(breakdown[0]?.listeningMinutes, 18);
  assert.equal(breakdown[0]?.locationMetrics.length, 1);
  assert.equal(breakdown[0]?.countryMetrics.length, 1);
  assert.equal(breakdown[0]?.countryMetrics[0]?.listeningMinutes, 18.4);
  assert.equal(breakdown[0]?.countryMetrics[0]?.name, 'Unknown');
});

test('buildTranslationBreakdown falls back to location listening totals before the RPC exposes explicit totals', () => {
  const breakdown = buildTranslationBreakdown(
    [],
    [
      {
        translationId: 'web',
        countryCode: 'NP',
        countryName: 'Nepal',
        downloadUnits: 0,
        listenerCount: 1,
        listeningMinutes: 27.3,
        latitude: 27.7,
        longitude: 85.3,
      },
    ]
  );

  assert.equal(breakdown.length, 1);
  assert.equal(breakdown[0]?.translationId, 'web');
  assert.equal(breakdown[0]?.listeningMinutes, 27);
  assert.equal(breakdown[0]?.countryMetrics.length, 1);
  assert.equal(breakdown[0]?.countryMetrics[0]?.code, 'NP');
  assert.equal(breakdown[0]?.countryMetrics[0]?.listeningMinutes, 27.3);
});

// ── Phase 1 (metric truth): listener counts come from the RPC, never derived ──

test('buildTranslationBreakdown uses the authoritative per-translation listener count, not a max of country rows', () => {
  // BSB has two country rows (145 + 137 listeners) that must NOT be summed or
  // max-merged client-side. The RPC supplies the deduped distinct total (377).
  const breakdown = buildTranslationBreakdown(
    [
      {
        translationId: 'bsb',
        code: 'NP',
        name: 'Nepal',
        listeningMinutes: 2424,
        readingMinutes: 530,
        listenerCount: 137,
        downloadUnits: 4,
      },
      {
        translationId: 'bsb',
        code: 'US',
        name: 'United States',
        listeningMinutes: 983,
        readingMinutes: 414,
        listenerCount: 145,
        downloadUnits: 134,
      },
    ],
    [],
    [{ translationId: 'bsb', listeningMinutes: 3247 }],
    [{ translationId: 'bsb', listenerCount: 377 }]
  );

  assert.equal(breakdown.length, 1);
  // NOT 145 (max of country rows) and NOT 282 (sum) — the RPC's dedup count.
  assert.equal(breakdown[0]?.listenerCount, 377);
});

test('per-translation listeners never exceed the all-listeners total (subset invariant)', () => {
  // Distinct listeners for any single translation are a subset of all distinct
  // listeners, so this must hold for every translation the RPC returns.
  const userCountWithListening = 418;
  const listenerRollups = [
    { translationId: 'bsb', listenerCount: 377 },
    { translationId: 'byh', listenerCount: 22 },
    { translationId: 'npiulb', listenerCount: 4 },
  ];

  const breakdown = buildTranslationBreakdown(
    listenerRollups.map((r) => ({
      translationId: r.translationId,
      code: 'NP',
      name: 'Nepal',
      listeningMinutes: 10,
      readingMinutes: 0,
      listenerCount: r.listenerCount,
      downloadUnits: 0,
    })),
    [],
    [],
    listenerRollups
  );

  for (const entry of breakdown) {
    assert.ok(
      entry.listenerCount <= userCountWithListening,
      `translation ${entry.translationId} listeners (${entry.listenerCount}) must be <= total (${userCountWithListening})`
    );
  }
});

test('a translation the RPC gives no listener count reports zero listeners, never a max of country rows', () => {
  // METRICS.md: only the RPC computes distinct listeners, and
  // buildTranslationBreakdown never max-merges country rows. The RPC omits a
  // translation from translationListenerCounts when nobody listened to it
  // (reading-only translations such as KJV), so there is nothing to report.
  const breakdown = buildTranslationBreakdown(
    [
      {
        translationId: 'kjv',
        code: 'US',
        name: 'United States',
        listeningMinutes: 10,
        readingMinutes: 0,
        listenerCount: 6,
        downloadUnits: 0,
      },
      {
        translationId: 'kjv',
        code: 'GB',
        name: 'United Kingdom',
        listeningMinutes: 8,
        readingMinutes: 0,
        listenerCount: 4,
        downloadUnits: 0,
      },
    ],
    [],
    [],
    [{ translationId: 'bsb', listenerCount: 12 }]
  );

  assert.deepEqual(
    breakdown.map(({ translationId, listenerCount }) => ({ translationId, listenerCount })),
    [
      { translationId: 'kjv', listenerCount: 0 },
      { translationId: 'bsb', listenerCount: 12 },
    ]
  );
});

test('translation totals retain reading and downloads without country attribution', () => {
  const entries = buildTranslationBreakdown(
    [],
    [],
    [],
    [],
    [{ translationId: 'offline', listeningMinutes: 0, readingMinutes: 5, downloadUnits: 3 }]
  );
  assert.equal(entries[0].readingMinutes, 5);
  assert.equal(entries[0].downloadUnits, 3);
  assert.equal(entries[0].countryTableMetrics.length, 0);
});

test('location rollups carry reading activity through to the atlas', () => {
  const points = mapLocationRollupsToMetrics([
    {
      countryCode: 'NP',
      latitude: 28.2,
      longitude: 84,
      listeningMinutes: 0,
      readingMinutes: 10,
      downloadUnits: 0,
      listenerCount: 0,
    },
  ]);
  assert.equal(points[0].readingMinutes, 10);
});

test('country rows with no known geography stay in the country table under a readable name', () => {
  // IP providers report pseudo-codes (EU, AP, A1, ...) that are not countries.
  // Their activity is real and the RPC counts it, so the table keeps the row;
  // it has no coordinates, so the map cannot place it.
  const metrics = mapCountryRollupsToMetrics([
    { code: 'NP', name: 'Nepal', listeningMinutes: 40, downloadUnits: 1, listenerCount: 2 },
    { code: 'eu', name: 'EU', listeningMinutes: 30, downloadUnits: 2, listenerCount: 3 },
    { code: 'AP', name: '', listeningMinutes: 20, downloadUnits: 0, listenerCount: 1 },
    { code: 'A1', name: 'A1', listeningMinutes: 10, downloadUnits: 0, listenerCount: 1 },
    { code: 'QQ', name: '', listeningMinutes: 5, downloadUnits: 0, listenerCount: 1 },
    { code: ' ', name: 'Nowhere', listeningMinutes: 1, downloadUnits: 0, listenerCount: 1 },
  ]);

  assert.deepEqual(
    metrics.map(({ code, name, latitude, longitude, listeningMinutes, listenerCount }) => ({
      code,
      name,
      placed: latitude !== null && longitude !== null,
      listeningMinutes,
      listenerCount,
    })),
    [
      { code: 'NP', name: 'Nepal', placed: true, listeningMinutes: 40, listenerCount: 2 },
      {
        code: 'EU',
        name: 'Europe (unspecified)',
        placed: false,
        listeningMinutes: 30,
        listenerCount: 3,
      },
      {
        code: 'AP',
        name: 'Asia/Pacific (unspecified)',
        placed: false,
        listeningMinutes: 20,
        listenerCount: 1,
      },
      {
        code: 'A1',
        name: 'Anonymous proxy',
        placed: false,
        listeningMinutes: 10,
        listenerCount: 1,
      },
      {
        code: 'QQ',
        name: 'Unknown region (QQ)',
        placed: false,
        listeningMinutes: 5,
        listenerCount: 1,
      },
    ]
  );
});

test('approximate points reported under a pseudo-code keep that code so the country row can focus them', () => {
  const [point] = mapLocationRollupsToMetrics([
    {
      countryCode: 'EU',
      latitude: 50.11,
      longitude: 8.68,
      listeningMinutes: 3,
      downloadUnits: 0,
      listenerCount: 1,
    },
  ]);
  assert.deepEqual(
    { code: point.code, name: point.name, latitude: point.latitude, longitude: point.longitude },
    { code: 'EU', name: 'Europe (unspecified)', latitude: 50.1, longitude: 8.7 }
  );
});
