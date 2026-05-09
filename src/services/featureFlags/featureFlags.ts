const FEATURE_FLAG_DEFAULTS = {
  reader_companion_v2: false,
  appsmith_ops_poc: false,
  audio_track_player_engine: false,
  posthog_reduced_mirror: false,
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAG_DEFAULTS;

export type FeatureFlagContext = {
  flags: Record<FeatureFlagKey, boolean>;
};

const featureFlagOverrides: Partial<Record<FeatureFlagKey, boolean>> = {};

const isFeatureFlagKey = (key: string): key is FeatureFlagKey =>
  Object.prototype.hasOwnProperty.call(FEATURE_FLAG_DEFAULTS, key);

// Unleash should plug in behind this local adapter later. Until then this
// module must stay synchronous and dependency-free so startup never waits on
// flag infrastructure.
export const getFeatureFlag = (key: string): boolean => {
  if (!isFeatureFlagKey(key)) {
    return false;
  }

  return featureFlagOverrides[key] ?? FEATURE_FLAG_DEFAULTS[key];
};

export const getFeatureFlagContext = (): FeatureFlagContext => {
  const flags = Object.fromEntries(
    Object.keys(FEATURE_FLAG_DEFAULTS).map((key) => [key, getFeatureFlag(key)])
  ) as Record<FeatureFlagKey, boolean>;

  return { flags };
};

export const setFeatureFlagOverride = (key: string, value: boolean): boolean => {
  if (!isFeatureFlagKey(key)) {
    return false;
  }

  featureFlagOverrides[key] = value;
  return true;
};

export const resetFeatureFlagOverrides = (): void => {
  for (const key of Object.keys(featureFlagOverrides) as FeatureFlagKey[]) {
    delete featureFlagOverrides[key];
  }
};
