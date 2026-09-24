import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { ChapterFeedbackAudioControls } from './ChapterFeedbackAudioControls';
import type { ChapterFeedback } from './useChapterFeedback';
import { styles } from './readerStyles';

interface ListenFeedbackComposerProps {
  feedback: ChapterFeedback;
  isLargeText: boolean;
}

/** The listen page's inline feedback card: sentiment, note, voice note and submit. */
export function ListenFeedbackComposer({ feedback, isLargeText }: ListenFeedbackComposerProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const {
    participationMode,
    savedChapterFeedbackIdentity,
    feedbackSentiment,
    setFeedbackSentiment,
    feedbackComment,
    setFeedbackComment,
    isSubmittingFeedback,
    feedbackSubmitError,
    setFeedbackSubmitError,
    canSubmitFeedback,
    handleSubmitChapterFeedback,
  } = feedback;

  return (
    <View
      style={[
        styles.listenFeedbackCard,
        {
          backgroundColor: colors.bibleSurface,
          borderColor: colors.bibleDivider,
        },
      ]}
    >
      {/* At large text the identity pill takes its own line under the heading,
                so "Name • Role" wraps instead of truncating beside it. */}
      <View
        style={[styles.listenFeedbackHeader, isLargeText && styles.listenFeedbackHeaderStacked]}
      >
        <View style={[styles.listenFeedbackCopy, isLargeText && styles.listenFeedbackCopyStacked]}>
          <Text style={[styles.listenFeedbackTitle, { color: colors.biblePrimaryText }]}>
            {t('bible.chapterFeedbackTitle')}
            {' · '}
            {t(
              participationMode === 'scripture_council' ? 'feedback.council' : 'feedback.community'
            )}
          </Text>
          <Text style={[styles.listenFeedbackBody, { color: colors.bibleSecondaryText }]}>
            {t(
              participationMode === 'scripture_council'
                ? 'feedback.submittingCouncil'
                : 'feedback.submittingCommunity'
            )}
          </Text>
        </View>
        <View
          style={[
            styles.listenFeedbackIdentityPill,
            {
              backgroundColor: colors.bibleElevatedSurface,
              borderColor: colors.bibleDivider,
            },
          ]}
        >
          <Ionicons name="person-outline" size={14} color={colors.bibleSecondaryText} />
          <Text
            style={[
              styles.listenFeedbackIdentityText,
              !isLargeText && styles.listenFeedbackIdentityTextCompact,
              { color: colors.bibleSecondaryText },
            ]}
            numberOfLines={isLargeText ? 2 : 1}
          >
            {savedChapterFeedbackIdentity
              ? `${savedChapterFeedbackIdentity.name} • ${savedChapterFeedbackIdentity.role}`
              : t('common.notSet')}
          </Text>
        </View>
      </View>

      <View style={styles.feedbackSentimentRow}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('bible.chapterFeedbackThumbsUp')}
          accessibilityState={{ selected: feedbackSentiment === 'up' }}
          style={[
            styles.listenSentimentButton,
            {
              backgroundColor:
                feedbackSentiment === 'up' ? colors.success : colors.bibleElevatedSurface,
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
            size={22}
            color={feedbackSentiment === 'up' ? colors.onAccent : colors.biblePrimaryText}
          />
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('bible.chapterFeedbackThumbsDown')}
          accessibilityState={{ selected: feedbackSentiment === 'down' }}
          style={[
            styles.listenSentimentButton,
            {
              backgroundColor:
                feedbackSentiment === 'down' ? colors.accentPrimary : colors.bibleElevatedSurface,
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
            size={22}
            color={feedbackSentiment === 'down' ? colors.onAccent : colors.biblePrimaryText}
          />
        </TouchableOpacity>
      </View>

      {feedbackSentiment ? (
        <>
          <TextInput
            value={feedbackComment}
            onChangeText={(value) => {
              setFeedbackComment(value);
              if (feedbackSubmitError) {
                setFeedbackSubmitError(null);
              }
            }}
            editable={!isSubmittingFeedback}
            multiline
            numberOfLines={3}
            maxLength={2000}
            placeholder={t('bible.chapterFeedbackPlaceholder')}
            placeholderTextColor={colors.bibleSecondaryText}
            accessibilityLabel={t('bible.chapterFeedbackPlaceholder')}
            style={[
              styles.listenFeedbackInput,
              {
                color: colors.biblePrimaryText,
                borderColor: colors.controlBorder,
                backgroundColor: colors.bibleElevatedSurface,
              },
            ]}
          />
          <ChapterFeedbackAudioControls feedback={feedback} compact />
          <TouchableOpacity
            style={[
              styles.feedbackActionButton,
              styles.listenFeedbackSubmitButton,
              {
                backgroundColor: canSubmitFeedback ? colors.accentPrimary : colors.bibleDivider,
                borderColor: canSubmitFeedback ? colors.accentPrimary : colors.bibleDivider,
              },
            ]}
            onPress={() => {
              void handleSubmitChapterFeedback('listener');
            }}
            accessibilityRole="button"
            accessibilityLabel={t('bible.chapterFeedbackSubmit')}
            accessibilityState={{ disabled: !canSubmitFeedback, busy: isSubmittingFeedback }}
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
        </>
      ) : (
        <Text style={[styles.listenFeedbackHint, { color: colors.bibleSecondaryText }]}>
          {t('bible.chapterFeedbackSelectionHint')}
        </Text>
      )}

      {feedbackSubmitError ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.feedbackErrorText, { color: colors.error }]}
        >
          {feedbackSubmitError}
        </Text>
      ) : null}
    </View>
  );
}
