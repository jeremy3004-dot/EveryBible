import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAnalyticsOverviewModel,
  buildTranslationBreakdown,
  mapCountryRollupsToMetrics,
  mapLocationRollupsToMetrics,
} from './analytics-reporting';

test('buildAnalyticsOverviewModel aggregates coarse country listening and download activity', () => {
  const overview = buildAnalyticsOverviewModel({
    since: new Date('2026-03-01T00:00:00.000Z'),
    summaries: [
      { user_id: 'user-1', engagement_score: 84, total_listening_minutes: 120 },
      { user_id: 'user-2', engagement_score: 66, total_listening_minutes: 40 },
    ],
    preferences: [
      { user_id: 'user-1', country_code: 'US', country_name: 'United States' },
      { user_id: 'user-2', country_code: 'NP', country_name: 'Nepal' },
    ],
    audioEvents: [
      {
        user_id: 'user-1',
        session_id: 'session-1',
        created_at: '2026-03-02T03:00:00.000Z',
        event_properties: { duration_ms: 900000 },
      },
      {
        user_id: 'user-2',
        session_id: 'session-2',
        created_at: '2026-03-02T10:00:00.000Z',
        event_properties: { duration_ms: 300000 },
      },
      {
        user_id: 'user-1',
        session_id: 'session-1',
        created_at: '2026-03-03T10:00:00.000Z',
        event_properties: { duration_ms: 600000 },
      },
    ],
    downloadEvents: [
      {
        user_id: 'user-1',
        session_id: null,
        created_at: '2026-03-03T08:00:00.000Z',
        event_properties: { download_units: 1 },
      },
      {
        user_id: 'user-2',
        session_id: null,
        created_at: '2026-03-03T09:00:00.000Z',
        event_properties: { download_units: 3 },
      },
    ],
  });

  assert.equal(overview.listeningTotalMinutes, 30);
  assert.equal(overview.totalDownloadUnits, 4);
  assert.equal(overview.totalTrackedSessions, 2);
  assert.equal(overview.userCountWithListening, 2);
  assert.equal(overview.averageEngagementScore, 75);
  assert.equal(overview.activeCountryCount, 2);

  const marchSecond = overview.dailyListeningMinutes.find((point) => point.day === '2026-03-02');
  const marchThirdDownloads = overview.dailyDownloadUnits.find((point) => point.day === '2026-03-03');

  assert.equal(marchSecond?.value, 20);
  assert.equal(marchThirdDownloads?.value, 4);

  const unitedStates = overview.countryMetrics.find((country) => country.code === 'US');
  const nepal = overview.countryMetrics.find((country) => country.code === 'NP');

  assert.equal(unitedStates?.listeningMinutes, 25);
  assert.equal(unitedStates?.downloadUnits, 1);
  assert.equal(unitedStates?.listenerCount, 1);
  assert.equal(nepal?.listeningMinutes, 5);
  assert.equal(nepal?.downloadUnits, 3);
  assert.equal(nepal?.listenerCount, 1);
});

test('mapCountryRollupsToMetrics enriches backend country rollups with globe coordinates', () => {
  const metrics = mapCountryRollupsToMetrics([
    {
      code: 'US',
      name: 'United States',
      listeningMinutes: 24.4,
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
  assert.equal(metrics[0]?.latitude > 0, true);
  assert.equal(metrics[0]?.longitude > 0, true);
  assert.equal(metrics[1]?.code, 'US');
  assert.equal(metrics[1]?.downloadUnits, 5);
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
