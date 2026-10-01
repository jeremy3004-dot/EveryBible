import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// Finds the test files that can reach a module, by walking the relative-import
// graph backwards from it. Tests nearest the module (and named after it) run
// first, so a mutant is usually killed by the first file.

const SOURCE_ROOTS = ['src', 'scripts'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.next', 'dist', 'build', 'coverage']);
const SPECIFIER_PATTERN =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)['"](\.{1,2}\/[^'"]+)['"]/gm;
const RESOLVE_SUFFIXES = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

export function isTestFile(file: string): boolean {
  return /\.test\.tsx?$/.test(file);
}

function listSourceFiles(repoRoot: string): string[] {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) visit(path.join(directory, entry.name));
      } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        files.push(path.join(directory, entry.name));
      }
    }
  };
  for (const root of SOURCE_ROOTS) {
    const directory = path.join(repoRoot, root);
    if (existsSync(directory)) visit(directory);
  }
  return files;
}

function resolveSpecifier(fromFile: string, specifier: string): string | undefined {
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = base + suffix;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return undefined;
}

/** Map of absolute file path → files that import it. */
export function buildReverseImportGraph(repoRoot: string): Map<string, Set<string>> {
  const importers = new Map<string, Set<string>>();
  for (const file of listSourceFiles(repoRoot)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(SPECIFIER_PATTERN)) {
      const specifier = match[1];
      if (!specifier) continue;
      const target = resolveSpecifier(file, specifier);
      if (!target) continue;
      let set = importers.get(target);
      if (!set) {
        set = new Set();
        importers.set(target, set);
      }
      set.add(file);
    }
  }
  return importers;
}

export interface SelectedTest {
  file: string;
  distance: number;
}

/** Every test that can reach the module within `maxDistance` import hops, nearest first. */
export function rankTests(
  graph: Map<string, Set<string>>,
  target: string,
  maxDistance = 4
): SelectedTest[] {
  const seen = new Set<string>([target]);
  let frontier = [target];
  const found: SelectedTest[] = [];
  for (let distance = 1; distance <= maxDistance && frontier.length > 0; distance++) {
    const next: string[] = [];
    for (const file of frontier) {
      for (const importer of graph.get(file) ?? []) {
        if (seen.has(importer)) continue;
        seen.add(importer);
        if (isTestFile(importer)) found.push({ file: importer, distance });
        else next.push(importer);
      }
    }
    frontier = next;
  }
  const stem = path.basename(target).replace(/\.tsx?$/, '');
  const namedAfterTarget = (file: string) => path.basename(file).startsWith(`${stem}.`);
  return found.sort(
    (a, b) =>
      Number(namedAfterTarget(b.file)) - Number(namedAfterTarget(a.file)) ||
      a.distance - b.distance ||
      a.file.localeCompare(b.file)
  );
}

/**
 * Tests that import the module directly, widened one import hop at a time while
 * fewer than `minimum` are found (a module only reached through a barrel or a
 * service facade has no direct tests). scripts/mutate.ts widens further, test by
 * test, when these leave mutants uncovered.
 */
export function selectTests(
  ranked: SelectedTest[],
  { minimum = 3, maxTests = 60 } = {}
): SelectedTest[] {
  let cutoff = 0;
  for (const test of [...ranked].sort((a, b) => a.distance - b.distance)) {
    if (test.distance > cutoff && ranked.filter((t) => t.distance <= cutoff).length >= minimum) {
      break;
    }
    cutoff = Math.max(cutoff, test.distance);
  }
  return ranked.filter((test) => test.distance <= cutoff).slice(0, maxTests);
}
