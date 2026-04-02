import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAnalyticsLocationEventProperties,
  normalizeAnalyticsLocationSnapshot,
} from './activityLocationModel';

test('normalizeAnalyticsLocationSnapshot rounds coordinates into coarse buckets and keeps country metadata', () => {
  const snapshot = normalizeAnalyticsLocationSnapshot({
    accuracyMeters: 842,
    countryCode: 'np',
    countryName: 'Nepal',
    label: 'Kathmandu, Nepal',
    latitude: 27.7172,
    longitude: 85.324,
  });

  assert.deepEqual(snapshot, {
    accuracyMeters: 842,
    countryCode: 'NP',
    countryName: 'Nepal',
    label: 'Approximate area near Kathmandu, Nepal',
    latitudeBucket: 28,
    longitudeBucket: 86,
    source: 'device',
  });
});

test('buildAnalyticsLocationEventProperties emits only privacy-safe coarse location keys', () => {
  const properties = buildAnalyticsLocationEventProperties({
    accuracyMeters: 1200,
    countryCode: 'NP',
    countryName: 'Nepal',
    label: 'Approximate area near Kathmandu, Nepal',
    latitudeBucket: 28,
    longitudeBucket: 86,
    source: 'device',
  });

  assert.deepEqual(properties, {
    geo_accuracy_meters: 1200,
    geo_country_code: 'NP',
    geo_country_name: 'Nepal',
    geo_label: 'Approximate area near Kathmandu, Nepal',
    geo_latitude_bucket: 28,
    geo_longitude_bucket: 86,
    geo_source: 'device',
  });
});
