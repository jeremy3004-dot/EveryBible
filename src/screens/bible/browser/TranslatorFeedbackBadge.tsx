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
      // Read as part of its book row or chapter tile, so it names the state, not
      // "Feedback queue", which is the header button's name.
      accessibilityLabel={
        isPending ? t('feedback.needsReview') : t('bible.translatorReviewConfirmedAccurate')
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
