import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('App boot path avoids heavy barrel imports and defers the root navigator', () => {
  const appSource = readRelativeSource('../../../App.tsx');

  const bannedBootImports = [
    "from './src/navigation';",
    "from './src/components';",
    "from './src/stores';",
    "from './src/hooks';",
    "from './src/navigation/RootNavigator';",
    "from './src/services/bible/bibleService';",
    "from './src/services/translations';",
    "from './src/stores/bibleStore';",
    "from './src/services/analytics';",
    "from './src/services/notifications';",
    "from './src/hooks/useSync';",
    "from './src/hooks/usePrivacyLock';",
  ];

  bannedBootImports.forEach((statement) => {
    assert.equal(
      appSource.includes(statement),
      false,
      `App.tsx should not eagerly import ${statement} on the startup path`
    );
  });

  assert.match(
    appSource,
    /require\('\.\/src\/navigation\/RootNavigator'\)/,
    'App.tsx should defer the navigator module until after boot'
  );
  assert.match(
    appSource,
    /preloadRuntimeTranslations:\s*async\s*\(\)\s*=>\s*\{[\s\S]*await bootstrapRuntimeTranslationsAndPreferences\(\);[\s\S]*await useBibleStore\.getState\(\)\.reconcileTranslationPacks\(\);[\s\S]*\}/,
    'App.tsx should repair stale runtime translation packs in deferred warmup rather than blocking first render'
  );
  assert.match(
    appSource,
    /migrateStorage:\s*async\s*\(\)\s*=>\s*\{[\s\S]*await migrateFromAsyncStorage\(\);[\s\S]*\}/,
    'App.tsx should keep the critical storage migration small during boot'
  );
  assert.match(
    appSource,
    /import\('\.\/src\/services\/startup\/AppRuntimeEffects'\)/,
    'App.tsx should defer sync and privacy app-state hooks so NetInfo/cloud sync modules stay off the first render path'
  );
});

test('deferred runtime effects own sync and privacy hooks after boot', () => {
  const source = readRelativeSource('./AppRuntimeEffects.tsx');

  assert.match(source, /import \{ useSync \} from '\.\.\/\.\.\/hooks\/useSync';/);
  assert.match(source, /import \{ usePrivacyLock \} from '\.\.\/\.\.\/hooks\/usePrivacyLock';/);
  assert.match(source, /useSync\(\);[\s\S]*usePrivacyLock\(\);/);
});

test('Root navigator does not mount the retired global mini-player host', () => {
  const rootNavigatorSource = readRelativeSource('../../navigation/RootNavigator.tsx');

  assert.equal(
    rootNavigatorSource.includes("import { MiniPlayer } from '../components';"),
    false,
    'RootNavigator should not eagerly import MiniPlayer during boot'
  );

  assert.equal(
    rootNavigatorSource.includes("require('../components/audio/MiniPlayer')"),
    false,
    'RootNavigator should not mount the retired global mini-player anywhere in the app shell'
  );

  assert.equal(
    rootNavigatorSource.includes('MiniPlayerHost'),
    false,
    'RootNavigator should not keep the old mini-player host helper around after the floating bar removal'
  );
});

test('navigation stacks lazy-load screens instead of importing them at module load', () => {
  const stackFiles = [
    '../../navigation/HomeStack.tsx',
    '../../navigation/BibleStack.tsx',
    '../../navigation/LearnStack.tsx',
    '../../navigation/MoreStack.tsx',
    '../../navigation/AuthStack.tsx',
  ];

  stackFiles.forEach((relativePath) => {
    const source = readRelativeSource(relativePath);

    assert.doesNotMatch(
      source,
      /from '\.\.\/screens\//,
      `${relativePath} should not eagerly import screen modules`
    );

    assert.match(
      source,
      /getComponent=\{\(\) => require\('/,
      `${relativePath} should lazy-load screens with getComponent`
    );
  });
});
