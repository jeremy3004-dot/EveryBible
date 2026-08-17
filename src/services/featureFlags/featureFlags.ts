const FEATURE_FLAG_DEFAULTS = {
  reader_companion_v2: false,
  appsmith_ops_poc: false,
  audio_track_player_engine: false,
  posthog_reduced_mirror: false,
  el_media_source: false,
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAG_DEFAULTS;

export type FeatureFlagContext = {
  flags: Record<FeatureFlagKey, boolean>;
};

export type FeatureFlagEnv = Partial<Record<string, string | undefined>>;

const featureFlagOverrides: Partial<Record<FeatureFlagKey, boolean>> = {};

// Build-time enable path: lets a build turn a flag on without editing FEATURE_FLAG_DEFAULTS
// (dev soak, staged rollout, per-EAS-profile enablement). Each EXPO_PUBLIC_* read MUST stay
// a literal static member expression so Expo/Metro inlines it into release bundles — never
// build these keys dynamically, or release builds silently see `undefined`.
const FEATURE_FLAG_ENV: FeatureFlagEnv = {
  el_media_source: process.env.EXPO_PUBLIC_EL_MEDIA_SOURCE,
};

const isFeatureFlagKey = (key: string): key is FeatureFlagKey =>
  Object.prototype.hasOwnProperty.call(FEATURE_FLAG_DEFAULTS, key);

// Only unambiguous booleans opt in; anything else leaves the default in charge.
const parseFeatureFlagEnvValue = (raw: string | undefined): boolean | undefined => {
  if (typeof raw !== 'string') {
    return undefined;
  }

  const normalized = raw.trim().toLowerCase();

  if (normalized === 'true' || normalized === '1') {
    return true;
  }

  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  return undefined;
};

// Precedence: explicit runtime override > build-time env opt-in > local default.
// `env` is injectable so tests never depend on the ambient shell.
export const resolveFeatureFlag = (
  key: string,
  { env = FEATURE_FLAG_ENV }: { env?: FeatureFlagEnv } = {}
): boolean => {
  if (!isFeatureFlagKey(key)) {
    return false;
  }

  return (
    featureFlagOverrides[key] ?? parseFeatureFlagEnvValue(env[key]) ?? FEATURE_FLAG_DEFAULTS[key]
  );
};

// Unleash should plug in behind this local adapter later. Until then this
// module must stay synchronous and dependency-free so startup never waits on
// flag infrastructure.
export const getFeatureFlag = (key: string): boolean => resolveFeatureFlag(key);

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
