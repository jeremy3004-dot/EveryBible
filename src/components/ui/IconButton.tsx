import {
  type GestureResponderEvent,
  I18nManager,
  type StyleProp,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import { ArrowLeft, ArrowRight, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, shadows } from '../../design/system';
import { PressableScale, type HapticFeedback } from './PressableScale';

export type IconButtonVariant = 'paper' | 'accent' | 'onPhoto';

// Arabic and Urdu are shipped interface languages: "back" points the other way
// in RTL, so every back control reads this instead of hardcoding ArrowLeft.
export const BackArrowIcon: LucideIcon = I18nManager.isRTL ? ArrowRight : ArrowLeft;

export interface IconButtonProps {
  icon: LucideIcon;
  onPress?: (event: GestureResponderEvent) => void;
  /** Diameter. 40 (default), 36 and 30 are the sizes the design uses. */
  size?: number;
  /** Glyph size. Defaults to 18; scale it down with the button, not below 14. */
  iconSize?: number;
  variant?: IconButtonVariant;
  /** Required: the glyph carries no text, so the label is the only affordance. */
  accessibilityLabel: string;
  disabled?: boolean;
  haptic?: HapticFeedback;
  style?: StyleProp<ViewStyle>;
}

// On-photo controls sit over a photograph, so they cannot use theme tokens —
// they must stay the same in both scopes or they vanish against the image.
// These are the two values the spec names for that surface.
const ON_PHOTO_FILL = 'rgba(253, 250, 245, 0.92)';
const ON_PHOTO_GLYPH = '#1A1914';

const STROKE_WIDTH = 2;

// The circular control used for back, share, more, and secondary play. Anything
// smaller than the 44pt touch floor grows its hit area rather than its circle,
// so a 30pt disc is still comfortably tappable.
export function IconButton({
  icon: Icon,
  onPress,
  size = layout.iconButton,
  iconSize = 18,
  variant = 'paper',
  accessibilityLabel,
  disabled = false,
  haptic = 'light',
  style,
}: IconButtonProps) {
  const { colors } = useTheme();

  const surface: ViewStyle =
    variant === 'accent'
      ? { backgroundColor: colors.accentPrimary, borderWidth: 0 }
      : variant === 'onPhoto'
        ? { backgroundColor: ON_PHOTO_FILL, borderWidth: 0 }
        : {
            backgroundColor: colors.cardBackground,
            borderWidth: 1,
            borderColor: colors.cardBorder,
          };

  const glyphColor =
    variant === 'accent'
      ? colors.onAccent
      : variant === 'onPhoto'
        ? ON_PHOTO_GLYPH
        : colors.primaryText;

  // Grow the touch target back to 44pt for the small variants.
  const slop = Math.max(0, Math.round((layout.minTouchTarget - size) / 2));

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      haptic={disabled ? undefined : haptic}
      hitSlop={slop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={[
        styles.button,
        { width: size, height: size, borderRadius: size / 2 },
        surface,
        variant === 'paper' ? shadows.card : null,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Icon size={iconSize} color={glyphColor} strokeWidth={STROKE_WIDTH} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.45,
  },
});
