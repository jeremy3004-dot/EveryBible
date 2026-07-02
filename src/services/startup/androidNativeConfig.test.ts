import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface AppConfig {
  expo: {
    android?: {
      googleServicesFile?: string;
    };
  };
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const readRootJson = <T>(relativePathFromRepoRoot: string): T =>
  JSON.parse(readFileSync(path.join(REPO_ROOT, relativePathFromRepoRoot), 'utf8')) as T;

test('android app config declares the FCM google-services credential file', () => {
  const appConfig = readRootJson<AppConfig>('app.json');

  assert.equal(
    appConfig.expo.android?.googleServicesFile,
    './google-services.json',
    'Expected app.json android block to declare googleServicesFile so getExpoPushTokenAsync ' +
      'can resolve FCM credentials on Android; without it, push registration silently fails. ' +
      'The referenced file itself is a real Firebase Console artifact and must be provided ' +
      'out-of-band (not committed) before any Android build.'
  );
});
