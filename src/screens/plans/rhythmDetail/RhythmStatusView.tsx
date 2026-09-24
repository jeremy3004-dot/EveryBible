import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { useDisplayFont } from '../../../hooks/useDisplayFont';
import { DISPLAY_TEXT_MAX_FONT_SCALE } from '../../../design/largeTextLayout';
import { layout, radius, spacing, typography } from '../../../design/system';

type RhythmStatusViewProps =
  | { status: 'loading' }
  | { status: 'error'; message: string; onBack: () => void };

/**
 * A rhythm screen with no rhythm to show yet: a spinner while it loads, or the
 * reason it cannot be shown with a way back. Shared by the detail and the composer.
 */
export function RhythmStatusView(props: RhythmStatusViewProps) {
  const { colors } = useTheme();
  const displayFont = useDisplayFont();
  const { t } = useTranslation();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      {props.status === 'loading' ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accentPrimary} />
        </View>
      ) : (
        <View style={styles.errorContainer}>
          <Text
            maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
            style={[styles.errorTitle, displayFont.bold, { color: colors.primaryText }]}
          >
            {t('readingPlans.rhythms')}
          </Text>
          <Text style={[styles.errorBody, { color: colors.secondaryText }]}>{props.message}</Text>
          <TouchableOpacity
            onPress={props.onBack}
            activeOpacity={0.85}
            accessibilityRole="button"
            style={[styles.errorButton, { backgroundColor: colors.accentPrimary }]}
          >
            <Text style={[styles.errorButtonLabel, { color: colors.onAccent }]}>
              {t('common.back')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenPadding,
    gap: spacing.md,
  },
  errorTitle: {
    ...typography.screenTitle,
    textAlign: 'center',
  },
  errorBody: {
    ...typography.body,
    textAlign: 'center',
  },
  errorButton: {
    minHeight: 48,
    borderRadius: radius.pill,
    paddingHorizontal: layout.cardPadding,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorButtonLabel: {
    ...typography.label,
  },
});
