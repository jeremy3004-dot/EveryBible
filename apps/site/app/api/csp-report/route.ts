// Receives violation reports from the site's Content-Security-Policy-Report-Only header
// (lib/security-headers.mjs) and writes one compact line per violation to the function logs,
// so the policy can be tightened and enforced from real traffic. Browsers post either the
// legacy `application/csp-report` body or a Reporting API array; both are accepted.

import { parseCspReports } from '../../../lib/csp-report';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 16 * 1024;

export async function POST(request: Request): Promise<Response> {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return new Response(null, { status: 413 });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }

  for (const violation of parseCspReports(body)) {
    console.warn('[csp-report]', JSON.stringify(violation));
  }
  return new Response(null, { status: 204 });
}
