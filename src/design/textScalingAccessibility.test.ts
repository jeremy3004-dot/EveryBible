// Codebase-wide static lint (not a behaviour test): interface text wraps instead of adjustsFontSizeToFit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Large-text guard, in the same AST style as touchableAccessibility.test.ts.
// `adjustsFontSizeToFit` shrinks text back down to fit its box, which quietly
// undoes the user's text-size setting. Interface text should wrap and let its
// container grow (minHeight, not height) instead.

// Counted per file so a new shrink-to-fit call site still fails.
const SHRINK_TO_FIT_ALLOWED: Record<string, number> = {
  // The verse-image preview is the shared picture itself: a fixed-aspect image
  // whose text must fit the frame it is exported at, not interface text.
  'src/screens/bible/BibleReaderScreen.tsx': 2,
  // The discreet-mode calculator display fits its number on one line, as the
  // system calculator does; the value is also exposed as its accessibility label.
  'src/components/privacy/PrivacyLockScreen.tsx': 1,
};

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : file.endsWith('.tsx') ? [file] : [];
  });
}

function shrinkToFitCallSites(): Map<string, number[]> {
  const byFile = new Map<string, number[]>();
  for (const directory of ['screens', 'components', 'navigation']) {
    for (const file of sourceFiles(path.join(process.cwd(), 'src', directory))) {
      const rel = path.relative(process.cwd(), file).split(path.sep).join('/');
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true
      );
      const visit = (node: ts.Node) => {
        if (
          ts.isJsxAttribute(node) &&
          node.name.getText(source) === 'adjustsFontSizeToFit' &&
          node.initializer?.getText(source) !== '{false}'
        ) {
          const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          byFile.set(rel, [...(byFile.get(rel) ?? []), line]);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  return byFile;
}

test('interface text wraps under large text instead of shrinking to fit', () => {
  const offenders = [...shrinkToFitCallSites().entries()].flatMap(([file, lines]) =>
    lines.length <= (SHRINK_TO_FIT_ALLOWED[file] ?? 0) ? [] : lines.map((line) => `${file}:${line}`)
  );

  assert.deepEqual(offenders, []);
});

test('the shrink-to-fit allowlist has no stale entries', () => {
  const sites = shrinkToFitCallSites();
  const stale = Object.entries(SHRINK_TO_FIT_ALLOWED).flatMap(([file, allowed]) =>
    (sites.get(file)?.length ?? 0) < allowed ? [file] : []
  );

  assert.deepEqual(stale, [], 'lower or remove the allowance once a call site is fixed');
});
