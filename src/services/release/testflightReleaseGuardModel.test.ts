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

test('evaluateRemoteBuildVersionState rejects remote build number drift', () => {
  const result = evaluateRemoteBuildVersionState({
    appVersionSource: 'remote',
    autoIncrement: true,
    latestUploadedBuildNumber: 285,
    easRemoteBuildNumber: 287,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /expected pre-build value 285/);
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
