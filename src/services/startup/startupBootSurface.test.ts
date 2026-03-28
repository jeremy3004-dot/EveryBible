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
    /migrateStorage:\s*async\s*\(\)\s*=>\s*\{[\s\S]*await migrateFromAsyncStorage\(\);[\s\S]*await reconcileTranslationPacks\(\);[\s\S]*\}/,
    'App.tsx should repair stale runtime translation packs before the boot flow renders the navigator'
  );
});

test('Root navigator keeps the mini-player off the startup import path', () => {
  const rootNavigatorSource = readRelativeSource('../../navigation/RootNavigator.tsx');

  assert.equal(
    rootNavigatorSource.includes("import { MiniPlayer } from '../components';"),
    false,
    'RootNavigator should not eagerly import MiniPlayer during boot'
  );

  assert.match(
    rootNavigatorSource,
    /require\('\.\.\/components\/audio\/MiniPlayer'\)/,
    'RootNavigator should defer MiniPlayer until it is actually needed'
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
