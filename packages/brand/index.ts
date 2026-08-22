/**
 * Every Language design-system tokens — canonical TS mirror of tokens.css.
 *
 * Consume these in JS/TSX where a CSS custom property is not reachable:
 * inline styles, canvas, MapLibre paint expressions, OG image generation.
 * Keep in exact sync with ./tokens.css and each app's mirrored stylesheet.
 *
 * Colors are exposed twice:
 *   - `hsl.*`   the raw HSL triplet, matching the CSS variable value, for
 *               building `hsl(... / alpha)` strings.
 *   - `color.*` a ready-to-use `hsl(...)` string for APIs that want a plain
 *               CSS color (MapLibre paint, canvas fillStyle, satori).
 *
 * Precedence when sources disagree: live Field values → official logo assets
 * and raw brand colors → DESIGN_SYSTEM.md prose → historical collateral.
 */

const LIGHT_HSL = {
  // Paper foundation
  vellum: '40 26% 92%',
  vellumLit: '44 40% 97%',
  ink: '48 13% 9%',
  graphite: '45 14% 36%',

  // Semantic surfaces
  background: '40 26% 92%',
  foreground: '48 13% 9%',
  card: '44 40% 97%',
  cardForeground: '48 13% 9%',
  popover: '44 44% 98%',
  secondary: '42 22% 89%',
  secondaryForeground: '48 10% 22%',
  muted: '42 22% 90%',
  mutedForeground: '45 14% 36%',
  textFaint: '45 12% 39%',

  // Product accent — one blue
  primary: '200 100% 45%',
  primaryForeground: '0 0% 100%',
  primaryDeep: '200 100% 28%',
  accent: '204 87% 92%',
  accentForeground: '200 100% 28%',

  // Structure
  border: '42 12% 80%',
  cardBorder: '42 14% 76%',
  input: '42 12% 80%',
  ring: '200 100% 45%',
  destructive: '0 72% 48%',

  // Status
  success: '147 51% 37%',
  successSoft: '142 46% 83%',
  successSoftForeground: '147 54% 27%',
  warning: '30 79% 46%',
  warningSoft: '34 80% 84%',
  warningSoftForeground: '29 80% 30%',
  danger: '354 65% 47%',
  dangerSoft: '354 64% 87%',
  dangerSoftForeground: '354 65% 34%',
  info: '200 100% 45%',
  infoSoft: '204 90% 87%',
  infoSoftForeground: '200 100% 28%',
  neutral: '35 5% 47%',
  neutralSoft: '40 12% 85%',
  neutralSoftForeground: '40 5% 32%',

  // Data series — use in order
  sea: '200 100% 45%',
  reef: '171 64% 33%',
  ochre: '40 79% 48%',
  clay: '23 53% 49%',
  dusk: '254 49% 55%',
  sage: '90 23% 46%',

  // Sequential map scale
  seq1: '96 24% 93%',
  seq2: '176 30% 74%',
  seq3: '192 46% 60%',
  seq4: '199 64% 45%',
  seq5: '201 88% 27%',

  // Map chrome
  mapBg: '45 8% 89%',
  mapLand: '45 13% 92%',
  mapWater: '200 18% 86%',
} as const;

const DARK_HSL = {
  ...LIGHT_HSL,

  background: '48 14% 6%',
  foreground: '44 30% 91%',
  card: '48 13% 11%',
  cardForeground: '44 30% 91%',
  popover: '40 14% 15%',
  secondary: '40 14% 14%',
  secondaryForeground: '40 20% 80%',
  muted: '40 14% 13%',
  mutedForeground: '40 12% 65%',
  textFaint: '40 10% 56%',

  primary: '202 80% 56%',
  primaryForeground: '43 20% 7%',
  primaryDeep: '200 100% 34%',
  accent: '200 65% 18%',
  accentForeground: '206 100% 84%',

  border: '40 14% 21%',
  cardBorder: '40 14% 24%',
  input: '40 14% 17%',
  ring: '202 80% 56%',

  success: '140 43% 57%',
  successSoft: '140 43% 16%',
  successSoftForeground: '140 47% 70%',
  warning: '35 79% 58%',
  warningSoft: '35 50% 16%',
  warningSoftForeground: '35 83% 71%',
  danger: '355 73% 60%',
  dangerSoft: '355 55% 20%',
  dangerSoftForeground: '355 79% 76%',
  info: '202 80% 56%',
  infoSoft: '200 65% 18%',
  infoSoftForeground: '204 81% 72%',
  neutral: '40 12% 59%',
  neutralSoft: '40 10% 16%',
  neutralSoftForeground: '40 16% 71%',

  sea: '202 80% 56%',
  reef: '171 58% 50%',
  ochre: '40 84% 61%',
  clay: '23 60% 60%',
  dusk: '252 68% 76%',
  sage: '90 30% 58%',

  seq1: '169 39% 14%',
  seq2: '174 40% 22%',
  seq3: '188 45% 38%',
  seq4: '199 70% 52%',
  seq5: '200 84% 62%',

  mapBg: '40 10% 6%',
  mapLand: '40 12% 10%',
  mapWater: '210 20% 5%',
} as const;

type HslSet = typeof LIGHT_HSL;

function toColors(hsl: HslSet): Record<keyof HslSet, string> {
  const out = {} as Record<keyof HslSet, string>;
  for (const key of Object.keys(hsl) as (keyof HslSet)[]) {
    out[key] = `hsl(${hsl[key]})`;
  }
  return out;
}

/**
 * Official Every Language brand colors. Brand-asset use only (logos, marks,
 * print collateral) — never as a semantic surface. Note that the official
 * off-white #ECE8E0 is a DIFFERENT token from the product vellum canvas and
 * must not be collapsed into it, and that brand red is NOT an error color.
 */
export const brandRaw = {
  blue: '#0099e5',
  blueDeep: '#005f8f',
  tan: '#e2e2c7',
  offwhite: '#ece8e0',
  lightblue: '#addfff',
  red: '#c72a37',
} as const;

export const font = {
  display: "'Bricolage Grotesque', 'Archivo', system-ui, sans-serif",
  ui: "'Archivo', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;

export const motion = {
  easeStandard: 'cubic-bezier(0.22, 1, 0.36, 1)',
  easeEmphasized: 'cubic-bezier(0.2, 0, 0, 1)',
  instant: '90ms',
  fast: '0.15s',
  normal: '0.24s',
  slow: '0.4s',
  draw: '1.5s',
} as const;

export const radius = {
  sm: '6px',
  md: '8px',
  lg: '10px',
  xl: '14px',
  '2xl': '20px',
  full: '9999px',
} as const;

export const layout = {
  railWidth: '256px',
  gutterDesktop: '32px',
  gutterMobile: '16px',
  regionGapDesktop: '24px',
  regionGapMobile: '20px',
  docMaxWidth: '1120px',
  controlHeight: '36px',
  controlHeightTouch: '44px',
} as const;

export const light = { hsl: LIGHT_HSL, color: toColors(LIGHT_HSL) };
export const dark = { hsl: DARK_HSL, color: toColors(DARK_HSL) };

/**
 * The six Field data-series colors, in the order the kit requires them to be
 * used. Never cherry-pick out of order for decoration.
 */
export const series = (theme: 'light' | 'dark' = 'light') => {
  const t = theme === 'dark' ? DARK_HSL : LIGHT_HSL;
  return [t.sea, t.reef, t.ochre, t.clay, t.dusk, t.sage].map((h) => `hsl(${h})`);
};

/**
 * Ordered sequential scale for choropleths and heatmaps, low → high.
 */
export const sequential = (theme: 'light' | 'dark' = 'light') => {
  const t = theme === 'dark' ? DARK_HSL : LIGHT_HSL;
  return [t.seq1, t.seq2, t.seq3, t.seq4, t.seq5].map((h) => `hsl(${h})`);
};

export const brand = {
  light,
  dark,
  brandRaw,
  font,
  motion,
  radius,
  layout,
  series,
  sequential,
} as const;

export type Brand = typeof brand;
