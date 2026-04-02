import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('the app defines a shared professional design system module', () => {
  const designSystemPath = fileURLToPath(new URL('./system.ts', import.meta.url).href);

  assert.equal(existsSync(designSystemPath), true, 'src/design/system.ts should exist');

  const source = readFileSync(designSystemPath, 'utf8');

  assert.equal(source.includes('export const spacing'), true, 'design system should export spacing');
  assert.equal(source.includes('export const radius'), true, 'design system should export radius');
  assert.equal(source.includes('export const typography'), true, 'design system should export typography');
  assert.equal(source.includes('export const shadows'), true, 'design system should export shadows');
});

test('high-traffic app surfaces consume the shared design system', () => {
  const files = [
    '../screens/home/HomeScreen.tsx',
    '../screens/bible/BibleBrowserScreen.tsx',
    '../screens/bible/ChapterSelectorScreen.tsx',
    '../screens/learn/CourseListScreen.tsx',
    '../screens/more/MoreScreen.tsx',
    '../screens/more/ProfileScreen.tsx',
    '../screens/more/ReadingActivityScreen.tsx',
    '../navigation/TabNavigator.tsx',
    '../navigation/RootNavigator.tsx',
  ];

  for (const relativePath of files) {
    const source = readRelativeSource(relativePath);

    assert.equal(
      /design\/system/.test(source),
      true,
      `${relativePath} should import the shared design system`
    );
  }
});

test('reading headings are bold, larger, and title case', () => {
  const source = readRelativeSource('./system.ts');

  const readingHeadingBlock = source.match(/readingHeading:\s*{[\s\S]*?}\s*satisfies TextStyle,/);

  assert.ok(readingHeadingBlock, 'readingHeading should exist in the shared design system');
  assert.match(readingHeadingBlock![0], /fontSize:\s*18,/);
  assert.match(readingHeadingBlock![0], /lineHeight:\s*24,/);
  assert.match(readingHeadingBlock![0], /fontWeight:\s*'700'/);
  assert.match(readingHeadingBlock![0], /letterSpacing:\s*-0\.1,/);
  assert.equal(
    readingHeadingBlock![0].includes("textTransform: 'uppercase'"),
    false,
    'reading headings should not force uppercase'
  );
});
