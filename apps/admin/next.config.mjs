import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyMaplibreWorker } from '../../scripts/copy-maplibre-worker.mjs';

// MapLibre's worker must be served from public/ (see lib/maplibre.ts). Copying here rather than
// in a prebuild script means it also happens when a host runs `next build` directly.
copyMaplibreWorker(path.dirname(fileURLToPath(import.meta.url)));

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  output: 'standalone',
  outputFileTracingIncludes: {
    '/api/language-atlas': ['./data/language-atlas/index.json.gz'],
    '/api/language-atlas/*': ['./data/language-atlas/details-*.json.gz'],
  },
};

export default nextConfig;
