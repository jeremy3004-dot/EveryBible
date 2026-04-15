import { NextResponse } from 'next/server';

import { resolveSmartDownloadTarget } from '../../lib/site-links';

export function GET(request: Request) {
  const target = resolveSmartDownloadTarget(request.headers.get('user-agent'));

  return NextResponse.redirect(target, 307);
}
