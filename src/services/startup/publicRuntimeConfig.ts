const PUBLIC_RUNTIME_CONFIG_KEYS = [
  'EXPO_PUBLIC_BIBLE_ASSET_BASE_URL',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID',
  'EXPO_PUBLIC_BIBLE_IS_API_KEY',
  'EXPO_PUBLIC_CONTENT_API_URL',
] as const;

type PublicRuntimeConfigKey = (typeof PUBLIC_RUNTIME_CONFIG_KEYS)[number];
type StringRecord = Record<string, unknown>;

export type PublicRuntimeConfig = Record<PublicRuntimeConfigKey, string | undefined>;

const readTrimmedString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const isRecord = (value: unknown): value is StringRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readPublicRuntimeConfigObject = (extra: unknown): StringRecord | undefined => {
  if (!isRecord(extra)) {
    return undefined;
  }

  const nestedConfig = extra.publicRuntimeConfig;

  if (isRecord(nestedConfig)) {
    return nestedConfig;
  }

  return extra;
};

const readExpoExtra = (): StringRecord | undefined => {
  try {
    // Load lazily so source-inspection tests can import this module in Node.
    const Constants = require('expo-constants').default as {
      expoConfig?: { extra?: unknown };
      manifest?: { extra?: unknown };
      manifest2?: { extra?: { expoClient?: { extra?: unknown } } };
    };

    return (
      readPublicRuntimeConfigObject(Constants.expoConfig?.extra) ??
      readPublicRuntimeConfigObject(Constants.manifest?.extra) ??
      readPublicRuntimeConfigObject(Constants.manifest2?.extra?.expoClient?.extra)
    );
  } catch {
    return undefined;
  }
};

export const buildPublicRuntimeConfig = ({
  env = process.env as StringRecord,
  extra,
}: {
  env?: StringRecord;
  extra?: unknown;
} = {}): PublicRuntimeConfig => {
  const extraConfig = readPublicRuntimeConfigObject(extra);

  return PUBLIC_RUNTIME_CONFIG_KEYS.reduce<PublicRuntimeConfig>(
    (config, key) => {
      config[key] = readTrimmedString(env[key]) ?? readTrimmedString(extraConfig?.[key]);
      return config;
    },
    {
      EXPO_PUBLIC_BIBLE_ASSET_BASE_URL: undefined,
      EXPO_PUBLIC_SUPABASE_URL: undefined,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: undefined,
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: undefined,
      EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: undefined,
      EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: undefined,
      EXPO_PUBLIC_BIBLE_IS_API_KEY: undefined,
      EXPO_PUBLIC_CONTENT_API_URL: undefined,
    }
  );
};

export const publicRuntimeConfig = buildPublicRuntimeConfig({
  env: process.env as StringRecord,
  extra: readExpoExtra(),
});
