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
  assert.match(
    appSource,
    /ANDROID_BACKGROUND_STARTUP_DELAY_MS/,
    'App.tsx should delay Android background warmups so they do not compete with the first interactions'
  );
  assert.match(
    appSource,
    /useState\(Platform\.OS === 'android'\)/,
    'App.tsx should allow Android to paint a usable first screen while startup continues'
  );
  assert.match(
    appSource,
    /const shouldWaitForFonts =[\s\S]*Platform\.OS !== 'android'[\s\S]*!fontsLoaded[\s\S]*!fontError[\s\S]*!fontLoadTimedOut;/,
    'App.tsx should not block Android first paint on custom font loading'
  );
  assert.match(
    appSource,
    /if \(!isReady \|\| shouldWaitForFonts\) \{[\s\S]*<View style=\{\[styles\.bootShell/,
    'App.tsx should still render a stable boot shell when non-Android startup is waiting'
  );
  assert.match(
    appSource,
    /const FONT_LOAD_TIMEOUT_MS = \d+;[\s\S]*setFontLoadTimedOut\(true\);/,
    'App.tsx should proceed with system fonts if custom fonts do not report ready'
  );
  assert.match(
    appSource,
    /const STARTUP_READY_TIMEOUT_MS = \d+;[\s\S]*Startup readiness timed out; continuing launch with safe defaults\.[\s\S]*setIsReady\(true\);/,
    'App.tsx should not leave Android stuck on the boot shell if critical startup does not resolve'
  );
});

test('App render path does not call impure timing helpers', () => {
  const appSource = readRelativeSource('../../../App.tsx');
  const appStart = appSource.indexOf('export default function App()');
  const appContentStart = appSource.indexOf('function AppContent()', appStart);
  const appRenderSource = appSource.slice(appStart, appContentStart);

  assert.equal(
    /Date\.now\(/.test(appRenderSource),
    false,
    'App component render body should stay pure; keep timing logs in effects or module scope'
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
