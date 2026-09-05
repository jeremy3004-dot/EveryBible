/** CPU regression probe, not a physical Android latency benchmark. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { useAudioStore as AudioStore } from '../src/stores/audioStore';

const root = fileURLToPath(new URL('../', import.meta.url));
const storePath = 'src/stores/audioStore.ts';
const baseline = execFileSync(
  'git',
  ['rev-parse', '--verify', `${process.argv[2] ?? 'HEAD'}^{commit}`],
  {
    cwd: root,
    encoding: 'utf8',
  }
).trim();
const beforeSource = execFileSync('git', ['show', `${baseline}:${storePath}`], {
  cwd: root,
  encoding: 'utf8',
});
const afterSource = readFileSync(new URL(`../${storePath}`, import.meta.url), 'utf8');
const localRequire = createRequire(new URL(`../${storePath}`, import.meta.url));

function makeStore(source: string, queueLength: number) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const values = new Map<string, string>();
  const counts = { serializations: 0, nativeReads: 0, nativeWrites: 0, notifications: 0 };
  const exports = {} as { useAudioStore: typeof AudioStore };
  const middleware = localRequire('zustand/middleware');
  runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      if (name === './mmkvStorage')
        return {
          zustandStorage: {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => {
              // Mirror mmkvStorage's equality check, without simulating native I/O latency.
              counts.nativeReads += 1;
              if (values.get(key) !== value) {
                counts.nativeWrites += 1;
                values.set(key, value);
              }
            },
            removeItem: (key: string) => values.delete(key),
          },
        };
      if (name === 'zustand/middleware')
        return {
          ...middleware,
          createJSONStorage: (...args: Parameters<typeof middleware.createJSONStorage>) => {
            const storage = middleware.createJSONStorage(...args);
            return {
              ...storage,
              setItem: (...setArgs: unknown[]) => {
                counts.serializations += 1;
                return storage.setItem(...setArgs);
              },
            };
          },
        };
      return localRequire(name);
    },
  });
  const store = exports.useAudioStore;
  store.getState().setCurrentTrack('bsb', 'PSA', 119);
  for (let chapter = 1; chapter <= queueLength; chapter++) {
    store.getState().addToQueue('bsb', 'PSA', chapter);
  }
  store.subscribe(() => {
    counts.notifications += 1;
  });
  return { store, counts };
}

function runMinute(store: typeof AudioStore) {
  const actions = store.getState();
  actions.setPosition(0);
  // Four interpolation updates/second, plus a native snapshot each second.
  for (let position = 250; position <= 60_000; position += 250) {
    actions.setPosition(position);
    if (position % 1000 === 0) {
      actions.setPosition(position);
      actions.setDuration(90_000);
      actions.setStatus('playing');
    }
  }
  assert.equal(store.getState().currentPosition, 60_000);
  assert.equal(store.getState().lastPosition, 60_000);
}

const percentile = (values: number[], fraction: number) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
const results = [];
for (const queueLength of [0, 30]) {
  const before = makeStore(beforeSource, queueLength);
  const after = makeStore(afterSource, queueLength);
  const timings = { before: [] as number[], after: [] as number[] };
  for (let sample = 0; sample < 28; sample++) {
    const order = sample % 2 ? (['after', 'before'] as const) : (['before', 'after'] as const);
    for (const name of order) {
      const subject = name === 'before' ? before : after;
      const start = performance.now();
      for (let iteration = 0; iteration < 10; iteration++) runMinute(subject.store);
      if (sample >= 3) timings[name].push((performance.now() - start) / 10);
    }
  }
  const beforeMs = percentile(timings.before, 0.5);
  const afterMs = percentile(timings.after, 0.5);
  const improvementPercent = (1 - afterMs / beforeMs) * 100;
  const workCounts = (subject: typeof before) => {
    for (const key of Object.keys(subject.counts) as (keyof typeof subject.counts)[])
      subject.counts[key] = 0;
    runMinute(subject.store);
    return { ...subject.counts };
  };
  results.push({
    queueLength,
    samples: timings.before.length,
    beforeMedianMs: beforeMs,
    afterMedianMs: afterMs,
    improvementPercent,
    beforeP95Ms: percentile(timings.before, 0.95),
    afterP95Ms: percentile(timings.after, 0.95),
    beforeWorkPerMinute: workCounts(before),
    afterWorkPerMinute: workCounts(after),
  });
}
console.log(
  JSON.stringify(
    {
      benchmark: 'Actual audio store actions with native storage mocked; one simulated minute',
      baseline,
      node: process.version,
      platform: process.platform,
      targetReductionPercent: 40,
      results,
    },
    null,
    2
  )
);
