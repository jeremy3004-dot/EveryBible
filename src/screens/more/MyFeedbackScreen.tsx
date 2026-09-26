import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../design/system';
import { getTranslatedBookName } from '../../constants';
import { fetchMyChapterFeedback, type MyChapterFeedbackItem } from '../../services/feedback';
import { useAuthStore } from '../../stores/authStore';
import { hexWithAlpha } from '../../utils';
import { isDeviceOffline } from '../../utils/connectivity';
import type { MoreStackParamList } from '../../navigation/types';
import { openAuthFlow } from '../../navigation/rootNavigation';

type NavigationProp = NativeStackNavigationProp<MoreStackParamList, 'MyFeedback'>;

const feedbackOwnerKey = (state: ReturnType<typeof useAuthStore.getState>): string | null =>
  state.isAuthenticated && state.user ? `${state.user.uid}:${state.authGeneration}` : null;

export function MyFeedbackScreen() {
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const ownerKey = useAuthStore(feedbackOwnerKey);
  const isAuthenticated = ownerKey !== null;
  const [snapshot, setSnapshot] = useState({
    ownerKey: null as string | null,
    items: [] as MyChapterFeedbackItem[],
    loading: true,
    refreshing: false,
    loadError: false,
    offline: false,
  });
  const ownsSnapshot = snapshot.ownerKey === ownerKey;
  const items = ownsSnapshot && isAuthenticated ? snapshot.items : [];
  const loading = isAuthenticated && (!ownsSnapshot || snapshot.loading);
  const refreshing = ownsSnapshot && snapshot.refreshing;
  const loadError = ownsSnapshot && snapshot.loadError;
  const offline = ownsSnapshot && snapshot.offline;

  // Only the latest load may write: one still out when the session ends (or a retry
  // overtakes it) would otherwise list an earlier account's feedback.
  const latestLoadRef = useRef(0);
  const mountedRef = useRef(false);

  const loadFeedback = useCallback(
    async (refresh = false) => {
      if (!mountedRef.current || feedbackOwnerKey(useAuthStore.getState()) !== ownerKey) return;
      const load = ++latestLoadRef.current;
      const isCurrent = () =>
        mountedRef.current &&
        load === latestLoadRef.current &&
        feedbackOwnerKey(useAuthStore.getState()) === ownerKey;
      setSnapshot((previous) => ({
        ownerKey,
        items: previous.ownerKey === ownerKey && ownerKey !== null ? previous.items : [],
        loading: ownerKey !== null && !refresh,
        refreshing: ownerKey !== null && refresh,
        loadError: false,
        offline: false,
      }));
      if (ownerKey === null) return;

      try {
        const result = await fetchMyChapterFeedback();
        if (!isCurrent()) return;
        if (result.success) {
          setSnapshot({
            ownerKey,
            items: result.feedback,
            loading: false,
            refreshing: false,
            loadError: false,
            offline: false,
          });
          return;
        }
      } catch {
        if (!isCurrent()) return;
      }
      // This list lives only on the server, so offline it cannot load; say why.
      let isOffline = false;
      try {
        isOffline = await isDeviceOffline();
      } catch {
        // A failed connectivity probe retains the generic load error.
      }
      if (!isCurrent()) return;
      setSnapshot((previous) => ({
        ...previous,
        loading: false,
        refreshing: false,
        loadError: true,
        offline: isOffline,
      }));
    },
    [ownerKey]
  );

  useEffect(() => {
    mountedRef.current = true;
    void loadFeedback(); // eslint-disable-line react-hooks/set-state-in-effect
    return () => {
      mountedRef.current = false;
      latestLoadRef.current += 1;
    };
  }, [loadFeedback]);

  // Back to the loading state, so the retry shows progress and cannot be tapped again
  // while its request is out.
  const onRetry = () => {
    void loadFeedback();
  };

  const onRefresh = () => loadFeedback(true);

  const getStatusCopy = (status: MyChapterFeedbackItem['status']): string => {
    switch (status) {
      case 'reviewed':
        return t('feedback.reviewed');
      case 'fixed':
        return t('feedback.addressed');
      case 'no_change_needed':
        return t('feedback.noChange');
      case 'received':
      default:
        return t('feedback.awaitingReview');
    }
  };

  const getStatusColors = (status: MyChapterFeedbackItem['status']) => {
    if (status === 'fixed') {
      return { background: hexWithAlpha(colors.success, 0.16), text: colors.onSuccessSoft };
    }
    if (status === 'no_change_needed') {
      return { background: colors.cardBackground, text: colors.secondaryText };
    }
    return { background: hexWithAlpha(colors.accentPrimary, 0.16), text: colors.accentPrimary };
  };

  const renderItem = ({ item }: { item: MyChapterFeedbackItem }) => {
    const statusColors = getStatusColors(item.status);

    return (
      <View
        style={[
          styles.card,
          { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
        ]}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Ionicons
              name={item.sentiment === 'up' ? 'checkmark-circle-outline' : 'alert-circle-outline'}
              size={18}
              color={item.sentiment === 'up' ? colors.success : colors.accentPrimary}
            />
            <Text style={[styles.reference, { color: colors.primaryText }]}>
              {`${getTranslatedBookName(item.bookId, t)} ${item.chapter}`}
            </Text>
          </View>
          <View style={[styles.statusChip, { backgroundColor: statusColors.background }]}>
            <Text style={[styles.statusChipText, { color: statusColors.text }]}>
              {getStatusCopy(item.status)}
            </Text>
          </View>
        </View>

        {item.comment ? (
          <Text style={[styles.comment, { color: colors.secondaryText }]} numberOfLines={4}>
            {item.comment}
          </Text>
        ) : null}

        {item.resolutionNote ? (
          <Text style={[styles.comment, { color: colors.primaryText }]}>{item.resolutionNote}</Text>
        ) : null}
        <View style={styles.cardFooter}>
          {item.hasAudio ? (
            <View style={styles.audioRow}>
              <Ionicons name="mic-outline" size={14} color={colors.secondaryText} />
              <Text style={[styles.audioLabel, { color: colors.secondaryText }]}>
                {t('myFeedback.audioLabel')}
              </Text>
            </View>
          ) : (
            <View />
          )}
          <Text style={[styles.date, { color: colors.secondaryText }]}>
            {new Date(item.createdAt).toLocaleDateString(i18n.language)}
          </Text>
        </View>
      </View>
    );
  };

  const renderEmptyState = () => {
    if (loading) {
      return (
        <View
          style={styles.emptyState}
          accessibilityState={{ busy: true }}
          accessibilityLabel={t('common.loading')}
        >
          <ActivityIndicator size="large" color={colors.accentPrimary} />
        </View>
      );
    }

    if (!isAuthenticated) {
      return (
        <View style={styles.emptyState}>
          <Ionicons
            name="person-circle-outline"
            size={48}
            color={hexWithAlpha(colors.secondaryText, 0.5)}
          />
          <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
            {t('myFeedback.signInRequired')}
          </Text>
          {/* The auth modal opens over this screen; signing in reloads the list here. */}
          <TouchableOpacity
            style={[styles.retryButton, { borderColor: colors.cardBorder }]}
            onPress={() => openAuthFlow('signIn')}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={[styles.retryText, { color: colors.accentPrimary }]}>
              {t('more.signInOrCreate')}
            </Text>
          </TouchableOpacity>
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
            onPress={onRetry}
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
          name="chatbox-ellipses-outline"
          size={48}
          color={hexWithAlpha(colors.secondaryText, 0.38)}
        />
        <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
          {t('myFeedback.empty')}
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
          {t('myFeedback.title')}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      {items.length > 0 ? (
        <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
          {t('myFeedback.subtitle')}
        </Text>
      ) : null}

      {/* A failed refresh keeps the last loaded list; say why it did not update. */}
      {loadError && items.length > 0 ? (
        <Text accessibilityRole="alert" style={[styles.subtitle, { color: colors.error }]}>
          {offline ? t('common.offlineTryAgain') : t('common.somethingWentWrong')}
        </Text>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
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
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  reference: {
    ...typography.bodyStrong,
    flexShrink: 1,
  },
  statusChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: radius.sm,
  },
  statusChipText: {
    ...typography.micro,
  },
  comment: {
    ...typography.body,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  audioLabel: {
    ...typography.micro,
  },
  date: {
    ...typography.micro,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xxxl * 2,
    gap: spacing.md,
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
