import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VERSION_PATTERN = /^[a-f0-9]{64}$/;

function acceptsEncoding(header: string, encoding: string) {
  return header.split(',').some((part) => {
    const [name, ...parameters] = part.trim().toLowerCase().split(';');
    if (name !== encoding) return false;
    const quality = parameters.find((parameter) => parameter.trim().startsWith('q='));
    return !quality || Number(quality.trim().slice(2)) > 0;
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ version: string }> }) {
  const { version } = await params;
  if (!VERSION_PATTERN.test(version)) {
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  const acceptEncoding = request.headers.get('accept-encoding') ?? '';
  // Browsers advertise at least gzip. If a simple client omits the header,
  // gzip remains the broadly supported, cacheable response.
  const encoding = acceptsEncoding(acceptEncoding, 'br') ? 'br' : 'gzip';
  if (acceptEncoding && encoding === 'gzip' && !acceptsEncoding(acceptEncoding, 'gzip')) {
    return new Response(null, {
      status: 406,
      headers: { 'Cache-Control': 'no-store', Vary: 'Accept-Encoding' },
    });
  }

  const filename = path.join(
    process.cwd(),
    'data/language-atlas',
    `startup-${version}.json.${encoding === 'gzip' ? 'gz' : 'br'}`
  );
  try {
    const body = await readFile(filename);
    return new Response(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Encoding': encoding,
        'Cache-Control': 'public, max-age=31536000, immutable',
        Vary: 'Accept-Encoding',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
}
