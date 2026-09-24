// Non-TypeScript artefact check: reads app.json, Info.plist and the Xcode project as text; there is no module to load for it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import plist from '@expo/plist';

interface PrivacyManifest {
  NSPrivacyAccessedAPITypes?: {
    NSPrivacyAccessedAPIType: string;
    NSPrivacyAccessedAPITypeReasons: string[];
  }[];
  NSPrivacyTracking?: boolean;
}

type ExpoPlugin = string | [string, { assets?: string[] }];

interface AppConfig {
  expo: {
    scheme?: string;
    ios?: {
      infoPlist?: {
        NSCameraUsageDescription?: string;
        NSPhotoLibraryUsageDescription?: string;
        UIBackgroundModes?: string[];
      };
      privacyManifests?: PrivacyManifest;
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
const readPlistStringArray = (contents: string, key: string): string[] => {
  const match = contents.match(new RegExp(`<key>${key}</key>\\s*<array>([\\s\\S]*?)</array>`));
  assert.ok(match, `Expected ${key} array in plist`);
  return Array.from(match[1].matchAll(/<string>([^<]+)<\/string>/g)).map((item) => item[1]);
};

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

test('ios privacy manifest declares required-reason APIs in app.json and the committed file', () => {
  // Prebuild does not run for iOS here, so the committed PrivacyInfo.xcprivacy is what ships.
  // app.json carries the same declaration so a future prebuild cannot silently drop a
  // category (App Store Connect rejects uploads with ITMS-91053 when one is missing).
  // MMKV, expo-file-system, React Native and AsyncStorage use all four categories below.
  const appConfig = readRootJson<AppConfig>('app.json');
  // Round-trip through JSON so plist's null-prototype objects compare structurally.
  const committed = JSON.parse(
    JSON.stringify(plist.parse(readRootFile('ios/EveryBible/PrivacyInfo.xcprivacy')))
  ) as PrivacyManifest;
  const configured = appConfig.expo.ios?.privacyManifests;

  assert.ok(configured, 'Expected app.json to declare expo.ios.privacyManifests');
  assert.deepEqual(
    configured.NSPrivacyAccessedAPITypes,
    committed.NSPrivacyAccessedAPITypes,
    'app.json privacyManifests must match ios/EveryBible/PrivacyInfo.xcprivacy'
  );
  assert.equal(configured.NSPrivacyTracking, false);
  assert.equal(committed.NSPrivacyTracking, false);

  const categories = (committed.NSPrivacyAccessedAPITypes ?? []).map(
    (entry) => entry.NSPrivacyAccessedAPIType
  );
  for (const required of [
    'NSPrivacyAccessedAPICategoryFileTimestamp',
    'NSPrivacyAccessedAPICategoryUserDefaults',
    'NSPrivacyAccessedAPICategoryDiskSpace',
    'NSPrivacyAccessedAPICategorySystemBootTime',
  ]) {
    assert.ok(
      categories.includes(required),
      `Expected the privacy manifest to declare ${required}`
    );
  }
});

test('ios Info.plist keeps both app and Google URL schemes for sign-in callbacks', () => {
  const appConfig = readRootJson<AppConfig>('app.json');
  const infoPlist = readRootFile('ios/EveryBible/Info.plist');
  const urlSchemes = readPlistStringArray(infoPlist, 'CFBundleURLSchemes');
  const appScheme = appConfig.expo.scheme;

  assert.ok(appScheme, 'Expected app.json to declare the Expo app URL scheme');
  assert.ok(
    urlSchemes.includes(appScheme),
    `Expected ios/EveryBible/Info.plist to include the app URL scheme ${appScheme}`
  );
  assert.ok(
    urlSchemes.some((scheme) => scheme.startsWith('com.googleusercontent.apps.')),
    'Expected ios/EveryBible/Info.plist to include the reversed Google iOS client ID scheme'
  );
  assert.equal(
    new Set(urlSchemes).size,
    urlSchemes.length,
    'Expected ios/EveryBible/Info.plist URL schemes to stay unique so Google callbacks are not replaced by duplicates'
  );
});

test('native RTL layout is disabled before React starts, not only from JS on the next launch', () => {
  // rtlPolicy.ts pins layout to LTR, but I18nManager.allowRTL/forceRTL only take effect on
  // the NEXT launch. With ar.lproj/ur.lproj bundled, an Arabic/Urdu (or any RTL-locale Android)
  // device therefore got its first session mirrored. expo-localization's supportsRTL writes
  // the same native preference in its module OnCreate, before the first surface renders.
  const appConfig = readRootJson<AppConfig>('app.json');
  const localizationPlugin = appConfig.expo.plugins?.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-localization'
  ) as [string, { supportsRTL?: boolean }] | undefined;

  assert.equal(
    localizationPlugin?.[1]?.supportsRTL,
    false,
    'Expected app.json to configure ["expo-localization", { "supportsRTL": false }]'
  );
  assert.match(
    readRootFile('ios/EveryBible/Info.plist'),
    /<key>ExpoLocalization_supportsRTL<\/key>\s*<false\/>/,
    'Expected the committed iOS Info.plist to carry ExpoLocalization_supportsRTL=false (prebuild does not run for this project)'
  );
});

test('the bundled bible SQLite database ships once, through the Metro asset require only', () => {
  // bibleDatabase.ts hands `require('../../../assets/databases/bible-bsb-v2.db')` to
  // expo-sqlite's importDatabaseFromAssetAsync, which resolves it with expo-asset: on iOS the
  // Metro copy under <app>/assets/assets/databases/, on Android the res/raw resource. Also
  // listing the file in the expo-asset config plugin (or the Xcode Resources phase) embedded a
  // second, never-read 44.7 MB copy at the .app root / Android assets/.
  const appConfig = readRootJson<AppConfig>('app.json');
  const pbxproj = readRootFile('ios/EveryBible.xcodeproj/project.pbxproj');

  assert.ok(
    !getBundledAssetEntries(appConfig.expo.plugins).includes(BUNDLED_BIBLE_DATABASE_PATH),
    'app.json must not embed the bible database through the expo-asset plugin; Metro already bundles it'
  );
  assert.doesNotMatch(
    pbxproj,
    /bible-bsb-v2\.db/,
    'the iOS Xcode project must not copy the bible database into app resources; Metro already bundles it'
  );
  assert.match(
    readRootFile('src/services/bible/bibleDatabase.ts'),
    /require\('\.\.\/\.\.\/\.\.\/assets\/databases\/bible-bsb-v2\.db'\)/,
    'bibleDatabase.ts must keep resolving the bundled database through the Metro asset require'
  );
});

test('ios Xcode project compiles the native now-playing bridge files', () => {
  const pbxproj = readRootFile('ios/EveryBible.xcodeproj/project.pbxproj');

  assert.match(
    pbxproj,
    /EveryBibleAudioNowPlayingModule\.swift in Sources/,
    'Expected the iOS Xcode project to compile the Swift now-playing bridge file'
  );
  assert.match(
    pbxproj,
    /EveryBibleAudioNowPlayingModule\.m in Sources/,
    'Expected the iOS Xcode project to compile the Objective-C now-playing bridge file'
  );
  assert.match(
    pbxproj,
    /path = EveryBible\/EveryBibleAudioNowPlayingModule\.swift;/,
    'Expected the iOS Xcode project to reference the Swift now-playing bridge path'
  );
  assert.match(
    pbxproj,
    /path = EveryBible\/EveryBibleAudioNowPlayingModule\.m;/,
    'Expected the iOS Xcode project to reference the Objective-C now-playing bridge path'
  );
});
