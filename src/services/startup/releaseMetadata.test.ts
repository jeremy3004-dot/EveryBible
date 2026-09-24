// Non-TypeScript artefact check: reads package.json, app.json, eas.json and the native projects (the runtime version comes from the real config module) as text; there is no module to load for it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../../constants/config';

interface AppConfig {
  expo: {
    version: string;
    description?: string;
    extra?: {
      privacyPolicyUrl?: string;
      termsOfServiceUrl?: string;
    };
  };
}

interface EasConfig {
  cli?: {
    appVersionSource?: string;
  };
  build?: {
    preview?: {
      distribution?: string;
    };
    production?: {
      autoIncrement?: boolean;
    };
  };
}

interface PackageJson {
  version: string;
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const readRootFile = (relativePathFromRepoRoot: string): string =>
  readFileSync(path.join(REPO_ROOT, relativePathFromRepoRoot), 'utf8');

const readOptionalRootFile = (relativePathFromRepoRoot: string): string | null => {
  const filePath = path.join(REPO_ROOT, relativePathFromRepoRoot);

  if (!existsSync(filePath)) {
    return null;
  }

  return readFileSync(filePath, 'utf8');
};

const readRootJson = <T>(relativePathFromRepoRoot: string): T =>
  JSON.parse(readRootFile(relativePathFromRepoRoot)) as T;

const readPlistString = (contents: string, key: string): string => {
  const match = contents.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`));
  assert.ok(match, `Expected ${key} in Info.plist`);
  return match[1];
};

const readGradleNumber = (contents: string, key: string): string => {
  const match = contents.match(new RegExp(`${key}\\s+(\\d+)`));
  assert.ok(match, `Expected ${key} in build.gradle`);
  return match[1];
};

const readGradleString = (contents: string, key: string): string => {
  const match = contents.match(new RegExp(`${key}\\s+"([^"]+)"`));
  assert.ok(match, `Expected ${key} in build.gradle`);
  return match[1];
};

const readPbxprojValue = (contents: string, key: string): string => {
  const matches = Array.from(contents.matchAll(new RegExp(`${key} = ([^;]+);`, 'g'))).map((match) =>
    match[1].trim()
  );

  assert.ok(matches.length > 0, `Expected ${key} in project.pbxproj`);
  assert.equal(new Set(matches).size, 1, `${key} should stay consistent across Xcode configs`);
  return matches[0];
};

interface NativeReleaseFiles {
  appVersion: string;
  infoPlist: string | null;
  pbxproj: string;
  androidGradle: string | null;
}

// Each platform's generated native metadata must agree with app.json and with
// itself. The iOS CFBundleVersion and Android versionCode are independent
// store counters (EAS remote versioning increments them per platform), so they
// are deliberately not compared with each other.
const checkNativeReleaseMetadata = ({
  appVersion,
  infoPlist,
  pbxproj,
  androidGradle,
}: NativeReleaseFiles): void => {
  if (infoPlist) {
    const iosShortVersion = readPlistString(infoPlist, 'CFBundleShortVersionString');
    const iosBuildNumber = readPlistString(infoPlist, 'CFBundleVersion');
    const iosProjectVersion = readPbxprojValue(pbxproj, 'CURRENT_PROJECT_VERSION');

    assert.equal(iosShortVersion, appVersion);
    assert.match(iosBuildNumber, /^[1-9]\d*$/, 'CFBundleVersion must be a positive integer');
    assert.equal(iosProjectVersion, iosBuildNumber);
  }

  if (androidGradle) {
    const androidVersionName = readGradleString(androidGradle, 'versionName');
    const androidVersionCode = readGradleNumber(androidGradle, 'versionCode');
    assert.equal(androidVersionName, appVersion);
    assert.match(androidVersionCode, /^[1-9]\d*$/, 'versionCode must be a positive integer');
  }
};

interface NativeFixtureOptions {
  iosBuild?: string;
  iosProjectVersion?: string;
  iosVersion?: string;
  androidCode?: string;
  androidName?: string;
}

const nativeFixture = ({
  iosBuild = '441',
  iosProjectVersion = iosBuild,
  iosVersion = '1.0.9',
  androidCode = '422',
  androidName = '1.0.9',
}: NativeFixtureOptions = {}): NativeReleaseFiles => ({
  appVersion: '1.0.9',
  infoPlist: `<dict>
  <key>CFBundleShortVersionString</key>
  <string>${iosVersion}</string>
  <key>CFBundleVersion</key>
  <string>${iosBuild}</string>
</dict>`,
  pbxproj: `MARKETING_VERSION = 1.0.9;
CURRENT_PROJECT_VERSION = ${iosProjectVersion};
MARKETING_VERSION = 1.0.9;
CURRENT_PROJECT_VERSION = ${iosProjectVersion};`,
  androidGradle: `defaultConfig {
        versionCode ${androidCode}
        versionName "${androidName}"
    }`,
});

test('independent Android and iOS build counters are valid release metadata', () => {
  // The 2026-09-15 audit state: both platforms at 1.0.9, Android 422, iOS 441.
  assert.doesNotThrow(() => checkNativeReleaseMetadata(nativeFixture()));
});

test('per-platform release metadata inconsistencies are still rejected', () => {
  assert.throws(() => checkNativeReleaseMetadata(nativeFixture({ iosProjectVersion: '440' })));
  assert.throws(() => checkNativeReleaseMetadata(nativeFixture({ iosVersion: '1.0.8' })));
  assert.throws(() => checkNativeReleaseMetadata(nativeFixture({ androidName: '1.0.8' })));
  assert.throws(() => checkNativeReleaseMetadata(nativeFixture({ iosBuild: '0' })));
  assert.throws(() => checkNativeReleaseMetadata(nativeFixture({ androidCode: '0' })));
});

test('release metadata stays aligned across tracked config and generated native outputs when present', () => {
  const packageJson = readRootJson<PackageJson>('package.json');
  const appConfig = readRootJson<AppConfig>('app.json');
  const easConfig = readRootJson<EasConfig>('eas.json');
  const infoPlist = readOptionalRootFile('ios/EveryBible/Info.plist');
  const pbxproj = readRootFile('ios/EveryBible.xcodeproj/project.pbxproj');
  const androidGradle = readOptionalRootFile('android/app/build.gradle');

  const appVersion = appConfig.expo.version;
  // The version the app reports at runtime, read from the real module.
  const runtimeConfigVersion = config.version;
  const iosMarketingVersion = readPbxprojValue(pbxproj, 'MARKETING_VERSION');
  const appDescription = appConfig.expo.description?.trim() ?? '';
  const privacyPolicyUrl = appConfig.expo.extra?.privacyPolicyUrl?.trim() ?? '';
  const termsOfServiceUrl = appConfig.expo.extra?.termsOfServiceUrl?.trim() ?? '';

  assert.equal(packageJson.version, appVersion);
  assert.equal(runtimeConfigVersion, appVersion);
  assert.equal(iosMarketingVersion, appVersion);
  assert.equal(easConfig.cli?.appVersionSource, 'remote');
  assert.equal(easConfig.build?.production?.autoIncrement, true);
  assert.ok(appDescription.length > 0, 'Expected app.json expo.description for release metadata');
  assert.match(
    privacyPolicyUrl,
    /^https:\/\/everybible\.app\/privacy$/,
    'Expected app.json expo.extra.privacyPolicyUrl to provide the canonical HTTPS privacy policy reference'
  );
  assert.match(
    termsOfServiceUrl,
    /^https:\/\/everybible\.app\/terms$/,
    'Expected app.json expo.extra.termsOfServiceUrl to provide the canonical HTTPS terms reference'
  );

  checkNativeReleaseMetadata({ appVersion, infoPlist, pbxproj, androidGradle });
});

test('ios bundle phase canonicalizes the project root for local EAS workdirs', () => {
  const pbxproj = readRootFile('ios/EveryBible.xcodeproj/project.pbxproj');

  assert.match(
    pbxproj,
    /export PROJECT_ROOT=.*pwd -P/,
    'Bundle script should resolve PROJECT_ROOT through pwd -P so /tmp and /private/tmp stay aligned'
  );
  assert.equal(
    pbxproj.includes('export PROJECT_ROOT=\\"$PROJECT_DIR\\"/..'),
    false,
    'Bundle script should not rely on the non-canonical PROJECT_DIR parent path'
  );
});

test('release docs match the supported distribution and Google sign-in contract', () => {
  const easConfig = readRootJson<EasConfig>('eas.json');
  const readme = readRootFile('README.md');
  const claude = readRootFile('CLAUDE.md');

  assert.doesNotMatch(readme, /EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID/);
  assert.doesNotMatch(claude, /EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID/);
  assert.match(readme, /EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID/);
  assert.match(readme, /EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID/);
  assert.match(readme, /npm run release:prepare/);
  assert.match(readme, /npm run testflight:submit-and-verify/);
  assert.match(readme, /npm run testflight:verify-distribution/);
  assert.match(readme, /scripts\/testflight_precheck\.sh/);
  assert.match(readme, /scripts\/testflight_release_guard\.ts/);
  assert.match(readme, /npm run testflight:build-local/);
  assert.match(readme, /eas submit --platform ios --profile production --path/);
  assert.match(claude, /npm run testflight:submit-and-verify/);
  assert.match(claude, /npm run testflight:verify-distribution/);
  assert.match(claude, /scripts\/testflight_precheck\.sh/);
  assert.match(claude, /npm run release:prepare/);
  assert.match(claude, /scripts\/testflight_release_guard\.ts/);
  assert.match(claude, /npm run testflight:build-local/);

  if (easConfig.build?.preview?.distribution === 'internal') {
    assert.match(readme, /Preview builds \(internal distribution installs\)/);
    assert.match(claude, /\*\*preview:\*\* Internal distribution builds \(not TestFlight\)/);
    assert.doesNotMatch(readme, /Preview builds \(TestFlight/i);
    assert.doesNotMatch(claude, /preview build \(TestFlight/i);
  }
});
