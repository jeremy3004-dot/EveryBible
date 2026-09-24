import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import { mockModule } from './testing/adminTestHarness';
import { buildAdminContentSecurityPolicy, createCspNonce } from './content-security-policy';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.test';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'publishable-key';
process.env.NEXT_PUBLIC_ADMIN_URL = 'https://admin.example';

let claims: Record<string, unknown> | null = null;
mockModule(mock, '@supabase/ssr', {
  createServerClient: () => ({
    auth: { getClaims: async () => ({ data: claims ? { claims } : null, error: null }) },
  }),
});

const { NextRequest } = await import('next/server');
const { middleware } = await import('../middleware');

function parseCsp(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(';').map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values] as [string, string[]];
    })
  );
}

const policy = parseCsp(
  buildAdminContentSecurityPolicy({ nonce: 'abc123', supabaseUrl: 'https://proj.supabase.co' })
);

test('scripts run only with the request nonce; no unsafe-inline or eval in production', () => {
  assert.deepEqual(policy.get('script-src'), ["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
});

test('the admin cannot be framed and loads nothing through plugins, frames or a foreign <base>', () => {
  assert.deepEqual(policy.get('frame-ancestors'), ["'none'"]);
  assert.deepEqual(policy.get('frame-src'), ["'none'"]);
  assert.deepEqual(policy.get('object-src'), ["'none'"]);
  assert.deepEqual(policy.get('base-uri'), ["'self'"]);
  assert.deepEqual(policy.get('form-action'), ["'self'"]);
});

test('the policy allows the fonts, basemap, MapLibre worker and Supabase audio the pages use', () => {
  assert.ok(policy.get('style-src')?.includes('https://fonts.googleapis.com'));
  assert.ok(policy.get('font-src')?.includes('https://fonts.gstatic.com'));
  assert.ok(policy.get('connect-src')?.includes('https://*.basemaps.cartocdn.com'));
  assert.ok(policy.get('connect-src')?.includes('https://basemaps.cartocdn.com'));
  assert.ok(policy.get('connect-src')?.includes('https://proj.supabase.co'));
  assert.ok(policy.get('connect-src')?.includes('wss://proj.supabase.co'));
  assert.ok(policy.get('media-src')?.includes('https://proj.supabase.co'));
  assert.ok(policy.get('worker-src')?.includes("'self'"));
});

test('a missing or malformed Supabase URL is left out rather than breaking the policy', () => {
  for (const supabaseUrl of [undefined, 'not a url']) {
    const p = parseCsp(buildAdminContentSecurityPolicy({ nonce: 'n', supabaseUrl }));
    assert.deepEqual(p.get('media-src'), ["'self'"]);
  }
});

test('only `next dev` gets eval and websocket allowances', () => {
  const dev = parseCsp(buildAdminContentSecurityPolicy({ nonce: 'n', dev: true }));
  assert.ok(dev.get('script-src')?.includes("'unsafe-eval'"));
  assert.ok(dev.get('connect-src')?.includes('ws:'));
  assert.ok(!policy.get('connect-src')?.includes('ws:'));
});

test('nonces are fresh 128-bit base64 values', () => {
  const a = createCspNonce();
  const b = createCspNonce();
  assert.notEqual(a, b);
  assert.equal(Buffer.from(a, 'base64').length, 16);
});

test('middleware enforces the CSP and forwards the same nonce to rendering', async () => {
  claims = { sub: 'user-7' };
  const response = await middleware(new NextRequest('https://admin.example/analytics'));
  const csp = response.headers.get('content-security-policy');
  assert.ok(csp, 'enforced policy is set');
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
  assert.ok(nonce);
  // NextResponse.next({ request }) forwards overridden request headers under this prefix.
  assert.equal(response.headers.get('x-middleware-request-x-nonce'), nonce);
  assert.equal(response.headers.get('x-middleware-request-content-security-policy'), csp);
  assert.ok(parseCsp(csp).get('media-src')?.includes('https://project.supabase.test'));
});

test('middleware also sets the CSP on the signed-out redirect', async () => {
  claims = null;
  const response = await middleware(new NextRequest('https://admin.example/analytics'));
  assert.ok(response.headers.get('location')?.endsWith('/login?reason=auth'));
  assert.match(response.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
});

test('each request gets its own nonce', async () => {
  claims = { sub: 'user-7' };
  const first = await middleware(new NextRequest('https://admin.example/'));
  const second = await middleware(new NextRequest('https://admin.example/'));
  assert.notEqual(
    first.headers.get('x-middleware-request-x-nonce'),
    second.headers.get('x-middleware-request-x-nonce')
  );
});
