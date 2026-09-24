// Dependency-contract guard (a read of package.json, not a behaviour test): every
// package the shipped app imports is a direct dependency.
import { builtinModules } from 'node:module';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

// A package that only resolves because another dependency hoists it can vanish or
// change major on any unrelated upgrade, and the bundle breaks with no package.json
// diff to explain it. @react-navigation/elements reached TabNavigator that way.
const SRC_ROOT = path.resolve(__dirname);
const REPO_ROOT = path.resolve(SRC_ROOT, '..');

// Test-only code may use devDependencies; it never ships.
function isTestOnly(file: string): boolean {
  return (
    /\.test\.tsx?$/.test(file) ||
    /(?:renderfixtures?|\.d)\.tsx?$/i.test(file) ||
    file.split(path.sep).includes('testing')
  );
}

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !isTestOnly(full)) {
      out.push(full);
    }
  }
  return out;
}

function packageName(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

test('every package the app source imports is declared in dependencies', () => {
  const manifest = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
  };
  const declared = new Set(Object.keys(manifest.dependencies));
  const builtins = new Set(builtinModules);
  const files = [
    ...walk(SRC_ROOT, []),
    path.join(REPO_ROOT, 'App.tsx'),
    path.join(REPO_ROOT, 'index.ts'),
  ];

  const undeclared: string[] = [];
  for (const file of files) {
    // preProcessFile reads static, dynamic and require() imports and skips comments.
    const { importedFiles } = ts.preProcessFile(readFileSync(file, 'utf8'), true, true);
    for (const { fileName } of importedFiles) {
      if (fileName.startsWith('.') || fileName.startsWith('node:') || builtins.has(fileName)) {
        continue;
      }
      const name = packageName(fileName);
      if (!declared.has(name)) {
        undeclared.push(`${name} (${path.relative(REPO_ROOT, file)})`);
      }
    }
  }

  assert.deepEqual(undeclared, []);
});
