import { NextResponse } from 'next/server';
import { getAdminIdentity } from '@/lib/admin-auth';
import { getAtlasDetail } from '@/lib/language-atlas/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await getAdminIdentity();
    if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    const { id } = await context.params;
    const detail = await getAtlasDetail(id);
    if (!detail) return NextResponse.json({ error: 'Record not found' }, { status: 404, headers });
    return NextResponse.json(detail, { headers });
  } catch {
    return NextResponse.json(
      { error: 'This language profile is temporarily unavailable. Please retry.' },
      { status: 503, headers }
    );
  }
}
