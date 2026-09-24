import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateLocalCredentialsPolicy,
  evaluateRemoteBuildVersionState,
  parseBuildNumber,
} from './testflightReleaseGuardModel';

test('parseBuildNumber accepts positive integer strings', () => {
  assert.equal(parseBuildNumber('286'), 286);
  assert.equal(parseBuildNumber(287), 287);
  assert.equal(parseBuildNumber(' 288 '), 288);
  assert.equal(parseBuildNumber('28a'), null);
  assert.equal(parseBuildNumber(null), null);
});

test('evaluateRemoteBuildVersionState accepts the current App Store build number as the pre-build EAS value', () => {
  const result = evaluateRemoteBuildVersionState({
    appVersionSource: 'remote',
    autoIncrement: true,
    latestUploadedBuildNumber: 285,
    easRemoteBuildNumber: 285,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('evaluateRemoteBuildVersionState accepts a reserved EAS build number above the latest App Store upload', () => {
  const result = evaluateRemoteBuildVersionState({
    appVersionSource: 'remote',
    autoIncrement: true,
    latestUploadedBuildNumber: 285,
    easRemoteBuildNumber: 287,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('evaluateRemoteBuildVersionState rejects an EAS build number behind the latest App Store upload', () => {
  const result = evaluateRemoteBuildVersionState({
    appVersionSource: 'remote',
    autoIncrement: true,
    latestUploadedBuildNumber: 285,
    easRemoteBuildNumber: 284,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /expected at least 285/);
  assert.match(result.errors.join('\n'), /eas build:version:set/);
});

test('evaluateLocalCredentialsPolicy rejects unexpected local credentials mode', () => {
  const result = evaluateLocalCredentialsPolicy({
    expectedBundleId: 'com.everybible.app',
    credentialsSource: 'local',
    allowLocalCredentials: false,
    localCredentialsPresent: true,
    localProfileBundleId: 'com.everybible.app',
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /defaults to remote Expo-managed iOS credentials/);
});

test('evaluateLocalCredentialsPolicy rejects a provisioning profile for the wrong app', () => {
  const result = evaluateLocalCredentialsPolicy({
    expectedBundleId: 'com.everybible.app',
    credentialsSource: 'local',
    allowLocalCredentials: true,
    localCredentialsPresent: true,
    localProfileBundleId: 'com.gurkhafit.app',
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /com\.gurkhafit\.app/);
  assert.match(result.errors.join('\n'), /com\.everybible\.app/);
});

test('evaluateLocalCredentialsPolicy accepts the remote default without local files', () => {
  const result = evaluateLocalCredentialsPolicy({
    expectedBundleId: 'com.everybible.app',
    credentialsSource: null,
    allowLocalCredentials: false,
    localCredentialsPresent: false,
    localProfileBundleId: null,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('parseBuildNumber rejects negative, fractional, and non-numeric values', () => {
  assert.equal(parseBuildNumber(0), 0);
  assert.equal(parseBuildNumber(-1), null);
  assert.equal(parseBuildNumber(12.5), null);
  assert.equal(parseBuildNumber('-3'), null);
  assert.equal(parseBuildNumber('12.5'), null);
  assert.equal(parseBuildNumber(''), null);
  assert.equal(parseBuildNumber(undefined), null);
});

test('evaluateRemoteBuildVersionState reports every misconfiguration and missing build number at once', () => {
  const result = evaluateRemoteBuildVersionState({
    appVersionSource: 'local',
    autoIncrement: false,
    latestUploadedBuildNumber: null,
    easRemoteBuildNumber: null,
  });

  assert.deepEqual(result, {
    ok: false,
    errors: [
      'eas.json must keep cli.appVersionSource set to "remote" for iOS releases.',
      'eas.json must keep build.production.autoIncrement set to true for iOS releases.',
      'Could not determine the latest uploaded iOS build number from App Store Connect.',
      'Could not determine the current remote iOS build number from EAS.',
    ],
  });
});

test('evaluateRemoteBuildVersionState skips the drift comparison when only one build number is known', () => {
  const missingEas = evaluateRemoteBuildVersionState({
    appVersionSource: 'remote',
    autoIncrement: true,
    latestUploadedBuildNumber: 285,
    easRemoteBuildNumber: null,
  });
  const missingAppStore = evaluateRemoteBuildVersionState({
    appVersionSource: 'remote',
    autoIncrement: true,
    latestUploadedBuildNumber: null,
    easRemoteBuildNumber: 1,
  });

  assert.deepEqual(missingEas, {
    ok: false,
    errors: ['Could not determine the current remote iOS build number from EAS.'],
  });
  assert.deepEqual(missingAppStore, {
    ok: false,
    errors: ['Could not determine the latest uploaded iOS build number from App Store Connect.'],
  });
});

test('evaluateRemoteBuildVersionState treats unset version settings as failures, not defaults', () => {
  const result = evaluateRemoteBuildVersionState({
    appVersionSource: null,
    autoIncrement: null,
    latestUploadedBuildNumber: 10,
    easRemoteBuildNumber: 10,
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 2);
});

test('evaluateLocalCredentialsPolicy rejects an allowed local mode whose credential files are missing', () => {
  const result = evaluateLocalCredentialsPolicy({
    expectedBundleId: 'com.everybible.app',
    credentialsSource: 'local',
    allowLocalCredentials: true,
    localCredentialsPresent: false,
    localProfileBundleId: null,
  });

  assert.deepEqual(result, {
    ok: false,
    errors: [
      'Local credentials mode is enabled, but credentials.json / credentials/ios assets are missing.',
    ],
  });
});

test('evaluateLocalCredentialsPolicy accepts an intentionally allowed local mode with a matching profile', () => {
  const result = evaluateLocalCredentialsPolicy({
    expectedBundleId: 'com.everybible.app',
    credentialsSource: 'local',
    allowLocalCredentials: true,
    localCredentialsPresent: true,
    localProfileBundleId: 'com.everybible.app',
  });

  assert.deepEqual(result, { ok: true, errors: [] });
});

test('evaluateLocalCredentialsPolicy ignores stray local files and profiles when credentials are remote', () => {
  const result = evaluateLocalCredentialsPolicy({
    expectedBundleId: 'com.everybible.app',
    credentialsSource: 'remote',
    allowLocalCredentials: false,
    localCredentialsPresent: false,
    localProfileBundleId: 'com.gurkhafit.app',
  });

  assert.deepEqual(result, { ok: true, errors: [] });
});
