import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  outputFileTracingRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
  outputFileTracingIncludes: {
    '/api/language-atlas': ['./data/language-atlas/index.json.gz'],
    '/api/language-atlas/startup/*': [
      './data/language-atlas/startup-*.json.br',
      './data/language-atlas/startup-*.json.gz',
    ],
    // Languages outside the prerendered set render on first request from one
    // ~30 KB shard; the full atlas snapshot is never loaded for a page.
    '/languages/[slug]': ['./data/language-atlas/pages/*'],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
