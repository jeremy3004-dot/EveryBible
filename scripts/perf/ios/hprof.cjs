#!/usr/bin/env node
// Summarises a Hermes sampled trace (HermesRuntime dumpSampledTraceToFile) from a
// release build, symbolicated with the build's composed Hermes source map
// (SOURCEMAP_FILE during the Xcode bundle phase). See
// docs/research/ios-profiling-2026-10-01.md and scripts/perf/ios/ebperf.py.
//
//   node hprof.cjs TRACE.json MAP [--top N] [--from-epoch MS --to-epoch MS]
//                  [--interactions] [--stacks REGEX]
//
// With TRACE.json.meta.json beside it (written by ebperf.py), times are shown from the
// process start, or from --from-epoch; --interactions prints one summary per touch:end
// window. "JS busy" counts samples whose stack is not the idle root.
const fs = require('fs');
const path = require('path');

const { SourceMapConsumer } = require(
  path.join(__dirname, '..', '..', '..', 'node_modules', 'source-map')
);

const [tracePath, mapPath, ...rest] = process.argv.slice(2);
const opt = {};
for (let i = 0; i < rest.length; i += 1) {
  const key = rest[i].replace(/^--/, '');
  const value = rest[i + 1];
  if (value === undefined || value.startsWith('--')) opt[key] = true;
  else {
    opt[key] = value;
    i += 1;
  }
}
const TOP = Number(opt.top ?? 25);

const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
const meta = fs.existsSync(`${tracePath}.meta.json`)
  ? JSON.parse(fs.readFileSync(`${tracePath}.meta.json`, 'utf8'))
  : null;
const consumer = new SourceMapConsumer(JSON.parse(fs.readFileSync(mapPath, 'utf8')));
const frames = trace.stackFrames;

// Hermes source maps use line 1 and the bytecode address as the column. Frames in
// compiler-generated code have no mapping; they are attributed (marked ~) to the
// nearest mapped code before them, and left out of the per-file table.
const mapped = [];
consumer.eachMapping((m) => {
  if (m.source && m.generatedLine === 1) mapped.push([m.generatedColumn, m.source, m.originalLine]);
});
mapped.sort((a, b) => a[0] - b[0]);
function nearestBefore(addr) {
  let lo = 0;
  let hi = mapped.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (mapped[mid][0] <= addr) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best >= 0 ? mapped[best] : null;
}
const locCache = new Map();
function loc(addr) {
  if (locCache.has(addr)) return locCache.get(addr);
  const p = consumer.originalPositionFor({ line: 1, column: addr });
  let v = p.source ? { file: p.source.replace(/^\//, ''), line: p.line, approx: false } : null;
  if (!v && addr > 0) {
    const n = nearestBefore(addr);
    if (n) v = { file: n[1].replace(/^\//, ''), line: n[2], approx: true };
  }
  locCache.set(addr, v);
  return v;
}
const infoCache = new Map();
function info(id) {
  if (infoCache.has(id)) return infoCache.get(id);
  const f = frames[id];
  let r;
  if (!f || f.category !== 'JavaScript') {
    r = { key: f ? f.name : '?', fn: f ? f.name : '?', file: null, approx: false };
  } else {
    const start = loc(Number(f.funcVirtAddr));
    const at = loc(Number(f.funcVirtAddr) + Number(f.offset));
    const where = start || at;
    const fn = f.name || '(anonymous)';
    r = {
      key: `${fn} ${where ? `${where.approx ? '~' : ''}${where.file}:${where.line}` : '?'}`,
      fn,
      file: where ? where.file : null,
      line: at ? at.line : null,
      approx: Boolean(where && where.approx),
    };
  }
  infoCache.set(id, r);
  return r;
}
function stack(sf) {
  const out = [];
  let id = String(sf);
  while (id && frames[id]) {
    out.push(info(id));
    id = frames[id].parent != null ? String(frames[id].parent) : null;
  }
  return out; // leaf first
}

const allSamples = trace.samples.map((s) => ({ ts: Number(s.ts) / 1000, sf: String(s.sf) }));
for (let i = 0; i < allSamples.length; i += 1) {
  allSamples[i].w = i + 1 < allSamples.length ? allSamples[i + 1].ts - allSamples[i].ts : 1;
}
const isBusy = (s) => frames[s.sf] && frames[s.sf].category !== 'root' && s.sf !== '1';
const toEpoch = (ts) => (meta ? ts + meta.uptime_offset_ms : ts);

function table(title, map) {
  console.log(`\n${title}`);
  [...map]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP)
    .forEach(([k, v]) => console.log(`${v.toFixed(1).padStart(8)} ms  ${k}`));
}

function summarize(fromEpoch, toEpochMs, label) {
  const samples = allSamples.filter((s) => {
    const t = toEpoch(s.ts);
    return (fromEpoch == null || t >= fromEpoch) && (toEpochMs == null || t <= toEpochMs);
  });
  if (samples.length === 0) return;
  const origin = fromEpoch ?? (meta && meta.proc_start_ms) ?? toEpoch(samples[0].ts);
  const rel = (s) => toEpoch(s.ts) - origin;
  const busy = samples.filter(isBusy);
  const total = busy.reduce((a, s) => a + s.w, 0);
  let lastBusy = null;
  for (const s of samples) {
    if (isBusy(s)) lastBusy = rel(s);
    else if (lastBusy != null && rel(s) - lastBusy >= 100) break;
  }
  console.log(`\n===== ${label}`);
  console.log(
    `JS busy ${total.toFixed(0)} ms; settles (before a 100 ms idle gap) at ${
      lastBusy == null ? '-' : lastBusy.toFixed(0)
    } ms`
  );
  const buckets = new Map();
  for (const s of busy) {
    const b = Math.floor(rel(s) / 100) * 100;
    buckets.set(b, (buckets.get(b) ?? 0) + s.w);
  }
  console.log(
    'busy per 100 ms: ' +
      [...buckets]
        .sort((a, b) => a[0] - b[0])
        .map(([b, v]) => `${b}:${v.toFixed(0)}`)
        .join('  ')
  );
  const self = new Map();
  const moduleSelf = new Map();
  const appFiles = new Map();
  const stacks = new Map();
  const re = opt.stacks ? new RegExp(opt.stacks) : null;
  for (const s of busy) {
    const st = stack(s.sf);
    self.set(st[0].key, (self.get(st[0].key) ?? 0) + s.w);
    const seen = new Set();
    let module = null;
    for (let i = 0; i < st.length; i += 1) {
      const f = st[i];
      const parent = st[i + 1];
      if (!module && parent && parent.fn === 'loadModuleImplementation' && f.file) module = f.file;
      if (f.file && !f.approx && f.file.startsWith('src/') && !seen.has(f.file)) {
        seen.add(f.file);
        appFiles.set(f.file, (appFiles.get(f.file) ?? 0) + s.w);
      }
    }
    if (module) moduleSelf.set(module, (moduleSelf.get(module) ?? 0) + s.w);
    if (re && st.some((f) => re.test(f.key))) {
      const k = st
        .slice(0, 12)
        .map((f) => `${f.fn}@${(f.file || '').split('/').slice(-2).join('/')}:${f.line ?? ''}`)
        .join(' < ');
      stacks.set(k, (stacks.get(k) ?? 0) + s.w);
    }
  }
  table('Self time by function:', self);
  table('Module evaluation (deepest module factory on the stack):', moduleSelf);
  table('App source files on the stack (inclusive):', appFiles);
  if (re) table(`Stacks matching ${opt.stacks}:`, stacks);
}

if (meta && opt.interactions) {
  const touches = meta.marks.filter((m) => m[1] === 'touch:end');
  touches.forEach((touch, i) => {
    const next = touches[i + 1];
    summarize(touch[2], next ? next[2] - 50 : touch[2] + 1700, `touch:end ${i} at ${touch[2]}`);
  });
} else {
  if (meta && meta.proc_start_ms && !opt['from-epoch']) {
    console.log(
      'marks (ms from process start): ' +
        meta.marks
          .map((m) => `${m[1]}${m[3] ? `(${m[3]})` : ''}@${(m[2] - meta.proc_start_ms).toFixed(0)}`)
          .join('  ')
    );
  }
  summarize(
    opt['from-epoch'] ? Number(opt['from-epoch']) : null,
    opt['to-epoch'] ? Number(opt['to-epoch']) : null,
    path.basename(tracePath)
  );
}
