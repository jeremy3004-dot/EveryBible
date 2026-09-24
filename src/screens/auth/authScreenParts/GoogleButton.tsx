import { Image, StyleSheet, Text } from 'react-native';
import { useTheme } from '../../../contexts/ThemeContext';
import { layout, shadows, spacing, typography } from '../../../design/system';
import { CONTROL_LABEL_MAX_FONT_SCALE } from '../../../design/largeTextLayout';
import { PressableScale } from '../../../components/ui';

// Google's official multicolour "G". It is a brand asset, not an icon we may
// recolour or replace with a Lucide glyph.
const GOOGLE_MARK = require('../../../../assets/icons/google-g.png');

const GOOGLE_MARK_SIZE = 18;
// Same cap as AppButton's label, so the Google strip and the primary CTA grow
// together with the user's text size.
const GOOGLE_LABEL_MAX_FONT_SCALE = CONTROL_LABEL_MAX_FONT_SCALE;

// The Google strip: geometrically the `secondary` AppButton (50pt paper pill,
// hairline border, card shadow), but its leading mark is a brand bitmap rather
// than a LucideIcon, which AppButton cannot take. Kept screen-local so the
// shared primitive stays icon-typed.
export function GoogleButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const { colors } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      haptic={disabled ? undefined : 'medium'}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[
        googleStyles.button,
        { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
        shadows.card,
        disabled && googleStyles.disabled,
      ]}
    >
      <Image
        source={GOOGLE_MARK}
        style={googleStyles.mark}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      />
      <Text
        style={[googleStyles.label, { color: colors.primaryText }]}
        numberOfLines={2}
        maxFontSizeMultiplier={GOOGLE_LABEL_MAX_FONT_SCALE}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

const googleStyles = StyleSheet.create({
  // minHeight, not height: the label grows with the user's text size.
  button: {
    minHeight: layout.pillHeight,
    borderRadius: layout.pillHeight / 2,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    alignSelf: 'stretch',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  label: {
    ...typography.bodyStrong,
    flexShrink: 1,
    textAlign: 'center',
  },
  mark: {
    width: GOOGLE_MARK_SIZE,
    height: GOOGLE_MARK_SIZE,
    resizeMode: 'contain',
  },
  disabled: {
    opacity: 0.45,
  },
});
