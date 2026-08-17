import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getFeatureFlag,
  getFeatureFlagContext,
  resetFeatureFlagOverrides,
  resolveFeatureFlag,
  setFeatureFlagOverride,
} from './featureFlags';

test('returns safe local defaults for registered feature flags', () => {
  resetFeatureFlagOverrides();

  // env: {} pins the default layer so a shell-exported EXPO_PUBLIC_* cannot skew this.
  const flagDefault = (key: string) => resolveFeatureFlag(key, { env: {} });

  assert.equal(flagDefault('reader_companion_v2'), false);
  assert.equal(flagDefault('appsmith_ops_poc'), false);
  assert.equal(flagDefault('audio_track_player_engine'), false);
  assert.equal(flagDefault('posthog_reduced_mirror'), false);
  assert.equal(flagDefault('el_media_source'), false);
});

test('an env opt-in enables a flag without changing its default', () => {
  resetFeatureFlagOverrides();

  for (const raw of ['true', 'TRUE', ' 1 ']) {
    assert.equal(resolveFeatureFlag('el_media_source', { env: { el_media_source: raw } }), true);
  }

  for (const raw of ['false', '0', '', 'yes', undefined]) {
    assert.equal(resolveFeatureFlag('el_media_source', { env: { el_media_source: raw } }), false);
  }
});

test('an explicit runtime override beats the env opt-in', () => {
  resetFeatureFlagOverrides();
  setFeatureFlagOverride('el_media_source', false);

  assert.equal(resolveFeatureFlag('el_media_source', { env: { el_media_source: 'true' } }), false);

  resetFeatureFlagOverrides();

  assert.equal(resolveFeatureFlag('el_media_source', { env: { el_media_source: 'true' } }), true);
});

test('the env opt-in cannot invent unregistered flags', () => {
  resetFeatureFlagOverrides();

  assert.equal(resolveFeatureFlag('missing_flag', { env: { missing_flag: 'true' } }), false);
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
  // Pin every other flag so an env opt-in in the ambient shell cannot skew the snapshot.
  setFeatureFlagOverride('reader_companion_v2', false);
  setFeatureFlagOverride('audio_track_player_engine', false);
  setFeatureFlagOverride('posthog_reduced_mirror', false);
  setFeatureFlagOverride('el_media_source', false);

  assert.deepEqual(getFeatureFlagContext(), {
    flags: {
      reader_companion_v2: false,
      appsmith_ops_poc: true,
      audio_track_player_engine: false,
      posthog_reduced_mirror: false,
      el_media_source: false,
    },
  });
  assert.equal(JSON.stringify(getFeatureFlagContext()).includes('missing_flag'), false);

  resetFeatureFlagOverrides();
});
