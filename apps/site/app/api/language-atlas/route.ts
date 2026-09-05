import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A prebuilt public whitelist, independent of the authenticated admin APIs. */
export async function GET() {
  const filename = path.join(process.cwd(), 'data/language-atlas/index.json.gz');
  try {
    await stat(filename);
    return new Response(Readable.toWeb(createReadStream(filename)) as ReadableStream<Uint8Array>, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Encoding': 'gzip',
        'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return Response.json(
      { error: 'The language atlas is temporarily unavailable. Please retry.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
