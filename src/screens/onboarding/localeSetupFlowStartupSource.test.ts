// Startup import-graph guards for first-run onboarding. These stay source checks
// because rendering cannot observe them: they are about which modules load, and
// when, on the cold-start path (App.tsx boot, and what LocaleSetupFlow's own
// module evaluation pulls in). Everything the flow renders and does is covered by
// LocaleSetupFlow.render.test.tsx and LocaleSetupFlow.android.render.test.tsx.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

const appSource = readRelativeSource('../../../App.tsx');
const flowSource = readRelativeSource('./LocaleSetupFlow.tsx');

test('App.tsx gates first run behind onboarding before rendering the main shell', () => {
  assert.match(appSource, /if \(!onboardingCompleted\) \{[\s\S]*?<OnboardingHost \/>[\s\S]*?\}/);
});

test('App.tsx loads LocaleSetupFlow lazily instead of importing it onto the boot render path', () => {
  assert.match(
    appSource,
    /function OnboardingHost\(\) \{[\s\S]*?import\('\.\/src\/screens\/onboarding\/LocaleSetupFlow'\)[\s\S]*?return LocaleSetupFlow \? <LocaleSetupFlow mode="initial" onComplete=\{\(\) => undefined\} \/> : null;/,
    'OnboardingHost should dynamic-import the flow and render it in initial mode'
  );
  assert.doesNotMatch(
    appSource,
    /^import[^;]*from '\.\/src\/screens\/onboarding(?:\/LocaleSetupFlow)?';/m,
    'App.tsx should not statically import LocaleSetupFlow'
  );
});

test('LocaleSetupFlow reaches preference sync (and so Supabase) only through a deferred import', () => {
  // services/sync evaluates the Supabase client; a static import would load it
  // with the onboarding screen at first mount.
  assert.match(
    flowSource,
    /const syncPreferencesAfterOnboarding = \(\): void => \{[\s\S]*?import\('\.\.\/\.\.\/services\/sync'\)[\s\S]*?\.then\(\(\{ syncPreferences \}\) => syncPreferences\(\)\)/
  );
  assert.doesNotMatch(flowSource, /^import[^;]*from '\.\.\/\.\.\/services\/sync';/m);
});

test('the modules LocaleSetupFlow is composed from keep the hooks barrel and sync off the first run', () => {
  // The flow's sections, rows and hooks live in ./localeSetup and are evaluated
  // with it, so the same two static imports would undo the deferral from there.
  const folder = fileURLToPath(new URL('./localeSetup/', import.meta.url).href);
  const modules = readdirSync(folder).filter(
    (name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)
  );
  assert.ok(modules.length > 5, 'the composed modules are found');
  for (const name of modules) {
    const source = readFileSync(join(folder, name), 'utf8');
    assert.doesNotMatch(
      source,
      /^import(?!\s+type)[^;]*from '\.\.\/\.\.\/\.\.\/hooks';/m,
      `${name} imports the hooks barrel`
    );
    assert.doesNotMatch(
      source,
      /^import(?!\s+type)[^;]*from '\.\.\/\.\.\/\.\.\/services\/sync(?:\/index)?';/m,
      `${name} imports services/sync statically`
    );
  }
});

test('LocaleSetupFlow imports its hooks from their own modules, not the hooks barrel', () => {
  // The hooks barrel re-exports useSync, which transitively evaluates the
  // Supabase client and would undo the deferred sync import above.
  assert.match(
    flowSource,
    /import \{ useKeyboardBottomInset \} from '\.\.\/\.\.\/hooks\/useKeyboardBottomInset';/
  );
  assert.doesNotMatch(flowSource, /from '\.\.\/\.\.\/hooks';/);
});
