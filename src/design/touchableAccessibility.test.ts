// Codebase-wide static lint (not a behaviour test): raw touchables and inputs under src/ carry accessibility roles and labels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Screen-reader structure guard for raw touchables, in the same AST style as
// i18n/interfaceCoverage.test.ts. The design-system primitives (AppButton,
// IconButton, ListRow, PressableScale, AppCard) set their own roles; these rules
// cover the hand-rolled TouchableOpacity / Pressable call sites in screens.

const TOUCHABLES = new Set([
  'Pressable',
  'TouchableOpacity',
  'TouchableHighlight',
  'TouchableWithoutFeedback',
  'PressableScale',
]);

// Verses are read as scripture, not announced as buttons; they expose
// `selected` instead. Counted per file so a new unroled touchable still fails.
const ROLELESS_ALLOWED: Record<string, number> = {
  'src/screens/bible/reader/renderStackedVerse.tsx': 2,
  'src/components/bible/HighlightedVerseText.tsx': 1,
};

// A row whose nested control only repeats the row's own action.
const NESTED_ALLOWED: Record<string, number> = {
  'src/screens/plans/plansHome/CatalogPlanRow.tsx': 1,
};

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    // Render tests (*.test.tsx) build throwaway trees; only app UI is audited.
    return entry.isDirectory()
      ? sourceFiles(file)
      : file.endsWith('.tsx') && !file.endsWith('.test.tsx')
        ? [file]
        : [];
  });
}

interface Finding {
  file: string;
  line: number;
  rule: 'role' | 'label' | 'nested' | 'input' | 'modal';
}

function audit(): Finding[] {
  const findings: Finding[] = [];
  for (const directory of ['screens', 'components', 'navigation']) {
    for (const file of sourceFiles(path.join(process.cwd(), 'src', directory))) {
      const rel = path.relative(process.cwd(), file).split(path.sep).join('/');
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true
      );
      const opening = (node: ts.JsxElement | ts.JsxSelfClosingElement) =>
        ts.isJsxElement(node) ? node.openingElement : node;
      const attributes = (node: ts.JsxOpeningLikeElement) =>
        new Map(
          node.attributes.properties.flatMap((attribute) =>
            ts.isJsxAttribute(attribute)
              ? [[attribute.name.getText(source), attribute] as const]
              : []
          )
        );
      const isPressable = (node: ts.Node): node is ts.JsxElement | ts.JsxSelfClosingElement => {
        if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) return false;
        const element = opening(node);
        const attrs = attributes(element);
        return (
          TOUCHABLES.has(element.tagName.getText(source)) &&
          (attrs.has('onPress') || attrs.has('onLongPress'))
        );
      };
      // JSX kept in a local (`const trailing = <Button … />`) and placed with
      // `{trailing}` is still rendered inside the touchable. Following those
      // names keeps a split-out control from escaping the nested rule.
      const jsxLocals = new Map<string, ts.Expression>();
      const someJsx = (node: ts.Node): boolean =>
        ts.isJsxElement(node) ||
        ts.isJsxSelfClosingElement(node) ||
        ts.isJsxFragment(node) ||
        (ts.forEachChild(node, someJsx) ?? false);
      const collectLocals = (node: ts.Node) => {
        if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.initializer !== undefined &&
          someJsx(node.initializer)
        ) {
          jsxLocals.set(node.name.text, node.initializer);
        }
        ts.forEachChild(node, collectLocals);
      };
      collectLocals(source);
      const someDescendant = (
        node: ts.Node,
        predicate: (child: ts.Node) => boolean,
        { followLocals = false } = {}
      ) => {
        let found = false;
        const followed = new Set<ts.Node>();
        const visit = (child: ts.Node) => {
          if (found) return;
          if (predicate(child)) {
            found = true;
            return;
          }
          // Only a name read as a value (`{trailing}`), not a prop name.
          const local =
            followLocals && ts.isIdentifier(child) && !ts.isJsxAttribute(child.parent)
              ? jsxLocals.get(child.text)
              : undefined;
          if (local !== undefined && !followed.has(local)) {
            followed.add(local);
            visit(local);
          }
          ts.forEachChild(child, visit);
        };
        ts.forEachChild(node, visit);
        return found;
      };

      const visit = (node: ts.Node) => {
        const line = () => source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        // A raw Modal is closed by Android back through onRequestClose, but on
        // iOS it ignores VoiceOver's two-finger scrub unless a view inside it
        // handles onAccessibilityEscape.
        if (
          (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) &&
          opening(node).tagName.getText(source) === 'Modal'
        ) {
          const escapes = someDescendant(
            node,
            (child) =>
              (ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) &&
              attributes(child).has('onAccessibilityEscape')
          );
          if (!attributes(opening(node)).has('onRequestClose') || !escapes) {
            findings.push({ file: rel, line: line(), rule: 'modal' });
          }
        }
        if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && !isPressable(node)) {
          const element = opening(node);
          if (
            element.tagName.getText(source) === 'TextInput' &&
            !attributes(element).has('accessibilityLabel')
          ) {
            findings.push({ file: rel, line: line(), rule: 'input' });
          }
        }
        if (isPressable(node)) {
          const attrs = attributes(opening(node));
          const hidden = attrs.get('accessible')?.getText(source) === 'accessible={false}';
          if (!hidden) {
            // A long-press-only card is not a button; everything tappable is.
            if (!attrs.has('accessibilityRole') && attrs.has('onPress')) {
              findings.push({ file: rel, line: line(), rule: 'role' });
            }
            // Digits and symbols alone ("10", "+") are not a name: a skip button
            // that shows only "10" beside a chevron still needs a label.
            const hasWords = (element: ts.JsxElement): boolean =>
              element.children.some((child) => {
                if (ts.isJsxText(child)) return /\p{L}/u.test(child.text);
                if (ts.isJsxExpression(child)) return child.expression !== undefined;
                if (ts.isJsxElement(child)) return hasWords(child);
                return ts.isJsxSelfClosingElement(child);
              });
            const hasVisibleText = someDescendant(node, (child) => {
              if (ts.isJsxText(child)) return /\p{L}/u.test(child.text);
              if (ts.isJsxSelfClosingElement(child)) {
                return /Text$/.test(child.tagName.getText(source));
              }
              if (ts.isJsxElement(child)) {
                return (
                  /Text$/.test(child.openingElement.tagName.getText(source)) && hasWords(child)
                );
              }
              return false;
            });
            if (!hasVisibleText && !attrs.has('accessibilityLabel')) {
              findings.push({ file: rel, line: line(), rule: 'label' });
            }
            // An accessible touchable becomes one VoiceOver element: anything
            // pressable inside it is unreachable unless re-offered as an action.
            if (
              !attrs.has('accessibilityActions') &&
              someDescendant(node, (child) => isPressable(child), { followLocals: true })
            ) {
              findings.push({ file: rel, line: line(), rule: 'nested' });
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  return findings;
}

const findings = audit();

function withoutAllowed(rule: Finding['rule'], allowed: Record<string, number>): string[] {
  const byFile = new Map<string, Finding[]>();
  for (const finding of findings.filter((entry) => entry.rule === rule)) {
    byFile.set(finding.file, [...(byFile.get(finding.file) ?? []), finding]);
  }
  return [...byFile.entries()].flatMap(([file, entries]) =>
    entries.length <= (allowed[file] ?? 0)
      ? []
      : entries.map((entry) => `${entry.file}:${entry.line}`)
  );
}

test('touchables in screens and components declare an accessibility role', () => {
  assert.deepEqual(withoutAllowed('role', ROLELESS_ALLOWED), []);
});

test('touchables without visible words carry an accessibility label', () => {
  assert.deepEqual(withoutAllowed('label', {}), []);
});

test('an accessible touchable that wraps other pressables re-offers them as actions', () => {
  // Fix by setting accessible={false} on a wrapping backdrop, or by adding
  // accessibilityActions + onAccessibilityAction for the nested controls.
  assert.deepEqual(withoutAllowed('nested', NESTED_ALLOWED), []);
});

test('text inputs are named for screen readers', () => {
  assert.deepEqual(withoutAllowed('input', {}), []);
});

test('raw modals close on Android back and on the VoiceOver escape gesture', () => {
  // Fix with onRequestClose on the Modal and onAccessibilityEscape (the same
  // close handler) on its root view, or use the Sheet primitive, which does both.
  assert.deepEqual(withoutAllowed('modal', {}), []);
});

test('the touchable allowlists have no stale entries', () => {
  // A surplus allowance lets a new unroled or nested touchable into that file
  // unnoticed, and a moved file leaves its old path behind as a dead entry.
  const stale = (
    [
      ['role', ROLELESS_ALLOWED],
      ['nested', NESTED_ALLOWED],
    ] as const
  ).flatMap(([rule, allowed]) =>
    Object.entries(allowed).flatMap(([file, count]) =>
      findings.filter((entry) => entry.rule === rule && entry.file === file).length < count
        ? [`${rule}: ${file}`]
        : []
    )
  );

  assert.deepEqual(stale, [], 'lower or remove the allowance once a call site is fixed');
});
