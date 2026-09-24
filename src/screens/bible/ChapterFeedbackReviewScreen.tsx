import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { useTranslation } from 'react-i18next';
import { Check, CheckCheck, ChevronDown, Users } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, spacing, typography } from '../../design/system';
import { getTranslatedBookName } from '../../constants';
import { useTranslatorReviewStore } from '../../stores/translatorReviewStore';
import {
  buildReviewQueue,
  fetchChapterFeedbackForTranslatorReview,
  getChapterReviewHeadline,
  getNextQueuedId,
  resolveTranslatorFeedbackOnServer,
  reopenTranslatorFeedbackOnServer,
  reviewPositiveFeedbackBatch,
  refreshFeedbackAudioUrl,
  TRANSLATION_NOT_COVERED,
  type ChapterFeedbackReviewItem,
  type FeedbackCategoryFilter,
  type FeedbackStatusFilter,
  type FeedbackPageCursor,
  type TranslatorFeedbackChapterSummary,
  type TranslatorFeedbackResolution,
} from '../../services/feedback';
import {
  FeedbackFocusedReview,
  FeedbackResponseCard,
  TranslationNotCoveredNotice,
} from '../../components/feedback';
import {
  AppButton,
  AppCard,
  BackArrowIcon,
  IconButton,
  ListRow,
  Sheet,
  TabSwitch,
} from '../../components/ui';
import type { BibleStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<BibleStackParamList, 'ChapterFeedbackReview'>;

/** A focused review walks a snapshot of the open items, so reloads never reshuffle it. */
interface ReviewSession {
  queue: string[];
  byId: Record<string, ChapterFeedbackReviewItem>;
  currentId: string | null;
  handled: ReadonlySet<string>;
}

const SOURCE_FILTERS: { value: FeedbackCategoryFilter; labelKey: string }[] = [
  { value: 'all', labelKey: 'feedback.everyone' },
  { value: 'scripture_council', labelKey: 'feedback.council' },
  { value: 'community', labelKey: 'feedback.community' },
];

export function ChapterFeedbackReviewScreen({ route, navigation }: Props) {
  const { translationId, bookId, chapter } = route.params;
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();

  const insets = useSafeAreaInsets();
  const passcode = useTranslatorReviewStore((state) => state.accessPasscode);
  const enabled = useTranslatorReviewStore((state) => state.enabled);
  const [category, setCategory] = useState<FeedbackCategoryFilter>('all');
  const [status, setStatus] = useState<FeedbackStatusFilter>('pending');
  const [positiveOnly, setPositiveOnly] = useState(false);
  const [items, setItems] = useState<ChapterFeedbackReviewItem[]>([]);
  const [summary, setSummary] = useState<TranslatorFeedbackChapterSummary | null>(null);
  const [positiveCount, setPositiveCount] = useState(0);
  const [cursor, setCursor] = useState<FeedbackPageCursor | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [failed, setFailed] = useState(false);
  // Set when this passcode does not open the translation; holds what it does open.
  const [notCovered, setNotCovered] = useState<{ coveredTranslationIds?: string[] } | null>(null);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [review, setReview] = useState<ReviewSession | null>(null);
  const [reviewFailed, setReviewFailed] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const sound = useRef<Audio.Sound | null>(null);
  const soundId = useRef<string | null>(null);
  const requestId = useRef(0);
  const busy = useRef(false);
  const chapterLabel = `${getTranslatedBookName(bookId, t)} ${chapter}`;
  const input = useCallback(
    () => ({
      apiVersion: 2 as const,
      translationId,
      bookId,
      chapter,
      passcode: passcode ?? '',
      category,
      status,
      positiveOnly,
    }),
    [translationId, bookId, chapter, passcode, category, status, positiveOnly]
  );

  const load = useCallback(
    async (page: FeedbackPageCursor | null = null) => {
      if (!enabled || !passcode || (page && busy.current)) return;
      const request = ++requestId.current;
      busy.current = true;
      setLoading(true);
      setFailed(false);
      setNotCovered(null);
      if (!page) {
        setItems([]);
        setCursor(null);
      }
      const result = await fetchChapterFeedbackForTranslatorReview({ ...input(), cursor: page });
      if (request !== requestId.current) return;
      busy.current = false;
      setLoading(false);
      if (!result.success) {
        setFailed(true);
        if (result.code === TRANSLATION_NOT_COVERED) {
          setNotCovered({ coveredTranslationIds: result.coveredTranslationIds });
        }
        return;
      }
      setItems((previous) =>
        page
          ? [
              ...previous,
              ...result.feedback.filter(
                (item) => !previous.some((existing) => existing.id === item.id)
              ),
            ]
          : result.feedback
      );
      setSummary(result.summary ?? null);
      setPositiveCount(result.positiveCount ?? 0);
      setCursor(result.nextCursor ?? null);
    },
    [enabled, passcode, input]
  );

  const stopAudio = useCallback(() => {
    void sound.current?.unloadAsync().catch(() => {});
    sound.current = null;
    soundId.current = null;
    setPlaying(null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        ++requestId.current;
        busy.current = false;
        stopAudio();
      };
    }, [load, stopAudio])
  );

  // Reports success so the list can alert while the focused review, where an Alert
  // cannot show over its modal, reports inline instead.
  const resolve = async (
    item: ChapterFeedbackReviewItem,
    resolution: TranslatorFeedbackResolution | null
  ): Promise<boolean> => {
    if (!passcode || mutating) return false;
    const note = notes[item.id]?.trim() ?? '';
    if (resolution && item.sentiment === 'down' && !note) return false;
    setMutating(true);
    const args = { apiVersion: 2 as const, passcode, translationId, feedbackId: item.id };
    const result = resolution
      ? await resolveTranslatorFeedbackOnServer({ ...args, resolution, note })
      : await reopenTranslatorFeedbackOnServer(args);
    setMutating(false);
    if (!result.success) return false;
    void load();
    return true;
  };

  const resolveFromList = async (
    item: ChapterFeedbackReviewItem,
    resolution: TranslatorFeedbackResolution | null
  ) => {
    if (!(await resolve(item, resolution))) {
      Alert.alert(t('common.error'), t('common.unexpectedError'));
    }
  };

  const reviewPositive = async () => {
    if (mutating) return;
    setMutating(true);
    const preview = await reviewPositiveFeedbackBatch(input());
    setMutating(false);
    if (!preview.success) {
      Alert.alert(t('common.error'), t('common.unexpectedError'));
      return;
    }
    const ids = preview.feedbackIds ?? [];
    if (!ids.length) {
      await load();
      return;
    }
    // Freeze the preview's exact IDs. New feedback is never silently included.
    Alert.alert(t('feedback.markReviewed'), t('feedback.bulkConfirm', { count: ids.length }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('feedback.markReviewed'),
        onPress: () => {
          setMutating(true);
          void reviewPositiveFeedbackBatch(input(), ids).then(async (result) => {
            setMutating(false);
            if (!result.success) Alert.alert(t('common.error'), t('common.unexpectedError'));
            await load();
          });
        },
      },
    ]);
  };

  const play = async (item: ChapterFeedbackReviewItem) => {
    try {
      if (soundId.current === item.id && sound.current) {
        if (playing === item.id) {
          await sound.current.pauseAsync();
          setPlaying(null);
        } else {
          await sound.current.playAsync();
          setPlaying(item.id);
        }
        return;
      }
      await sound.current?.unloadAsync();
      sound.current = null;
      soundId.current = item.id;
      const audio = await refreshFeedbackAudioUrl({ ...input(), feedbackId: item.id });
      if (!audio.success || !audio.playbackUrl) throw new Error('Audio unavailable');
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const created = await Audio.Sound.createAsync(
        { uri: audio.playbackUrl },
        { shouldPlay: true }
      );
      sound.current = created.sound;
      setPlaying(item.id);
      created.sound.setOnPlaybackStatusUpdate((playback) => {
        if (!playback.isLoaded) return;
        if (
          playback.didJustFinish ||
          (playback.durationMillis && playback.positionMillis >= playback.durationMillis * 0.6)
        ) {
          useTranslatorReviewStore.getState().markListened(item.id);
        }
        if (playback.didJustFinish) {
          setPlaying(null);
          void created.sound.unloadAsync();
          sound.current = null;
        }
      });
    } catch {
      setPlaying(null);
      Alert.alert(t('common.error'), t('bible.translatorReviewAudioError'));
    }
  };

  const startReview = (startId?: string) => {
    const queue = buildReviewQueue(items, startId);
    if (!queue.length) return;
    setReviewFailed(false);
    setReview({
      queue,
      byId: Object.fromEntries(items.map((item) => [item.id, item])),
      currentId: queue[0],
      handled: new Set(),
    });
  };

  const advanceReview = (session: ReviewSession, id: string) => {
    stopAudio();
    setReviewFailed(false);
    const handled = new Set(session.handled).add(id);
    setReview({ ...session, handled, currentId: getNextQueuedId(session.queue, handled, id) });
  };

  const decide = async (resolution: TranslatorFeedbackResolution) => {
    const current = review?.currentId ? review.byId[review.currentId] : null;
    if (!review || !current) return;
    if (await resolve(current, resolution)) {
      advanceReview(review, current.id);
    } else {
      setReviewFailed(true);
    }
  };

  const closeReview = () => {
    stopAudio();
    setReview(null);
  };

  const headline = getChapterReviewHeadline(summary, loading);
  const hasOpenItems = items.some((item) => !item.resolution);
  const sourceLabelKey =
    SOURCE_FILTERS.find((filter) => filter.value === category)?.labelKey ?? 'feedback.everyone';
  const reviewItem = review?.currentId ? review.byId[review.currentId] : null;

  const header = (
    <View style={styles.header}>
      <View style={styles.headline}>
        {headline.kind === 'waiting' ? (
          <Text style={[styles.headlineText, { color: colors.primaryText }]}>
            {t('feedback.waiting', { count: headline.count })}
          </Text>
        ) : headline.kind === 'caughtUp' ? (
          <View style={styles.caughtUp}>
            <CheckCheck size={20} color={colors.success} strokeWidth={2} />
            <Text style={[styles.headlineText, { color: colors.primaryText }]}>
              {t('feedback.complete')}
            </Text>
          </View>
        ) : (
          <Text style={[styles.body, { color: colors.secondaryText }]}>
            {t(headline.kind === 'loading' ? 'common.loading' : 'bible.translatorReviewEmpty')}
          </Text>
        )}
        {status === 'pending' && hasOpenItems && (
          <AppButton
            label={t('feedback.startReview')}
            variant="primary"
            size="md"
            onPress={() => startReview()}
          />
        )}
      </View>

      <TabSwitch
        segments={[
          { key: 'pending', label: t('feedback.needsReview') },
          { key: 'reviewed', label: t('feedback.reviewed') },
        ]}
        value={status}
        onChange={(key) => setStatus(key as FeedbackStatusFilter)}
        fullWidth
        size="md"
        accessibilityLabel={t('feedback.statusFilter')}
      />
      <AppButton
        label={t(sourceLabelKey)}
        accessibilityLabel={`${t('feedback.sourceFilter')}: ${t(sourceLabelKey)}`}
        leadingIcon={Users}
        trailingIcon={ChevronDown}
        variant="ghost"
        size="md"
        onPress={() => setSourcePickerOpen(true)}
        style={styles.sourceButton}
      />

      {positiveOnly ? (
        <View style={styles.positiveRow}>
          <Text style={[styles.positiveText, { color: colors.primaryText }]}>
            {t('feedback.plainPositive', { count: positiveCount })}
          </Text>
          <AppButton
            label={t('feedback.showComments')}
            variant="ghost"
            size="md"
            onPress={() => setPositiveOnly(false)}
          />
        </View>
      ) : (
        positiveCount > 0 && (
          <AppCard padding={layout.denseCardPadding}>
            <View style={styles.positiveRow}>
              <Check size={18} color={colors.success} strokeWidth={2.4} />
              <Text style={[styles.positiveText, { color: colors.primaryText }]}>
                {t('feedback.plainPositive', { count: positiveCount })}
              </Text>
            </View>
            <View style={styles.positiveActions}>
              <AppButton
                label={t('feedback.viewPositive')}
                variant="ghost"
                size="md"
                onPress={() => setPositiveOnly(true)}
              />
              {status === 'pending' && (
                <AppButton
                  label={t('feedback.markReviewed')}
                  variant="outline"
                  size="md"
                  disabled={mutating}
                  onPress={() => {
                    void reviewPositive();
                  }}
                />
              )}
            </View>
          </AppCard>
        )
      )}

      {notCovered ? (
        // This screen is pinned to one translation, so after switching the reader go back to
        // it; the reader then shows the new translation's feedback summary.
        <TranslationNotCoveredNotice
          translationId={translationId}
          coveredTranslationIds={notCovered.coveredTranslationIds}
          onRetry={() => {
            void load();
          }}
          onSwitched={() => navigation.goBack()}
        />
      ) : (
        failed && (
          <AppButton
            label={t('common.retry')}
            variant="outline"
            size="md"
            onPress={() => {
              void load();
            }}
          />
        )
      )}
    </View>
  );

  const renderItem = ({ item }: { item: ChapterFeedbackReviewItem }) => (
    <FeedbackResponseCard
      item={item}
      language={i18n.language}
      isPlaying={playing === item.id}
      busy={mutating}
      onPlay={() => {
        void play(item);
      }}
      onReview={() => startReview(item.id)}
      onMarkReviewed={() => {
        void resolveFromList(item, 'no_change_needed');
      }}
      onReopen={() => {
        void resolveFromList(item, null);
      }}
    />
  );

  // A caught-up chapter already says so in the headline, and the accurate-with-no-comment
  // row already lists what the comment list leaves out; an empty list only needs
  // explaining when a filter is hiding everything.
  const showNoMatching =
    !loading &&
    !failed &&
    !!summary?.total &&
    (positiveOnly || positiveCount === 0) &&
    !(status === 'pending' && headline.kind !== 'waiting');

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <View style={styles.top}>
        <IconButton
          icon={BackArrowIcon}
          onPress={() => navigation.goBack()}
          accessibilityLabel={t('common.back')}
        />
        <View style={styles.titleBlock}>
          <Text
            accessibilityRole="header"
            style={[styles.title, { color: colors.primaryText }]}
            numberOfLines={1}
          >
            {chapterLabel}
          </Text>
          <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
            {t('feedback.title')}
          </Text>
        </View>
      </View>
      {enabled ? (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 90 }]}
          refreshControl={
            <RefreshControl
              refreshing={loading && !items.length}
              onRefresh={() => {
                void load();
              }}
            />
          }
          onEndReached={() => {
            if (cursor) void load(cursor);
          }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            showNoMatching ? (
              <Text style={[styles.body, { color: colors.secondaryText }]}>
                {t('feedback.noMatching')}
              </Text>
            ) : null
          }
          ListFooterComponent={
            loading ? (
              <ActivityIndicator color={colors.accentPrimary} />
            ) : cursor ? (
              <AppButton
                label={t('common.continue')}
                variant="outline"
                size="md"
                onPress={() => {
                  void load(cursor);
                }}
              />
            ) : null
          }
        />
      ) : (
        <Text style={[styles.body, styles.content, { color: colors.secondaryText }]}>
          {t('settings.translatorAccessSummaryOff')}
        </Text>
      )}

      <Sheet
        visible={sourcePickerOpen}
        onClose={() => setSourcePickerOpen(false)}
        title={t('feedback.sourceFilter')}
      >
        {SOURCE_FILTERS.map((filter, index) => (
          <ListRow
            key={filter.value}
            title={t(filter.labelKey)}
            trailing={
              category === filter.value ? (
                <Check size={18} color={colors.accentPrimary} strokeWidth={2.4} />
              ) : undefined
            }
            isLast={index === SOURCE_FILTERS.length - 1}
            onPress={() => {
              setCategory(filter.value);
              setSourcePickerOpen(false);
            }}
          />
        ))}
      </Sheet>

      <FeedbackFocusedReview
        visible={!!review}
        item={reviewItem}
        position={(review?.handled.size ?? 0) + 1}
        total={review?.queue.length ?? 0}
        chapterLabel={chapterLabel}
        language={i18n.language}
        note={reviewItem ? (notes[reviewItem.id] ?? '') : ''}
        onChangeNote={(value) => {
          if (reviewItem) setNotes((previous) => ({ ...previous, [reviewItem.id]: value }));
        }}
        busy={mutating}
        failed={reviewFailed}
        isPlaying={!!reviewItem && playing === reviewItem.id}
        onPlay={() => {
          if (reviewItem) void play(reviewItem);
        }}
        onResolve={(resolution) => {
          void decide(resolution);
        }}
        onSkip={() => {
          if (review && reviewItem) advanceReview(review, reviewItem.id);
        }}
        onClose={closeReview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
  },
  titleBlock: { flexShrink: 1 },
  title: { ...typography.sectionTitle },
  subtitle: { ...typography.caption },
  content: { paddingHorizontal: layout.screenPadding, gap: spacing.md },
  header: { gap: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  headline: { gap: spacing.md, alignItems: 'flex-start' },
  headlineText: { ...typography.cardTitle },
  caughtUp: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  body: { ...typography.body },
  sourceButton: { alignSelf: 'flex-start' },
  positiveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  positiveText: { ...typography.bodyMedium, flexShrink: 1 },
  positiveActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
