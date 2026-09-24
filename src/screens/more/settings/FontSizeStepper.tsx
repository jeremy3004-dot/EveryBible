import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { useDisplayFont, useFontSize } from '../../../hooks';
import { radius, spacing, typography } from '../../../design/system';
import { hexWithAlpha } from '../../../utils';
import { CONTROL_LABEL_MAX_FONT_SCALE } from '../../../design/largeTextLayout';

/** The stepper's A-/A+ glyphs when the size is already at the end of the scale. */
const STEPPER_DISABLED_ALPHA = 0.4;

/**
 * The A-/A+ stepper stays a bespoke control: it is a three-stop scale, not a
 * switch or a picker, and the label between the buttons is the value.
 */
export function FontSizeStepper() {
  const { colors } = useTheme();
  const displayFont = useDisplayFont();
  const { t } = useTranslation();
  const { label: fontSizeLabel, increase, decrease, canIncrease, canDecrease } = useFontSize();

  return (
    <View style={styles.fontSizeControls}>
      <TouchableOpacity
        style={[
          styles.fontSizeButton,
          { backgroundColor: colors.muted },
          !canDecrease && [
            styles.fontSizeButtonDisabled,
            { backgroundColor: colors.cardBackground, borderColor: colors.borderStrong },
          ],
        ]}
        onPress={decrease}
        disabled={!canDecrease}
        activeOpacity={0.85}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={t('learn.decreaseTextSize')}
        accessibilityState={{ disabled: !canDecrease }}
      >
        <Text
          style={[
            styles.fontSizeText,
            { color: colors.primaryText },
            !canDecrease && { color: hexWithAlpha(colors.secondaryText, STEPPER_DISABLED_ALPHA) },
          ]}
        >
          A-
        </Text>
      </TouchableOpacity>
      <Text
        style={[styles.fontSizeValue, displayFont.regular, { color: colors.secondaryText }]}
        numberOfLines={2}
        maxFontSizeMultiplier={CONTROL_LABEL_MAX_FONT_SCALE}
      >
        {fontSizeLabel}
      </Text>
      <TouchableOpacity
        style={[
          styles.fontSizeButton,
          { backgroundColor: colors.muted },
          !canIncrease && [
            styles.fontSizeButtonDisabled,
            { backgroundColor: colors.cardBackground, borderColor: colors.borderStrong },
          ],
        ]}
        onPress={increase}
        disabled={!canIncrease}
        activeOpacity={0.85}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={t('learn.increaseTextSize')}
        accessibilityState={{ disabled: !canIncrease }}
      >
        <Text
          style={[
            styles.fontSizeText,
            { color: colors.primaryText },
            !canIncrease && { color: hexWithAlpha(colors.secondaryText, STEPPER_DISABLED_ALPHA) },
          ]}
        >
          A+
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  fontSizeControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fontSizeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  fontSizeButtonDisabled: {
    borderWidth: 1,
  },
  fontSizeText: {
    ...typography.captionStrong,
  },
  fontSizeValue: {
    ...typography.mono,
    marginHorizontal: spacing.md,
    minWidth: 58,
    flexShrink: 1,
    textAlign: 'center',
  },
});
