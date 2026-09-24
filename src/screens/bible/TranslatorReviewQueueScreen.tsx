import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../design/system';
import { getTranslatedBookName } from '../../constants';
import {
  fetchChapterFeedbackReviewSummaryForTranslation,
  getTranslatorFeedbackUnresolvedCount,
  sortTranslatorFeedbackQueue,
  TRANSLATION_NOT_COVERED,
  type TranslatorFeedbackChapterSummary,
} from '../../services/feedback';
import { TranslationNotCoveredNotice } from '../../components/feedback';
import { useBibleStore } from '../../stores/bibleStore';
import { useTranslatorReviewStore } from '../../stores/translatorReviewStore';
import { hexWithAlpha } from '../../utils';
import { isDeviceOffline } from '../../utils/connectivity';
import type { BibleStackParamList } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<BibleStackParamList, 'TranslatorQueue'>;

export function TranslatorReviewQueueScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const currentTranslation = useBibleStore((state) => state.currentTranslation);
  const translatorReviewEnabled = useTranslatorReviewStore((state) => state.enabled);
  const translatorReviewPasscode = useTranslatorReviewStore((state) => state.accessPasscode);

  const [queue, setQueue] = useState<TranslatorFeedbackChapterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // The queue lives only on the server, so offline it cannot load; say why.
  const [offline, setOffline] = useState(false);
  // Set when this passcode does not open the current translation; holds what it does open.
  const [notCovered, setNotCovered] = useState<{ coveredTranslationIds?: string[] } | null>(null);

  const loadQueueRequestIdRef = useRef(0);

  const loadQueue = useCallback(async () => {
    if (!translatorReviewEnabled || !translatorReviewPasscode) {
      loadQueueRequestIdRef.current += 1;
      setQueue([]);
      setLoadError(false);
      setNotCovered(null);
      setLoading(false);
      return;
    }

    const requestId = loadQueueRequestIdRef.current + 1;
    loadQueueRequestIdRef.current = requestId;

    const result = await fetchChapterFeedbackReviewSummaryForTranslation({
      translationId: currentTranslation,
      passcode: translatorReviewPasscode,
    });

    if (requestId !== loadQueueRequestIdRef.current) {
      return;
    }

    if (result.success) {
      setQueue(sortTranslatorFeedbackQueue(result.chapters));
      setLoadError(false);
      setNotCovered(null);
    } else {
      const deviceOffline = await isDeviceOffline();
      if (requestId !== loadQueueRequestIdRef.current) {
        return;
      }
      setOffline(deviceOffline);
      setQueue([]);
      setLoadError(true);
      setNotCovered(
        result.code === TRANSLATION_NOT_COVERED
          ? { coveredTranslationIds: result.coveredTranslationIds }
          : null
      );
    }
    setLoading(false);
  }, [currentTranslation, translatorReviewEnabled, translatorReviewPasscode]);

  useFocusEffect(
    useCallback(() => {
      void loadQueue();
    }, [loadQueue])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadQueue();
    setRefreshing(false);
  };

  const totalPending = queue.reduce(
    (sum, summary) => sum + getTranslatorFeedbackUnresolvedCount(summary),
    0
  );

  const renderItem = ({ item }: { item: TranslatorFeedbackChapterSummary }) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={t('translatorQueue.openLabel', {
        reference: `${getTranslatedBookName(item.bookId, t)} ${item.chapter}`,
      })}
      // The label replaces the card's text, so the counts travel as its value.
      accessibilityValue={{
        text: t('bible.translatorReviewSummary', {
          count: item.total,
          pending: item.unresolvedDown + item.unresolvedUp,
        }),
      }}
      style={[
        styles.card,
        { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
      ]}
      onPress={() =>
        navigation.navigate('BibleReader', {
          bookId: item.bookId,
          chapter: item.chapter,
          preferredMode: 'read',
        })
      }
    >
      <View style={styles.cardMain}>
        <Text style={[styles.reference, { color: colors.primaryText }]}>
          {`${getTranslatedBookName(item.bookId, t)} ${item.chapter}`}
        </Text>
        <Text style={[styles.counts, { color: colors.secondaryText }]}>
          {t('bible.translatorReviewSummary', {
            count: item.total,
            pending: item.unresolvedDown + item.unresolvedUp,
          })}
        </Text>
      </View>
      <View style={styles.cardRight}>
        {item.unresolvedDown > 0 ? (
          <View
            style={[
              styles.countPill,
              { backgroundColor: hexWithAlpha(colors.accentPrimary, 0.16) },
            ]}
          >
            <Text style={[styles.countPillText, { color: colors.accentPrimary }]}>
              {item.unresolvedDown}
            </Text>
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => {
    if (loading) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={colors.accentPrimary} />
        </View>
      );
    }

    if (notCovered) {
      // Switching the reader's translation changes loadQueue, so the focus effect reloads.
      return (
        <View style={styles.notCovered}>
          <TranslationNotCoveredNotice
            translationId={currentTranslation}
            coveredTranslationIds={notCovered.coveredTranslationIds}
            onRetry={() => {
              void loadQueue();
            }}
          />
        </View>
      );
    }

    if (loadError) {
      return (
        <View style={styles.emptyState}>
          <Ionicons
            name="cloud-offline-outline"
            size={48}
            color={hexWithAlpha(colors.secondaryText, 0.6)}
          />
          <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
            {offline ? t('common.offlineTryAgain') : t('common.somethingWentWrong')}
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { borderColor: colors.cardBorder }]}
            onPress={loadQueue}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={[styles.retryText, { color: colors.accentPrimary }]}>
              {t('common.retry')}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <Ionicons
          name="checkmark-done-outline"
          size={48}
          color={hexWithAlpha(colors.success, 0.7)}
        />
        <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
          {t('translatorQueue.empty')}
        </Text>
      </View>
    );
  };

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <Text
          accessibilityRole="header"
          style={[styles.headerTitle, { color: colors.primaryText }]}
        >
          {t('translatorQueue.title')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
        {totalPending > 0
          ? t('translatorQueue.pendingCount', { count: queue.length })
          : t('translatorQueue.subtitle')}
      </Text>

      <FlatList
        data={queue}
        keyExtractor={(item) => `${item.bookId}:${item.chapter}`}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={renderEmptyState}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    ...typography.sectionTitle,
    // Shrinks and wraps between Back and the spacer; unshrinkable, a long
    // translated title pushed the spacer off the row at large text.
    flexShrink: 1,
    textAlign: 'center',
    marginHorizontal: spacing.sm,
  },
  headerSpacer: {
    width: 32,
  },
  subtitle: {
    ...typography.label,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.sm,
  },
  listContent: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.xxxl,
    gap: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardMain: {
    flexShrink: 1,
    gap: spacing.xs,
  },
  reference: {
    ...typography.bodyStrong,
  },
  counts: {
    ...typography.micro,
  },
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  countPill: {
    minWidth: 24,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  countPillText: {
    ...typography.micro,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xxxl * 2,
    gap: spacing.md,
  },
  notCovered: {
    paddingTop: spacing.xl,
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
    paddingHorizontal: layout.screenPadding,
  },
  retryButton: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryText: {
    ...typography.bodyStrong,
  },
});
