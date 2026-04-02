import { NextResponse } from 'next/server';

import { fetchUpstreamTranslations } from '../../../../lib/upstreamTranslationFeed';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getConfiguredApiKey(): string | null {
  const value = process.env.EVERYBIBLE_UPSTREAM_API_KEY;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isAuthorized(request: Request): boolean {
  const configuredApiKey = getConfiguredApiKey();
  if (!configuredApiKey) {
    return false;
  }

  const authorizationHeader = request.headers.get('authorization');
  const apiKeyHeader = request.headers.get('x-api-key');
  const bearerToken = authorizationHeader?.startsWith('Bearer ')
    ? authorizationHeader.slice('Bearer '.length).trim()
    : null;

  return bearerToken === configuredApiKey || apiKeyHeader === configuredApiKey;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const translations = await fetchUpstreamTranslations();
    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        translations,
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown upstream translation feed error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
