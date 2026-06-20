interface Env {
  BIBLE_MEDIA_BUCKET: R2Bucket;
}

const AUDIO_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const CACHEABLE_PREFIXES = ['/audio/bsb/', '/audio/web/'];

type ByteRange = {
  start: number;
  end: number;
};

function isCacheableAudioPath(pathname: string): boolean {
  return CACHEABLE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function objectKeyFromPath(pathname: string): string {
  return decodeURIComponent(pathname.replace(/^\/+/, ''));
}

function contentTypeForKey(key: string): string {
  return key.endsWith('.m4a') ? 'audio/mp4' : 'audio/mpeg';
}

function parseByteRange(value: string | null, size: number): ByteRange | null {
  if (!value) return null;

  const match = value.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    const start = Math.max(size - suffixLength, 0);
    return { start, end: size - 1 };
  }

  const start = Number(rawStart);
  const end = rawEnd ? Number(rawEnd) : size - 1;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return null;
  }

  return { start, end: Math.min(end, size - 1) };
}

function audioHeaders(key: string, size: number): Headers {
  return new Headers({
    'Accept-Ranges': 'bytes',
    'Cache-Control': AUDIO_CACHE_CONTROL,
    'Content-Length': String(size),
    'Content-Type': contentTypeForKey(key),
  });
}

async function readCachedBytes(request: Request): Promise<ArrayBuffer | null> {
  const cached = await caches.default.match(request);
  return cached ? cached.arrayBuffer() : null;
}

async function cacheFullObject(cacheRequest: Request, env: Env, key: string): Promise<void> {
  const object = await env.BIBLE_MEDIA_BUCKET.get(key);
  if (!object?.body) return;

  const response = new Response(object.body, {
    headers: audioHeaders(key, object.size),
    status: 200,
  });
  await caches.default.put(cacheRequest, response);
}

function rangeResponse(
  bytes: ArrayBuffer,
  range: ByteRange,
  key: string,
  size: number,
  cacheStatus: 'HIT' | 'MISS'
): Response {
  const chunk = bytes.slice(range.start, range.end + 1);
  const headers = audioHeaders(key, chunk.byteLength);
  headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
  headers.set('X-EveryBible-Audio-Cache', cacheStatus);

  return new Response(chunk, {
    headers,
    status: 206,
  });
}

async function handleAudio(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const key = objectKeyFromPath(url.pathname);
  const head = await env.BIBLE_MEDIA_BUCKET.head(key);

  if (!head) {
    return new Response('Not found', {
      headers: { 'Cache-Control': 'public, max-age=60' },
      status: 404,
    });
  }

  if (request.method === 'HEAD') {
    const headers = audioHeaders(key, head.size);
    headers.set('X-EveryBible-Audio-Cache', 'HEAD');
    return new Response(null, {
      headers,
      status: 200,
    });
  }

  const cacheRequest = new Request(`${url.origin}${url.pathname}`, { method: 'GET' });
  const range = parseByteRange(request.headers.get('Range'), head.size);

  if (range) {
    const cachedBytes = await readCachedBytes(cacheRequest);
    if (cachedBytes) {
      return rangeResponse(cachedBytes, range, key, head.size, 'HIT');
    }

    ctx.waitUntil(cacheFullObject(cacheRequest, env, key));
    const object = await env.BIBLE_MEDIA_BUCKET.get(key, {
      range: {
        offset: range.start,
        length: range.end - range.start + 1,
      },
    });

    if (!object?.body) {
      return new Response('Range not satisfiable', { status: 416 });
    }

    const headers = audioHeaders(key, range.end - range.start + 1);
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${head.size}`);
    headers.set('X-EveryBible-Audio-Cache', 'MISS');

    return new Response(object.body, {
      headers,
      status: 206,
    });
  }

  const cached = await caches.default.match(cacheRequest);
  if (cached) {
    const response = new Response(cached.body, {
      headers: new Headers(cached.headers),
      status: cached.status,
      statusText: cached.statusText,
    });
    response.headers.set('X-EveryBible-Audio-Cache', 'HIT');
    return response;
  }

  const object = await env.BIBLE_MEDIA_BUCKET.get(key);
  if (!object?.body) return new Response('Not found', { status: 404 });

  const response = new Response(object.body, {
    headers: audioHeaders(key, object.size),
    status: 200,
  });
  response.headers.set('X-EveryBible-Audio-Cache', 'MISS');
  ctx.waitUntil(caches.default.put(cacheRequest, response.clone()));
  return response;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (
      url.hostname !== 'media.everybible.app' ||
      !isCacheableAudioPath(url.pathname) ||
      !['GET', 'HEAD'].includes(request.method)
    ) {
      return fetch(request);
    }

    return handleAudio(request, env, ctx);
  },
};
