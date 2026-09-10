import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

// expo-file-system 19 (SDK 54) ships the new File/Directory API at its root and turns the
// legacy helpers (getInfoAsync, readAsStringAsync, downloadAsync, ...) into stubs that throw
// at runtime. Every caller that still uses those helpers must import 'expo-file-system/legacy'.
// A root import once made avatar upload fail 100% of the time on both platforms while the
// suite stayed green, so this guard walks all of src/ instead of one file.
const SRC_ROOT = path.resolve(__dirname);
const ROOT_IMPORT = /from\s+['"]expo-file-system['"]/;

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

test('no source file imports the root expo-file-system module', () => {
  const offenders = walk(SRC_ROOT, [])
    .filter((file) => ROOT_IMPORT.test(readFileSync(file, 'utf8')))
    .map((file) => path.relative(SRC_ROOT, file));
  assert.deepEqual(
    offenders,
    [],
    `Import from 'expo-file-system/legacy' instead (root helpers throw in SDK 54): ${offenders.join(', ')}`
  );
});
