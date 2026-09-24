// Test support for the reader's remaining source-text checks. BibleReaderScreen
// is split across the screen file and the hooks and components in `reader/`, so
// a check that pins how the reader is wired reads all of them together.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const readerDirectory = fileURLToPath(new URL('./reader/', import.meta.url).href);

/** The reader's source files, relative to this folder: the screen first. */
export function listBibleReaderSourceFiles(): string[] {
  const split = readdirSync(readerDirectory)
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .sort()
    .map((name) => `./reader/${name}`);
  return ['./BibleReaderScreen.tsx', ...split];
}

/**
 * A `reader/` file's relative specifiers, rewritten as the screen would spell them,
 * so a check for `import('../../services/...')` holds wherever the code lives.
 */
const asScreenRelative = (source: string) =>
  source
    .replace(/(['"])\.\.\/(?!\.\.\/)/g, '$1./')
    .replace(/(['"])\.\.\/\.\.\/\.\.\//g, '$1../../');

/** The screen and everything split out of it, concatenated file by file. */
export function readBibleReaderSource(): string {
  return listBibleReaderSourceFiles()
    .map((file) => {
      const source = readFileSync(fileURLToPath(new URL(file, import.meta.url).href), 'utf8');
      return file.startsWith('./reader/') ? asScreenRelative(source) : source;
    })
    .join('\n');
}
