import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { PluginItem, TransformOptions } from '@babel/core';

const repoRoot = process.cwd();
const babel = require('@babel/core') as typeof import('@babel/core');
const pluginPath = path.join(repoRoot, 'plugins/babel-lucide-deep-imports.js');
const lucideDeepImports = require(pluginPath) as PluginItem & {
  readIconFiles: (source: string) => Map<string, string>;
};

const lucideRoot = path.join(repoRoot, 'node_modules/lucide-react-native/dist/esm');
const iconFiles = lucideDeepImports.readIconFiles(
  readFileSync(path.join(lucideRoot, 'lucide-react-native.mjs'), 'utf8')
);

function transform(source: string): string {
  const options: TransformOptions = {
    babelrc: false,
    configFile: false,
    filename: path.join(repoRoot, 'src/fixture.tsx'),
    parserOpts: { plugins: ['typescript', 'jsx'] },
    plugins: [lucideDeepImports],
  };
  return babel.transformSync(source, options)?.code ?? '';
}

test('the icon map covers every root export and resolves aliases to the canonical file', () => {
  assert.ok(iconFiles.size > 3000, `expected thousands of icon names, got ${iconFiles.size}`);
  assert.equal(iconFiles.get('Check'), 'check');
  assert.equal(iconFiles.get('CheckCircle2'), 'circle-check');
  assert.equal(iconFiles.get('CircleCheck'), 'circle-check');
  assert.equal(iconFiles.get('Home'), 'house');
  assert.equal(iconFiles.get('House'), 'house');
  assert.equal(iconFiles.get('LucideProvider'), undefined);
});

test('named icon imports become per-icon default imports, keeping local names', () => {
  const output = transform(
    "import { Check, CheckCircle2 as Done } from 'lucide-react-native';\nexport const icons = [Check, Done];"
  );

  assert.match(output, /import Check from ["']lucide-react-native\/icons\/check["'];/);
  assert.match(output, /import Done from ["']lucide-react-native\/icons\/circle-check["'];/);
  assert.doesNotMatch(output, /from 'lucide-react-native';/);
});

test('type imports and non-icon exports stay on the package root', () => {
  const output = transform(
    [
      "import type { LucideProps } from 'lucide-react-native';",
      "import { LucideProvider, Play, type LucideIcon } from 'lucide-react-native';",
      'export const value: [LucideIcon, LucideProps | null] = [Play, null];',
      'export const provider = LucideProvider;',
    ].join('\n')
  );

  assert.match(output, /import type \{ LucideProps \} from 'lucide-react-native';/);
  assert.match(output, /import \{ LucideProvider, type LucideIcon \} from 'lucide-react-native';/);
  assert.match(output, /import Play from ["']lucide-react-native\/icons\/play["'];/);
});

test('every icon the app imports maps to a file the package ships', () => {
  const sources: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
      } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) {
        sources.push(entryPath);
      }
    }
  };
  walk(path.join(repoRoot, 'src'));

  const rewritten = new Set<string>();
  for (const sourcePath of sources) {
    const source = readFileSync(sourcePath, 'utf8');
    if (!source.includes("'lucide-react-native'")) {
      continue;
    }
    for (const [, file] of transform(source).matchAll(
      /["']lucide-react-native\/icons\/([a-z0-9-]+)["']/g
    )) {
      rewritten.add(file);
    }
  }

  assert.ok(rewritten.size > 20, `expected the app's icons to be rewritten, got ${rewritten.size}`);
  for (const file of rewritten) {
    assert.ok(existsSync(path.join(lucideRoot, 'icons', `${file}.mjs`)), `${file}.mjs is missing`);
  }
});

test('the app Babel config applies the rewrite before Reanimated', () => {
  const babelConfig = require(path.join(repoRoot, 'babel.config.js')) as (api: {
    cache: (value: boolean) => void;
  }) => { plugins: string[] };
  const { plugins } = babelConfig({ cache: () => undefined });

  assert.deepEqual(plugins, [
    './plugins/babel-lucide-deep-imports',
    'react-native-reanimated/plugin',
  ]);
});
