import type { ThemeColors } from '../contexts/ThemeContext';

/**
 * The on/off colours every Settings switch shares. The off track is the only outline
 * an off switch has, so it takes the 3:1 control boundary rather than a translucent
 * tint of body text (1.6:1 light, 1.95:1 dark).
 *
 * The thumb must also stand off that track. A card-coloured thumb is near-black in
 * dark mode, so an off switch showed a dark blob on a dark card (Android draws the
 * thumb in `thumbColor` alone). Off, dark scopes use the ink colour instead.
 */
export function getSwitchColors(
  colors: Pick<ThemeColors, 'controlBorder' | 'accentPrimary' | 'cardBackground' | 'primaryText'>,
  value: boolean,
  isDark: boolean
) {
  return {
    trackColor: { false: colors.controlBorder, true: colors.accentPrimary },
    ios_backgroundColor: colors.controlBorder,
    thumbColor: !value && isDark ? colors.primaryText : colors.cardBackground,
  };
}
