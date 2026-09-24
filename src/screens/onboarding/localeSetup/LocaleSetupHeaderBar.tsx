import { StyleSheet, Text, type TextStyle, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ThemeColors } from '../../../contexts/ThemeContext';
import { layout, spacing, typography } from '../../../design/system';
import { BackArrowIcon, IconButton } from '../../../components/ui';
import type { SetupStep } from '../localeSetupModel';

// EL geometry for this screen. The step bar is a fixed 120pt rail regardless of
// how many segments it carries, so the header reads the same on every step.
const STEP_BAR_WIDTH = 120;
const STEP_BAR_HEIGHT = 3;

interface LocaleSetupHeaderBarProps {
  steps: readonly SetupStep[];
  currentStepNumber: number;
  colors: ThemeColors;
  eyebrowFont: TextStyle;
  /** The back arrow: absent on the first step of first-run onboarding. */
  onBack: (() => void) | null;
  /** Settings mode saves from the header's Done. */
  onDone: (() => void) | null;
}

/** Back, the "Step 2 of 3" eyebrow over its rail, and Done in settings. */
export function LocaleSetupHeaderBar({
  steps,
  currentStepNumber,
  colors,
  eyebrowFont,
  onBack,
  onDone,
}: LocaleSetupHeaderBarProps) {
  const { t } = useTranslation();
  const totalSteps = steps.length;

  return (
    <View style={styles.header}>
      <View style={styles.headerSide}>
        {onBack ? (
          <IconButton icon={BackArrowIcon} onPress={onBack} accessibilityLabel={t('common.back')} />
        ) : null}
      </View>

      <View style={styles.headerCenter}>
        {totalSteps > 1 ? (
          <>
            <Text style={[typography.eyebrow, eyebrowFont, { color: colors.secondaryText }]}>
              {t('onboarding.stepEyebrow', { step: currentStepNumber, total: totalSteps })}
            </Text>
            <View style={styles.stepBar}>
              {steps.map((stepKey, index) => (
                <View
                  key={stepKey}
                  style={[
                    styles.stepSegment,
                    {
                      backgroundColor:
                        index < currentStepNumber ? colors.accentPrimary : colors.borderStrong,
                    },
                  ]}
                />
              ))}
            </View>
          </>
        ) : null}
      </View>

      <View style={[styles.headerSide, styles.headerSideEnd]}>
        {onDone ? (
          <TouchableOpacity
            onPress={onDone}
            accessibilityRole="button"
            accessibilityLabel={t('common.done')}
            hitSlop={12}
          >
            <Text style={[typography.captionStrong, { color: colors.accentPrimary }]}>
              {t('common.done')}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  headerSide: {
    width: 56,
    minHeight: layout.iconButton,
    justifyContent: 'center',
  },
  headerSideEnd: {
    alignItems: 'flex-end',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  stepBar: {
    flexDirection: 'row',
    width: STEP_BAR_WIDTH,
    gap: spacing.xs,
  },
  stepSegment: {
    flex: 1,
    height: STEP_BAR_HEIGHT,
    borderRadius: STEP_BAR_HEIGHT / 2,
  },
});
