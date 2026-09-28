import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('pinned Expo Sound unload clears subscriptions on native failure in source and runtime', () => {
  const packageInfo = JSON.parse(readFileSync('node_modules/expo-av/package.json', 'utf8'));
  assert.equal(packageInfo.version, '16.0.8');
  for (const path of ['src/Audio/Sound.ts', 'build/Audio/Sound.js']) {
    const source = readFileSync(`node_modules/expo-av/${path}`, 'utf8');
    const unload = source.slice(
      source.indexOf('async unloadAsync('),
      source.indexOf('// Set status API')
    );
    assert.match(unload, /try\s*\{[\s\S]*await ExponentAV\.unloadForSound\(key\)/);
    assert.match(unload, /finally\s*\{\s*this\._clearSubscriptions\(\);/);
    assert.ok(unload.indexOf('this._loaded = false') < unload.indexOf('await ExponentAV'));
  }
  const patch = readFileSync('patches/expo-av+16.0.8.patch', 'utf8');
  assert.match(patch, /a\/node_modules\/expo-av\/src\/Audio\/Sound\.ts/);
  assert.match(patch, /a\/node_modules\/expo-av\/build\/Audio\/Sound\.js/);
  assert.equal((patch.match(/^\+\s*(?:} )?finally \{/gm) ?? []).length, 2);
});
