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

interface EasConfig {
  build?: {
    production?: {
      env?: {
        GRADLE_OPTS?: string;
      };
    };
  };
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const readRootJson = <T>(relativePathFromRepoRoot: string): T =>
  JSON.parse(readFileSync(path.join(REPO_ROOT, relativePathFromRepoRoot), 'utf8')) as T;

test('android app config does not require an unprovisioned Firebase credential file', () => {
  const appConfig = readRootJson<AppConfig>('app.json');

  assert.equal(
    appConfig.expo.android?.googleServicesFile,
    undefined,
    'Do not require google-services.json until Firebase/FCM is provisioned. Local Android ' +
      'notification channels and scheduled reminders work without Firebase, while the current ' +
      'push-token registration path already treats missing native push credentials as non-fatal.'
  );
});

test('android production builds give the Gradle daemon enough heap for R8', () => {
  const easConfig = readRootJson<EasConfig>('eas.json');

  assert.equal(
    easConfig.build?.production?.env?.GRADLE_OPTS,
    '-Dorg.gradle.jvmargs=-Xmx4g',
    'The production bundle enables R8/resource shrinking and needs more than the generated ' +
      '2 GiB Gradle heap on clean CI runners.'
  );
});
