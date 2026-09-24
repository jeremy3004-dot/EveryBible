import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Android runs edge-to-edge (app.json edgeToEdgeEnabled), which makes the window's own
// adjustResize inert: nothing resizes for the keyboard unless the screen does it. A
// KeyboardAvoidingView whose behavior is `undefined` on Android therefore leaves a focused
// input under the keyboard. Sheet.tsx documented this; two screens still used the old
// `Platform.OS === 'ios' ? 'padding' : undefined` shape. This guard walks every .tsx under src.

const SRC_ROOT = fileURLToPath(new URL('.', import.meta.url).href);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(file);
    return entry.name.endsWith('.tsx') ? [file] : [];
  });
}

const isUndefined = (expression: ts.Expression) =>
  ts.isIdentifier(expression) && expression.text === 'undefined';

// Which branch of `Platform.OS === 'x' ? a : b` runs on Android.
function androidBranch(expression: ts.ConditionalExpression): ts.Expression | null {
  const condition = expression.condition;
  if (!ts.isBinaryExpression(condition)) return null;
  const platform = [condition.left, condition.right].find(ts.isStringLiteral)?.text;
  const operator = condition.operatorToken.kind;
  const equals =
    operator === ts.SyntaxKind.EqualsEqualsEqualsToken ||
    operator === ts.SyntaxKind.EqualsEqualsToken;
  if (!platform) return null;
  const matchesAndroid = (platform === 'android') === equals;
  return matchesAndroid ? expression.whenTrue : expression.whenFalse;
}

function findAndroidKeyboardGaps(fileName: string, text: string): string[] {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const gaps: string[] = [];

  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(source) === 'KeyboardAvoidingView'
    ) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const behavior = node.attributes.properties.find(
        (attribute): attribute is ts.JsxAttribute =>
          ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'behavior'
      );
      const initializer = behavior?.initializer;
      const expression =
        initializer && ts.isJsxExpression(initializer) ? initializer.expression : initializer;
      if (!expression) {
        gaps.push(`${fileName}:${line} has no behavior`);
      } else if (ts.isConditionalExpression(expression)) {
        const android = androidBranch(expression);
        if (android && isUndefined(android))
          gaps.push(`${fileName}:${line} is undefined on Android`);
      } else if (ts.isExpression(expression) && isUndefined(expression)) {
        gaps.push(`${fileName}:${line} is undefined on Android`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return gaps;
}

test('every KeyboardAvoidingView does something on Android', () => {
  const gaps = sourceFiles(SRC_ROOT).flatMap((file) =>
    findAndroidKeyboardGaps(path.relative(SRC_ROOT, file), readFileSync(file, 'utf8'))
  );
  assert.deepEqual(
    gaps,
    [],
    `Use behavior={Platform.OS === 'ios' ? 'padding' : 'height'} (see components/ui/Sheet.tsx).`
  );
});

test('the scan recognises both platform test shapes and a missing behavior', () => {
  const probe = [
    "const a = <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} />;",
    "const b = <KeyboardAvoidingView behavior={Platform.OS === 'android' ? undefined : 'padding'} />;",
    "const c = <KeyboardAvoidingView behavior={Platform.OS !== 'android' ? 'padding' : undefined} />;",
    'const d = <KeyboardAvoidingView style={x} />;',
    "const ok1 = <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} />;",
    'const ok2 = <KeyboardAvoidingView behavior="height" />;',
  ].join('\n');
  assert.deepEqual(findAndroidKeyboardGaps('probe.tsx', probe), [
    'probe.tsx:1 is undefined on Android',
    'probe.tsx:2 is undefined on Android',
    'probe.tsx:3 is undefined on Android',
    'probe.tsx:4 has no behavior',
  ]);
});
