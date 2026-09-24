import assert from 'node:assert/strict';
import test from 'node:test';

import nextConfig from '../next.config.mjs';
import { buildAdminSecurityHeaders } from './security-headers.mjs';

function headerMap(headers) {
  return new Map(headers.map(({ key, value }) => [key.toLowerCase(), value]));
}

test('next.config applies the static security headers to every route', async () => {
  const rules = await nextConfig.headers();
  assert.equal(rules.length, 1);
  assert.equal(rules[0].source, '/:path*');
  assert.deepEqual(rules[0].headers, buildAdminSecurityHeaders());
  assert.equal(nextConfig.poweredByHeader, false);
});

test('the admin cannot be framed, sniffed or downgraded', () => {
  const headers = headerMap(buildAdminSecurityHeaders());
  assert.equal(headers.get('strict-transport-security'), 'max-age=63072000; includeSubDomains');
  assert.equal(headers.get('x-frame-options'), 'DENY');
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(headers.get('cross-origin-opener-policy'), 'same-origin');
  assert.equal(headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.match(headers.get('permissions-policy'), /(^|, )camera=\(\)/);
});

test('next.config leaves the CSP to middleware so no second, nonce-less policy is sent', () => {
  const headers = headerMap(buildAdminSecurityHeaders());
  assert.equal(headers.has('content-security-policy'), false);
  assert.equal(headers.has('content-security-policy-report-only'), false);
});
