import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface AppConfig {
  expo: {
    version: string;
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

test('release metadata stays aligned across tracked config and generated native outputs when present', () => {
  const packageJson = readRootJson<PackageJson>('package.json');
  const appConfig = readRootJson<AppConfig>('app.json');
  const easConfig = readRootJson<EasConfig>('eas.json');
  const infoPlist = readOptionalRootFile('ios/EveryBible/Info.plist');
  const pbxproj = readRootFile('ios/EveryBible.xcodeproj/project.pbxproj');
  const androidGradle = readOptionalRootFile('android/app/build.gradle');

  const appVersion = appConfig.expo.version;
  const iosMarketingVersion = readPbxprojValue(pbxproj, 'MARKETING_VERSION');

  assert.equal(packageJson.version, appVersion);
  assert.equal(iosMarketingVersion, appVersion);
  assert.equal(easConfig.cli?.appVersionSource, 'remote');
  assert.equal(easConfig.build?.production?.autoIncrement, true);

  if (infoPlist) {
    const iosShortVersion = readPlistString(infoPlist, 'CFBundleShortVersionString');
    const iosBuildNumber = readPlistString(infoPlist, 'CFBundleVersion');
    const iosProjectVersion = readPbxprojValue(pbxproj, 'CURRENT_PROJECT_VERSION');

    assert.equal(iosShortVersion, appVersion);
    assert.equal(iosProjectVersion, iosBuildNumber);

    if (androidGradle) {
      const androidVersionCode = readGradleNumber(androidGradle, 'versionCode');
      assert.equal(androidVersionCode, iosBuildNumber);
    }
  }

  if (androidGradle) {
    const androidVersionName = readGradleString(androidGradle, 'versionName');
    assert.equal(androidVersionName, appVersion);
  }
});

test('release docs match the supported distribution and Google sign-in contract', () => {
  const easConfig = readRootJson<EasConfig>('eas.json');
  const readme = readRootFile('README.md');
  const claude = readRootFile('CLAUDE.md');

  assert.doesNotMatch(readme, /EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID/);
  assert.doesNotMatch(claude, /EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID/);
  assert.match(readme, /EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID/);
  assert.match(readme, /EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID/);
  assert.match(readme, /scripts\/testflight_precheck\.sh/);
  assert.match(claude, /scripts\/testflight_precheck\.sh/);

  if (easConfig.build?.preview?.distribution === 'internal') {
    assert.match(readme, /Preview builds \(internal distribution installs\)/);
    assert.match(claude, /\*\*preview:\*\* Internal distribution builds \(not TestFlight\)/);
    assert.doesNotMatch(readme, /Preview builds \(TestFlight/i);
    assert.doesNotMatch(claude, /preview build \(TestFlight/i);
  }
});
