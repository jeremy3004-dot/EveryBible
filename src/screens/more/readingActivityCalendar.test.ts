import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { buildCalendarLocale } from '../../i18n/interfaceFormatting';

test('reading activity gives calendar weekday test IDs a stable prefix without changing localized text', () => {
  const screen = readFileSync(fileURLToPath(new URL('./ReadingActivityScreen.tsx', import.meta.url)), 'utf8');
  const testID = screen.match(/<Calendar\b[\s\S]*?\btestID="([^"]+)"/)?.[1];
  assert.equal(testID, 'reading-activity-calendar');

  // Exercise the installed library's weekday renderer; native snapshot tools may
  // display testID before text, so a generated identifier must not be mistaken for copy.
  const header = ts.createSourceFile(
    'header.tsx',
    readFileSync('node_modules/react-native-calendars/src/calendar/header/index.js', 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  let initializer: string | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(header) === 'renderWeekDays') {
      initializer = node.initializer?.getText(header);
    }
    ts.forEachChild(node, visit);
  };
  visit(header);
  assert.ok(initializer);
  const weekdays = buildCalendarLocale('fr', 'Aujourd’hui').dayNamesShort;
  const nodes = runInNewContext(
    ts.transpileModule(`const result = ${initializer}; result;`, {
      fileName: 'header.tsx',
      compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      React: { createElement: (_type: unknown, props: object, child: string) => ({ ...props, child }) },
      Text: 'Text',
      useMemo: (callback: () => unknown) => callback(),
      XDate: class { getDay() { return 0; } },
      weekDayNames: () => weekdays,
      includes: () => false,
      style: { current: {} },
      testID: `${testID}.header`,
      firstDay: 0,
      current: '',
      numberOfDaysCondition: false,
      numberOfDays: undefined,
      disabledDaysIndexes: undefined,
    }
  ) as Array<{ child: string; testID: string; accessibilityLabel: string }>;
  assert.equal(nodes.length, 7);
  nodes.forEach((node, index) => {
    assert.equal(node.child, weekdays[index]);
    assert.equal(node.testID, `reading-activity-calendar.header.dayName_${weekdays[index]}`);
    assert.equal(node.accessibilityLabel, '');
    assert.ok(!node.child.includes('dayName_'));
  });
});
