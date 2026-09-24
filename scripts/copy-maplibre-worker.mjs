// Copies MapLibre's worker module and the shared chunk it imports into a web app's
// public/maplibre/ directory, where apps/admin/lib/maplibre.ts points setWorkerUrl.
// MapLibre 6 documents this for Next.js: neither webpack nor Turbopack emits the worker with
// its sibling, so the map would never load tiles. Both apps call this from next.config.mjs
// so it runs for every `next dev` and `next build` however they are invoked, and the copy
// always matches the installed maplibre-gl version.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const WORKER_FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

export function copyMaplibreWorker(appDir) {
  const require = createRequire(path.join(appDir, 'package.json'));
  const dist = path.join(path.dirname(require.resolve('maplibre-gl/package.json')), 'dist');
  const destination = path.join(appDir, 'public', 'maplibre');
  mkdirSync(destination, { recursive: true });
  for (const file of WORKER_FILES)
    copyFileSync(path.join(dist, file), path.join(destination, file));
}
