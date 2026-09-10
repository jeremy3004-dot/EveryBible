import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_ROOT = fileURLToPath(new URL('.', import.meta.url).href);

const EXEMPT_MARKER = 'modal-translucency: exempt';

function collectScreenSources(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__snapshots__') {
        continue;
      }
      files.push(...collectScreenSources(absolute));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.tsx')) {
      files.push(absolute);
    }
  }

  return files;
}

/**
 * Returns the source text of every `<Modal ...>` opening tag in the file, paired
 * with the source line the tag starts on.
 */
function findModalOpeningTags(source: string): { line: number; tag: string; index: number }[] {
  const tags: { line: number; tag: string; index: number }[] = [];
  const opener = /<Modal(?=[\s/>])/g;

  let match: RegExpExecArray | null;
  while ((match = opener.exec(source)) !== null) {
    const start = match.index;

    // Walk forward to the end of the opening tag, ignoring `>` characters that
    // appear inside string literals or nested JSX expression braces (arrow
    // functions in props such as onRequestClose={() => ...}).
    let depth = 0;
    let quote: string | null = null;
    let end = -1;

    for (let i = start; i < source.length; i += 1) {
      const char = source[i];

      if (quote) {
        if (char === quote && source[i - 1] !== '\\') {
          quote = null;
        }
        continue;
      }

      if (char === '"' || char === "'" || char === '`') {
        quote = char;
        continue;
      }

      if (char === '{') {
        depth += 1;
        continue;
      }

      if (char === '}') {
        depth -= 1;
        continue;
      }

      if (char === '>' && depth === 0) {
        end = i;
        break;
      }
    }

    if (end === -1) {
      end = source.length - 1;
    }

    tags.push({
      index: start,
      line: source.slice(0, start).split('\n').length,
      tag: source.slice(start, end + 1),
    });
  }

  return tags;
}

function hasExemptionComment(source: string, tagIndex: number): boolean {
  const before = source.slice(0, tagIndex).split('\n');
  // The line the tag opens on is the last entry; the preceding line is the one
  // an opt-out comment must live on.
  const precedingLine = before[before.length - 2] ?? '';
  return precedingLine.includes(EXEMPT_MARKER);
}

test('every React Native <Modal> opts into Android edge-to-edge translucency', () => {
  const files = collectScreenSources(SRC_ROOT);
  const violations: string[] = [];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');

    if (!source.includes('<Modal')) {
      continue;
    }

    for (const { tag, line, index } of findModalOpeningTags(source)) {
      if (hasExemptionComment(source, index)) {
        continue;
      }

      const missing: string[] = [];
      if (!/\bstatusBarTranslucent\b/.test(tag)) {
        missing.push('statusBarTranslucent');
      }
      if (!/\bnavigationBarTranslucent\b/.test(tag)) {
        missing.push('navigationBarTranslucent');
      }

      if (missing.length > 0) {
        violations.push(`${path.relative(SRC_ROOT, file)}:${line} missing ${missing.join(' + ')}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Under Android edge-to-edge a <Modal> without statusBarTranslucent and navigationBarTranslucent is inset by the system bars, leaving un-dimmed bands and pushing bottom sheets above the navigation bar. Add both props, or annotate the line above the tag with "// ${EXEMPT_MARKER}".\n${violations.join('\n')}`
  );
});

test('the modal translucency scan actually finds the app modals and honours the opt-out marker', () => {
  const files = collectScreenSources(SRC_ROOT);
  const modalFiles = files.filter((file) => readFileSync(file, 'utf8').includes('<Modal'));

  assert.ok(
    modalFiles.length >= 5,
    'expected the scan to walk real screen sources containing <Modal> usages'
  );

  const sample = [
    'const x = (',
    '  // modal-translucency: exempt',
    '  <Modal visible={value} transparent>',
    '    <View />',
    '  </Modal>',
    ');',
  ].join('\n');

  const [tag] = findModalOpeningTags(sample);
  assert.ok(tag, 'the scanner should detect a <Modal> opening tag');
  assert.equal(hasExemptionComment(sample, tag.index), true);

  const withArrowProp = '<Modal onRequestClose={() => close({ a: 1 })} statusBarTranslucent>\n';
  const [arrowTag] = findModalOpeningTags(withArrowProp);
  assert.match(
    arrowTag.tag,
    /statusBarTranslucent>$/,
    'the scanner should not stop at a `>` inside a JSX expression prop'
  );
});
