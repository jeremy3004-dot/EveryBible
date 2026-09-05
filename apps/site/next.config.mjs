import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  outputFileTracingRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
  outputFileTracingIncludes: {
    '/api/language-atlas': ['./data/language-atlas/index.json.gz'],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
