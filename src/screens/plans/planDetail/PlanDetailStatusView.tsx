import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { layout, spacing, typography } from '../../../design/system';
import { AppButton, BackArrowIcon, IconButton } from '../../../components/ui';

type PlanDetailStatusViewProps = { onBack: () => void } & (
  | { status: 'loading' }
  | { status: 'error'; message: string; onRetry: () => void }
);

/** The plan page before it has a plan to show: a spinner, or an error with Retry. */
export function PlanDetailStatusView(props: PlanDetailStatusViewProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.plainHeader, { paddingTop: insets.top + spacing.sm }]}>
        <IconButton
          icon={BackArrowIcon}
          variant="paper"
          onPress={props.onBack}
          accessibilityLabel={t('common.back')}
        />
      </View>
      {props.status === 'loading' ? (
        <View
          style={styles.loadingContainer}
          accessibilityState={{ busy: true }}
          accessibilityLabel={t('common.loading')}
        >
          <ActivityIndicator size="large" color={colors.accentPrimary} />
        </View>
      ) : (
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.error }]}>{props.message}</Text>
          <AppButton
            label={t('common.retry')}
            variant="outline"
            onPress={props.onRetry}
            fullWidth={false}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  plainHeader: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.md,
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
    gap: spacing.lg,
    paddingHorizontal: layout.screenPadding,
  },
  errorText: {
    ...typography.body,
    textAlign: 'center',
  },
});
