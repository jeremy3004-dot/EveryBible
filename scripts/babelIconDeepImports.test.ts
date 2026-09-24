import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { PluginItem, TransformOptions } from '@babel/core';

const repoRoot = process.cwd();
const babel = require('@babel/core') as typeof import('@babel/core');
const iconDeepImports = require(
  path.join(repoRoot, 'plugins/babel-icon-deep-imports.js')
) as PluginItem & {
  readIconFiles: (source: string) => Map<string, string>;
  readVectorIconSets: (fileNames: string[]) => Set<string>;
};

const lucideRoot = path.join(repoRoot, 'node_modules/lucide-react-native/dist/esm');
const vectorIconsRoot = path.join(repoRoot, 'node_modules/@expo/vector-icons');
const iconFiles = iconDeepImports.readIconFiles(
  readFileSync(path.join(lucideRoot, 'lucide-react-native.mjs'), 'utf8')
);
const vectorIconSets = iconDeepImports.readVectorIconSets(readdirSync(vectorIconsRoot));

function transform(source: string): string {
  const options: TransformOptions = {
    babelrc: false,
    configFile: false,
    filename: path.join(repoRoot, 'src/fixture.tsx'),
    parserOpts: { plugins: ['typescript', 'jsx'] },
    plugins: [iconDeepImports],
  };
  return babel.transformSync(source, options)?.code ?? '';
}

function appSources(): string[] {
  const sources: string[] = [path.join(repoRoot, 'App.tsx')];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        // src/testing is node:test infrastructure, never bundled by Metro.
        if (entry.name !== 'testing') walk(entryPath);
      } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) {
        sources.push(entryPath);
      }
    }
  };
  walk(path.join(repoRoot, 'src'));
  return sources;
}

test('the Lucide map covers every root export and resolves aliases to the canonical file', () => {
  assert.ok(iconFiles.size > 3000, `expected thousands of icon names, got ${iconFiles.size}`);
  assert.equal(iconFiles.get('Check'), 'check');
  assert.equal(iconFiles.get('CheckCircle2'), 'circle-check');
  assert.equal(iconFiles.get('CircleCheck'), 'circle-check');
  assert.equal(iconFiles.get('Home'), 'house');
  assert.equal(iconFiles.get('House'), 'house');
  assert.equal(iconFiles.get('LucideProvider'), undefined);
});

test('the vector-icons map lists icon sets but not the createIconSet helpers', () => {
  assert.ok(vectorIconSets.has('Ionicons'));
  assert.ok(vectorIconSets.has('MaterialCommunityIcons'));
  assert.equal(vectorIconSets.has('createIconSet'), false);
  assert.equal(vectorIconSets.has('LICENSE'), false);
});

test('named icon imports become per-icon default imports, keeping local names', () => {
  const output = transform(
    [
      "import { Check, CheckCircle2 as Done } from 'lucide-react-native';",
      "import { Ionicons } from '@expo/vector-icons';",
      'export const icons = [Check, Done, Ionicons];',
    ].join('\n')
  );

  assert.match(output, /import Check from ["']lucide-react-native\/icons\/check["'];/);
  assert.match(output, /import Done from ["']lucide-react-native\/icons\/circle-check["'];/);
  assert.match(output, /import Ionicons from ["']@expo\/vector-icons\/Ionicons["'];/);
  assert.doesNotMatch(output, /from 'lucide-react-native';/);
  assert.doesNotMatch(output, /from '@expo\/vector-icons';/);
});

test('type imports and non-icon exports stay on the package root', () => {
  const output = transform(
    [
      "import type { LucideProps } from 'lucide-react-native';",
      "import { LucideProvider, Play, type LucideIcon } from 'lucide-react-native';",
      "import { createIconSet } from '@expo/vector-icons';",
      'export const value: [LucideIcon, LucideProps | null] = [Play, null];',
      'export const helpers = [LucideProvider, createIconSet];',
    ].join('\n')
  );

  assert.match(output, /import type \{ LucideProps \} from 'lucide-react-native';/);
  assert.match(output, /import \{ LucideProvider, type LucideIcon \} from 'lucide-react-native';/);
  assert.match(output, /import Play from ["']lucide-react-native\/icons\/play["'];/);
  assert.match(output, /import \{ createIconSet \} from '@expo\/vector-icons';/);
});

// Runs the app's real Babel config (Expo preset included) so the assertion is
// about what Metro ships: no module may still require an icon package root.
function transformLikeMetro(sourcePath: string, source: string): string {
  return (
    babel.transformSync(source, {
      filename: sourcePath,
      cwd: repoRoot,
      caller: { name: 'metro', bundler: 'metro', platform: 'ios', isDev: false } as never,
    })?.code ?? ''
  );
}

// Codebase-wide static lint (not a behaviour test): every icon import in App.tsx and src/
// resolves, through the real plugin, to a file the icon packages ship.
test('every icon the app imports is rewritten to a file the package ships', () => {
  const lucideFiles = new Set<string>();
  const vectorIconFiles = new Set<string>();
  for (const sourcePath of appSources()) {
    const source = readFileSync(sourcePath, 'utf8');
    if (!source.includes("'lucide-react-native'") && !source.includes("'@expo/vector-icons'")) {
      continue;
    }
    const output = transformLikeMetro(sourcePath, source);
    assert.doesNotMatch(
      output,
      /require\(["'](?:lucide-react-native|@expo\/vector-icons)["']\)/,
      `${path.relative(repoRoot, sourcePath)} still evaluates an icon package root`
    );
    for (const [, file] of output.matchAll(/["']lucide-react-native\/icons\/([a-z0-9-]+)["']/g)) {
      lucideFiles.add(file);
    }
    for (const [, file] of output.matchAll(/["']@expo\/vector-icons\/([A-Za-z0-9]+)["']/g)) {
      vectorIconFiles.add(file);
    }
  }

  assert.ok(lucideFiles.size > 20, `expected the app's Lucide icons, got ${lucideFiles.size}`);
  assert.ok(vectorIconFiles.size > 0, 'expected the app to use at least one vector-icons set');
  for (const file of lucideFiles) {
    assert.ok(existsSync(path.join(lucideRoot, 'icons', `${file}.mjs`)), `${file}.mjs is missing`);
  }
  for (const file of vectorIconFiles) {
    assert.ok(existsSync(path.join(vectorIconsRoot, `${file}.js`)), `${file}.js is missing`);
  }
});

test('the app Babel config applies the rewrite before Reanimated', () => {
  const babelConfig = require(path.join(repoRoot, 'babel.config.js')) as (api: {
    cache: (value: boolean) => void;
  }) => { plugins: string[] };
  const { plugins } = babelConfig({ cache: () => undefined });

  assert.deepEqual(plugins, [
    './plugins/babel-icon-deep-imports',
    './plugins/babel-hermes-native-unicode-regex',
    'react-native-reanimated/plugin',
  ]);
});
