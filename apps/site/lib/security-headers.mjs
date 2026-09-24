// HTTP security headers for everybible.app, applied to every route from next.config.mjs.
// See docs/research/web-security-headers-2026-09-24.md for the audit and the plan for moving
// the Report-Only policy to enforcement.
//
// The site's pages are prerendered, so a per-request CSP nonce is not possible and Next.js's
// inline bootstrap scripts (self.__next_f.push) need 'unsafe-inline'. The full policy therefore
// ships as Content-Security-Policy-Report-Only while a small enforced policy covers the
// directives that cannot break rendering (framing, <base>, plugins, form targets).

/** CARTO serves the atlas basemap: style JSON, sprites and glyphs on basemaps/tiles, and vector
 * tiles on tiles-{a..d}. See apps/admin/lib/atlas-basemap.ts. */
export const MAP_CONNECT_SOURCES = [
  'https://basemaps.cartocdn.com',
  'https://*.basemaps.cartocdn.com',
];

export const CSP_REPORT_PATH = '/api/csp-report';

/** @param {Record<string, string[]>} directives */
export function serializeCsp(directives) {
  return Object.entries(directives)
    .map(([name, values]) => (values.length > 0 ? `${name} ${values.join(' ')}` : name))
    .join('; ');
}

/** Directives enforced today: none of them governs how a page loads its own resources. */
export function buildSiteEnforcedCsp() {
  return serializeCsp({
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'object-src': ["'none'"],
  });
}

/**
 * The full policy the site is working toward, reported but not enforced.
 * @param {{ dev?: boolean }} [options]
 */
export function buildSiteReportOnlyCsp({ dev = false } = {}) {
  return serializeCsp({
    'default-src': ["'self'"],
    // Next.js inlines its flight data and bootstrap on static pages; `next dev` also evals.
    'script-src': ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    // React renders style="" attributes and MapLibre's stylesheet ships inline SVG icons.
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    // next/font and the Alte Haas files are self-hosted under /_next/static and /fonts.
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", ...MAP_CONNECT_SOURCES, ...(dev ? ['ws:'] : [])],
    // MapLibre runs its tile worker from /maplibre/maplibre-gl-worker.mjs.
    'worker-src': ["'self'", 'blob:'],
    'media-src': ["'self'"],
    'manifest-src': ["'self'"],
    'frame-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'object-src': ["'none'"],
    'report-uri': [CSP_REPORT_PATH],
  });
}

/** Features the site never uses; denying them also denies any embedded third party. */
export const PERMISSIONS_POLICY = [
  'accelerometer=()',
  'autoplay=()',
  'browsing-topics=()',
  'camera=()',
  'display-capture=()',
  'geolocation=()',
  'gyroscope=()',
  'magnetometer=()',
  'microphone=()',
  'payment=()',
  'usb=()',
].join(', ');

/**
 * @param {{ dev?: boolean }} [options]
 * @returns {{ key: string, value: string }[]}
 */
export function buildSiteSecurityHeaders({ dev = false } = {}) {
  return [
    // No preload: submitting everybible.app to the browser preload list is the owner's call.
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    { key: 'Content-Security-Policy', value: buildSiteEnforcedCsp() },
    { key: 'Content-Security-Policy-Report-Only', value: buildSiteReportOnlyCsp({ dev }) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // Legacy counterpart of frame-ancestors for browsers without CSP level 2.
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ];
}
