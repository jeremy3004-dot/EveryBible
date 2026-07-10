# @everybible/brand

Canonical **Illuminated** brand tokens for every EveryBible web surface.

The brand is one ember terracotta accent (`#D96C57`) on two warm surface
families — **ivory** (light) and **ink** (dark) — mirrored from the mobile
app's palette in `src/constants/colors.ts`. There are no blues, no maroon,
and no cool greys; the older per-app palettes (the site's blue Every-Language
theme and the admin's Sacred-Editorial maroon) have been retired.

## Files

- `tokens.css` — CSS custom properties (`--eb-*`). Canonical source.
- `index.ts` — the same values for JS/TSX (inline styles, MapLibre paint,
  OG image generation) plus the data-viz `heatRamp`.

## How it's consumed

`apps/site` and `apps/admin` deploy as **separate Vercel projects with
different root directories**, so they can't reliably share a cross-package
CSS import at build time. Instead each app **mirrors these exact values** in
its own stylesheet:

- `apps/site/app/globals.css`
- `apps/admin/app/neo-swiss.css`

A source-text test in each app (`brandTokens.test.ts`) asserts the ember
values stay in sync with this package. **When you change a token here, update
both apps and re-run their brand tests.**
