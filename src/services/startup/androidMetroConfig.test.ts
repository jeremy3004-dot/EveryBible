import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test, { mock } from 'node:test';
import { mockModule } from '../../testing/mockModules';

// The real metro.config.js, loaded through require with only Expo's default config replaced.
type TransformOptions = {
  transform: { inlineRequires: boolean; experimentalImportSupport: boolean };
  preloadedModules: object;
};
type MetroConfig = {
  resolver: { assetExts: string[] };
  transformer: { getTransformOptions: (...args: unknown[]) => Promise<TransformOptions> };
};

const preloadedModules = { bootstrap: true };
const expoCalls: unknown[][] = [];
const projectRoots: string[] = [];
mockModule(mock, 'expo/metro-config', {
  getDefaultConfig: (projectRoot: string) => {
    projectRoots.push(projectRoot);
    return {
      resolver: { assetExts: ['png'] },
      transformer: {
        getTransformOptions: async (...args: unknown[]) => {
          expoCalls.push(args);
          return {
            transform: { inlineRequires: false, experimentalImportSupport: true },
            preloadedModules,
          };
        },
      },
    };
  },
});

const localRequire = createRequire(import.meta.url);
const metroConfigPath = localRequire.resolve('../../../metro.config.js');
const config = localRequire(metroConfigPath) as MetroConfig;

test('Android release defers module evaluation while retaining Expo transform options', async () => {
  const entries = ['index.ts'];
  const getDependencies = async () => [];
  for (const options of [
    { platform: 'android', dev: false },
    { platform: 'android', dev: true },
    { platform: 'ios', dev: false },
  ]) {
    const result = await config.transformer.getTransformOptions(entries, options, getDependencies);
    assert.equal(result.transform.inlineRequires, options.platform === 'android' && !options.dev);
    assert.equal(result.transform.experimentalImportSupport, true);
    assert.equal(result.preloadedModules, preloadedModules);
    assert.deepEqual(expoCalls.at(-1), [entries, options, getDependencies]);
  }
});

test('the config is built for the project root and serves WebP book icons', () => {
  assert.deepEqual(projectRoots, [path.dirname(metroConfigPath)]);
  assert.deepEqual(config.resolver.assetExts, ['png', 'webp']);
});
