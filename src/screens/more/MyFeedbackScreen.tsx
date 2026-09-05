import { useCallback, useEffect, useState } from 'react';
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
import type { MoreStackParamList } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<MoreStackParamList, 'MyFeedback'>;

export function MyFeedbackScreen() {
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const [items, setItems] = useState<MyChapterFeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const loadFeedback = useCallback(async () => {
    if (!isAuthenticated) {
      setItems([]);
      setLoadError(false);
      setLoading(false);
      return;
    }

    const result = await fetchMyChapterFeedback();
    if (result.success) {
      setItems(result.feedback);
      setLoadError(false);
    } else {
      setLoadError(true);
    }
    setLoading(false);
  }, [isAuthenticated]);

  useEffect(() => {
    loadFeedback(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [loadFeedback]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadFeedback();
    setRefreshing(false);
  };

  const getStatusCopy = (status: MyChapterFeedbackItem['status']): string => {
    switch (status) {
      case 'fixed':
        return t('myFeedback.statusFixed');
      case 'no_change_needed':
        return t('myFeedback.statusNoChange');
      case 'received':
      default:
        return t('myFeedback.statusReceived');
    }
  };

  const getStatusColors = (status: MyChapterFeedbackItem['status']) => {
    if (status === 'fixed') {
      return { background: hexWithAlpha(colors.success, 0.16), text: colors.success };
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
        <View style={styles.emptyState}>
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
            {t('common.somethingWentWrong')}
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { borderColor: colors.cardBorder }]}
            onPress={loadFeedback}
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
        <Text style={[styles.headerTitle, { color: colors.primaryText }]}>
          {t('myFeedback.title')}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      {items.length > 0 ? (
        <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
          {t('myFeedback.subtitle')}
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
