import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { ThemeColors } from '../../../contexts/ThemeContext';
import { layout, spacing, typography } from '../../../design/system';
import { AppButton } from '../../../components/ui';

// Fallback footer height used for the first frame, before onLayout reports the
// real one: 24 top pad + 50 pill + 8 gap + 15 hint + 16 bottom pad.
export const ESTIMATED_FOOTER_HEIGHT = 113;

interface LocaleSetupFooterProps {
  label: string;
  canAdvance: boolean;
  /** How far the keyboard covers this surface; the footer rides above it. */
  keyboardOffset: number;
  colors: ThemeColors;
  onPress: () => void;
  onHeightChange: (height: number) => void;
}

/** The pinned primary action that fades the list out beneath it (settings mode). */
export function LocaleSetupFooter({
  label,
  canAdvance,
  keyboardOffset,
  colors,
  onPress,
  onHeightChange,
}: LocaleSetupFooterProps) {
  const { t } = useTranslation();

  return (
    <View
      style={[styles.footer, { bottom: keyboardOffset }]}
      onLayout={(event: LayoutChangeEvent) => onHeightChange(event.nativeEvent.layout.height)}
    >
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', colors.background, colors.background]}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View testID="onboarding-primary-action">
        <AppButton
          label={label}
          variant="primary"
          size="lg"
          trailingIcon={ChevronRight}
          disabled={!canAdvance}
          accessibilityLabel={label}
          onPress={onPress}
        />
      </View>
      <Text style={[typography.captionStrong, styles.footerHint, { color: colors.secondaryText }]}>
        {t('onboarding.searchAboveHint')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  footerHint: {
    textAlign: 'center',
  },
});
