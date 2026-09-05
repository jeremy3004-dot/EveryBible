import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { en } from './locales/en';

function flatten(tree: object, prefix = ''): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tree).flatMap(([key, value]) => {
      const name = prefix ? `${prefix}.${key}` : key;
      return typeof value === 'string' ? [[name, value]] : Object.entries(flatten(value, name));
    })
  );
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(file)
      : /\.tsx?$/.test(file) && !file.endsWith('.test.ts')
        ? [file]
        : [];
  });
}

test('every static mobile translation call has a source entry', () => {
  const entries = flatten(en);
  const missing: string[] = [];
  for (const file of sourceFiles(path.join(process.cwd(), 'src'))) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true
    );
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && /^(?:t|i18n\.t)$/.test(node.expression.getText(source))) {
        const key = node.arguments[0];
        if (
          key &&
          ts.isStringLiteral(key) &&
          !(key.text in entries) &&
          !(`${key.text}_other` in entries)
        ) {
          missing.push(
            `${path.relative(process.cwd(), file)}:${source.getLineAndCharacterOfPosition(key.getStart()).line + 1} ${key.text}`
          );
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.deepEqual(missing, []);
});

test('mobile JSX text and accessibility hints use translation keys', () => {
  const failures: string[] = [];
  const invariantText = new Set(['EveryBible', 'Tt', 'Aa', 'A', 'A-', 'A+', 'x']);
  const uiProps = new Set([
    'accessibilityLabel',
    'accessibilityHint',
    'placeholder',
    'title',
    'headerTitle',
  ]);
  for (const directory of ['screens', 'components', 'navigation']) {
    for (const file of sourceFiles(path.join(process.cwd(), 'src', directory)).filter((file) =>
      file.endsWith('.tsx')
    )) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true
      );
      function visit(node: ts.Node) {
        const value = ts.isJsxText(node)
          ? node.text.trim()
          : ts.isJsxAttribute(node) &&
              uiProps.has(node.name.getText(source)) &&
              node.initializer &&
              ts.isStringLiteral(node.initializer)
            ? node.initializer.text
            : '';
        if (/[A-Za-z]/.test(value) && !invariantText.has(value)) {
          failures.push(
            `${path.relative(process.cwd(), file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${value}`
          );
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  assert.deepEqual(failures, []);
});
