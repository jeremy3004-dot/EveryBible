/**
 * Mutation testing for the node --test suite (Stryker has no runner for it).
 *
 *   node --import tsx scripts/mutate.ts <src file> [<src file> ...] [options]
 *
 *   --jobs N              parallel workers (default: CPU cores - 1)
 *   --tests a.ts,b.ts     run these test files instead of the discovered ones
 *   --operators a,b       only these operators (see scripts/mutation/mutants.ts)
 *   --lines 10-80         only mutate these lines
 *   --ids 3,17            only these mutant ids (as printed by --list or a run)
 *   --verbose             print the failing output of the test that killed each mutant
 *   --include-source-tests  also run *Source.test.ts import-graph guards (they read
 *                         the source text, so they "kill" mutants without testing behaviour)
 *   --json path           write every mutant and its outcome as JSON
 *   --list                print the mutants and selected tests without running
 *
 * Each worker owns a copy-on-write clone of the repository under the OS temp
 * directory; mutants are written there, never into this checkout, and the
 * clones are deleted when the run ends. Every selected test file first runs
 * once against an instrumented copy of the module (scripts/mutation/coverage.ts)
 * so each mutant only runs the tests that reach it. A mutant is killed when one
 * of those test files fails or times out. Mutants listed in
 * scripts/mutation-equivalents.json (with the reason) are not run.
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HITS_FILE_ENV, instrumentForCoverage, parseHits } from './mutation/coverage';
import {
  applyMutant,
  generateMutants,
  isSyntacticallyValid,
  type Mutant,
} from './mutation/mutants';
import { buildReverseImportGraph, selectTests } from './mutation/testSelection';

type Status = 'killed' | 'timeout' | 'survived' | 'uncovered' | 'equivalent' | 'invalid';

interface MutantResult extends Mutant {
  status: Status;
  killedBy?: string;
  reason?: string;
  durationMs?: number;
}

interface Options {
  files: string[];
  jobs: number;
  tests?: string[];
  operators?: Set<string>;
  lines?: [number, number];
  ids?: Set<number>;
  verbose: boolean;
  includeSourceTests: boolean;
  json?: string;
  list: boolean;
}

interface Worker {
  root: string;
  tmp: string;
}

interface TestOutcome {
  passed: boolean;
  timedOut: boolean;
  durationMs: number;
  output: string;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Not needed by any unit test, and large: left out of the worker clones.
const CLONE_EXCLUDES = new Set([
  'node_modules',
  '.git',
  '.claude',
  '.planning',
  'ios',
  'android',
  'apps',
  'store-assets',
  'store-metadata',
  'workers',
  'cloudflare',
]);
const EQUIVALENTS_FILE = path.join(repoRoot, 'scripts', 'mutation-equivalents.json');
const SOURCE_TEXT_TEST = /Source\.test\.tsx?$/;

function parseArgs(argv: string[]): Options {
  const options: Options = {
    files: [],
    jobs: Math.max(1, os.availableParallelism() - 1),
    verbose: false,
    includeSourceTests: false,
    list: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      return next;
    };
    if (arg === '--jobs') options.jobs = Math.max(1, Number(value()));
    else if (arg === '--tests') options.tests = value().split(',').filter(Boolean);
    else if (arg === '--operators') options.operators = new Set(value().split(','));
    else if (arg === '--ids') options.ids = new Set(value().split(',').map(Number));
    else if (arg === '--lines') {
      const [from, to] = value().split('-').map(Number);
      options.lines = [from ?? 1, to ?? from ?? Number.MAX_SAFE_INTEGER];
    } else if (arg === '--json') options.json = path.resolve(value());
    else if (arg === '--verbose') options.verbose = true;
    else if (arg === '--include-source-tests') options.includeSourceTests = true;
    else if (arg === '--list') options.list = true;
    else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else options.files.push(arg);
  }
  if (options.files.length === 0) throw new Error('Pass at least one source file to mutate');
  return options;
}

function loadEquivalents(): Record<string, Record<string, string>> {
  if (!existsSync(EQUIVALENTS_FILE)) return {};
  const raw = JSON.parse(readFileSync(EQUIVALENTS_FILE, 'utf8')) as Record<
    string,
    { key: string; reason: string }[]
  >;
  return Object.fromEntries(
    Object.entries(raw).map(([file, entries]) => [
      file,
      Object.fromEntries(entries.map((entry) => [entry.key, entry.reason])),
    ])
  );
}

function cloneRepo(destination: string): void {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(repoRoot)) {
    if (CLONE_EXCLUDES.has(entry)) continue;
    const from = path.join(repoRoot, entry);
    const to = path.join(destination, entry);
    // APFS clonefile: instant, and takes no space until a file is written.
    const cloned = process.platform === 'darwin' && spawnSync('cp', ['-cR', from, to]).status === 0;
    if (!cloned) cpSync(from, to, { recursive: true });
  }
  symlinkSync(
    realpathSync(path.join(repoRoot, 'node_modules')),
    path.join(destination, 'node_modules')
  );
}

// Test processes run in their own process group (so a timeout can kill the
// whole tree); they are tracked so an interrupted run takes them down too.
const liveChildren = new Set<number>();

function killGroup(pid: number): void {
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    // already gone
  }
}

function runTestFile(
  worker: Worker,
  testFile: string,
  timeoutMs: number,
  extraEnv: NodeJS.ProcessEnv = {},
  captureOutput = false
): Promise<TestOutcome> {
  const started = Date.now();
  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = { ...process.env, TMPDIR: worker.tmp, ...extraEnv };
    delete env.NODE_TEST_CONTEXT;
    delete env.TSX_DISABLE_CACHE; // a per-worker TMPDIR keeps tsx's cache small and private
    const child = spawn(
      process.execPath,
      ['--test', '--experimental-test-module-mocks', '--import', 'tsx', testFile],
      { cwd: worker.root, env, stdio: captureOutput ? 'pipe' : 'ignore', detached: true }
    );
    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
    const pid = child.pid;
    if (pid) liveChildren.add(pid);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (pid) killGroup(pid);
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (pid) liveChildren.delete(pid);
      resolve({
        passed: code === 0 && !timedOut,
        timedOut,
        durationMs: Date.now() - started,
        output,
      });
    });
  });
}

function pickWorker(workers: Worker[], index: number): Worker {
  const worker = workers[index % workers.length];
  if (!worker) throw new Error('No workers');
  return worker;
}

interface TestCoverage {
  timeoutMs: number;
  /** Probe ids the test reached; null = could not instrument, assume every probe. */
  hits: Set<number> | null;
}

// Runs every test once against the instrumented module, in parallel across
// workers. A test that fails instrumented but passes plain (it reads the source
// text) is assumed to reach everything; one that fails plain stops the run.
async function measureCoverage(
  relativeFile: string,
  original: string,
  instrumented: string,
  tests: string[],
  workers: Worker[]
): Promise<Map<string, TestCoverage>> {
  for (const worker of workers) writeFileSync(path.join(worker.root, relativeFile), instrumented);
  const coverage = new Map<string, TestCoverage>();
  const failing: string[] = [];
  let next = 0;
  await Promise.all(
    workers.map(async (worker, workerIndex) => {
      for (let index = next++; index < tests.length; index = next++) {
        const test = tests[index] as string;
        const hitsFile = path.join(worker.tmp, `hits-${workerIndex}-${index}.jsonl`);
        const outcome = await runTestFile(worker, test, 600_000, { [HITS_FILE_ENV]: hitsFile });
        const timeoutMs = Math.max(20_000, 4 * outcome.durationMs);
        if (outcome.passed) {
          const hits = existsSync(hitsFile) ? parseHits(readFileSync(hitsFile, 'utf8')) : new Set();
          coverage.set(test, { timeoutMs, hits: hits as Set<number> });
          continue;
        }
        const target = path.join(worker.root, relativeFile);
        writeFileSync(target, original);
        const plain = await runTestFile(worker, test, 600_000);
        writeFileSync(target, instrumented);
        if (plain.passed) coverage.set(test, { timeoutMs, hits: null });
        else failing.push(test);
      }
    })
  );
  for (const worker of workers) writeFileSync(path.join(worker.root, relativeFile), original);
  if (failing.length > 0) {
    throw new Error(`Tests fail before mutation, fix them first:\n  ${failing.join('\n  ')}`);
  }
  return coverage;
}

async function mutateFile(
  relativeFile: string,
  options: Options,
  workers: Worker[],
  equivalents: Record<string, string>
): Promise<{ results: MutantResult[]; tests: string[] }> {
  const original = readFileSync(path.join(repoRoot, relativeFile), 'utf8');
  const tests = (
    options.tests ??
    selectTests(buildReverseImportGraph(repoRoot), path.join(repoRoot, relativeFile)).map((test) =>
      path.relative(repoRoot, test.file)
    )
  ).filter((test) => options.includeSourceTests || options.tests || !SOURCE_TEXT_TEST.test(test));
  let mutants = generateMutants(original, relativeFile);
  if (options.operators) mutants = mutants.filter((m) => options.operators?.has(m.operator));
  if (options.lines) {
    const [from, to] = options.lines;
    mutants = mutants.filter((m) => m.line >= from && m.line <= to);
  }
  if (options.ids) mutants = mutants.filter((m) => options.ids?.has(m.id));
  console.log(`\n${relativeFile}: ${mutants.length} mutants, ${tests.length} test files`);
  for (const test of tests) console.log(`  ${test}`);
  if (options.list) {
    for (const m of mutants) {
      console.log(
        `  #${m.id} L${m.line}:${m.column} ${m.operator} ${m.original} -> ${m.replacement}`
      );
    }
    return { results: [], tests };
  }
  if (tests.length === 0) throw new Error(`No tests reach ${relativeFile}; pass --tests`);

  const { text: instrumented, probes } = instrumentForCoverage(
    original,
    relativeFile,
    mutants.map((m) => m.anchor)
  );
  const coverage = await measureCoverage(relativeFile, original, instrumented, tests, workers);
  const probeOf = new Map(mutants.map((m, index) => [m.id, probes[index] ?? -1]));
  const reaches = (test: string, mutant: Mutant) => {
    const hits = coverage.get(test)?.hits;
    return hits === null || hits === undefined || hits.has(probeOf.get(mutant.id) ?? -1);
  };
  // Tests that killed a mutant move to the front: neighbouring mutants tend to
  // be killed by the same file.
  const order = [...tests];

  const results: MutantResult[] = [];
  let next = 0;
  const report = (result: MutantResult) => {
    results.push(result);
    if (result.status === 'survived' || result.status === 'uncovered') {
      console.log(
        `  ${result.status.toUpperCase()} #${result.id} L${result.line}:${result.column} ` +
          `${result.operator}: ${result.original} -> ${result.replacement}   | ${result.lineText}`
      );
    }
    if (results.length % 50 === 0) console.log(`  … ${results.length}/${mutants.length}`);
  };

  const evaluate = async (worker: Worker, mutant: Mutant): Promise<MutantResult> => {
    const reason = equivalents[mutant.key];
    if (reason !== undefined) return { ...mutant, status: 'equivalent', reason };
    const mutated = applyMutant(original, mutant);
    if (!isSyntacticallyValid(mutated, relativeFile)) return { ...mutant, status: 'invalid' };
    const relevant = order.filter((test) => reaches(test, mutant));
    if (relevant.length === 0) return { ...mutant, status: 'uncovered' };
    const target = path.join(worker.root, relativeFile);
    const started = Date.now();
    writeFileSync(target, mutated);
    try {
      for (const test of relevant) {
        const timeoutMs = coverage.get(test)?.timeoutMs ?? 60_000;
        const outcome = await runTestFile(worker, test, timeoutMs, {}, options.verbose);
        if (outcome.passed) continue;
        order.splice(order.indexOf(test), 1);
        order.unshift(test);
        if (options.verbose) {
          console.log(`  #${mutant.id} killed by ${test}:\n${outcome.output.slice(-3000)}`);
        }
        return {
          ...mutant,
          status: outcome.timedOut ? 'timeout' : 'killed',
          killedBy: test,
          durationMs: Date.now() - started,
        };
      }
      return { ...mutant, status: 'survived', durationMs: Date.now() - started };
    } finally {
      writeFileSync(target, original);
    }
  };

  await Promise.all(
    workers.map(async (worker) => {
      for (let index = next++; index < mutants.length; index = next++) {
        report(await evaluate(worker, mutants[index] as Mutant));
      }
    })
  );
  results.sort((a, b) => a.id - b.id);
  return { results, tests };
}

function summarize(results: MutantResult[]) {
  const count = (status: Status) => results.filter((r) => r.status === status).length;
  const killed = count('killed') + count('timeout');
  const survived = count('survived') + count('uncovered');
  return {
    total: results.length,
    killed: count('killed'),
    timeout: count('timeout'),
    survived: count('survived'),
    uncovered: count('uncovered'),
    equivalent: count('equivalent'),
    invalid: count('invalid'),
    score:
      killed + survived === 0 ? 'n/a' : `${((100 * killed) / (killed + survived)).toFixed(1)}%`,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const files = options.files.map((file) => path.relative(repoRoot, path.resolve(file)));
  const equivalents = loadEquivalents();
  const base = mkdtempSync(path.join(os.tmpdir(), 'everybible-mutate-'));
  const cleanup = () => rmSync(base, { recursive: true, force: true });
  const onSignal = () => {
    for (const pid of liveChildren) killGroup(pid);
    cleanup();
    process.exit(130);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  const report: Record<string, unknown> = {};
  const summaries: Record<string, ReturnType<typeof summarize>> = {};
  try {
    const workers: Worker[] = [];
    for (let i = 0; i < (options.list ? 0 : options.jobs); i++) {
      const worker = { root: path.join(base, `w${i}`), tmp: path.join(base, `w${i}-tmp`) };
      cloneRepo(worker.root);
      mkdirSync(worker.tmp);
      workers.push(worker);
    }
    for (const file of files) {
      const { results, tests } = await mutateFile(file, options, workers, equivalents[file] ?? {});
      if (options.list) continue;
      summaries[file] = summarize(results);
      console.log(`${file}: ${JSON.stringify(summaries[file])}`);
      report[file] = { summary: summaries[file], tests, mutants: results };
    }
  } finally {
    cleanup();
  }
  if (Object.keys(summaries).length > 1) console.table(summaries);
  if (options.json) {
    mkdirSync(path.dirname(options.json), { recursive: true });
    writeFileSync(options.json, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\nWrote ${options.json}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
