import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import {
  buildTranslationLanguageFilters,
  filterTranslationsByLanguage,
  normalizeTranslationLanguage,
} from './bibleTranslationModel';

// Run the actual hook callbacks without loading React Native or FlashList under Node.
const source = ts.createSourceFile(
  'TranslationPickerList.tsx',
  readFileSync(fileURLToPath(new URL('./TranslationPickerList.tsx', import.meta.url).href), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
function findExpression(predicate: (node: ts.Node) => boolean): string {
  let expression: string | undefined;
  const visit = (node: ts.Node) => {
    if (predicate(node)) expression = node.getText(source);
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(expression);
  return expression;
}
function runExpression(expression: string, context: Record<string, unknown>) {
  const code = ts.transpileModule(`const result = ${expression}; result;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return runInNewContext(code, context);
}

test('picker language counts scan translations once rather than once per language', () => {
  let languageReads = 0;
  const visibleTranslations = Array.from({ length: 1200 }, (_, index) => ({
    get language() {
      languageReads += 1;
      return `Language ${index % 600}`;
    },
  }));
  const languageFilters = buildTranslationLanguageFilters(visibleTranslations);
  languageReads = 0;
  const declaration = findExpression(
    (node) => ts.isVariableDeclaration(node) && node.name.getText(source) === 'languageOptions'
  );
  const expression = declaration.slice(declaration.indexOf('=') + 1);
  const options = runExpression(expression, {
    useMemo: (compute: () => unknown) => compute(),
    visibleTranslations,
    languageFilters,
    filterTranslationsByLanguage,
    normalizeTranslationLanguage,
  }) as Array<{ value: string; label: string; count: number }>;
  assert.equal(options.length, 600);
  assert.ok(options.every(({ count }) => count === 2));
  assert.equal(options[0].value, languageFilters[0].value);
  assert.ok(
    languageReads <= visibleTranslations.length * 2,
    `Read language ${languageReads} times`
  );
});

test('opening a picker with existing runtime rows still attempts the shared hydration gate', async () => {
  let ensureCalls = 0;
  const loadingStates: boolean[] = [];
  const effect = findExpression(
    (node) =>
      ts.isCallExpression(node) &&
      node.expression.getText(source) === 'useEffect' &&
      node.getText(source).includes('ensureRuntimeCatalogLoaded')
  );
  runExpression(effect, {
    useEffect: (callback: () => unknown) => callback(),
    hasHydratedRuntimeCatalog: true,
    setIsHydratingRuntimeCatalog: (value: boolean) => loadingStates.push(value),
    ensureRuntimeCatalogLoaded: async () => {
      ensureCalls += 1;
    },
    console,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    ensureCalls,
    1,
    'cached rows must not suppress retry after a partial source failure'
  );
  assert.equal(loadingStates.at(-1), false);
});
