# EveryBible Admin — Design System

> Every Language "Field" · operational dashboard · internal admin tooling

> **Brand source of truth:** [`packages/brand`](../../packages/brand) — the
> canonical Every Language token set, ported from the design-system kit whose
> values are byte-verified against the live Field product at
> [field.everylanguage.com](https://field.everylanguage.com/). Token values
> below mirror `packages/brand/tokens.css` and are locked by
> `app/brandTokens.test.ts`. Change a colour there, not just here.
>
> The retired ember "Illuminated" palette this document used to describe is
> gone from the web. The mobile app keeps its own palette in
> `src/constants/colors.ts` and is deliberately outside this system.

## 1. Visual theme and atmosphere

The character to hold is **a field atlas or a well-made research instrument** —
not a SaaS dashboard, not a charity microsite. Warm, precise, operational,
grounded. Quiet confidence over marketing spectacle.

The canvas is **vellum, not white**: `hsl(40 26% 92%)`. Panels are lit paper
`hsl(44 40% 97%)`. Ink is a warm off-black `hsl(48 13% 9%)` — never `#000`,
never a cool grey. There is **one accent, EL blue** `hsl(200 100% 45%)`, with
`hsl(200 100% 28%)` for blue text on pale fills, and pale blue
`hsl(204 87% 92%)` as the hover/selected surface.

Both themes ship. Light is the default; the shell stamps `data-theme="dark"` on
`<html>` and the stylesheet scopes the dark values to
`[data-theme='dark'], .dark`. A `.hc` high-contrast scope also ships.

**Key characteristics:**

- Paper foundation: vellum canvas, lit-paper panels, warm ink.
- Single accent, EL blue. Everything else is paper, ink and status.
- **Brand red `#C72A37` is not an error colour.** Product danger is the separate
  `--danger` token that happens to look similar.
- Fonts: **Bricolage Grotesque** (display, 800, tight negative tracking),
  **Archivo** (all reading and UI), **JetBrains Mono** (eyebrows, timestamps,
  technical metadata). Tabular numerals everywhere numbers align.
- Data gets the expanded palette **in order**: Sea, Reef, Ochre, Clay, Dusk,
  Sage. Never cherry-picked for decoration.
- Choropleths and heatmaps use the sequential `--seq-1..5` scale.
- Elevation is a warm shadow plus an inset edge light — never neutral black.
- A `--grain` overlay at 3.5% multiply keeps the paper feeling like paper
  (2.5% in dark, 0 in high contrast, removed in print).

## 2. Stylesheet layering

Three files load in this order from `app/layout.tsx`:

| File | Role |
|---|---|
| `app/globals.css` | The `:root` token mirror (light), the `[data-theme='dark'] / .dark` and `.hc` scopes, plus the base shell rules. |
| `app/neo-swiss.css` | Shell structure and per-component layout. Reads every colour from the tokens above. |
| `app/el-field.css` | **Loads last.** The design-system decisions rather than values: paper surfaces, the type system, the geometry scale, the interaction states, the nav rail, and the materiality. |

Prefer the semantic tokens (`--background`, `--card`, `--primary`) over the raw
`--brand-*` / `--series-*` ones. Reach for the raw tokens only when the role
really is brand or data.

## 3. Typography

Loaded from Google Fonts in `app/layout.tsx`.

| Role | Family | Size | Weight | Notes |
|---|---|---|---|---|
| Display | Bricolage Grotesque | `--text-display` `clamp(40px, 6vw, 72px)` | 800 | `-.04em`, `.92` line height |
| H1 / H2 / H3 | Bricolage Grotesque | 32 / 24 / 18px | 800 | `-.025em` |
| Body, UI | Archivo | 15–16px | 400–600 | 1.5 line height |
| Caption | Archivo | 13px | 400 | `--muted-foreground` |
| Eyebrow | JetBrains Mono | 11px | 600 | uppercase, `.18em` |
| Metadata, IDs, JSON | JetBrains Mono | 11–13px | 400–600 | timestamps, `⌘K` |

**Sentence case** for headings and UI labels — "Average completion across Bible
projects", not Title Case. **UPPERCASE only in mono eyebrows and metadata**;
the stylesheet applies it, so the markup stays sentence case. **No emoji, ever**
— not in product, not in reports.

## 4. Component styles

**Cards** are bordered paper with a whisper of shadow: 1px `--card-border`,
`--radius-lg` (10px), `--card` fill, `--edge-light` + `--shadow-sm`. Not
floating, not borderless, and never a coloured left border as decoration.
Compact utility rows use `--shadow-xs`.

**Metric cards** put the number first and the explanation second, set in
Bricolage 800 with tabular numerals: "590,584 total recordings · Across 35
connected projects · last synced just now."

**Buttons** are `--radius-md` (8px), minimum 36px tall (44px for a primary touch
target). The primary action is a solid `--primary` fill with
`--primary-foreground` text. No gradients.

**Eyebrow + title** is the standard region header: a mono uppercase eyebrow in
`--muted-foreground`, then a Bricolage title. The accent belongs on state, not
on every eyebrow.

**Data tables** carry tabular numerals throughout. Every table, chart and map
should carry a source line naming owner, system and retrieval date.

**Status** comes in two forms: solid tokens for dots and bars, and the
`*-soft` + `*-soft-foreground` pairs for chips, badges and banners.

**Overlays** — and only transient overlays that visibly float — use `.glass`
(16px blur, ~82% paper fill). Glass is never the base surface.

## 5. Layout

- Desktop: a persistent **256px** navigation rail (`--rail-width`), fixed and
  never icon-collapsed, plus a fluid canvas at a 32px gutter and 24px region
  gap.
- Selected nav row: a 2px blue left rule, a paper fill and 600 weight. Wired via
  `aria-current="page"` from `components/AdminNavLink.tsx`.
- Mobile (≤900px): **the rail is removed entirely**, everything becomes one
  column at a 16px gutter, and no data is hidden — order and hierarchy are
  preserved. No horizontal overflow at 390px, ever.
- Controls stay ≥36px, ≥44px when they're a primary touch target.

## 6. Radii and elevation

Six radii and nothing else: **6** chips · **8** buttons and inputs · **10**
paper · **14** overlays · **20** rare · **full** for badges.

Shadows are warm (`#1a1a16` at 4–16% alpha), never neutral black, and always
paired with the inset edge light. Five steps, `--shadow-xs` → `--shadow-2xl`,
plus `--shadow-focus` for the 3px 35%-alpha blue focus ring.

## 7. Motion and interaction

Quick and physically restrained: `90ms / 150ms / 240ms / 400ms` with
`cubic-bezier(.22, 1, .36, 1)`. Transform and opacity only.

- **Hover** is a *colour* change — canvas to pale blue accent, text to deep
  blue. Not an opacity change.
- **Active/press** is `translateY(1px)`. No scale-down, no colour darkening.
- **Focus** is `--shadow-focus`, always visible.
- **Disabled** is 45% opacity with pointer events off.

Progress and chart draws are the only animated data. No perpetual decorative
motion in a dashboard. `prefers-reduced-motion` is honoured globally.

## 8. Do's and don'ts

### Do

- Read colours from the semantic tokens; add new ones to
  `packages/brand/tokens.css` first and mirror them into `app/globals.css`.
- Use the data series in order, and the sequential scale for magnitude.
- Put the number first and the explanation second.
- Label facts, estimates and recommendations separately, and say "estimated,
  not measured" out loud when it is.
- Keep both themes working — check the dark scope before shipping.

### Don't

- Don't add decorative gradients, photographic backgrounds, or textures beyond
  the grain.
- Don't use brand red as an error colour, or collapse the official brand
  off-white `#ECE8E0` into the product vellum canvas.
- Don't use glass or blur as a base surface.
- Don't use Title Case in headings or UI labels, and don't use emoji.
- Don't hard-code a hex where a token exists — `brandTokens.test.ts` will catch
  the retired palette, but it can't catch a brand-new stray colour.
