# @everybible/brand

Canonical **Every Language** design-system tokens for every EveryBible web
surface.

Ported from the Every Language Design System kit ("Field Sync 2026.07"), whose
values are byte-verified against the live Field product at
[field.everylanguage.com](https://field.everylanguage.com/).

## The brand in one paragraph

The canvas is **vellum, not white** (`hsl(40 26% 92%)`); panels are lit paper
(`hsl(44 40% 97%)`); ink is a warm off-black (`hsl(48 13% 9%)`) — never `#000`,
never a cool grey. There is **one accent, EL blue** `hsl(200 100% 45%)`, with
`hsl(200 100% 28%)` for blue text on pale fills. Type is three Google-served
families: **Bricolage Grotesque** (display, 800, tight negative tracking),
**Archivo** (all reading and UI), **JetBrains Mono** (eyebrows, timestamps,
technical metadata). Surfaces are bordered paper with a whisper of warm shadow
and an inset edge light — not floating, not borderless. A 3.5%-opacity grain
overlay keeps the paper feeling like paper.

The previous per-app palettes — the site's ember "Illuminated" terracotta and
the admin's Sacred-Editorial maroon — are **retired on the web**. The mobile app
keeps its own palette in `src/constants/colors.ts` and is deliberately outside
this package's scope.

## Rules that are easy to get wrong

- **Prefer semantic tokens** (`--background`, `--card`, `--primary`) over the
  raw `--brand-*` / `--series-*` tokens. Reach for the raw ones only when the
  role really is brand or data.
- The official brand off-white `#ECE8E0` is a **different token** from the
  product vellum canvas. Do not collapse them.
- **Brand red `#C72A37` is not an error color.** Product danger is the separate
  `--danger` token that happens to look similar.
- **Data gets the expanded palette in order**: Sea, Reef, Ochre, Clay, Dusk,
  Sage. Never cherry-picked for decoration.
- **No decorative gradients, no photographic backgrounds in product**, no
  perpetual motion. Hover is a *color* change (canvas → pale blue accent), press
  is `translateY(1px)`, focus is the 3px blue ring.
- **Sentence case** everywhere except mono eyebrows and metadata, which are
  uppercase. **No emoji, ever.**

## Files

- `tokens.css` — CSS custom properties, the canonical source. Colors are bare
  HSL triplets consumed as `hsl(var(--primary))` or
  `hsl(var(--primary) / 0.35)`. Includes the `.dark` and `.hc` theme scopes and
  the `.atlas-paper` / `.atlas-strip` / `.glass` / `.grain` surface utilities.
- `index.ts` — the same values for JS/TSX (inline styles, MapLibre paint, OG
  image generation), exposed both as raw HSL triplets and ready-made
  `hsl(...)` strings, plus the ordered `series()` and `sequential()` scales.

## How it's consumed

`apps/site` and `apps/admin` deploy as **separate Vercel projects with
different root directories**, so they can't reliably share a cross-package CSS
import at build time. Instead each app **mirrors these exact values** in its own
stylesheet:

- `apps/site/app/globals.css`
- `apps/admin/app/el-field.css`

A source-text test in each app (`brandTokens.test.ts`) asserts the values stay
in sync with this package and that the retired ember palette does not creep
back. **When you change a token here, update both apps and re-run their brand
tests.**

## Source kit

`/Users/dev/Desktop/EVERY LANGUAGE MAIN/Every Language Design System` — also
carries the component primitives, the Field dashboard and report UI kits, the
23 foundation specimen cards, and the 16 verified logo PNGs. Logos are copied
into each app's `public/everylanguage/`; never redraw, recolor, outline, glow,
stretch or shadow the mark. Black or blue on vellum; off-white on dark.
