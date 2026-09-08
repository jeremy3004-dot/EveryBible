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
  assert.equal(renderDate('fr'), 'samedi \u00b7 5 septembre');
});

test('HomeScreen refreshes its memoized date after the interface language changes', () => {
  const renderDate = makeDateLabelHarness();
  assert.equal(renderDate('en'), 'Saturday \u00b7 September 5');
  assert.equal(renderDate('fr'), 'samedi \u00b7 5 septembre');
});

// The eyebrow reads "TUESDAY \u00b7 8 SEPTEMBER": the weekday is split off its own
// way so every locale keeps the EL separator rather than the locale's own comma.
test('HomeScreen joins the weekday and the date with the EL separator, never a comma', () => {
  const renderDate = makeDateLabelHarness();

  for (const language of ['en', 'fr', 'de', 'es']) {
    const label = renderDate(language);
    assert.match(label, /^[^,]+ \u00b7 [^,]+$/, `${language} should render "weekday \u00b7 date"`);
    assert.equal(
      /\d{4}/.test(label),
      false,
      `${language} should not carry the year in the eyebrow`
    );
  }
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
