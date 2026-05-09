import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getFeatureFlag,
  getFeatureFlagContext,
  resetFeatureFlagOverrides,
  setFeatureFlagOverride,
} from './featureFlags';

test('returns safe local defaults for registered feature flags', () => {
  resetFeatureFlagOverrides();

  assert.equal(getFeatureFlag('reader_companion_v2'), false);
  assert.equal(getFeatureFlag('appsmith_ops_poc'), false);
  assert.equal(getFeatureFlag('audio_track_player_engine'), false);
  assert.equal(getFeatureFlag('posthog_reduced_mirror'), false);
});

test('applies and resets dev/test feature flag overrides', () => {
  resetFeatureFlagOverrides();

  assert.equal(setFeatureFlagOverride('reader_companion_v2', true), true);
  assert.equal(getFeatureFlag('reader_companion_v2'), true);

  resetFeatureFlagOverrides();

  assert.equal(getFeatureFlag('reader_companion_v2'), false);
});

test('unknown feature flag keys fail closed and cannot be overridden', () => {
  resetFeatureFlagOverrides();

  assert.equal(getFeatureFlag('missing_flag'), false);
  assert.equal(setFeatureFlagOverride('missing_flag', true), false);
  assert.equal(getFeatureFlag('missing_flag'), false);
});

test('feature flag context serializes only non-sensitive registered keys and states', () => {
  resetFeatureFlagOverrides();
  setFeatureFlagOverride('appsmith_ops_poc', true);

  assert.deepEqual(getFeatureFlagContext(), {
    flags: {
      reader_companion_v2: false,
      appsmith_ops_poc: true,
      audio_track_player_engine: false,
      posthog_reduced_mirror: false,
    },
  });
  assert.equal(JSON.stringify(getFeatureFlagContext()).includes('missing_flag'), false);

  resetFeatureFlagOverrides();
});
