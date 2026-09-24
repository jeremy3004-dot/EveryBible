import * as maplibregl from 'maplibre-gl';

// MapLibre 6 is ESM-only and runs its tile worker from a separate module file. Under Next.js
// neither bundler emits that file with its `maplibre-gl-shared.mjs` sibling, so the map mounts
// but never loads a tile. `scripts/copy-maplibre-worker.mjs` copies both files from the
// installed package into each web app's `public/maplibre/` (from next.config.mjs, so it runs
// for every `next dev` and `next build`), and every map imports MapLibre through this module
// so the worker URL is set before the first map is created. The site imports the admin atlas
// components, so this path must stay the same in both apps.
export const MAPLIBRE_WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';

maplibregl.setWorkerUrl(MAPLIBRE_WORKER_URL);

export { maplibregl };
