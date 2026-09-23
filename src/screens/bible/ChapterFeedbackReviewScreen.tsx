import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { getTranslatedBookName } from '../../constants';
import { useTranslatorReviewStore } from '../../stores/translatorReviewStore';
import {
  fetchChapterFeedbackForTranslatorReview,
  resolveTranslatorFeedbackOnServer,
  reopenTranslatorFeedbackOnServer,
  reviewPositiveFeedbackBatch,
  refreshFeedbackAudioUrl,
  type ChapterFeedbackReviewItem,
  type FeedbackCategoryFilter,
  type FeedbackStatusFilter,
  type FeedbackPageCursor,
  type TranslatorFeedbackChapterSummary,
  type TranslatorFeedbackResolution,
} from '../../services/feedback';
import type { BibleStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<BibleStackParamList, 'ChapterFeedbackReview'>;
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
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const sound = useRef<Audio.Sound | null>(null);
  const soundId = useRef<string | null>(null);
  const requestId = useRef(0);
  const busy = useRef(false);
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

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        ++requestId.current;
        busy.current = false;
        void sound.current?.unloadAsync().catch(() => {});
        sound.current = null;
        soundId.current = null;
        setPlaying(null);
      };
    }, [load])
  );

  const resolve = async (
    item: ChapterFeedbackReviewItem,
    resolution: TranslatorFeedbackResolution | null
  ) => {
    if (!passcode || mutating) return;
    const note = notes[item.id]?.trim() ?? '';
    if (resolution && item.sentiment === 'down' && !note) return;
    setMutating(true);
    const args = { apiVersion: 2 as const, passcode, translationId, feedbackId: item.id };
    const result = resolution
      ? await resolveTranslatorFeedbackOnServer({ ...args, resolution, note })
      : await reopenTranslatorFeedbackOnServer(args);
    setMutating(false);
    if (!result.success) {
      Alert.alert(t('common.error'), t('common.unexpectedError'));
      return;
    }
    setExpanded(null);
    await load();
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

  const button = (label: string, onPress: () => void, selected = false, disabled = false) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        {
          borderColor: selected ? colors.accentPrimary : colors.cardBorder,
          backgroundColor: selected ? colors.accentPrimary : colors.cardBackground,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Text style={{ color: selected ? colors.onAccent : colors.primaryText }}>{label}</Text>
    </TouchableOpacity>
  );
  const pending = (summary?.unresolvedDown ?? 0) + (summary?.unresolvedUp ?? 0);
  const header = (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.primaryText }]}>
        {getTranslatedBookName(bookId, t)} {chapter}
      </Text>
      <Text style={{ color: colors.secondaryText }}>
        {summary?.total
          ? t('bible.translatorReviewSummary', { count: summary.total, pending })
          : loading
            ? t('common.loading')
            : t('bible.translatorReviewEmpty')}
      </Text>
      {!!summary?.total && pending === 0 && (
        <Text style={{ color: colors.secondaryText }}>{t('feedback.complete')}</Text>
      )}
      <View style={styles.wrap}>
        {(['all', 'scripture_council', 'community'] as const).map((value) => (
          <View key={value}>
            {button(
              t(
                value === 'all'
                  ? 'feedback.all'
                  : value === 'community'
                    ? 'feedback.community'
                    : 'feedback.council'
              ),
              () => setCategory(value),
              category === value
            )}
          </View>
        ))}
      </View>
      <View style={styles.wrap}>
        {button(t('feedback.needsReview'), () => setStatus('pending'), status === 'pending')}
        {button(t('feedback.reviewed'), () => setStatus('reviewed'), status === 'reviewed')}
      </View>
      {(positiveCount > 0 || positiveOnly) && (
        <View
          style={[
            styles.card,
            { borderColor: colors.cardBorder, backgroundColor: colors.cardBackground },
          ]}
        >
          <Text style={{ color: colors.primaryText }}>
            {t('feedback.positiveCount', { count: positiveCount })}
          </Text>
          {button(t(positiveOnly ? 'feedback.showComments' : 'feedback.viewPositive'), () =>
            setPositiveOnly(!positiveOnly)
          )}
          {status === 'pending' &&
            positiveCount > 0 &&
            button(
              t('feedback.reviewPositive'),
              () => {
                void reviewPositive();
              },
              false,
              mutating
            )}
        </View>
      )}
      {failed &&
        button(t('common.retry'), () => {
          void load();
        })}
    </View>
  );
  const renderItem = ({ item }: { item: ChapterFeedbackReviewItem }) => {
    const isExpanded = expanded === item.id;
    const isPositive = item.sentiment === 'up';
    const ratingLabel = t(
      isPositive ? 'bible.chapterFeedbackThumbsUp' : 'bible.chapterFeedbackThumbsDown'
    );
    const outcome = !item.resolution
      ? 'feedback.needsReview'
      : item.resolution === 'fixed'
        ? 'feedback.addressed'
        : item.sentiment === 'up'
          ? 'feedback.reviewed'
          : 'feedback.noChange';
    const source =
      item.contributorCategory === 'scripture_council'
        ? 'feedback.council'
        : item.contributorCategory === 'community'
          ? 'feedback.community'
          : 'feedback.legacy';
    const noteRequired = item.sentiment === 'down' && !notes[item.id]?.trim();
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: isPositive ? colors.successSoft : colors.warningSoft,
            borderColor: isPositive ? colors.success : colors.warning,
            borderLeftWidth: 4,
            borderLeftColor: isPositive ? colors.success : colors.warning,
          },
        ]}
      >
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ expanded: isExpanded }}
          onPress={() => setExpanded(isExpanded ? null : item.id)}
          style={styles.row}
        >
          <View style={styles.wrap}>
            <Text
              accessibilityLabel={ratingLabel}
              style={[
                styles.rating,
                {
                  color: isPositive ? colors.onSuccessSoft : colors.onWarningSoft,
                  backgroundColor: isPositive ? colors.successSoft : colors.warningSoft,
                },
              ]}
            >
              {isPositive ? '✓' : '!'} {ratingLabel}
            </Text>
          </View>
          <Text style={[styles.name, { color: colors.primaryText }]}>
            {item.participantName || t('bible.translatorReviewUnknownUser')}
          </Text>
          <Text style={{ color: colors.secondaryText }}>{t(source)}</Text>
          <Text style={{ color: colors.secondaryText }}>{t(outcome)}</Text>
          <Text style={{ color: colors.secondaryText }}>
            {new Date(item.createdAt).toLocaleDateString(i18n.language)}
          </Text>
          <Text numberOfLines={isExpanded ? undefined : 2} style={{ color: colors.primaryText }}>
            {item.comment ||
              t(item.sentiment === 'up' ? 'feedback.positive' : 'bible.chapterFeedbackThumbsDown')}
          </Text>
          {!!item.audioResponse && (
            <Text style={{ color: colors.secondaryText }}>{t('myFeedback.audioLabel')}</Text>
          )}
        </TouchableOpacity>
        {isExpanded && (
          <View style={styles.row}>
            {!!item.audioResponse &&
              button(
                t(
                  playing === item.id
                    ? 'bible.translatorReviewPause'
                    : 'bible.translatorReviewListen'
                ),
                () => {
                  void play(item);
                }
              )}
            {!!item.resolutionNote && (
              <Text style={{ color: colors.primaryText }}>{item.resolutionNote}</Text>
            )}
            {!item.resolution && item.sentiment === 'down' && (
              <TextInput
                value={notes[item.id] ?? ''}
                onChangeText={(value) =>
                  setNotes((previous) => ({ ...previous, [item.id]: value }))
                }
                placeholder={t('feedback.explanation')}
                accessibilityLabel={t('feedback.explanation')}
                placeholderTextColor={colors.secondaryText}
                multiline
                maxLength={1000}
                style={[
                  styles.input,
                  { borderColor: colors.cardBorder, color: colors.primaryText },
                ]}
              />
            )}
            {item.resolution ? (
              button(
                t('bible.translatorReviewReopen'),
                () => {
                  void resolve(item, null);
                },
                false,
                mutating
              )
            ) : item.sentiment === 'up' ? (
              button(
                t('feedback.markReviewed'),
                () => {
                  void resolve(item, 'no_change_needed');
                },
                false,
                mutating
              )
            ) : (
              <View style={styles.wrap}>
                {button(
                  t('feedback.markAddressed'),
                  () => {
                    void resolve(item, 'fixed');
                  },
                  false,
                  mutating || !!noteRequired
                )}
                {button(
                  t('feedback.noChange'),
                  () => {
                    void resolve(item, 'no_change_needed');
                  },
                  false,
                  mutating || !!noteRequired
                )}
              </View>
            )}
          </View>
        )}
      </View>
    );
  };
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { paddingTop: insets.top, backgroundColor: colors.background }]}
    >
      <View style={styles.top}>
        {button(t('common.back'), () => navigation.goBack())}
        <Text accessibilityRole="header" style={[styles.title, { color: colors.primaryText }]}>
          {t('feedback.title')}
        </Text>
      </View>
      {enabled ? (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={header}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
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
            !loading && !failed ? (
              <Text style={[styles.section, { color: colors.secondaryText }]}>
                {t('feedback.noMatching')}
              </Text>
            ) : null
          }
          ListFooterComponent={
            loading ? (
              <ActivityIndicator color={colors.accentPrimary} />
            ) : cursor ? (
              button(t('common.continue'), () => {
                void load(cursor);
              })
            ) : null
          }
        />
      ) : (
        <Text style={[styles.section, { color: colors.secondaryText }]}>
          {t('settings.translatorAccessSummaryOff')}
        </Text>
      )}
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  content: { paddingHorizontal: 16, gap: 12 },
  section: { paddingVertical: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '600' },
  name: { fontSize: 16, fontWeight: '600' },
  rating: {
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { gap: 8, paddingVertical: 8 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  button: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 10,
  },
  input: { minHeight: 84, borderWidth: 1, borderRadius: 10, padding: 12, textAlignVertical: 'top' },
});
