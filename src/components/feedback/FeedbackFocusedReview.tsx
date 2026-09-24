import { useEffect, useRef } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { CheckCheck, X } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../design/system';
import { AppButton, IconButton, ProgressBar } from '../ui';
import {
  canSubmitResolution,
  getResolutionChoices,
  requiresResolutionNote,
  type ChapterFeedbackReviewItem,
  type TranslatorFeedbackResolution,
} from '../../services/feedback';
import { FeedbackAudioButton, FeedbackVerdict } from './FeedbackResponseCard';
import { announceForAccessibility } from '../../utils/a11y';

export interface FeedbackFocusedReviewProps {
  visible: boolean;
  /** The item under review; null once the queue is finished. */
  item: ChapterFeedbackReviewItem | null;
  position: number;
  total: number;
  chapterLabel: string;
  language: string;
  note: string;
  onChangeNote: (note: string) => void;
  busy: boolean;
  /** An Alert cannot show over a modal, so a failed decision is reported inline. */
  failed: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onResolve: (resolution: TranslatorFeedbackResolution) => void;
  onSkip: () => void;
  onClose: () => void;
}

// One decision per page: the response, the reason, and the two outcomes, with
// nothing else competing. Walks the open items the list had when review began.
export function FeedbackFocusedReview({
  visible,
  item,
  position,
  total,
  chapterLabel,
  language,
  note,
  onChangeNote,
  busy,
  failed,
  isPlaying,
  onPlay,
  onResolve,
  onSkip,
  onClose,
}: FeedbackFocusedReviewProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // iOS page sheets sit below the status bar already; Android modals cover it.
  const topInset = Platform.OS === 'ios' ? spacing.lg : insets.top + spacing.md;
  const choices = item ? getResolutionChoices(item) : [];
  const ready = item ? canSubmitResolution(item, note) : false;

  const headerLabel = item
    ? `${chapterLabel} · ${t('feedback.progress', { current: position, total })}`
    : chapterLabel;

  // Deciding swaps the page in place and the focus stays on the pressed button, so
  // a screen reader hears nothing unless the new position, the end of the queue, or
  // a failure is spoken. The first page needs none: opening the sheet reads it.
  const announcedItemId = useRef<string | null>(null);
  const itemId = item?.id ?? null;
  useEffect(() => {
    if (!visible) {
      announcedItemId.current = null;
      return;
    }
    const previous = announcedItemId.current;
    announcedItemId.current = itemId;
    if (previous === null || previous === itemId) return;
    announceForAccessibility(itemId ? headerLabel : t('feedback.complete'));
  }, [headerLabel, itemId, t, visible]);

  useEffect(() => {
    if (visible && failed) announceForAccessibility(t('common.unexpectedError'));
  }, [failed, t, visible]);

  const choiceLabel = (resolution: TranslatorFeedbackResolution) =>
    resolution === 'fixed'
      ? t('feedback.markAddressed')
      : item?.sentiment === 'up'
        ? t('feedback.markReviewed')
        : t('feedback.noChange');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.screen, { backgroundColor: colors.background, paddingTop: topInset }]}
      >
        <View style={styles.header}>
          <IconButton icon={X} onPress={onClose} accessibilityLabel={t('interface.close')} />
          <Text
            accessibilityRole="header"
            style={[styles.headerLabel, { color: colors.secondaryText }]}
            numberOfLines={2}
          >
            {headerLabel}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        {/* The header already says "3 of 7"; the bar is its picture. */}
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <ProgressBar
            progress={total ? (item ? (position - 1) / total : 1) : 0}
            height={3}
            style={styles.progress}
          />
        </View>

        {item ? (
          <>
            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              <FeedbackVerdict item={item} />
              {!!item.comment && (
                <Text style={[styles.comment, { color: colors.primaryText }]}>{item.comment}</Text>
              )}
              <FeedbackAudioButton item={item} isPlaying={isPlaying} onPlay={onPlay} />
              <Text style={[styles.meta, { color: colors.secondaryText }]}>
                {`${item.participantName || t('bible.translatorReviewUnknownUser')} · ${new Date(
                  item.createdAt
                ).toLocaleDateString(language)}`}
              </Text>
              {requiresResolutionNote(item) && (
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
                <Text style={[styles.meta, { color: colors.error }]} accessibilityRole="alert">
                  {t('common.unexpectedError')}
                </Text>
              )}
            </ScrollView>
            <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
              <View style={styles.choices}>
                {choices.map((resolution, index) => (
                  <AppButton
                    key={resolution}
                    label={choiceLabel(resolution)}
                    variant={index === 0 ? 'primary' : 'outline'}
                    size="lg"
                    loading={busy && index === 0}
                    disabled={busy || !ready}
                    onPress={() => onResolve(resolution)}
                    style={styles.choice}
                  />
                ))}
              </View>
              <AppButton
                label={t('feedback.skip')}
                variant="ghost"
                size="md"
                disabled={busy}
                onPress={onSkip}
              />
            </View>
          </>
        ) : (
          <View style={styles.finished}>
            <CheckCheck size={40} color={colors.success} strokeWidth={1.8} />
            <Text
              accessibilityRole="header"
              style={[styles.finishedTitle, { color: colors.primaryText }]}
            >
              {t('feedback.complete')}
            </Text>
            <AppButton label={t('common.done')} variant="primary" size="lg" onPress={onClose} />
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: layout.screenPadding,
  },
  headerLabel: { ...typography.label, flexShrink: 1, textAlign: 'center' },
  headerSpacer: { width: layout.iconButton },
  progress: { marginHorizontal: layout.screenPadding, marginTop: spacing.md },
  content: { padding: layout.screenPadding, gap: spacing.md },
  comment: { ...typography.cardTitle, fontWeight: '400' },
  meta: { ...typography.caption },
  input: {
    ...typography.body,
    minHeight: 110,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.sm,
    textAlignVertical: 'top',
  },
  footer: { paddingHorizontal: layout.screenPadding, gap: spacing.sm, alignItems: 'center' },
  choices: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch' },
  choice: { flex: 1 },
  finished: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: layout.screenPadding,
  },
  finishedTitle: { ...typography.cardTitle, textAlign: 'center' },
});
