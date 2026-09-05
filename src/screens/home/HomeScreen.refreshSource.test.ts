import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

function makeDateLabelHarness() {
  const source = ts.createSourceFile(
    'HomeScreen.tsx',
    readRelativeSource('./HomeScreen.tsx'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  let initializer: string | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'todayLabel') {
      initializer = node.initializer?.getText(source);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(initializer, 'HomeScreen must render a date label');
  let lastDependencies: unknown[] | undefined;
  let cachedLabel: string;
  const i18n = { language: 'en' };
  const context = {
    i18n,
    Date: class extends Date {
      constructor() {
        super(2026, 8, 5, 12);
      }
    },
    Intl: {
      // Make the device locale English regardless of the test machine's locale.
      DateTimeFormat: function (locale: string | undefined, options: Intl.DateTimeFormatOptions) {
        return new Intl.DateTimeFormat(locale ?? 'en-US', options);
      },
    },
    useMemo: (factory: () => string, dependencies: unknown[]) => {
      if (
        !lastDependencies ||
        dependencies.some((value, index) => value !== lastDependencies![index])
      ) {
        cachedLabel = factory();
        lastDependencies = [...dependencies];
      }
      return cachedLabel;
    },
  };
  return (language: string): string => {
    i18n.language = language;
    return runInNewContext(initializer!, context) as string;
  };
}

test('HomeScreen formats its date in French when the device locale is English', () => {
  const renderDate = makeDateLabelHarness();
  assert.equal(renderDate('fr'), '5 septembre 2026');
});

test('HomeScreen refreshes its memoized date after the interface language changes', () => {
  const renderDate = makeDateLabelHarness();
  assert.equal(renderDate('en'), 'September 5, 2026');
  assert.equal(renderDate('fr'), '5 septembre 2026');
});

test('HomeScreen refreshes the verse of the day on foreground and at midnight', () => {
  const source = readRelativeSource('./HomeScreen.tsx');

  assert.match(
    source,
    /AppState,[\s\S]*type AppStateStatus/,
    'HomeScreen should listen for app foreground changes'
  );

  assert.match(
    source,
    /const appStateRef = useRef<AppStateStatus>\(AppState\.currentState\);/,
    'HomeScreen should track the current app state'
  );

  assert.match(
    source,
    /getMillisecondsUntilNextLocalMidnight\(/,
    'HomeScreen should schedule a refresh for the next local midnight'
  );

  assert.match(
    source,
    /AppState\.addEventListener\('change', \(nextAppState: AppStateStatus\) => \{/,
    'HomeScreen should refresh the verse when the app returns to the foreground'
  );

  assert.match(
    source,
    /midnightRefreshTimerRef\.current = setTimeout\(\(\) => \{/,
    'HomeScreen should create a midnight refresh timer'
  );

  assert.match(
    source,
    /clearTimeout\(midnightRefreshTimerRef\.current\);/,
    'HomeScreen should clear the midnight timer during cleanup'
  );
});
