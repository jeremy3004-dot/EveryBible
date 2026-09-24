import { useEffect } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { radius, spacing, typography } from '../../design/system';
import { AppButton, Sheet } from '../ui';
import {
  canSubmitResolution,
  getResolutionLabelKey,
  requiresResolutionNote,
  type ChapterFeedbackReviewItem,
  type TranslatorFeedbackResolution,
} from '../../services/feedback';
import { announceForAccessibility } from '../../utils/a11y';
import { FeedbackVerdict } from './FeedbackResponseCard';

export interface FeedbackResolveSheetProps {
  /** The item being settled and how; null keeps the sheet closed. */
  target: { item: ChapterFeedbackReviewItem; resolution: TranslatorFeedbackResolution } | null;
  note: string;
  onChangeNote: (note: string) => void;
  busy: boolean;
  /** An Alert cannot show over the sheet's modal, so a failed save is reported inline. */
  failed: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

// Settling a concern asks for the reason in place, so the list stays the page
// translators read and nothing walks them through a queue.
export function FeedbackResolveSheet({
  target,
  note,
  onChangeNote,
  busy,
  failed,
  onConfirm,
  onClose,
}: FeedbackResolveSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const visible = !!target;

  useEffect(() => {
    if (visible && failed) announceForAccessibility(t('common.unexpectedError'));
  }, [failed, t, visible]);

  const label = target ? t(getResolutionLabelKey(target.item, target.resolution)) : '';

  return (
    <Sheet visible={visible} onClose={onClose} title={label}>
      {target && (
        <View style={styles.body}>
          <FeedbackVerdict item={target.item} />
          {!!target.item.comment && (
            <Text style={[styles.comment, { color: colors.secondaryText }]} numberOfLines={3}>
              {target.item.comment}
            </Text>
          )}
          {requiresResolutionNote(target.item) && (
            <TextInput
              value={note}
              onChangeText={onChangeNote}
              placeholder={t('feedback.explanation')}
              accessibilityLabel={t('feedback.explanation')}
              placeholderTextColor={colors.secondaryText}
              multiline
              maxLength={1000}
              style={[
                styles.input,
                {
                  borderColor: colors.cardBorder,
                  backgroundColor: colors.cardBackground,
                  color: colors.primaryText,
                },
              ]}
            />
          )}
          {failed && (
            <Text style={[styles.comment, { color: colors.error }]} accessibilityRole="alert">
              {t('common.unexpectedError')}
            </Text>
          )}
          <AppButton
            label={label}
            variant="primary"
            size="lg"
            fullWidth
            loading={busy}
            disabled={busy || !canSubmitResolution(target.item, note)}
            onPress={onConfirm}
          />
          <AppButton label={t('common.cancel')} variant="ghost" size="md" onPress={onClose} />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md },
  comment: { ...typography.body },
  input: {
    ...typography.body,
    minHeight: 110,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    textAlignVertical: 'top',
  },
});
