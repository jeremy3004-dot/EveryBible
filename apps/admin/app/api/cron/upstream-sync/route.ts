import { NextResponse } from 'next/server';

import { runUpstreamTranslationSync } from '@/lib/upstream-sync';

// Daily upstream translation sync (Phase 4). Before this the sync only ever ran
// when an admin clicked the button — it ran once, failed, and was never retried,
// leaving the whole catalog "Not versioned yet". This route is invoked by the
// Vercel cron declared in vercel.json.
//
// Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET
// is set on the project. We require it so the endpoint can't be triggered by the
// public internet.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 });
  }
  const authorization = request.headers.get('authorization');
  if (authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // triggered_by is a nullable FK to profiles — cron runs have no admin actor.
    const result = await runUpstreamTranslationSync(null);
    return NextResponse.json(
      { ok: true, ranAt: new Date().toISOString(), result },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upstream sync cron failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
