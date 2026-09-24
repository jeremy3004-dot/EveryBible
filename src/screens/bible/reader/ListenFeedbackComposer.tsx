import {
  StyleSheet,
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { layout, radius, spacing } from '../../../design/system';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { readerSharedStyles } from './readerSharedStyles';
import { ChapterFeedbackAudioControls } from './ChapterFeedbackAudioControls';
import type { ChapterFeedback } from './useChapterFeedback';

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

      <View style={readerSharedStyles.feedbackSentimentRow}>
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
              readerSharedStyles.feedbackActionButton,
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
                  readerSharedStyles.feedbackActionLabel,
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
          style={[readerSharedStyles.feedbackErrorText, { color: colors.error }]}
        >
          {feedbackSubmitError}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  listenFeedbackCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 16,
    gap: 14,
  },
  listenFeedbackHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  listenFeedbackHeaderStacked: {
    flexDirection: 'column',
  },
  listenFeedbackCopy: {
    flex: 1,
    gap: 4,
  },
  listenFeedbackCopyStacked: {
    // flex: 1 in a column would try to fill a height the card does not have.
    flex: 0,
  },
  listenFeedbackTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  listenFeedbackBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  listenFeedbackIdentityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  listenFeedbackIdentityText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
  },
  listenFeedbackIdentityTextCompact: {
    maxWidth: 110,
  },
  listenSentimentButton: {
    flex: 1,
    minHeight: layout.minTouchTarget,
    borderWidth: 1,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listenFeedbackInput: {
    minHeight: 96,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    lineHeight: 21,
    textAlignVertical: 'top',
  },
  listenFeedbackHint: {
    fontSize: 12,
    lineHeight: 17,
  },
  listenFeedbackSubmitButton: {
    minWidth: 0,
  },
});
