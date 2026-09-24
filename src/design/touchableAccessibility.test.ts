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
  'src/screens/bible/reader/ReaderVerseList.tsx': 2,
  'src/components/bible/HighlightedVerseText.tsx': 1,
};

// A row whose nested control only repeats the row's own action.
const NESTED_ALLOWED: Record<string, number> = {
  'src/screens/plans/PlansHomeScreen.tsx': 1,
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
  rule: 'role' | 'label' | 'nested' | 'input';
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
      const someDescendant = (node: ts.Node, predicate: (child: ts.Node) => boolean) => {
        let found = false;
        const visit = (child: ts.Node) => {
          if (found) return;
          if (predicate(child)) {
            found = true;
            return;
          }
          ts.forEachChild(child, visit);
        };
        ts.forEachChild(node, visit);
        return found;
      };

      const visit = (node: ts.Node) => {
        const line = () => source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
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
              someDescendant(node, (child) => isPressable(child))
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
