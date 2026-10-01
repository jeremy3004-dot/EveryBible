import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function linkedPackages(platform: 'android' | 'ios'): Promise<string[]> {
  const { queryAutolinkingModulesFromProjectAsync } =
    await import('expo-modules-autolinking/exports');
  const modules = await queryAutolinkingModulesFromProjectAsync(REPO_ROOT, { platform });
  return modules.map((module) => module.packageName);
}

// The app ships no update URL, so expo-updates only ever runs disabled. On Android its
// module definition still sat on the cold-start critical path: 428 ms of a 1.7 s launch on
// a Xiaomi (API 36) in an atrace of 2026-10-01, and gone with no cost moved elsewhere when
// left out. JS reads it only through requireOptionalNativeModule (expo-asset,
// expo-constants), which treat a missing module the same as a disabled one.
test('Android builds leave out expo-updates', async () => {
  const android = await linkedPackages('android');

  assert.ok(android.includes('expo-asset'), 'the resolver should see the app modules');
  assert.equal(android.includes('expo-updates'), false);
});

test('iOS builds keep expo-updates until iOS startup is measured without it', async () => {
  assert.ok((await linkedPackages('ios')).includes('expo-updates'));
});
