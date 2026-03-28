import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

interface BabelConfigApi {
  cache: (enabled: boolean) => void;
}

interface BabelConfigResult {
  presets?: unknown[];
  plugins?: unknown[];
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BABEL_CONFIG_PATH = path.join(REPO_ROOT, 'babel.config.js');
const requireFromRepo = createRequire(import.meta.url);

const loadBabelConfig = (): BabelConfigResult => {
  const babelConfigModule = requireFromRepo(BABEL_CONFIG_PATH);
  const exportedConfig =
    typeof babelConfigModule === 'function'
      ? babelConfigModule({ cache: () => {} } satisfies BabelConfigApi)
      : babelConfigModule;

  return exportedConfig as BabelConfigResult;
};

test('babel config exists and registers the Reanimated plugin last', () => {
  assert.ok(existsSync(BABEL_CONFIG_PATH), 'Expected babel.config.js at the repo root');

  const config = loadBabelConfig();
  const presets = config.presets ?? [];
  const plugins = config.plugins ?? [];
  const firstPreset = presets.at(0);

  assert.ok(
    typeof firstPreset === 'string' && firstPreset.length > 0,
    'babel.config.js should include an Expo Babel preset entry'
  );
  assert.doesNotThrow(
    () => requireFromRepo.resolve(firstPreset as string),
    'babel.config.js should reference a resolvable Expo Babel preset'
  );
  assert.ok(plugins.length > 0, 'babel.config.js should include plugins');
  assert.equal(
    plugins.at(-1),
    'react-native-reanimated/plugin',
    'react-native-reanimated/plugin must be the last Babel plugin'
  );
});
