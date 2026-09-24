import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import type { TranslatorFeedbackAggregateStatus } from '../../../services/feedback/translatorFeedbackReviewModel';

/** Corner badge on a book icon or chapter tile: pending (alert) or addressed (check). */
export const TranslatorFeedbackBadge = memo(function TranslatorFeedbackBadge({
  status,
}: {
  status: TranslatorFeedbackAggregateStatus | null;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  if (!status) {
    return null;
  }

  const isPending = status === 'pending';
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        isPending ? t('translatorQueue.title') : t('bible.translatorReviewConfirmedAccurate')
      }
      style={[
        styles.badge,
        {
          backgroundColor: isPending ? colors.accentPrimary : colors.success,
          borderColor: colors.bibleBackground,
        },
      ]}
    >
      <Ionicons name={isPending ? 'alert' : 'checkmark'} size={10} color={colors.onAccent} />
    </View>
  );
});

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
