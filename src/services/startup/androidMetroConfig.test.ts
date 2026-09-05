import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

test('Android release defers module evaluation while retaining Expo transform options', async () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const module = {
    exports: {} as {
      transformer: {
        getTransformOptions: (...args: unknown[]) => Promise<{
          transform: { inlineRequires: boolean; experimentalImportSupport: boolean };
          preloadedModules: object;
        }>;
      };
    },
  };
  const preloadedModules = { bootstrap: true };
  const calls: unknown[][] = [];
  runInNewContext(readFileSync(path.join(root, 'metro.config.js'), 'utf8'), {
    module,
    __dirname: root,
    require: (name: string) => {
      if (name === 'path') return path;
      if (name === 'fs') return { existsSync: () => false };
      assert.equal(name, 'expo/metro-config');
      return {
        getDefaultConfig: () => ({
          resolver: { assetExts: ['png'] },
          transformer: {
            getTransformOptions: async (...args: unknown[]) => {
              calls.push(args);
              return {
                transform: { inlineRequires: false, experimentalImportSupport: true },
                preloadedModules,
              };
            },
          },
        }),
      };
    },
  });
  const entries = ['index.ts'];
  const getDependencies = async () => [];
  for (const options of [
    { platform: 'android', dev: false },
    { platform: 'android', dev: true },
    { platform: 'ios', dev: false },
  ]) {
    const result = await module.exports.transformer.getTransformOptions(
      entries,
      options,
      getDependencies
    );
    assert.equal(result.transform.inlineRequires, options.platform === 'android' && !options.dev);
    assert.equal(result.transform.experimentalImportSupport, true);
    assert.equal(result.preloadedModules, preloadedModules);
    assert.deepEqual(calls.at(-1), [entries, options, getDependencies]);
  }
});
