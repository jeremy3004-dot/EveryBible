import { NextResponse } from 'next/server';
import { getAdminIdentity } from '@/lib/admin-auth';
import { getAtlasIndex } from '@/lib/language-atlas/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
const JSON_CHUNK_BYTES = 64 * 1024;

/**
 * Vercel rejects non-streaming function responses over 4.5 MB. The atlas index
 * is intentionally complete, so keep the existing client contract while
 * sending the JSON as a real streaming response.
 */
function streamJson(value: unknown): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
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

export async function GET() {
  try {
    const identity = await getAdminIdentity();
    if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    return new NextResponse(streamJson(await getAtlasIndex()), {
      headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch {
    return NextResponse.json(
      { error: 'The language atlas is temporarily unavailable. Please retry.' },
      { status: 503, headers }
    );
  }
}
