import {
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { radius, spacing, typography } from '../../../design/system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getTranslatedBookName } from '../../../constants';
import { useTheme } from '../../../contexts/ThemeContext';
import { readerSharedStyles } from './readerSharedStyles';
import { ChapterFeedbackAudioControls } from './ChapterFeedbackAudioControls';
import type { ChapterFeedback } from './useChapterFeedback';

interface ChapterFeedbackModalProps {
  feedback: ChapterFeedback;
  bookId: string;
  chapter: number;
}

/** The reader's chapter feedback sheet, kept above the keyboard. */
export function ChapterFeedbackModal({ feedback, bookId, chapter }: ChapterFeedbackModalProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const safeInsets = useSafeAreaInsets();
  const {
    participationMode,
    showFeedbackModal,
    feedbackSentiment,
    setFeedbackSentiment,
    feedbackComment,
    setFeedbackComment,
    isSubmittingFeedback,
    feedbackSubmitError,
    setFeedbackSubmitError,
    canSubmitFeedback,
    handleCloseFeedbackModal,
    handleSubmitChapterFeedback,
  } = feedback;

  return (
    <Modal
      visible={showFeedbackModal}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="fade"
      onRequestClose={handleCloseFeedbackModal}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={safeInsets.top + spacing.lg}
        style={[readerSharedStyles.feedbackModalOverlay, { backgroundColor: colors.overlay }]}
      >
        <TouchableOpacity
          style={readerSharedStyles.feedbackModalBackdrop}
          activeOpacity={1}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          onPress={handleCloseFeedbackModal}
        />
        <View
          style={[
            styles.feedbackModalCard,
            {
              backgroundColor: colors.bibleSurface,
              borderColor: colors.bibleDivider,
            },
          ]}
        >
          <ScrollView
            style={styles.feedbackModalScroll}
            contentContainerStyle={styles.feedbackModalScrollContent}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.feedbackModalTitle, { color: colors.biblePrimaryText }]}>
              {t('bible.chapterFeedbackTitle')}
              {' · '}
              {t(
                participationMode === 'scripture_council'
                  ? 'feedback.council'
                  : 'feedback.community'
              )}
            </Text>
            <Text style={[styles.feedbackModalReference, { color: colors.bibleSecondaryText }]}>
              {getTranslatedBookName(bookId, t)} {chapter}
            </Text>
            <Text style={[styles.feedbackModalBody, { color: colors.bibleSecondaryText }]}>
              {t(
                participationMode === 'scripture_council'
                  ? 'feedback.submittingCouncil'
                  : 'feedback.submittingCommunity'
              )}
            </Text>

            <View style={readerSharedStyles.feedbackSentimentRow}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ selected: feedbackSentiment === 'up' }}
                accessibilityLabel={t('bible.chapterFeedbackThumbsUp')}
                style={[
                  styles.feedbackSentimentButton,
                  {
                    // White on the `success` fill is 4.09:1 on vellum, short of AA
                    // for this label; the soft tint pair clears it in both scopes.
                    backgroundColor:
                      feedbackSentiment === 'up' ? colors.successSoft : colors.bibleElevatedSurface,
                    borderColor: feedbackSentiment === 'up' ? colors.success : colors.bibleDivider,
                  },
                ]}
                onPress={() => {
                  setFeedbackSentiment('up');
                  if (feedbackSubmitError) {
                    setFeedbackSubmitError(null);
                  }
                }}
                disabled={isSubmittingFeedback}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={18}
                  color={
                    feedbackSentiment === 'up' ? colors.onSuccessSoft : colors.biblePrimaryText
                  }
                />
                <Text
                  style={[
                    styles.feedbackSentimentLabel,
                    {
                      color:
                        feedbackSentiment === 'up' ? colors.onSuccessSoft : colors.biblePrimaryText,
                    },
                  ]}
                >
                  {t('bible.chapterFeedbackThumbsUp')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ selected: feedbackSentiment === 'down' }}
                accessibilityLabel={t('bible.chapterFeedbackThumbsDown')}
                style={[
                  styles.feedbackSentimentButton,
                  {
                    backgroundColor:
                      feedbackSentiment === 'down'
                        ? colors.accentPrimary
                        : colors.bibleElevatedSurface,
                    borderColor:
                      feedbackSentiment === 'down' ? colors.accentPrimary : colors.bibleDivider,
                  },
                ]}
                onPress={() => {
                  setFeedbackSentiment('down');
                  if (feedbackSubmitError) {
                    setFeedbackSubmitError(null);
                  }
                }}
                disabled={isSubmittingFeedback}
              >
                <Ionicons
                  name="close-circle-outline"
                  size={18}
                  color={feedbackSentiment === 'down' ? colors.onAccent : colors.biblePrimaryText}
                />
                <Text
                  style={[
                    styles.feedbackSentimentLabel,
                    {
                      color:
                        feedbackSentiment === 'down' ? colors.onAccent : colors.biblePrimaryText,
                    },
                  ]}
                >
                  {t('bible.chapterFeedbackThumbsDown')}
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              value={feedbackComment}
              onChangeText={setFeedbackComment}
              editable={!isSubmittingFeedback}
              multiline
              numberOfLines={4}
              maxLength={2000}
              placeholder={t('bible.chapterFeedbackPlaceholder')}
              placeholderTextColor={colors.bibleSecondaryText}
              accessibilityLabel={t('bible.chapterFeedbackPlaceholder')}
              style={[
                styles.feedbackCommentInput,
                {
                  color: colors.biblePrimaryText,
                  borderColor: colors.controlBorder,
                  backgroundColor: colors.bibleElevatedSurface,
                },
              ]}
            />
            <Text style={[styles.feedbackCharCount, { color: colors.bibleSecondaryText }]}>
              {`${feedbackComment.length}/2000`}
            </Text>

            <ChapterFeedbackAudioControls feedback={feedback} />

            {feedbackSubmitError ? (
              <Text
                accessibilityLiveRegion="polite"
                style={[readerSharedStyles.feedbackErrorText, { color: colors.error }]}
              >
                {feedbackSubmitError}
              </Text>
            ) : null}

            <View style={styles.feedbackActionRow}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
                style={[
                  readerSharedStyles.feedbackActionButton,
                  {
                    borderColor: colors.bibleDivider,
                    backgroundColor: colors.bibleElevatedSurface,
                  },
                ]}
                onPress={handleCloseFeedbackModal}
                disabled={isSubmittingFeedback}
              >
                <Text
                  style={[
                    readerSharedStyles.feedbackActionLabel,
                    { color: colors.biblePrimaryText },
                  ]}
                >
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('bible.chapterFeedbackSubmit')}
                accessibilityState={{ disabled: !canSubmitFeedback }}
                style={[
                  readerSharedStyles.feedbackActionButton,
                  styles.feedbackSubmitButton,
                  {
                    backgroundColor: canSubmitFeedback ? colors.accentPrimary : colors.bibleDivider,
                    borderColor: canSubmitFeedback ? colors.accentPrimary : colors.bibleDivider,
                  },
                ]}
                onPress={() => {
                  void handleSubmitChapterFeedback('reader');
                }}
                disabled={!canSubmitFeedback}
              >
                {isSubmittingFeedback ? (
                  <ActivityIndicator size="small" color={colors.cardBackground} />
                ) : (
                  <Text
                    style={[
                      readerSharedStyles.feedbackActionLabel,
                      { color: canSubmitFeedback ? colors.cardBackground : colors.secondaryText },
                    ]}
                  >
                    {t('bible.chapterFeedbackSubmit')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  feedbackModalCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  feedbackModalScroll: {
    maxHeight: '100%',
  },
  feedbackModalScrollContent: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  feedbackModalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  feedbackModalReference: {
    ...typography.label,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  feedbackModalBody: {
    fontSize: 14,
    lineHeight: 21,
  },
  feedbackSentimentButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  feedbackSentimentLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  feedbackCommentInput: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    lineHeight: 21,
    textAlignVertical: 'top',
  },
  feedbackCharCount: {
    ...typography.micro,
    alignSelf: 'flex-end',
    marginTop: spacing.xs,
  },
  feedbackActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  feedbackSubmitButton: {
    minWidth: 132,
  },
});
