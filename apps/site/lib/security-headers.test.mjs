import assert from 'node:assert/strict';
import test from 'node:test';

import nextConfig from '../next.config.mjs';
import {
  buildSiteEnforcedCsp,
  buildSiteReportOnlyCsp,
  buildSiteSecurityHeaders,
} from './security-headers.mjs';

function parseCsp(policy) {
  return new Map(
    policy.split(';').map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values];
    })
  );
}

function headerMap(headers) {
  return new Map(headers.map(({ key, value }) => [key.toLowerCase(), value]));
}

test('next.config applies the security headers to every route and hides x-powered-by', async () => {
  const rules = await nextConfig.headers();
  assert.equal(rules.length, 1);
  assert.equal(rules[0].source, '/:path*');
  assert.deepEqual(rules[0].headers, buildSiteSecurityHeaders({ dev: true }));
  assert.equal(nextConfig.poweredByHeader, false);
});

test('HSTS covers subdomains for two years without opting into the preload list', () => {
  const hsts = headerMap(buildSiteSecurityHeaders()).get('strict-transport-security');
  assert.equal(hsts, 'max-age=63072000; includeSubDomains');
  assert.doesNotMatch(hsts, /preload/);
});

test('the baseline headers are present', () => {
  const headers = headerMap(buildSiteSecurityHeaders());
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('x-frame-options'), 'DENY');
  assert.equal(headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(headers.get('cross-origin-opener-policy'), 'same-origin');
  for (const feature of ['camera', 'microphone', 'geolocation', 'payment', 'browsing-topics']) {
    assert.match(headers.get('permissions-policy'), new RegExp(`(^|, )${feature}=\\(\\)`));
  }
});

test('the enforced CSP only restricts framing, <base>, plugins and form targets', () => {
  const enforced = parseCsp(buildSiteEnforcedCsp());
  assert.deepEqual([...enforced.keys()].sort(), [
    'base-uri',
    'form-action',
    'frame-ancestors',
    'object-src',
  ]);
  assert.deepEqual(enforced.get('frame-ancestors'), ["'none'"]);
  assert.deepEqual(enforced.get('object-src'), ["'none'"]);
});

test('the report-only CSP allows what the pages load, including the MapLibre atlas', () => {
  const policy = parseCsp(buildSiteReportOnlyCsp());
  assert.deepEqual(policy.get('default-src'), ["'self'"]);
  assert.ok(policy.get('worker-src').includes("'self'"), 'MapLibre worker from /maplibre/');
  assert.ok(policy.get('connect-src').includes('https://basemaps.cartocdn.com'));
  assert.ok(policy.get('connect-src').includes('https://*.basemaps.cartocdn.com'));
  assert.ok(policy.get('img-src').includes('data:'), 'MapLibre control icons are data: URIs');
  assert.deepEqual(policy.get('frame-ancestors'), ["'none'"]);
  assert.deepEqual(policy.get('report-uri'), ['/api/csp-report']);
});

test('only `next dev` gets eval and websocket allowances', () => {
  const prod = parseCsp(buildSiteReportOnlyCsp({ dev: false }));
  const dev = parseCsp(buildSiteReportOnlyCsp({ dev: true }));
  assert.ok(!prod.get('script-src').includes("'unsafe-eval'"));
  assert.ok(!prod.get('connect-src').includes('ws:'));
  assert.ok(dev.get('script-src').includes("'unsafe-eval'"));
  assert.ok(dev.get('connect-src').includes('ws:'));
});
