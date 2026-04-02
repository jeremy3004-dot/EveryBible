/* global module, process, require */

const appJson = require('./app.json');

const PUBLIC_RUNTIME_CONFIG_KEYS = [
  'EXPO_PUBLIC_BIBLE_ASSET_BASE_URL',
  'EXPO_PUBLIC_ANALYTICS_COLLECTOR_URL',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID',
  'EXPO_PUBLIC_BIBLE_IS_API_KEY',
  'EXPO_PUBLIC_CONTENT_API_URL',
];

const readTrimmedString = (value) => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const buildPublicRuntimeConfigExtra = (env = process.env) => {
  const publicRuntimeConfig = {};

  PUBLIC_RUNTIME_CONFIG_KEYS.forEach((key) => {
    const value = readTrimmedString(env[key]);

    if (value) {
      publicRuntimeConfig[key] = value;
    }
  });

  return Object.keys(publicRuntimeConfig).length > 0 ? { publicRuntimeConfig } : {};
};

const configFactory = ({ config }) => {
  const baseConfig = config ?? appJson.expo;

  return {
    ...baseConfig,
    extra: {
      ...(baseConfig.extra ?? {}),
      ...buildPublicRuntimeConfigExtra(process.env),
    },
  };
};

module.exports = configFactory;
module.exports.PUBLIC_RUNTIME_CONFIG_KEYS = PUBLIC_RUNTIME_CONFIG_KEYS;
module.exports.buildPublicRuntimeConfigExtra = buildPublicRuntimeConfigExtra;
