import { NextResponse } from 'next/server';

import type { MobileContentOverridePayload } from '../../../../lib/shared-contracts';

import { createSiteServiceClient } from '../../../../lib/supabase/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const service = createSiteServiceClient();
    const { data, error } = await service.rpc('get_live_mobile_content');

    if (error) {
      throw new Error(`Unable to load shared mobile content: ${error.message}`);
    }

    const payload = (data ?? null) as MobileContentOverridePayload | null;

    if (!payload) {
      throw new Error('Shared mobile content contract returned no payload');
    }

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown mobile content error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
