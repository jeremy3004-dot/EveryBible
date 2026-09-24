import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Pause, Play } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { radius, spacing, typography } from '../../design/system';
import { AppButton, AppCard } from '../ui';
import {
  formatVoiceNoteDuration,
  getFeedbackOutcomeKey,
  getFeedbackSourceKey,
  type ChapterFeedbackReviewItem,
} from '../../services/feedback';

export interface FeedbackVerdictProps {
  item: ChapterFeedbackReviewItem;
}

/** The reviewer's verdict first, then who sent it: the two facts a translator sorts by. */
export function FeedbackVerdict({ item }: FeedbackVerdictProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const isPositive = item.sentiment === 'up';
  const Icon = isPositive ? Check : AlertTriangle;
  const ink = isPositive ? colors.onSuccessSoft : colors.onWarningSoft;
  return (
    <View style={styles.verdictRow}>
      <View
        style={[
          styles.verdictPill,
          { backgroundColor: isPositive ? colors.successSoft : colors.warningSoft },
        ]}
      >
        <Icon size={13} color={ink} strokeWidth={2.4} />
        <Text style={[styles.verdictLabel, { color: ink }]}>
          {t(isPositive ? 'bible.chapterFeedbackThumbsUp' : 'bible.chapterFeedbackThumbsDown')}
        </Text>
      </View>
      <Text style={[styles.meta, { color: colors.secondaryText }]} numberOfLines={1}>
        {t(getFeedbackSourceKey(item))}
      </Text>
    </View>
  );
}

export interface FeedbackAudioButtonProps {
  item: ChapterFeedbackReviewItem;
  isPlaying: boolean;
  onPlay: () => void;
}

export function FeedbackAudioButton({ item, isPlaying, onPlay }: FeedbackAudioButtonProps) {
  const { t } = useTranslation();
  if (!item.audioResponse) return null;
  const label = t(isPlaying ? 'bible.translatorReviewPause' : 'bible.translatorReviewListen');
  return (
    <AppButton
      label={`${label} · ${formatVoiceNoteDuration(item.audioResponse.durationMs)}`}
      accessibilityLabel={`${label}, ${t('myFeedback.audioLabel')}`}
      leadingIcon={isPlaying ? Pause : Play}
      variant="outline"
      size="md"
      onPress={onPlay}
      style={styles.audioButton}
    />
  );
}

export interface FeedbackResponseCardProps {
  item: ChapterFeedbackReviewItem;
  language: string;
  isPlaying: boolean;
  busy: boolean;
  onPlay: () => void;
  /** Open items: start the focused review at this item. */
  onReview: () => void;
  /** Open praise: settle it without leaving the list. */
  onMarkReviewed: () => void;
  onReopen: () => void;
}

export function FeedbackResponseCard({
  item,
  language,
  isPlaying,
  busy,
  onPlay,
  onReview,
  onMarkReviewed,
  onReopen,
}: FeedbackResponseCardProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const isOpen = !item.resolution;
  const name = item.participantName || t('bible.translatorReviewUnknownUser');
  const date = new Date(item.createdAt).toLocaleDateString(language);

  return (
    <AppCard onPress={isOpen ? onReview : undefined} accessibilityLabel={item.comment ?? name}>
      <View style={styles.body}>
        <FeedbackVerdict item={item} />
        {!!item.comment && (
          <Text style={[styles.comment, { color: colors.primaryText }]} numberOfLines={4}>
            {item.comment}
          </Text>
        )}
        <FeedbackAudioButton item={item} isPlaying={isPlaying} onPlay={onPlay} />
        <Text style={[styles.meta, { color: colors.secondaryText }]}>{`${name} · ${date}`}</Text>

        {isOpen ? (
          <View style={[styles.actions, { borderTopColor: colors.cardBorder }]}>
            {item.sentiment === 'down' ? (
              <AppButton
                label={t('feedback.reviewFeedback')}
                variant="outline"
                size="md"
                onPress={onReview}
              />
            ) : (
              <AppButton
                label={t('feedback.markReviewed')}
                leadingIcon={Check}
                variant="outline"
                size="md"
                disabled={busy}
                onPress={onMarkReviewed}
              />
            )}
          </View>
        ) : (
          <View style={[styles.actions, { borderTopColor: colors.cardBorder }]}>
            <View style={styles.outcome}>
              <Text style={[styles.outcomeLabel, { color: colors.primaryText }]}>
                {t(getFeedbackOutcomeKey(item))}
              </Text>
              {!!item.resolutionNote && (
                <Text style={[styles.meta, { color: colors.secondaryText }]}>
                  {item.resolutionNote}
                </Text>
              )}
            </View>
            <AppButton
              label={t('bible.translatorReviewReopen')}
              variant="ghost"
              size="md"
              disabled={busy}
              onPress={onReopen}
            />
          </View>
        )}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.sm },
  verdictRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  verdictPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: radius.pill,
  },
  verdictLabel: { ...typography.label },
  meta: { ...typography.caption, flexShrink: 1 },
  comment: { ...typography.body },
  audioButton: { alignSelf: 'flex-start' },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
    marginTop: spacing.xs,
  },
  outcome: { flexShrink: 1, gap: spacing.xs / 2 },
  outcomeLabel: { ...typography.label },
});
