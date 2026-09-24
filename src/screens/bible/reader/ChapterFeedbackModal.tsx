import {
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getTranslatedBookName } from '../../../constants';
import { useTheme } from '../../../contexts/ThemeContext';
import { spacing } from '../../../design/system';
import { ChapterFeedbackAudioControls } from './ChapterFeedbackAudioControls';
import type { ChapterFeedback } from './useChapterFeedback';
import { styles } from './readerStyles';

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
        style={[styles.feedbackModalOverlay, { backgroundColor: colors.overlay }]}
      >
        <TouchableOpacity
          style={styles.feedbackModalBackdrop}
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

            <View style={styles.feedbackSentimentRow}>
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
                style={[styles.feedbackErrorText, { color: colors.error }]}
              >
                {feedbackSubmitError}
              </Text>
            ) : null}

            <View style={styles.feedbackActionRow}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
                style={[
                  styles.feedbackActionButton,
                  {
                    borderColor: colors.bibleDivider,
                    backgroundColor: colors.bibleElevatedSurface,
                  },
                ]}
                onPress={handleCloseFeedbackModal}
                disabled={isSubmittingFeedback}
              >
                <Text style={[styles.feedbackActionLabel, { color: colors.biblePrimaryText }]}>
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('bible.chapterFeedbackSubmit')}
                accessibilityState={{ disabled: !canSubmitFeedback }}
                style={[
                  styles.feedbackActionButton,
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
                      styles.feedbackActionLabel,
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
