import { NextResponse } from 'next/server';
import { getAdminIdentity } from '@/lib/admin-auth';
import { getAtlasIndex, getAtlasIndexGzip } from '@/lib/language-atlas/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
const JSON_CHUNK_BYTES = 64 * 1024;

/**
 * Vercel rejects non-streaming function responses over 4.5 MB. The atlas index
 * is intentionally complete, so keep the existing client contract while
 * sending it as a real streaming response.
 */
function streamBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      const end = Math.min(offset + JSON_CHUNK_BYTES, bytes.byteLength);
      controller.enqueue(bytes.subarray(offset, end));
      offset = end;
    },
  });
}

function acceptsGzip(request: Request): boolean {
  return (request.headers.get('accept-encoding') ?? '').split(',').some((entry) => {
    const [coding, ...parameters] = entry.trim().toLowerCase().split(';');
    if (coding.trim() !== 'gzip') return false;
    const quality = parameters.map((parameter) => parameter.trim()).find((p) => p.startsWith('q='));
    return quality === undefined || Number(quality.slice(2)) > 0;
  });
}

export async function GET(request: Request) {
  try {
    const identity = await getAdminIdentity();
    if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    const jsonHeaders = {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8',
      Vary: 'Accept-Encoding',
    };
    // Every browser sends gzip: pass the stored snapshot through (4.4 MB instead
    // of 48 MB, and no per-request JSON.stringify of the whole index).
    if (acceptsGzip(request)) {
      return new NextResponse(streamBytes(await getAtlasIndexGzip()), {
        headers: { ...jsonHeaders, 'Content-Encoding': 'gzip' },
      });
    }
    return new NextResponse(
      streamBytes(new TextEncoder().encode(JSON.stringify(await getAtlasIndex()))),
      { headers: jsonHeaders }
    );
  } catch {
    return NextResponse.json(
      { error: 'The language atlas is temporarily unavailable. Please retry.' },
      { status: 503, headers }
    );
  }
}
