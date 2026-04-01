import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type ExpoPlugin = string | [string, { assets?: string[] }];

interface AppConfig {
  expo: {
    ios?: {
      infoPlist?: {
        NSCameraUsageDescription?: string;
        NSPhotoLibraryUsageDescription?: string;
        UIBackgroundModes?: string[];
      };
    };
    plugins?: ExpoPlugin[];
  };
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BUNDLED_BIBLE_DATABASE_PATH = './assets/databases/bible-bsb-v2.db';

const readRootFile = (relativePathFromRepoRoot: string): string =>
  readFileSync(path.join(REPO_ROOT, relativePathFromRepoRoot), 'utf8');

const readRootJson = <T>(relativePathFromRepoRoot: string): T =>
  JSON.parse(readRootFile(relativePathFromRepoRoot)) as T;

const escapeForRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getBundledAssetEntries = (plugins: ExpoPlugin[] | undefined): string[] => {
  const assetPlugin = plugins?.find(
    (plugin): plugin is [string, { assets?: string[] }] =>
      Array.isArray(plugin) && plugin[0] === 'expo-asset'
  );

  return assetPlugin?.[1]?.assets ?? [];
};

test('ios Info.plist keeps configured background modes aligned with app config', () => {
  const appConfig = readRootJson<AppConfig>('app.json');
  const infoPlist = readRootFile('ios/EveryBible/Info.plist');
  const expectedBackgroundModes = appConfig.expo.ios?.infoPlist?.UIBackgroundModes ?? [];

  assert.ok(
    expectedBackgroundModes.length > 0,
    'Expected app.json to declare at least one iOS background mode'
  );

  for (const mode of expectedBackgroundModes) {
    assert.match(
      infoPlist,
      new RegExp(`<string>${escapeForRegex(mode)}</string>`),
      `Expected ios/EveryBible/Info.plist to include the ${mode} background mode from app.json`
    );
  }
});

test('ios Info.plist keeps image permission purpose strings aligned with app config', () => {
  const appConfig = readRootJson<AppConfig>('app.json');
  const infoPlist = readRootFile('ios/EveryBible/Info.plist');
  const expectedCameraUsage = appConfig.expo.ios?.infoPlist?.NSCameraUsageDescription;
  const expectedPhotoLibraryUsage = appConfig.expo.ios?.infoPlist?.NSPhotoLibraryUsageDescription;

  assert.ok(expectedCameraUsage, 'Expected app.json to declare NSCameraUsageDescription');
  assert.ok(
    expectedPhotoLibraryUsage,
    'Expected app.json to declare NSPhotoLibraryUsageDescription'
  );

  assert.match(
    infoPlist,
    new RegExp(
      `<key>NSCameraUsageDescription</key>\\s*<string>${escapeForRegex(expectedCameraUsage)}</string>`
    ),
    'Expected ios/EveryBible/Info.plist to mirror NSCameraUsageDescription from app.json'
  );
  assert.match(
    infoPlist,
    new RegExp(
      `<key>NSPhotoLibraryUsageDescription</key>\\s*<string>${escapeForRegex(expectedPhotoLibraryUsage)}</string>`
    ),
    'Expected ios/EveryBible/Info.plist to mirror NSPhotoLibraryUsageDescription from app.json'
  );
});

test('ios Xcode project bundles the configured bible SQLite asset', () => {
  const appConfig = readRootJson<AppConfig>('app.json');
  const pbxproj = readRootFile('ios/EveryBible.xcodeproj/project.pbxproj');
  const configuredBundledAssets = getBundledAssetEntries(appConfig.expo.plugins);

  assert.ok(
    configuredBundledAssets.includes(BUNDLED_BIBLE_DATABASE_PATH),
    'Expected app.json expo-asset plugin to keep the bundled bible database configured'
  );
  assert.match(
    pbxproj,
    /bible-bsb-v2\.db in Resources/,
    'Expected the iOS Xcode project to copy the bundled bible database into app resources'
  );
  assert.match(
    pbxproj,
    /path = "\.\.\/assets\/databases\/bible-bsb-v2\.db"/,
    'Expected the iOS Xcode project to reference the configured bible database asset path'
  );
});
