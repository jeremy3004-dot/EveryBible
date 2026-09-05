import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Only test files under maintained source roots are eligible. In particular,
// scripts/testflight_* and other operational tools must never run as tests.
const TEST_ROOTS = ['src', 'apps/admin', 'apps/site', 'packages', 'supabase/functions', 'scripts'];
const EXCLUDED_DIRECTORIES = new Set(['node_modules', '.next', 'dist', 'build', 'coverage']);

export function discoverTestFiles(repoRoot: string): string[] {
  const files: string[] = [];
  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory() && !EXCLUDED_DIRECTORIES.has(entry.name)) {
        visit(entryPath);
      } else if (entry.isFile() && /\.test\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name)) {
        files.push(entryPath);
      }
    }
  }
  for (const root of TEST_ROOTS) visit(path.join(repoRoot, root));
  return files.sort();
}

export function runTestFiles(files: string[], repoRoot: string): number {
  if (files.length === 0) throw new Error('No workspace tests found');
  const result = spawnSync(
    process.execPath,
    ['--test', '--experimental-test-module-mocks', '--import', 'tsx', ...files],
    {
      cwd: repoRoot,
      stdio: 'inherit',
    }
  );
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = discoverTestFiles(repoRoot);
  console.log(`Running ${files.length} workspace test files`);
  process.exitCode = runTestFiles(files, repoRoot);
}
