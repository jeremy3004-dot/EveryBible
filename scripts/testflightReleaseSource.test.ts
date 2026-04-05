import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const packageJson = JSON.parse(
  readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
) as {
  scripts?: Record<string, string>;
};

const precheckSource = readFileSync(
  path.join(process.cwd(), 'scripts', 'testflight_precheck.sh'),
  'utf8'
);

test('testflight local build script syncs the Expo remote build number before the local build', () => {
  assert.equal(
    packageJson.scripts?.['testflight:build-local'],
    'npm run testflight:sync-version && eas build --platform ios --profile production --local --non-interactive',
    'Local TestFlight builds should sync the native iOS build number from Expo before invoking the local production build'
  );

  assert.equal(
    packageJson.scripts?.['testflight:sync-version'],
    'eas build:version:sync --platform ios --profile production',
    'The repo should expose a first-class sync command for future local iOS release builds'
  );
});

test('testflight precheck rejects IPAs whose build number drifted from the Expo remote release counter', () => {
  assert.match(
    precheckSource,
    /eas build:version:get --platform ios --profile production --json --non-interactive/,
    'Precheck should query Expo for the current remote iOS build number'
  );

  assert.match(
    precheckSource,
    /IPA build number .* does not match the current EAS remote iOS build number/,
    'Precheck should fail fast when a local IPA drifted from the Expo-managed release counter'
  );

  assert.match(
    precheckSource,
    /npm run testflight:build-local/,
    'Precheck should point future release work to the synced local TestFlight build command'
  );
});
