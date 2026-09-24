// Static HTTP security headers for admin.everybible.app, applied to every route (including
// /_next/static and /maplibre assets the middleware skips) from next.config.mjs. The
// Content-Security-Policy itself carries a per-request nonce, so middleware.ts sets it; see
// lib/content-security-policy.ts and docs/research/web-security-headers-2026-09-24.md.

/** Features the admin never uses; denying them also denies any embedded third party. */
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

/** @returns {{ key: string, value: string }[]} */
export function buildAdminSecurityHeaders() {
  return [
    // No preload: submitting the domain to the browser preload list is the owner's call.
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // Legacy counterpart of the CSP's frame-ancestors 'none'.
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  ];
}
