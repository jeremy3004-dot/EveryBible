import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyMaplibreWorker } from '../../scripts/copy-maplibre-worker.mjs';
import { buildAdminSecurityHeaders } from './lib/security-headers.mjs';

// MapLibre's worker must be served from public/ (see lib/maplibre.ts). Copying here rather than
// in a prebuild script means it also happens when a host runs `next build` directly.
copyMaplibreWorker(path.dirname(fileURLToPath(import.meta.url)));

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // The Content-Security-Policy carries a per-request nonce, so middleware.ts sets it.
  async headers() {
    return [{ source: '/:path*', headers: buildAdminSecurityHeaders() }];
  },
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
