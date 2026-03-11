import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const readRootFile = (relativePathFromRepoRoot: string): string =>
  readFileSync(new URL(`../../../${relativePathFromRepoRoot}`, import.meta.url), 'utf8');

const readOptionalRootFile = (relativePathFromRepoRoot: string): string | null => {
  const fileUrl = new URL(`../../../${relativePathFromRepoRoot}`, import.meta.url);

  if (!existsSync(fileUrl)) {
    return null;
  }

  return readFileSync(fileUrl, 'utf8');
};

const readExpoConfig = (): { expo: { newArchEnabled?: boolean; scheme?: string } } =>
  JSON.parse(readRootFile('app.json')) as { expo: { newArchEnabled?: boolean; scheme?: string } };

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
