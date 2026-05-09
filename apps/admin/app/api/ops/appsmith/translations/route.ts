import { NextResponse } from 'next/server';

import { authorizeAppsmithOpsRequest, getOpsTranslationCatalogStatus } from '@/lib/appsmith-ops';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
export const runtime = 'nodejs';

function json(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set('Cache-Control', 'no-store, max-age=0');
  headers.set('X-Content-Type-Options', 'nosniff');

  return NextResponse.json(data, {
    ...init,
    headers,
  });
}

export async function GET(request: Request) {
  const auth = authorizeAppsmithOpsRequest(request);
  if (!auth.ok) {
    return json(
      {
        error:
          auth.reason === 'missing_key' ? 'Appsmith ops API is not configured.' : 'Unauthorized',
        reason: auth.reason,
      },
      { status: auth.reason === 'missing_key' ? 503 : 401 }
    );
  }

  try {
    return json(await getOpsTranslationCatalogStatus());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown translation ops error';
    return json({ error: message }, { status: 500 });
  }
}
