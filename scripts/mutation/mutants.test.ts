import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { HITS_FILE_ENV, instrumentForCoverage, parseHits } from './coverage';
import { applyMutant, generateMutants, isSyntacticallyValid } from './mutants';

const SAMPLE = `import { thing } from './thing';

type Mode = 'a' | 'b';

export function clamp(value: number, max: number): number {
  if (value > max) {
    console.warn('clamped', value);
    return max;
  }
  return Math.max(value, 0);
}

export function record(log: string[], entry: string): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    log.push('debug');
  }
  log.push(entry);
  log.push(entry.trim());
}
`;

test('mutants cover operators, literals and statements but never types, imports or logging', () => {
  const mutants = generateMutants(SAMPLE, 'sample.ts');
  const describe = (m: (typeof mutants)[number]) =>
    `${m.operator}:${m.original}->${m.replacement}@${m.line}`;
  const all = mutants.map(describe);

  for (const expected of [
    'relational-boundary:>->>=@6',
    'negate-condition:value > max->!(value > max)@6',
    'math-swap:max->min@10',
    'number-literal:0->1@10',
    'remove-statement:return max;->;@8',
    'remove-statement:log.push(entry);->;@17',
    'early-return:-> return;@13',
  ]) {
    assert.ok(all.includes(expected), `missing ${expected}`);
  }
  for (const m of mutants) {
    assert.ok(m.line !== 1 && m.line !== 3, `mutated an import or a type: ${describe(m)}`);
    assert.ok(m.line !== 7, `mutated a logging call: ${describe(m)}`);
    assert.ok(m.line < 14 || m.line > 16, `mutated a __DEV__ block: ${describe(m)}`);
    assert.ok(isSyntacticallyValid(applyMutant(SAMPLE, m), 'sample.ts'), describe(m));
  }
});

test('mutant keys survive unrelated edits above them', () => {
  const before = generateMutants(SAMPLE, 'sample.ts');
  const after = generateMutants(`// a new comment\nconst unrelated = 1;\n${SAMPLE}`, 'sample.ts');
  const keysAfter = new Set(after.map((m) => m.key));
  for (const m of before) assert.ok(keysAfter.has(m.key), m.key);
});

test('coverage probes record exactly the statements a run reached', () => {
  const source = [
    'export function pick(flag: boolean): string {',
    '  if (flag) {',
    "    return 'yes';",
    '  }',
    "  return 'no';",
    '}',
    'pick(true);',
    '',
  ].join('\n');
  const mutants = generateMutants(source, 'pick.ts');
  const yes = mutants.find((m) => m.original === "'yes'");
  const no = mutants.find((m) => m.original === "'no'");
  assert.ok(yes && no);
  const { text, probes } = instrumentForCoverage(source, 'pick.ts', [yes.anchor, no.anchor]);

  const directory = mkdtempSync(path.join(os.tmpdir(), 'everybible-mutation-probe-'));
  try {
    const file = path.join(directory, 'pick.ts');
    const hitsFile = path.join(directory, 'hits.jsonl');
    writeFileSync(file, text);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      [HITS_FILE_ENV]: hitsFile,
      TSX_DISABLE_CACHE: '1',
    };
    delete env.NODE_TEST_CONTEXT;
    const run = spawnSync(process.execPath, ['--import', 'tsx', file], { env, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);

    const hits = parseHits(readFileSync(hitsFile, 'utf8'));
    assert.ok(hits.has(-1), 'loading the module is recorded');
    assert.ok(hits.has(probes[0] ?? NaN), "the 'yes' branch ran");
    assert.equal(hits.has(probes[1] ?? NaN), false, "the 'no' branch never ran");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('an edit to an identical statement in another function leaves a key alone', () => {
  const twoGuards = (first: string) =>
    [
      'export function save(blocked: boolean) {',
      '  if (blocked) {',
      `    ${first}`,
      '  }',
      '}',
      'export function remove(blocked: boolean) {',
      '  if (blocked) {',
      '    return;',
      '  }',
      '}',
      '',
    ].join('\n');
  const keyOfRemoveGuard = (text: string) =>
    generateMutants(text, 'guards.ts').find(
      (m) => m.operator === 'remove-statement' && m.scope === 'remove'
    )?.key;

  assert.equal(
    keyOfRemoveGuard(twoGuards('return false;')),
    keyOfRemoveGuard(twoGuards('return;'))
  );
});
