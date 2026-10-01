/**
 * Regenerates apps/site/data/plans.json and the web covers in
 * apps/site/public/plans/covers/ from the mobile app's bundled plan catalog,
 * its English text and its cover art. Run after changing a plan in the app:
 *
 *   npm run plans:pages --workspace @everybible/site           # write
 *   npm run plans:pages:check --workspace @everybible/site     # fail if stale
 *
 * Covers are resized to 800 px WebP with cwebp (brew install webp), falling
 * back to ImageMagick. lib/plan-snapshot.test.ts regenerates the JSON in
 * memory on every test run, so the site cannot drift from the app unnoticed.
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readingPlanEntriesByPlanId, readingPlans } from '../../../src/data/readingPlans.generated';
import { en } from '../../../src/i18n/locales/en';
import { buildPlanSnapshot, formatPlanSnapshot, type PlanSnapshot } from '../lib/plan-snapshot';

const repoRoot = new URL('../../../', import.meta.url);
const coverMapFile = new URL('src/services/plans/readingPlanAssets.ts', repoRoot);
const appCovers = new URL('assets/plans/covers/', repoRoot);
export const PLANS_JSON = new URL('../data/plans.json', import.meta.url);
export const WEB_COVERS = new URL('../public/plans/covers/', import.meta.url);

const COVER_WIDTH = 800;
const COVER_QUALITY = 82;

/** A dotted i18n key looked up in en.ts, e.g. readingPlans.psalms30.title. */
function englishText(key: string): string | undefined {
  let value: unknown = en;
  for (const part of key.split('.')) {
    if (typeof value !== 'object' || value === null) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return typeof value === 'string' ? value : undefined;
}

/**
 * Cover key to PNG stem, read from the app's require() map
 * (readingPlanAssets.ts), which can't be imported outside React Native.
 * Keys and files differ: `river` uses shore.png.
 */
export function readCoverFiles(): Record<string, string> {
  const source = readFileSync(coverMapFile, 'utf8');
  const pattern =
    /^\s*(\w+): require\('\.\.\/\.\.\/\.\.\/assets\/plans\/covers\/([\w-]+)\.png'\)/gm;
  const files = Object.fromEntries(
    [...source.matchAll(pattern)].map(([, key, file]) => [key, file])
  );
  if (Object.keys(files).length === 0)
    throw new Error(`No covers found in ${coverMapFile.pathname}`);
  return files;
}

export function generatePlanSnapshot(): PlanSnapshot {
  return buildPlanSnapshot({
    plans: readingPlans,
    entriesByPlanId: readingPlanEntriesByPlanId,
    text: englishText,
    coverFiles: readCoverFiles(),
  });
}

function run(command: string, args: string[]): boolean {
  const result = spawnSync(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') return false;
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr?.toString()}`);
  return true;
}

function encodeCover(stem: string): void {
  const input = fileURLToPath(new URL(`${stem}.png`, appCovers));
  const output = fileURLToPath(new URL(`${stem}.webp`, WEB_COVERS));
  const width = String(COVER_WIDTH);
  const quality = String(COVER_QUALITY);
  if (
    run('cwebp', ['-quiet', '-q', quality, '-m', '6', '-resize', width, '0', input, '-o', output])
  )
    return;
  if (run('magick', [input, '-resize', `${width}x`, '-quality', quality, output])) return;
  throw new Error('Install cwebp (brew install webp) or ImageMagick to encode the covers');
}

function main(): void {
  const check = process.argv.includes('--check');
  const snapshot = generatePlanSnapshot();
  const json = formatPlanSnapshot(snapshot);
  const covers = [...new Set(snapshot.plans.map((plan) => plan.cover))].sort();
  const coverFile = (stem: string) => new URL(`${stem}.webp`, WEB_COVERS);

  if (check) {
    const stale = !existsSync(PLANS_JSON) || readFileSync(PLANS_JSON, 'utf8') !== json;
    const missing = covers.filter((stem) => !existsSync(coverFile(stem)));
    if (stale) console.error('data/plans.json is out of date; run npm run plans:pages');
    if (missing.length) console.error(`Missing covers: ${missing.join(', ')}`);
    process.exitCode = stale || missing.length ? 1 : 0;
    return;
  }

  writeFileSync(PLANS_JSON, json);
  mkdirSync(WEB_COVERS, { recursive: true });
  const wanted = new Set(covers.map((stem) => `${stem}.webp`));
  for (const name of readdirSync(WEB_COVERS))
    if (!wanted.has(name)) rmSync(new URL(name, WEB_COVERS));
  covers.forEach(encodeCover);

  const bytes = covers.reduce((sum, stem) => sum + statSync(coverFile(stem)).size, 0);
  console.log(
    `Wrote ${snapshot.plans.length} plans to data/plans.json (${(json.length / 1024).toFixed(0)} KB) ` +
      `and ${covers.length} covers (${(bytes / 1024).toFixed(0)} KB)`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
