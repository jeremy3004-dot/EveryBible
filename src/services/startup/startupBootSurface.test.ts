// Import-graph guard by design: reads source text to protect the cold-start
// import closure, which runtime tests cannot observe.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrivacyInstallationBootstrap } from '../privacy/privacyInstallationAdapter';

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
  // `candidateBase` is a directory whenever the import points at a package
  // folder (`'../services/supabase'`). Returning it made readFileSync throw and
  // the walk silently `continue` past every barrel, so the closure guards below
  // were toothless. Only ever resolve to a real file.
  return (
    candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null
  );
}

// Walks the transitive graph of static (top-level) imports reachable from
// entryFile, ignoring type-only imports (which are erased at compile time and carry
// no runtime/boot cost). Relative imports are followed; bare package specifiers are
// recorded with the files that import them but not followed. Used to assert that
// heavy runtime modules never re-enter the App.tsx boot surface indirectly through
// a screen that is imported eagerly.
function collectStaticImports(entryFile: string): {
  files: Set<string>;
  packages: Map<string, string[]>;
} {
  const visited = new Set<string>();
  const packages = new Map<string, string[]>();
  const queue: string[] = [entryFile];
  // Barrels re-export with `export … from`, which the old import-only pattern
  // ignored — the single most common way a heavy module re-enters the boot
  // surface. Match both forms, and both quote styles.
  const importRegex = /^\s*(?:import|export)\s+(type\s+)?(?:[\s\S]*?\bfrom\s+)?['"]([^'"]+)['"]/gm;

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
      const specifier = match[2];
      if (!specifier.startsWith('.')) {
        packages.set(specifier, [...(packages.get(specifier) ?? []), currentFile]);
        continue;
      }
      const resolved = resolveModuleFile(currentFile, specifier);
      if (resolved && !visited.has(resolved)) {
        queue.push(resolved);
      }
    }
  }

  return { files: visited, packages };
}

function collectStaticImportClosure(entryFile: string): Set<string> {
  return collectStaticImports(entryFile).files;
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
    // No screen uses react-query yet; a root provider evaluated query-core first.
    "from '@tanstack/react-query';",
    "from './src/services/queryClient';",
    // The package root drags push-token auto-registration and Node polyfills in;
    // notificationBootstrap deep-imports the three pieces App.tsx needs.
    "from 'expo-notifications';",
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
    /void import\('\.\/src\/navigation\/RootNavigator'\)/,
    'App.tsx should defer the navigator module until after boot — asynchronously, so its ~670KB import closure never evaluates inside a render commit'
  );
  assert.match(
    appSource,
    /preloadRuntimeTranslations:\s*async\s*\(\)\s*=>\s*\{[\s\S]*await bootstrapRuntimeTranslationsAndPreferences\(\);[\s\S]*await useBibleStore\.getState\(\)\.reconcileTranslationPacks\(\);[\s\S]*\}/,
    'App.tsx should repair stale runtime translation packs in deferred warmup rather than blocking first render'
  );
  assert.equal(
    appSource.includes("require('./src/navigation/RootNavigator')"),
    false,
    'App.tsx should not synchronously require the navigator from a render body'
  );
  assert.match(
    appSource,
    /import\('\.\/src\/services\/startup\/AppRuntimeEffects'\)/,
    'App.tsx should defer the sync and deep-link hooks so NetInfo/cloud sync modules stay off the first render path'
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
    /if \(\s*!isReady\s*\|\|\s*!isPrivacyInitialized\s*\|\|\s*shouldWaitForFonts\s*\)\s*\{[\s\S]*<View style=\{\[styles\.bootShell/,
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

test('privacy installation bootstrap migrates before reconciliation', async () => {
  const calls: string[] = [];
  const bootstrap = createPrivacyInstallationBootstrap({
    migrateStorage: async () => {
      calls.push('migration');
    },
    reconcileInstallation: async () => {
      calls.push('reconciliation');
    },
  });

  await bootstrap();

  assert.deepEqual(calls, ['migration', 'reconciliation']);
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
    installHandlersCallIndex > setupNotificationCallIndex &&
      installHandlersCallIndex < firstComponentIndex,
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
    // @supabase/supabase-js is ~520KB of JS. Anything that reaches the client
    // module pays for it at module-eval on every cold start.
    'src/services/supabase/client.ts',
    'src/services/sync/index.ts',
    'src/services/sync/syncService.ts',
    'src/services/translations/index.ts',
    'src/services/translations/runtimeTranslationBootstrap.ts',
    'src/screens/onboarding/LocaleSetupFlow.tsx',
    // authService drags google-signin + expo-apple-authentication in with it.
    'src/services/auth/index.ts',
    'src/services/auth/authService.ts',
    // Analytics owns a durable queue, geo lookups and NetInfo; it is loaded
    // through dynamic import() from AppContent, never statically.
    'src/services/analytics/index.ts',
    'src/services/analytics/analyticsService.ts',
    'src/services/analytics/anonymousUsageAnalytics.ts',
    // Push registration and download recovery run from hooks App imports statically, so
    // the notification service and the Bible store must stay behind their import()s.
    'src/services/notifications/index.ts',
    'src/services/notifications/notificationService.ts',
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

test('RootNavigator static import closure leaves the translations service for later', () => {
  const navigatorPath = fileURLToPath(
    new URL('../../navigation/RootNavigator.tsx', import.meta.url).href
  );
  const closurePaths = [...collectStaticImportClosure(navigatorPath)].map((file) =>
    file.replace(/\\/g, '/')
  );

  // The navigator is evaluated before Home can paint. The translations barrel
  // brings the runtime catalog bootstrap and the Fuse-backed locale search
  // engine with it; the deferred startup warmup loads them after interactions.
  ['src/services/translations/index.ts', 'src/services/onboarding/localeSelection.ts'].forEach(
    (suffix) => {
      const hit = closurePaths.find((file) => file.endsWith(suffix));
      assert.equal(
        hit,
        undefined,
        `RootNavigator's static import closure should not reach ${suffix} (found ${hit}); load it with a deferred require()/import()`
      );
    }
  );
  assert.ok(
    closurePaths.some((file) => file.endsWith('src/stores/bibleStore.ts')),
    'the navigator closure should still include bibleStore — check the walker if this fails'
  );
});

// The `src/hooks`, `src/constants` and `src/stores` barrels each re-export a
// large family of modules — `src/constants` alone pulls the ~298KB
// bookIconVectors table in through `bookIcons`, and `src/stores` hydrates all
// nine stores on first import. Pulling one symbol through a barrel therefore
// costs the whole family at module-eval, and metro.config.js only enables
// inlineRequires for Android release, so iOS release and every dev build pay
// it in full. Modules that sit on the app-shell render path must import the
// concrete file instead.
const BARREL_IMPORT_PATTERN =
  /^\s*import\s+(?!type\b)[\s\S]*?\bfrom\s+['"](\.[./]*\/(?:hooks|constants|stores))['"]/gm;

// bibleStore's `from '../constants'` import is tracked separately and owned by
// the offline-downloads work; exempt just that file so this guard stays useful
// without colliding with it.
const BARREL_GUARD_EXEMPTIONS = ['src/stores/bibleStore.ts'];

test('app-shell modules import concrete files instead of the hooks/constants/stores barrels', () => {
  const repoRoot = fileURLToPath(new URL('../../../', import.meta.url).href);
  const navigatorPath = fileURLToPath(
    new URL('../../navigation/RootNavigator.tsx', import.meta.url).href
  );
  // Only files the navigator actually reaches statically matter — a barrel
  // import inside a module nothing boots costs nothing.
  const closure = [...collectStaticImportClosure(navigatorPath)].map((file) =>
    file.replace(repoRoot, '').replace(/\\/g, '/')
  );

  const guardedDirectories = ['src/navigation/', 'src/stores/', 'src/components/audio/'];
  const guardedFiles = closure.filter(
    (file) =>
      guardedDirectories.some((directory) => file.startsWith(directory)) &&
      !BARREL_GUARD_EXEMPTIONS.includes(file)
  );

  assert.ok(
    guardedFiles.length > 3,
    'the navigator closure should contain several navigation/store/audio modules — check the walker if this fails'
  );

  guardedFiles.forEach((file) => {
    const source = readFileSync(join(repoRoot, file), 'utf8');
    const offenders = [...source.matchAll(BARREL_IMPORT_PATTERN)].map((match) => match[1]);
    assert.deepEqual(
      offenders,
      [],
      `${file} is on the app-shell render path and must import concrete modules, not the ${offenders.join(', ')} barrel`
    );
  });
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

test('deferred runtime effects own sync after boot, and the privacy lock is not deferred with them', () => {
  const source = readRelativeSource('./AppRuntimeEffects.tsx');
  const appSource = readRelativeSource('../../../App.tsx');

  assert.match(source, /import \{ useSync \} from '\.\.\/\.\.\/hooks\/useSync';/);
  assert.doesNotMatch(source, /usePrivacyLock/);
  assert.match(
    appSource,
    /import \{ lockAfterPrivacyLockFailure, usePrivacyLock \} from '\.\/src\/hooks\/usePrivacyLock';/,
    'the privacy lock loads with the app shell: its closure (privacyStore, AppState) is already there'
  );
});

test('src/stores/index.ts is not a store barrel', () => {
  const source = readRelativeSource('../../stores/index.ts');

  // `export *` from nine store modules meant one import hydrated all nine.
  assert.doesNotMatch(
    source,
    /export \* from '\.\/(?!mmkvStorage)/,
    'src/stores/index.ts must not re-export whole store modules — consumers import the concrete store file'
  );
  assert.match(
    source,
    /export \{ zustandStorage, mmkvInstance, getPersistedLanguagePreference \} from '\.\/mmkvStorage';/,
    'only the shared MMKV plumbing (which owns no store) may be re-exported here'
  );
});

test('Root navigator mounts AudioReturnTab directly instead of a barrel-imported player host', () => {
  const rootNavigatorSource = readRelativeSource('../../navigation/RootNavigator.tsx');

  assert.match(
    rootNavigatorSource,
    /import \{ AudioReturnTab \} from '\.\.\/components\/audio\/AudioReturnTab';/,
    'RootNavigator should import AudioReturnTab from its concrete module, not the components barrel'
  );

  assert.match(
    rootNavigatorSource,
    /<AudioReturnTab currentRouteName=\{currentRouteName\} \/>/,
    'RootNavigator should render the audio return tab as the app-shell playback affordance'
  );

  assert.equal(
    rootNavigatorSource.includes("from '../components';"),
    false,
    'RootNavigator should not pull the whole components barrel into the boot path'
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

// Everything in these three closures evaluates before Home can paint: App.tsx at
// launch, RootNavigator once privacy and auth are ready, HomeScreen through its
// getComponent require. See round 2 of docs/research/app-performance-pass-2026-09-24.md.
const PATH_TO_HOME = [
  '../../../App.tsx',
  '../../navigation/RootNavigator.tsx',
  '../../screens/home/HomeScreen.tsx',
];

test('nothing evaluated before Home loads react-query, the expo-notifications root or SQLite', () => {
  const bannedPackages = [
    // No screen uses react-query; getQueryClient() creates the client on first use.
    '@tanstack/react-query',
    // notificationBootstrap deep-imports the handler and the two listeners.
    'expo-notifications',
    // bibleStore registers its resolvers through bibleDatabaseSources and
    // requires bibleDatabase only when a text pack is installed or removed.
    'expo-sqlite',
  ];
  const bannedFiles = ['src/services/queryClient.ts', 'src/services/bible/bibleDatabase.ts'];

  PATH_TO_HOME.forEach((entry) => {
    const { files, packages } = collectStaticImports(
      fileURLToPath(new URL(entry, import.meta.url).href)
    );
    bannedPackages.forEach((specifier) => {
      assert.deepEqual(
        packages.get(specifier) ?? [],
        [],
        `${entry}'s static closure must not import '${specifier}'`
      );
    });
    const closurePaths = [...files].map((file) => file.replace(/\\/g, '/'));
    bannedFiles.forEach((suffix) => {
      const hit = closurePaths.find((file) => file.endsWith(suffix));
      assert.equal(hit, undefined, `${entry}'s static closure must not reach ${suffix}`);
    });
  });

  // Sanity-check that the walker records bare specifiers and follows the store.
  const app = collectStaticImports(fileURLToPath(new URL(PATH_TO_HOME[0], import.meta.url).href));
  assert.ok(
    app.packages.has('expo-notifications/build/NotificationsHandler'),
    'the boot closure should still register the foreground handler — check the walker if this fails'
  );
  const home = collectStaticImportClosure(
    fileURLToPath(new URL(PATH_TO_HOME[2], import.meta.url).href)
  );
  assert.ok(
    [...home].some((file) => file.endsWith('src/services/bible/bibleDatabaseSources.ts')),
    'bibleStore should still register its database resolvers at import — check the walker if this fails'
  );
});

test('restoring the session at launch does not load the native sign-in SDKs', () => {
  const { files, packages } = collectStaticImports(
    fileURLToPath(new URL('../auth/authSession.ts', import.meta.url).href)
  );

  ['@react-native-google-signin/google-signin', 'expo-apple-authentication'].forEach(
    (specifier) => {
      assert.equal(
        packages.has(specifier),
        false,
        `authSession runs during critical startup and must not import '${specifier}'`
      );
    }
  );
  assert.equal(
    [...files].some((file) => file.endsWith('src/services/auth/authService.ts')),
    false,
    'authSession must not reach authService, which owns the sign-in flows'
  );
  assert.ok(files.size > 1, 'authSession should reach the Supabase client — check the walker');
});
