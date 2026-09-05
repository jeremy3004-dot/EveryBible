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
