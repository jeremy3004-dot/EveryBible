/**
 * Applies an alpha channel to a 6-digit hex color, returning an 8-digit hex.
 *
 * Theme accent tokens are 6-digit hex today, but a theme could ship an `rgba()`
 * or named color; string-concatenating an alpha suffix onto those produces an
 * invalid color (silently transparent on iOS). This guards that case: if the
 * input is not a 6-digit hex, it is returned unchanged (no alpha applied) so
 * the color stays valid rather than breaking.
 *
 * @param color 6-digit hex like `#C8463C`
 * @param alpha 0–1 opacity
 */
export function hexWithAlpha(color: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) {
    return color;
  }
  const clamped = Math.max(0, Math.min(1, alpha));
  const suffix = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
  return `${color}${suffix}`;
}
