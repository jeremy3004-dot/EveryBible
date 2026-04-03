import { S3Client } from '@aws-sdk/client-s3';

import { assertEnv, type EnvMap } from './shared-contracts';

const DEFAULT_PUBLIC_SITE_URL = 'https://everybible.app';
const MEDIA_ROUTE_PREFIX = '/api/media';

export interface BibleMediaEnv {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  secretAccessKey: string;
}

let cachedClient: S3Client | null = null;
let cachedClientCacheKey: string | null = null;

function normalizeSiteUrl(value: string | undefined): string {
  const trimmed = value?.trim();
  const candidate = trimmed && trimmed.length > 0 ? trimmed : DEFAULT_PUBLIC_SITE_URL;
  return candidate.replace(/\/+$/, '');
}

function isUnsafeSegment(segment: string): boolean {
  return segment.length === 0 || segment === '.' || segment === '..' || segment.includes('\\');
}

export function resolveBibleMediaObjectKey(assetPath: string | string[]): string | null {
  const rawSegments = Array.isArray(assetPath)
    ? assetPath
    : assetPath.split('/');

  const segments = rawSegments
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0 || segments.some(isUnsafeSegment)) {
    return null;
  }

  return segments.join('/');
}

export function getBibleMediaPublicBaseUrl(siteUrl = process.env.NEXT_PUBLIC_SITE_URL): string {
  return `${normalizeSiteUrl(siteUrl)}/${MEDIA_ROUTE_PREFIX.replace(/^\/+/, '')}`;
}

export function buildBibleMediaUrl(
  assetPath: string | string[],
  siteUrl = process.env.NEXT_PUBLIC_SITE_URL
): string {
  const objectKey = resolveBibleMediaObjectKey(assetPath);

  if (!objectKey) {
    throw new Error('Invalid Bible media asset path.');
  }

  return `${getBibleMediaPublicBaseUrl(siteUrl)}/${objectKey}`;
}

export function getBibleMediaEnv(env: EnvMap = process.env): BibleMediaEnv {
  assertEnv(
    ['R2_ACCESS_KEY_ID', 'R2_BUCKET', 'R2_ENDPOINT', 'R2_SECRET_ACCESS_KEY'],
    env,
    'Bible media env'
  );

  return {
    accessKeyId: env.R2_ACCESS_KEY_ID!.trim(),
    bucket: env.R2_BUCKET!.trim(),
    endpoint: env.R2_ENDPOINT!.trim(),
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!.trim(),
  };
}

export function getBibleMediaClient(env: BibleMediaEnv): S3Client {
  const cacheKey = JSON.stringify(env);

  if (cachedClient && cachedClientCacheKey === cacheKey) {
    return cachedClient;
  }

  cachedClient = new S3Client({
    region: 'auto',
    endpoint: env.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
  });
  cachedClientCacheKey = cacheKey;

  return cachedClient;
}
