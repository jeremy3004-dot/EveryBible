import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const readRootFile = (relativePathFromRepoRoot: string): string =>
  readFileSync(path.join(REPO_ROOT, relativePathFromRepoRoot), 'utf8');

test('ios AppDelegate only uses Metro for DEBUG and falls back to embedded main.jsbundle for release', () => {
  const appDelegate = readRootFile('ios/EveryBible/AppDelegate.swift');

  assert.match(
    appDelegate,
    /#if DEBUG[\s\S]*RCTBundleURLProvider\.sharedSettings\(\)\.jsBundleURL\(forBundleRoot: "\.expo\/\.virtual-metro-entry"\)/,
    'Expected DEBUG builds to resolve JavaScript from Metro via the Expo virtual entry'
  );
  assert.match(
    appDelegate,
    /#else[\s\S]*Bundle\.main\.url\(forResource: "main", withExtension: "jsbundle"\)/,
    'Expected non-DEBUG builds to boot from the embedded main.jsbundle instead of Metro'
  );
});
