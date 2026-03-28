import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

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

  assert.match(envExample, /EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=/);
  assert.match(envExample, /EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=/);
  assert.doesNotMatch(envExample, /EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=/);
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
