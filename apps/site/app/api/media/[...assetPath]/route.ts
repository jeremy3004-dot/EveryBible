import { resolveBibleMediaObjectKey } from '../../../../lib/bible-media';

export const dynamic = 'force-dynamic';

// Bible media (text databases + chapter audio) is served directly from the
// Cloudflare R2 custom domain rather than being streamed through this route.
// Proxying every byte through the serverless function throttled downloads to
// ~200 KB/s and timed out larger translation databases (the 13 MB Nepali pack
// took ~64s and failed on-device). Redirecting lets the client download
// straight from R2's CDN (~2.5 MB/s) with native HTTP Range support.
//
// The path stays backwards compatible: installed apps that still request
// https://everybible.app/api/media/<key> simply follow the 302 to the fast
// domain, so no app update is required for the fix to take effect.
const DEFAULT_MEDIA_CDN_BASE_URL = 'https://media.everybible.app';

function getMediaCdnBaseUrl(): string {
  const configured = process.env.BIBLE_MEDIA_CDN_BASE_URL?.trim();
  const base = configured && configured.length > 0 ? configured : DEFAULT_MEDIA_CDN_BASE_URL;
  return base.replace(/\/+$/, '');
}

interface RouteContext {
  params: Promise<{
    assetPath?: string[];
  }>;
}

async function handleRequest(_request: Request, context: RouteContext): Promise<Response> {
  const { assetPath = [] } = await context.params;
  const objectKey = resolveBibleMediaObjectKey(assetPath);

  if (!objectKey) {
    return new Response('Not found', { status: 404 });
  }

  const location = `${getMediaCdnBaseUrl()}/${objectKey}`;

  return new Response(null, {
    headers: {
      location,
      'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
    },
    status: 302,
  });
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return handleRequest(request, context);
}

export async function HEAD(request: Request, context: RouteContext): Promise<Response> {
  return handleRequest(request, context);
}
