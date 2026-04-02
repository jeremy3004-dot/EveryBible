import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPublicRuntimeConfig } from './publicRuntimeConfig';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);

const toRootFilePath = (relativePathFromRepoRoot: string): string =>
  path.join(REPO_ROOT, relativePathFromRepoRoot);

const readRootFile = (relativePathFromRepoRoot: string): string =>
  readFileSync(toRootFilePath(relativePathFromRepoRoot), 'utf8');

const readOptionalRootFile = (relativePathFromRepoRoot: string): string | null => {
  const filePath = toRootFilePath(relativePathFromRepoRoot);

  if (!existsSync(filePath)) {
    return null;
  }

  return readFileSync(filePath, 'utf8');
};

const readExpoConfig = (): { expo: { newArchEnabled?: boolean; scheme?: string } } =>
  JSON.parse(readRootFile('app.json')) as { expo: { newArchEnabled?: boolean; scheme?: string } };

const readPlistStringArray = (contents: string, key: string): string[] => {
  const match = contents.match(new RegExp(`<key>${key}</key>\\s*<array>([\\s\\S]*?)</array>`));
  assert.ok(match, `Expected ${key} array in plist`);
  return Array.from(match[1].matchAll(/<string>([^<]+)<\/string>/g)).map((item) => item[1]);
};

const readGradleProperty = (contents: string, propertyName: string): string | null => {
  const match = contents.match(
    new RegExp(`^${propertyName}=(.+)$`, 'm')
  );

  return match?.[1]?.trim() ?? null;
};

test('expo disables the new architecture and local android output matches when present', () => {
  const appConfig = readExpoConfig();

  assert.equal(appConfig.expo.newArchEnabled, false);
  const gradleProperties = readOptionalRootFile('android/gradle.properties');

  if (!gradleProperties) {
    return;
  }

  const androidNewArchEnabled = readGradleProperty(gradleProperties, 'newArchEnabled');
  assert.equal(androidNewArchEnabled, String(appConfig.expo.newArchEnabled));
});

test('env example documents only supported Google sign-in client IDs', () => {
  const envExample = readRootFile('.env.example');

  assert.match(envExample, /EXPO_PUBLIC_BIBLE_ASSET_BASE_URL=/);
  assert.match(envExample, /EXPO_PUBLIC_ANALYTICS_COLLECTOR_URL=/);
  assert.match(envExample, /EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=/);
  assert.match(envExample, /EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=/);
  assert.doesNotMatch(envExample, /EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=/);
  assert.match(envExample, /EXPO_PUBLIC_CONTENT_API_URL=/);
});

test('buildPublicRuntimeConfig falls back to Expo extra when release bundles miss inline env vars', () => {
  const runtimeConfig = buildPublicRuntimeConfig({
    env: {},
    extra: {
      publicRuntimeConfig: {
        EXPO_PUBLIC_BIBLE_ASSET_BASE_URL: 'https://media.everybible.app',
        EXPO_PUBLIC_ANALYTICS_COLLECTOR_URL: 'https://analytics.everybible.app',
        EXPO_PUBLIC_SUPABASE_URL: 'https://ganmududzdzpruvdulkg.supabase.co',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
        EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'web-client-id',
        EXPO_PUBLIC_CONTENT_API_URL: 'https://everybible.app/api/mobile/content',
      },
    },
  });

  assert.equal(
    runtimeConfig.EXPO_PUBLIC_BIBLE_ASSET_BASE_URL,
    'https://media.everybible.app'
  );
  assert.equal(
    runtimeConfig.EXPO_PUBLIC_ANALYTICS_COLLECTOR_URL,
    'https://analytics.everybible.app'
  );
  assert.equal(
    runtimeConfig.EXPO_PUBLIC_SUPABASE_URL,
    'https://ganmududzdzpruvdulkg.supabase.co'
  );
  assert.equal(runtimeConfig.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'publishable-key');
  assert.equal(runtimeConfig.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, 'web-client-id');
  assert.equal(
    runtimeConfig.EXPO_PUBLIC_CONTENT_API_URL,
    'https://everybible.app/api/mobile/content'
  );
});

test('app config injects public runtime auth values into Expo extra for release builds', () => {
  const appConfig = require(toRootFilePath('app.config.js'));
  const extra = appConfig.buildPublicRuntimeConfigExtra({
    EXPO_PUBLIC_BIBLE_ASSET_BASE_URL: ' https://media.everybible.app ',
    EXPO_PUBLIC_ANALYTICS_COLLECTOR_URL: ' https://analytics.everybible.app ',
    EXPO_PUBLIC_SUPABASE_URL: ' https://ganmududzdzpruvdulkg.supabase.co ',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ' publishable-key ',
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: ' ios-client-id ',
    EXPO_PUBLIC_CONTENT_API_URL: ' https://everybible.app/api/mobile/content ',
  });

  assert.deepEqual(extra, {
    publicRuntimeConfig: {
      EXPO_PUBLIC_BIBLE_ASSET_BASE_URL: 'https://media.everybible.app',
      EXPO_PUBLIC_ANALYTICS_COLLECTOR_URL: 'https://analytics.everybible.app',
      EXPO_PUBLIC_CONTENT_API_URL: 'https://everybible.app/api/mobile/content',
      EXPO_PUBLIC_SUPABASE_URL: 'https://ganmududzdzpruvdulkg.supabase.co',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
      EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: 'ios-client-id',
    },
  });
});

test('local xcode node override points to an installed executable when present', () => {
  const xcodeEnvLocal = readOptionalRootFile('ios/.xcode.env.local');

  if (!xcodeEnvLocal) {
    return;
  }

  const nodeBinaryMatch = xcodeEnvLocal.match(/^\s*export\s+NODE_BINARY=(.+)$/m);
  assert.ok(nodeBinaryMatch, 'Expected NODE_BINARY export in ios/.xcode.env.local');

  const configuredValue = nodeBinaryMatch[1].trim().replace(/^['"]|['"]$/g, '');

  if (configuredValue.includes('command -v node')) {
    return;
  }

  assert.ok(
    existsSync(configuredValue),
    `ios/.xcode.env.local points to a missing NODE_BINARY path: ${configuredValue}`
  );
});

test('ios background modes stay aligned with notification delivery requirements', () => {
  const appConfig = JSON.parse(readRootFile('app.json')) as {
    expo: {
      ios?: {
        infoPlist?: {
          UIBackgroundModes?: string[];
        };
      };
    };
  };
  const expectedModes = ['audio', 'fetch', 'remote-notification'];
  const configuredModes = appConfig.expo.ios?.infoPlist?.UIBackgroundModes ?? [];
  const infoPlistModes = readPlistStringArray(readRootFile('ios/EveryBible/Info.plist'), 'UIBackgroundModes');

  assert.deepEqual(configuredModes, expectedModes);
  assert.deepEqual(infoPlistModes, expectedModes);
});
