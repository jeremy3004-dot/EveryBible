import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

function resolveModuleFile(fromFile: string, importPath: string): string | null {
  const candidateBase = resolve(dirname(fromFile), importPath);
  const candidates = [
    candidateBase,
    `${candidateBase}.ts`,
    `${candidateBase}.tsx`,
    join(candidateBase, 'index.ts'),
    join(candidateBase, 'index.tsx'),
  ];
  return candidates.find((candidate) => existsSync(candidate) && !candidate.endsWith('/')) ?? null;
}

// Walks the transitive graph of static (top-level) relative imports reachable from
// entryFile, ignoring type-only imports (which are erased at compile time and carry
// no runtime/boot cost). Used to assert that heavy runtime modules never re-enter the
// App.tsx boot surface indirectly through a screen that is imported eagerly.
function collectStaticImportClosure(entryFile: string): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [entryFile];
  const importRegex = /^import\s+(type\s+)?[\s\S]*?\s+from\s+'(\.[^']+)';?\s*$/gm;

  while (queue.length > 0) {
    const currentFile = queue.shift();
    if (!currentFile || visited.has(currentFile)) {
      continue;
    }
    visited.add(currentFile);

    let source: string;
    try {
      source = readFileSync(currentFile, 'utf8');
    } catch {
      continue;
    }

    for (const match of source.matchAll(importRegex)) {
      const isTypeOnly = Boolean(match[1]);
      if (isTypeOnly) {
        continue;
      }
      const resolved = resolveModuleFile(currentFile, match[2]);
      if (resolved && !visited.has(resolved)) {
        queue.push(resolved);
      }
    }
  }

  return visited;
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

test('App.tsx installs global error handlers at module scope before render', () => {
  const appSource = readRelativeSource('../../../App.tsx');

  assert.match(
    appSource,
    /import \{ installGlobalErrorHandlers \} from '\.\/src\/services\/diagnostics\/globalErrorHandler';/,
    'App.tsx should statically import installGlobalErrorHandlers so it is available before any component renders'
  );

  const setupNotificationCallIndex = appSource.indexOf('setupNotificationHandler();');
  const installHandlersCallIndex = appSource.indexOf('installGlobalErrorHandlers();');
  const firstComponentIndex = appSource.indexOf('function LoadingScreen()');

  assert.ok(
    setupNotificationCallIndex !== -1 && installHandlersCallIndex !== -1,
    'both setup calls should be present at module scope'
  );
  assert.ok(
    installHandlersCallIndex > setupNotificationCallIndex && installHandlersCallIndex < firstComponentIndex,
    'installGlobalErrorHandlers() should run at module scope, before any component is defined, so early boot crashes are captured'
  );
});

test('App.tsx enforces the LTR layout stopgap at module scope before render', () => {
  const appSource = readRelativeSource('../../../App.tsx');

  assert.match(
    appSource,
    /import \{ enforceLtrLayoutPolicy \} from '\.\/src\/services\/startup\/rtlPolicy';/,
    'App.tsx should statically import enforceLtrLayoutPolicy so it applies before any component renders'
  );

  const installHandlersCallIndex = appSource.indexOf('installGlobalErrorHandlers();');
  const enforceLtrCallIndex = appSource.indexOf('enforceLtrLayoutPolicy();');
  const firstComponentIndex = appSource.indexOf('function LoadingScreen()');

  assert.ok(
    installHandlersCallIndex !== -1 && enforceLtrCallIndex !== -1,
    'both setup calls should be present at module scope'
  );
  assert.ok(
    enforceLtrCallIndex > installHandlersCallIndex && enforceLtrCallIndex < firstComponentIndex,
    'enforceLtrLayoutPolicy() should run at module scope, before any component is defined, since native RTL layout is applied at launch'
  );
});

test('App.tsx static import closure never reaches heavy runtime modules', () => {
  const appPath = fileURLToPath(new URL('../../../App.tsx', import.meta.url).href);
  const closure = collectStaticImportClosure(appPath);

  // These are the modules the eager RootNavigator require() and the eager
  // LocaleSetupFlow require() both exist specifically to keep off the static
  // boot path (bibleStore hydration, Supabase client, sync, translations
  // bootstrap). If any file in App.tsx's *static* (non-deferred) import
  // closure resolves to one of these, something started statically importing
  // a screen/module that pulls them in again.
  const bannedModules = [
    'src/stores/bibleStore.ts',
    'src/services/supabase/index.ts',
    'src/services/supabase/client.ts',
    'src/services/sync/index.ts',
    'src/services/sync/syncService.ts',
    'src/services/translations/index.ts',
    'src/services/translations/runtimeTranslationBootstrap.ts',
    'src/screens/onboarding/LocaleSetupFlow.tsx',
  ];

  const closurePaths = [...closure];
  bannedModules.forEach((suffix) => {
    const hit = closurePaths.find((file) => file.replace(/\\/g, '/').endsWith(suffix));
    assert.equal(
      hit,
      undefined,
      `App.tsx's static import closure should not reach ${suffix} (found via ${hit}); it must stay behind a deferred require()/import()`
    );
  });

  // Sanity check the walker itself is actually traversing multiple files, not
  // silently no-op'ing because resolution failed.
  assert.ok(
    closure.size > 5,
    'static import closure walker should resolve more than App.tsx itself — check resolveModuleFile if this fails'
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
    '../../navigation/PlansStack.tsx',
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
