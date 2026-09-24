# Web security headers — everybible.app and admin.everybible.app (2026-09-24)

## What was live before this change

`curl -sI` against production on 2026-09-24:

| URL | Security headers present |
| --- | --- |
| `https://everybible.app/` | `strict-transport-security: max-age=63072000` (Vercel default) only |
| `https://everybible.app/languages` | same |
| `https://everybible.app/api/media` | same (the route is a 302 to `media.everybible.app`, no page loads it) |
| `https://admin.everybible.app/login` | same, plus `x-powered-by: Next.js` |

Missing everywhere: Content-Security-Policy, `frame-ancestors`/`X-Frame-Options` (both apps,
including the admin, could be framed for clickjacking), `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`. HSTS lacked
`includeSubDomains`.

Not changed: prerendered site pages carry `access-control-allow-origin: *`, which Vercel adds to
static responses. It exposes nothing that is not already public.

## What each app now sends

Both apps: `poweredByHeader: false`, and on every route (`/:path*`, from `next.config.mjs`):

- `Strict-Transport-Security: max-age=63072000; includeSubDomains`. No `preload`: adding the
  domain to the browser preload list is hard to undo and is the owner's call. Known subdomains
  (`www`, `admin`, `media` on Cloudflare R2) all serve HTTPS. Any future subdomain must too.
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (legacy counterpart of `frame-ancestors 'none'`)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`: accelerometer, autoplay, browsing-topics, camera, display-capture,
  geolocation, gyroscope, magnetometer, microphone, payment, usb all set to `()`
- `Cross-Origin-Opener-Policy: same-origin` (no page relies on popups talking back; the PayPal
  and store links are plain `target="_blank"` links)
- Admin only: `Cross-Origin-Resource-Policy: same-origin`

### Site (`apps/site/lib/security-headers.mjs`)

Site pages are prerendered (static/SSG), so they cannot carry a per-request nonce. Next.js's
inline bootstrap scripts (`self.__next_f.push(...)`) therefore need `'unsafe-inline'`, which
makes a strict enforced policy impossible without making every page dynamic. So the site sends
two policies:

- **Enforced** `Content-Security-Policy`: `base-uri 'self'; form-action 'self';
  frame-ancestors 'none'; object-src 'none'`. None of these govern how a page loads its own
  resources, so they cannot break rendering.
- **Report-Only** `Content-Security-Policy-Report-Only`: `default-src 'self'`, scripts
  `'self' 'unsafe-inline'`, styles `'self' 'unsafe-inline'`, images `'self' data: blob:`, fonts
  `'self' data:`, connect `'self'` plus CARTO (`basemaps.cartocdn.com`, `*.basemaps.cartocdn.com`),
  worker `'self' blob:` (MapLibre worker at `/maplibre/maplibre-gl-worker.mjs`), `frame-src
  'none'`, and the four directives above. Reports go to `report-uri /api/csp-report`, which logs
  one `[csp-report] {...}` line per violation to the Vercel function logs (body capped at 16 KB,
  10 reports per request).

`next dev` adds `'unsafe-eval'` and `ws:` so React Refresh and HMR work.

### Admin (`apps/admin/lib/content-security-policy.ts`, `middleware.ts`)

The admin is fully per-request rendered (auth-gated, `no-store`), so it **enforces** a
nonce-based policy:

- `middleware.ts` creates a 128-bit nonce per request, puts the policy on the request (Next.js
  reads the nonce from the request's CSP header and stamps it on its own scripts) and on the
  response, including the signed-out redirect to `/login`.
- `app/layout.tsx` reads `x-nonce` for the `beforeInteractive` theme bootstrap `<Script>`.
  Reading `headers()` in the root layout also keeps every page dynamic; a prerendered page would
  have no nonce and its scripts would be blocked.
- `script-src 'self' 'nonce-…' 'strict-dynamic'` (no `'unsafe-inline'`, no eval in production).
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` (React server-renders `style=""`
  attributes), `font-src 'self' data: https://fonts.gstatic.com`.
- `connect-src 'self'`, the Supabase project (`https://` and `wss://`), and CARTO.
- `img-src`/`media-src` include the Supabase origin: feedback audio plays from signed Storage URLs.
- `worker-src 'self' blob:`, `frame-src 'none'`, `object-src 'none'`, `base-uri 'self'`,
  `form-action 'self'`, `frame-ancestors 'none'`.

`next.config.mjs` does not set a CSP for the admin, so no second nonce-less policy is sent.

## Verification (local `next build` + `next start`)

- Headers confirmed with `curl -sI` on both apps.
- Site home (MapLibre globe), `/languages`, `/languages/abau-aau` loaded in a browser with zero
  report-only violations. The report path was checked with a deliberate `fetch` to a disallowed
  host, which arrived at `/api/csp-report` and was logged.
- Admin `/login` under the enforced policy: all 14 scripts carry the nonce, React hydrated, the
  theme bootstrap ran, Google Fonts loaded. From that page, the MapLibre module worker started and
  CARTO style, TileJSON, vector tile, glyph and sprite requests all returned 200 with no
  violation; a control `fetch` to an unlisted host was blocked. `/analytics` and `/languages`
  sit behind sign-in and were not opened. They use the same MapLibre module, worker path and
  CARTO hosts as the site atlas, which loaded without violations.

## Switching the site from Report-Only to enforce

1. Deploy, then watch Vercel logs for `[csp-report]` on everybible.app for 1–2 weeks. Expect some
   noise from browser extensions (`chrome-extension:` and `moz-extension:` sources, inline
   injections). Ignore those. Add any real host to `buildSiteReportOnlyCsp`.
2. Vercel preview deployments load the Vercel toolbar from `https://vercel.live`. Preview
   reports for it are expected. If previews need to work once the policy is enforced, allow
   `vercel.live` only when `VERCEL_ENV === 'preview'`.
3. When reports are clean, rename the header to `Content-Security-Policy` (merge it with the
   enforced baseline into one policy) and keep `report-uri`. `'unsafe-inline'` stays in
   `script-src` for as long as the pages are static. To remove it, move the site to nonces (this
   makes every page dynamic and costs the CDN prerender cache) or wait for Next.js to support
   hashes for static inline scripts.
4. Optional: once enforced, add `upgrade-insecure-requests`. It was left out because every
   resource is already HTTPS, and on `http://localhost` it would upgrade same-origin requests.

## Other follow-ups

- **HSTS preload:** after `includeSubDomains` has been live for a while with no problem, the
  owner can add `preload` and submit the domain at hstspreload.org.
- **Admin `style-src 'unsafe-inline'`:** removing it needs every server-rendered `style=""` moved
  into classes. The risk it leaves is low (CSS injection only).
- **Admin reporting:** the admin enforces its policy but sends no reports. If a future feature
  loads a new host, the browser console shows the block. A `report-uri` could reuse the site's
  handler pattern.
- `apps/admin/lib/supabase/browser.ts` is not imported anywhere today. The Supabase `connect-src`
  entries let it work if a client component starts using it (Realtime needs `wss://`).
