# EveryBible Admin — Design System
> Sacred Editorial Dark · Linear-grade component patterns · Internal admin tooling

## 1. Visual Theme & Atmosphere

A dark-mode-only admin dashboard built for one: the operator. The visual register is **editorial darkness** — warm charcoal backgrounds where data surfaces at exactly the right luminance level. The accent is maroon (`#C0392B`), used sparingly as a signal color for actions, active states, and critical highlights. Everything else is achromatic.

Typography uses **Cormorant Garamond** for display/headings (gives an authoritative, crafted feeling) and **DM Sans** for all functional UI text (clean, legible, neutral). No light mode. No toggle.

**Key characteristics:**
- Dark-only: `#101113` base, `#17191d` surface, `#1d2026` elevated
- Warm-neutral text: `#f5f2ea` primary, `#a09b93` muted, `#5a5651` dim
- Single accent: maroon `#C0392B` / `#d94f3d` hover / `#a0301f` strong
- Borders: semi-transparent `rgba(255,255,255,0.05)` and solid `#262a31`
- Fonts: Cormorant Garamond (headings/display), DM Sans (body/UI)
- Elevation via background luminance steps, not drop shadows

---

## 2. Color Tokens

```css
:root {
  /* Backgrounds — luminance stacking model */
  --bg:           #101113;   /* page base */
  --bg-surface:   #17191d;   /* cards, panels */
  --bg-elevated:  #1d2026;   /* nested cards, inputs */
  --bg-input:     #13151a;   /* form inputs */

  /* Borders */
  --border:       #262a31;              /* solid structural border */
  --border-soft:  rgba(255,255,255,0.05); /* subtle card border */
  --border-focus: rgba(192,57,43,0.5);  /* focus ring */

  /* Text */
  --text:         #f5f2ea;   /* primary — warm off-white */
  --text-muted:   #a09b93;   /* secondary — warm gray */
  --text-dim:     #5a5651;   /* tertiary — for metadata */

  /* Accent — maroon, used sparingly */
  --accent:       #C0392B;
  --accent-light: #d94f3d;   /* hover */
  --accent-strong:#a0301f;   /* pressed/active */
  --accent-warm:  #d0c2af;   /* parchment complement */
  --accent-dim:   rgba(192,57,43,0.12); /* subtle tint */

  /* Status */
  --success:      #4caf7d;
  --warning:      #d4912a;
  --danger:       #e05050;

  /* Shadows */
  --shadow:       0 8px 32px rgba(0,0,0,0.4);
  --shadow-soft:  0 4px 16px rgba(0,0,0,0.28);

  /* Typography */
  --font-display: 'Cormorant Garamond', Georgia, serif;
  --font-body:    'DM Sans', -apple-system, sans-serif;
  --font-mono:    ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;

  /* Radius */
  --radius-sm:    6px;
  --radius-md:    10px;
  --radius-lg:    12px;
}
```

---

## 3. Typography Rules

### Font Loading
```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,400;1,500&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap" />
```

### Type Scale

| Role | Font | Size | Weight | Notes |
|------|------|------|--------|-------|
| Page title | Cormorant Garamond | 2rem–2.5rem | 600 | -0.03em letter-spacing |
| Section heading | Cormorant Garamond | 1.4rem–1.65rem | 600 | -0.02em |
| Card heading | Cormorant Garamond | 1.1rem–1.25rem | 600 | -0.01em |
| Eyebrow label | DM Sans | 0.65rem | 600 | uppercase, 0.08em letter-spacing |
| Body | DM Sans | 0.875rem–1rem | 400 | normal spacing |
| UI label | DM Sans | 0.75rem | 500 | |
| Stat number | Cormorant Garamond | 2rem–2.5rem | 600 | tabular-nums |
| Metadata/caption | DM Sans | 0.7rem | 400 | text-muted |
| Mono | system mono | 0.8rem | 400 | code, env vars |

### Principles
- Cormorant Garamond for anything that should feel **crafted or authoritative** (page titles, metric numbers, card headings)
- DM Sans for everything **functional** (labels, body, navigation, form elements)
- Eyebrow labels are ALWAYS uppercase DM Sans 600 with wide letter-spacing
- Metric numbers use Cormorant Garamond tabular-nums for visual impact

---

## 4. Component Styles

### Cards
```css
.card {
  background: var(--bg-surface);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
}
/* Elevated / nested */
.card--elevated {
  background: var(--bg-elevated);
}
/* With top accent bar */
.card--accented::before {
  content: '';
  display: block;
  height: 2px;
  background: linear-gradient(90deg, var(--accent), var(--accent-strong));
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  margin: -1.25rem -1.25rem 1.25rem;
}
```

### Metric Cards
- Background: `var(--bg-surface)` with `var(--border-soft)` border
- 2px top accent bar in maroon gradient
- Label: DM Sans 0.65rem uppercase 600, `var(--text-dim)`
- Number: Cormorant Garamond clamp(1.75rem, 2vw, 2.25rem) 600, `var(--text)`
- Sub-text: DM Sans 0.72rem, `var(--text-muted)`
- Hover: subtle translateY(-2px) + shadow lift

### Buttons

**Primary (maroon)**
- Background: `var(--accent)` → hover `var(--accent-light)`
- Text: `#fff`
- Padding: 0.45em 1em
- Radius: `var(--radius-sm)`

**Secondary / Ghost**
- Background: `rgba(255,255,255,0.04)` → hover `rgba(255,255,255,0.07)`
- Border: `1px solid var(--border-soft)`
- Text: `var(--text-muted)` → hover `var(--text)`
- Radius: `var(--radius-sm)`

**Tab / Segmented**
- Inactive: transparent, `var(--text-muted)`
- Active: `var(--accent)` background, `#fff` text, `var(--radius-sm)` radius

### Eyebrow + Title Pattern (used everywhere)
```html
<p class="eyebrow">SECTION LABEL</p>
<h2 class="section-title">Section heading here</h2>
```
- Eyebrow: DM Sans 0.65rem 600 uppercase, 0.08em letter-spacing, `var(--text-dim)`
- Title: Cormorant Garamond 1.4–2rem 600, `var(--text)`

### Data Tables
- Background: `var(--bg-surface)`, `var(--border-soft)` border
- Header row: DM Sans 0.68rem 600 uppercase, `var(--text-dim)`, border-bottom
- Data rows: DM Sans 0.875rem, `var(--text)`, `rgba(255,255,255,0.02)` hover
- Accented value cells: `var(--accent)` text or left border marker
- Rank numbers: Cormorant Garamond 1.1rem, `var(--text-dim)`

---

## 5. Layout Principles

### Spacing System (base 4px)
- 4px, 8px, 12px, 16px, 20px, 24px, 32px, 40px, 48px
- Page padding: `clamp(1rem, 2vw, 1.5rem)`
- Card inner padding: `1.25rem`
- Grid gap: `1rem`

### Analytics Page Grid
```
┌─────────────────────────────────────────┐
│  Page header (eyebrow + title + actions) │
├─────────────────────────────────────────┤
│  Metric strip (6–7 cards, scroll on mob) │
├──────────────────────┬──────────────────┤
│                      │  Sidebar          │
│   Globe / map        │  (stats, legend,  │
│   (2/3 width)        │   explore panel)  │
│                      │  (1/3 width)      │
├─────────────────────────────────────────┤
│  Daily trends (3 calendar panels)        │
├─────────────────────────────────────────┤
│  Translation table  │  Locations table   │
└─────────────────────────────────────────┘
```

### Grid Columns
- Metric grid: `repeat(auto-fill, minmax(160px, 1fr))`
- Globe+sidebar: `minmax(0, 2fr) minmax(300px, 1fr)`
- Two data tables: `repeat(2, 1fr)` → stacked on mobile

### Responsive
- < 980px: sidebar below globe
- < 720px: metrics 2-col, tables stacked

---

## 6. Elevation

| Level | Background | Border | Use |
|-------|-----------|--------|-----|
| Page | `#101113` | none | App background |
| Surface | `#17191d` | `rgba(255,255,255,0.05)` | Cards, panels |
| Elevated | `#1d2026` | `rgba(255,255,255,0.05)` | Nested cards |
| Input | `#13151a` | `#262a31` | Form controls |
| Overlay | `rgba(255,255,255,0.06)` | none | Hover states |

**Rule:** Use luminance stepping, not drop shadows, for depth. `--shadow-soft` only for floating elements.

---

## 7. Do's and Don'ts

### Do
- Use Cormorant Garamond for all display text, headings, stat numbers
- Use DM Sans for all labels, body, form elements, navigation
- Use `var(--border-soft)` (semi-transparent) for card borders
- Use solid `var(--border)` only for dividers and input borders
- Reserve `var(--accent)` for primary actions and active states only
- Apply eyebrow labels (uppercase DM Sans) before every section heading
- Use luminance stacking for elevation: --bg → --bg-surface → --bg-elevated

### Don't
- Don't use colored backgrounds on cards (except the 2px accent bar)
- Don't use `--accent` for decorative elements
- Don't mix font families on the same visual element
- Don't use pure white text — `var(--text)` (`#f5f2ea`) is the warmest allowed
- Don't add light mode styles
- Don't use visible border on `.metric-card` — rely on background contrast
- Don't use bright status colors for anything non-critical
