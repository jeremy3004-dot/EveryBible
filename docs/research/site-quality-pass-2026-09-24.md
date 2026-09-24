# everybible.app quality pass — speed, search, accessibility (2026-09-24)

Scope: `apps/site` (Next.js 15, deployed to https://everybible.app from `main`).
Visual design and fonts are unchanged: the same Every Language tokens, Alte Haas
Grotesk / Archivo / JetBrains Mono, vellum + EL blue. Only how the fonts are
delivered changed. Nothing was deployed.

## Method

- Lighthouse 13.4.1 via `npx lighthouse … --only-categories=performance,accessibility,seo,best-practices`,
  headless Chrome, default mobile emulation (Moto G Power, slow 4G, 4× CPU,
  simulated throttling) and `--preset=desktop`.
- **Live**: https://everybible.app at `origin/main` 7376d690, one run per page.
- **Local before**: `next build && next start` of 7376d690 on this machine.
- **Local after**: same, with the changes below. The homepage was run three
  times after the change; all three gave the same scores (TBT 130–190 ms).
- Live and local numbers are not directly comparable (Vercel edge vs.
  localhost), so compare *local before* with *local after*. Live is recorded as
  the production reference.
- `/download` is a redirect (desktop → `/#download`, Android → Play Store, iOS
  → App Store), so its "score" is the homepage or a store page. It is excluded.
- The atlas has no per-language URL (selection is client state only), so there
  is no routable atlas detail view to measure.

## Scores

Perf / Accessibility / Best practices / SEO. LCP and TBT from the same run.

### Mobile

| Page     | Live               | Local before       | Local after           |
| -------- | ------------------ | ------------------ | --------------------- |
| Home     | 39/100/96/100 · LCP 16.3 s · TBT 710 ms | 58/100/96/100 · LCP 13.8 s · TBT 530 ms | **90**/100/**100**/100 · LCP **3.1 s** · TBT 130–190 ms |
| /about   | 87/100/96/100 · LCP 3.3 s | 87/100/96/100 · LCP 3.3 s | **97**/100/**100**/100 · LCP **2.5 s** |
| /support | 86/100/96/100 · LCP 3.4 s | 86/100/96/100 · LCP 3.4 s | **97**/100/**100**/100 · LCP **2.5 s** |
| /give    | 88/100/96/100 · LCP 3.2 s | 95/100/96/100 · LCP 2.7 s | **97**/100/**100**/100 · LCP **2.5 s** |

### Desktop

| Page     | Live               | Local before       | Local after           |
| -------- | ------------------ | ------------------ | --------------------- |
| Home     | 66/100/96/100 · LCP 3.1 s · TBT 220 ms | 87/100/96/100 · LCP 2.3 s | **100**/100/**100**/100 · LCP **0.6 s** · TBT 0 ms |
| /about   | 100/100/96/100 | 100/100/96/100 | 100/100/**100**/100 |
| /support | 100/100/96/100 | 100/100/96/100 | 100/100/**100**/100 |
| /give    | 100/100/96/100 | 100/100/96/100 | 100/100/**100**/100 |

### Other measured effects (local, mobile)

| Measure                                   | Before   | After   |
| ----------------------------------------- | -------- | ------- |
| Home first-load JS (Next build report, gz) | 395 kB   | 119 kB  |
| Home time to interactive (simulated)      | 13.8 s   | 5.9 s   |
| Home main-thread work                     | 2.4 s    | 1.7 s   |
| Home first contentful paint               | 2.0 s    | 1.4 s   |
| /about, /support, /give total page weight | 2,430 KiB | 271 KiB |

Lighthouse's SEO category was already 100 everywhere, because it only checks
basics (title, description, crawlable links). The real SEO gaps it does not
score — no sitemap, no robots.txt, no share cards, relative canonicals, no
structured data — are listed under "Search" below.

The homepage still downloads the same total JavaScript (MapLibre is ~270 KB
compressed) and the 1.9 MB atlas snapshot plus basemap tiles; the change is
*when*. Total home weight is ~5 MB either way and is dominated by the atlas
data and CARTO tiles (see "Not changed").

## What was wrong, and what changed

### Speed

1. **Every static page downloaded the whole homepage atlas (2.1 MB).**
   The "Back to homepage" `<Link>` on /about, /support, /give, /privacy and
   /terms prefetched the home route in production. That prefetch ran the home
   page's `preload()` of the 1.9 MB atlas snapshot and pulled the 270 KB
   MapLibre chunk. Fixed with `prefetch={false}` (the header already uses plain
   links). Static pages drop from 2,430 KiB to 271 KiB, which matters for the
   site's target audience on metered mobile data.
2. **MapLibre blocked the headline.** The map library (~1 MB uncompressed) was
   in the homepage's main chunk, so it had to download, parse and run before
   the page hydrated. `LanguageMap` is now loaded with `next/dynamic`
   (`ssr: false`); its loading placeholder is the exact markup the map renders
   before it is ready, so there is no layout shift. Home first-load JS: 395 kB
   → 119 kB.
3. **The atlas snapshot competed with render-blocking files.** The 1.9 MB
   `/api/language-atlas/startup/<sha>` preload ran at High priority from the
   first byte of HTML, sharing bandwidth with CSS, fonts and scripts. The
   preload is kept (commit dfbceb54 added it deliberately so the map fills in
   sooner) but now has `fetchPriority: 'low'`.
4. **Google Fonts was a three-step render-blocking chain.** `globals.css` did
   `@import url(fonts.googleapis.com/…)`, so the browser had to fetch the site
   CSS, then Google's CSS, then the font files before painting (Lighthouse
   estimated 0.9–1.9 s of render-blocking time). Archivo and JetBrains Mono now
   load through `next/font/google`: the same Google families, downloaded at
   build time, served from everybible.app, preloaded, with metric-matched
   fallbacks. Both are variable fonts, so all weights the CSS uses are covered.
5. **Alte Haas Grotesk shipped as TTF.** Added lossless WOFF2 versions (144 KB
   → 48 KB each, glyph outlines, metrics and cmap verified identical with
   fontTools) as the first `src`, TTF kept as fallback, and the preload now
   targets the Bold WOFF2 (the homepage headline is the LCP element).
6. **Footer logo over-fetched.** The Every Language wordmark renders at 104 px
   but had no `sizes`, so `next/image` served the 1080/1920 px variants. Added
   `sizes="104px"`.
7. **Missing favicon** caused a console 404 on every page (the Best Practices
   deduction). Added `app/favicon.ico`, `app/icon.png` and
   `app/apple-icon.png`, resized from `public/everybible/app-icon.png` (matches
   the live App Store icon).

### Search and sharing

- `metadataBase` = https://everybible.app, so canonicals and image URLs are
  absolute. Before, /privacy and /terms emitted `<link rel="canonical"
  href="/privacy">` and other pages had no canonical.
- Every page now has a canonical, Open Graph and `summary_large_image` Twitter
  tags via `pageMetadata()` in `apps/site/lib/site-metadata.ts`.
- `app/opengraph-image.tsx`: a 1200×630 share card rendered at build time from
  the homepage headline in the site's dark tokens and Alte Haas Grotesk.
- `app/sitemap.ts` → `/sitemap.xml` (/, /about, /give, /support, /privacy,
  /terms; `/download` and `/api` are excluded).
- `app/robots.ts` → `/robots.txt` (allow all, disallow `/api/`, sitemap link).
  Both returned 404 before.
- JSON-LD on the homepage: `Organization` (Every Language), `WebSite`, and a
  `MobileApplication` (free `Offer`, iOS and Android, both store URLs,
  `ReferenceApplication` to match the App Store's Books/Reference genres). No
  rating is included: the App Store lookup API reports 0 ratings, and invented
  ratings breach Google's structured-data policy.

### Accessibility

Lighthouse accessibility was already 100 on every page. Manual review found:

- **Skip link.** "Skip to content" is the first tab stop on every page, hidden
  until focused, jumping past the seven header stops (WCAG 2.4.1).
- **Focus in Windows High Contrast.** The global `:focus-visible` used
  `outline: none` + `box-shadow`. Forced-colors mode drops box-shadow, which
  left no focus ring. It now also sets a transparent 2 px outline, which is
  invisible normally and becomes a system-coloured ring in forced colours.
- **Anchors and focus under the fixed header.** Added
  `scroll-padding-top: var(--header-h)` so #app, #download, #mission, etc. and
  keyboard-focused elements no longer land under the 72 px fixed header
  (WCAG 2.4.11). Verified in headless Chrome: `/about#offline` lands exactly at
  72 px and `/#download` at 90 px.
- **`/download` on desktop landed at the top of the page.** It redirects to
  `/#download`, but no element had `id="download"`. The QR/store block now
  does, using a shared `EVERYBIBLE_DOWNLOAD_ANCHOR` constant so the redirect
  and the page cannot drift apart again.
- **The homepage lost its h1 when a panel opened.** The visible headline is
  removed while the explorer is expanded; a visually hidden h1 with the same
  text now stays for screen-reader heading navigation.
- Checked and left as is: landmarks (header, nav, main, aside, footer), heading
  order, `lang="en"`, alt text on every image, keyboard access to the atlas
  (search, Browse all, record list, pagination, Escape to close with focus
  return; the canvas region points keyboard users to the records list), and
  reduced motion (global CSS override plus zero-duration map camera moves).

## Not changed (needs a decision or is out of scope)

- **Focus ring contrast.** `--shadow-focus` is EL blue at 35% opacity; on the
  dark surface that is roughly 1.9:1 against the background. It passes WCAG AA
  (2.4.7 only requires a visible indicator) but a stronger ring would help.
  It is a design-system token (`packages/brand/tokens.css`), so it is left for
  the owner.
- **Atlas data size.** The startup snapshot is 1.9 MB compressed / 15 MB
  decoded and is parsed on the main thread. Splitting it (e.g. a small
  first-paint set plus the rest in a worker) is the next big mobile win but is
  a data-format change.
- **Basemap tiles.** CARTO vector tiles are 2–3 MB per first view at zoom 2.
  A lighter style or raster tiles for the globe view would cut this.
- **Per-language URLs.** The atlas has no shareable URL per language, so none
  of the 35,000 language profiles can be indexed or linked. A route such as
  `/languages/<id>` would be a large SEO opportunity.
- **Legacy JavaScript** (~11 KB of polyfills flagged by Lighthouse) comes from
  Next's default browserslist; not worth changing.

## Needs the owner

- **Google Search Console / Bing Webmaster Tools:** after deploy, submit
  `https://everybible.app/sitemap.xml` and request indexing of the homepage.
  If the property is not verified yet, verify it with a DNS TXT record (this
  pass did not add a verification meta tag).
- **Check share cards after deploy** with the Facebook Sharing Debugger,
  LinkedIn Post Inspector and an X/Twitter post preview. They cache old
  results, so run a re-scrape.
- **Google Rich Results Test** on the homepage to confirm the
  `MobileApplication` markup. It will not be rich-result eligible until the
  app has a public rating to include.

## Files

- `apps/site/app/layout.tsx`: next/font setup, WOFF2 preload
- `apps/site/app/globals.css`: font tokens, @font-face WOFF2, focus outline,
  skip link, scroll padding
- `apps/site/app/page.tsx`: low-priority snapshot preload, JSON-LD, skip target
- `apps/site/components/atlas/PublicLanguageAtlas.tsx`: dynamic map, hidden h1
- `apps/site/components/StaticPageLayout.tsx`: no prefetch, `id="main"`
- `apps/site/components/SiteHeader.tsx`: skip link
- `apps/site/components/SiteFooter.tsx`: image `sizes`
- `apps/site/components/HomeBelowAtlas.tsx`: `#download` anchor
- `apps/site/lib/site-metadata.ts` (+ `.test.ts`): metadata, sitemap, robots,
  JSON-LD helpers
- `apps/site/lib/site-links.ts`: `EVERYBIBLE_DOWNLOAD_ANCHOR`
- `apps/site/app/{sitemap,robots}.ts`, `opengraph-image.tsx`, `favicon.ico`,
  `icon.png`, `apple-icon.png`
- `apps/site/public/fonts/AlteHaasGrotesk-{Regular,Bold}.woff2`
- page metadata in `about`, `support`, `give`, `privacy`, `terms`
- `apps/site/app/brandTokens.test.ts`: font assertions updated for next/font
  and WOFF2 (still guards the three EL families and the Bricolage ban)
