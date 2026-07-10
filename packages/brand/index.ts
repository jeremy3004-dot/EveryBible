/**
 * EveryBible unified "Illuminated" brand tokens — canonical TS mirror
 * of tokens.css. Consume these in JS/TSX where a CSS variable is not
 * reachable (inline styles, canvas, MapLibre paint expressions, OG
 * image generation). Keep in exact sync with ./tokens.css and each
 * app's mirrored globals.
 *
 * Derived from the mobile app palette (src/constants/colors.ts).
 */

export const brand = {
  ember: '#D96C57',
  emberSoft: '#E08573',
  emberDeep: '#B85441',
  emberDarkest: '#8F3D2E',
  emberTint: 'rgba(217, 108, 87, 0.10)',
  emberGlow: 'rgba(217, 108, 87, 0.25)',

  ink: {
    bg: '#161412',
    surface: '#1E1B18',
    elevated: '#262220',
    divider: 'rgba(242, 237, 227, 0.08)',
    border: 'rgba(242, 237, 227, 0.10)',
    text: '#F2EDE3',
    muted: '#A8A094',
    dim: '#857D72',
  },

  ivory: {
    bg: '#F2EDE3',
    deep: '#ECE6DA',
    card: '#FAF6ED',
    border: '#D8D1C2',
    text: '#26221E',
    muted: '#74706A',
    dim: '#9A948B',
  },

  parchment: '#D0C2AF',
  amber: '#D0A35A',
  success: '#80C16F',
  warning: '#D0A35A',
  danger: '#FF7B72',

  font: {
    display: "'Fraunces', 'Iowan Old Style', Georgia, 'Times New Roman', serif",
    body: "'DM Sans', 'Noto Sans', 'Helvetica Neue', Arial, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  },

  /**
   * Ordered heat ramp for data visualisation (globe markers, heatmaps).
   * Low → high magnitude, staying inside the ember family.
   */
  heatRamp: ['#D0C2AF', '#D0A35A', '#D96C57', '#B85441'] as const,
} as const;

export type Brand = typeof brand;
