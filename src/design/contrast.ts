// WCAG 2.x contrast maths for 6-digit hex tokens. Kept free of react-native
// imports so the node test runner can audit the real theme palettes with it.

/** WCAG 1.4.3 floor for body text. */
export const WCAG_AA_TEXT = 4.5;
/** WCAG 1.4.11 floor for control boundaries, state indicators and meaningful graphics. */
export const WCAG_NON_TEXT = 3;

function relativeLuminance(hex: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    throw new Error(`contrast needs a 6-digit hex colour, got ${hex}`);
  }
  const linearChannel = (offset: number) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linearChannel(1) + 0.7152 * linearChannel(3) + 0.0722 * linearChannel(5);
}

/** The WCAG contrast ratio between two opaque colours, from 1 to 21. */
export function contrastRatio(foreground: string, background: string): number {
  const fg = relativeLuminance(foreground);
  const bg = relativeLuminance(background);
  return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
}
