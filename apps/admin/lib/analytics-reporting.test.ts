import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAnalyticsOverviewModel,
  mapLocationRollupsToMetrics,
} from './analytics-reporting';

test('buildAnalyticsOverviewModel aggregates coarse location listening and download activity', () => {
  const overview = buildAnalyticsOverviewModel({
    since: new Date('2026-03-01T00:00:00.000Z'),
    summaries: [
      { user_id: 'user-1', engagement_score: 84, total_listening_minutes: 120 },
      { user_id: 'user-2', engagement_score: 66, total_listening_minutes: 40 },
    ],
    audioEvents: [
      {
        user_id: 'user-1',
        session_id: 'session-1',
        created_at: '2026-03-02T03:00:00.000Z',
        event_properties: { duration_ms: 900000 },
        geo_accuracy_km: 50,
        geo_city: 'Kathmandu',
        geo_country_code: 'NP',
        geo_latitude: 27.7172,
        geo_longitude: 85.324,
        geo_region_code: 'BA',
        geo_region_name: 'Bagmati',
        geo_source: 'cloudflare_request_cf',
        geo_timezone: 'Asia/Kathmandu',
      },
      {
        user_id: 'user-2',
        session_id: 'session-2',
        created_at: '2026-03-02T10:00:00.000Z',
        event_properties: { duration_ms: 300000 },
        geo_accuracy_km: 50,
        geo_city: 'Manchester',
        geo_country_code: 'GB',
        geo_latitude: 53.48,
        geo_longitude: -2.24,
        geo_region_code: 'ENG',
        geo_region_name: 'England',
        geo_source: 'cloudflare_request_cf',
        geo_timezone: 'Europe/London',
      },
      {
        user_id: 'user-1',
        session_id: 'session-1',
        created_at: '2026-03-03T10:00:00.000Z',
        event_properties: { duration_ms: 600000 },
        geo_accuracy_km: 50,
        geo_city: 'Kathmandu',
        geo_country_code: 'NP',
        geo_latitude: 27.7172,
        geo_longitude: 85.324,
        geo_region_code: 'BA',
        geo_region_name: 'Bagmati',
        geo_source: 'cloudflare_request_cf',
        geo_timezone: 'Asia/Kathmandu',
      },
    ],
    downloadEvents: [
      {
        user_id: 'user-1',
        session_id: null,
        created_at: '2026-03-03T08:00:00.000Z',
        event_properties: { download_units: 1 },
        geo_accuracy_km: 50,
        geo_city: 'Kathmandu',
        geo_country_code: 'NP',
        geo_latitude: 27.7172,
        geo_longitude: 85.324,
        geo_region_code: 'BA',
        geo_region_name: 'Bagmati',
        geo_source: 'cloudflare_request_cf',
        geo_timezone: 'Asia/Kathmandu',
      },
      {
        user_id: 'user-2',
        session_id: null,
        created_at: '2026-03-03T09:00:00.000Z',
        event_properties: { download_units: 3 },
        geo_accuracy_km: 50,
        geo_city: 'Manchester',
        geo_country_code: 'GB',
        geo_latitude: 53.48,
        geo_longitude: -2.24,
        geo_region_code: 'ENG',
        geo_region_name: 'England',
        geo_source: 'cloudflare_request_cf',
        geo_timezone: 'Europe/London',
      },
    ],
  });

  assert.equal(overview.listeningTotalMinutes, 30);
  assert.equal(overview.totalDownloadUnits, 4);
  assert.equal(overview.totalTrackedSessions, 2);
  assert.equal(overview.userCountWithListening, 2);
  assert.equal(overview.averageEngagementScore, 75);
  assert.equal(overview.activeLocationCount, 2);

  const marchSecond = overview.dailyListeningMinutes.find((point) => point.day === '2026-03-02');
  const marchThirdDownloads = overview.dailyDownloadUnits.find((point) => point.day === '2026-03-03');

  assert.equal(marchSecond?.value, 20);
  assert.equal(marchThirdDownloads?.value, 4);

  const kathmandu = overview.locationMetrics.find((location) => location.code === 'NP|BA|Kathmandu');
  const manchester = overview.locationMetrics.find((location) => location.code === 'GB|ENG|Manchester');

  assert.equal(kathmandu?.name, 'Kathmandu, Bagmati');
  assert.equal(kathmandu?.countryCode, 'NP');
  assert.equal(kathmandu?.regionCode, 'BA');
  assert.equal(kathmandu?.city, 'Kathmandu');
  assert.equal(kathmandu?.listeningMinutes, 25);
  assert.equal(kathmandu?.downloadUnits, 1);
  assert.equal(kathmandu?.listenerCount, 1);
  assert.equal(manchester?.name, 'Manchester, England');
  assert.equal(manchester?.listeningMinutes, 5);
  assert.equal(manchester?.downloadUnits, 3);
  assert.equal(manchester?.listenerCount, 1);
});

test('mapLocationRollupsToMetrics preserves backend location rollups for the globe view', () => {
  const metrics = mapLocationRollupsToMetrics([
    {
      code: 'NP|BA|Kathmandu',
      name: 'Kathmandu, Bagmati',
      countryCode: 'NP',
      regionCode: 'BA',
      regionName: 'Bagmati',
      city: 'Kathmandu',
      latitude: 27.7172,
      longitude: 85.324,
      accuracyKm: 50,
      listeningMinutes: 24.4,
      downloadUnits: 5,
      listenerCount: 3,
    },
    {
      code: 'GB|ENG|Manchester',
      name: 'Manchester, England',
      countryCode: 'GB',
      regionCode: 'ENG',
      regionName: 'England',
      city: 'Manchester',
      latitude: 53.48,
      longitude: -2.24,
      accuracyKm: 50,
      listeningMinutes: 40,
      downloadUnits: 1,
      listenerCount: 2,
    },
  ]);

  assert.equal(metrics.length, 2);
  assert.equal(metrics[0]?.code, 'GB|ENG|Manchester');
  assert.equal(metrics[0]?.latitude > 0, true);
  assert.equal(metrics[0]?.longitude < 0, true);
  assert.equal(metrics[1]?.code, 'NP|BA|Kathmandu');
  assert.equal(metrics[1]?.downloadUnits, 5);
});
