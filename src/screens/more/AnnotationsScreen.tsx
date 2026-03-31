import { useCallback, useEffect, useState } from 'react';
import {
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
import { rootNavigationRef } from '../../navigation/rootNavigation';
import { layout, radius, spacing, typography } from '../../design/system';
import { getBookById } from '../../constants';
import { fetchAnnotations } from '../../services/annotations';
import type { UserAnnotation } from '../../services/supabase/types';
import type { MoreStackParamList } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<MoreStackParamList>;

type FilterType = 'bookmark' | 'highlight' | 'note';

export function AnnotationsScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();

  const [annotations, setAnnotations] = useState<UserAnnotation[]>([]);
  const [filter, setFilter] = useState<FilterType>('note');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadAnnotations = useCallback(async () => {
    const result = await fetchAnnotations();
    if (result.success && result.data) {
      setAnnotations(result.data.filter((a) => !a.deleted_at));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAnnotations(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [loadAnnotations]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAnnotations();
    setRefreshing(false);
  };

  const filtered = annotations.filter((a) => a.type === filter);

  const getAnnotationIcon = (type: UserAnnotation['type']): string => {
    switch (type) {
      case 'bookmark': return 'bookmark';
      case 'highlight': return 'color-fill';
      case 'note': return 'document-text';
    }
  };

  const getEmptyMessage = (): string => {
    switch (filter) {
      case 'note': return t('annotations.noNotes');
      case 'bookmark': return t('annotations.noBookmarks');
      case 'highlight': return t('annotations.noHighlights');
    }

    return t('annotations.noNotes');
  };

  const emptyStateIcons = {
    note: 'document-text-outline',
    bookmark: 'bookmark-outline',
    highlight: 'color-fill-outline',
  } as const;

  const formatReference = (a: UserAnnotation): string => {
    const book = getBookById(a.book);
    const bookName = book?.name ?? a.book;
    const verse = a.verse_end
      ? `${a.verse_start}-${a.verse_end}`
      : `${a.verse_start}`;
    return `${bookName} ${a.chapter}:${verse}`;
  };

  const navigateToBible = (item: UserAnnotation) => {
    if (!rootNavigationRef.isReady()) return;
    rootNavigationRef.navigate('Bible', {
      screen: 'BibleReader',
      params: { bookId: item.book, chapter: item.chapter, focusVerse: item.verse_start },
    });
  };

  const renderItem = ({ item }: { item: UserAnnotation }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}
      activeOpacity={0.7}
      onPress={() => navigateToBible(item)}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardIconRow}>
          <Ionicons
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            name={getAnnotationIcon(item.type) as any}
            size={18}
            color={item.color ?? colors.accentPrimary}
          />
          <Text style={[styles.reference, { color: colors.primaryText }]}>
            {formatReference(item)}
          </Text>
        </View>
        <Text style={[styles.date, { color: colors.secondaryText }]}>
          {new Date(item.created_at).toLocaleDateString()}
        </Text>
      </View>
      {item.content ? (
        <Text
          style={[styles.content, { color: colors.secondaryText }]}
          numberOfLines={3}
        >
          {item.content}
        </Text>
      ) : null}
      {item.type === 'highlight' && item.color ? (
        <View style={[styles.colorStrip, { backgroundColor: item.color + '30' }]} />
      ) : null}
    </TouchableOpacity>
  );

  const filterButtons: { key: FilterType; label: string; icon: string }[] = [
    { key: 'note', label: t('annotations.notes'), icon: 'document-text-outline' },
    { key: 'bookmark', label: t('annotations.bookmarks'), icon: 'bookmark-outline' },
    { key: 'highlight', label: t('annotations.highlights'), icon: 'color-fill-outline' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.primaryText }]}>
          {t('annotations.title')}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {filterButtons.map((fb) => (
          <TouchableOpacity
            key={fb.key}
            style={[
              styles.filterPill,
              {
                backgroundColor: filter === fb.key ? colors.accentPrimary : colors.cardBackground,
                borderColor: filter === fb.key ? colors.accentPrimary : colors.cardBorder,
              },
            ]}
            onPress={() => setFilter(fb.key)}
          >
            <Ionicons
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              name={fb.icon as any}
              size={14}
              color={filter === fb.key ? colors.cardBackground : colors.secondaryText}
            />
            <Text
              style={[
                styles.filterLabel,
                { color: filter === fb.key ? colors.cardBackground : colors.secondaryText },
              ]}
            >
              {fb.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <Ionicons name={emptyStateIcons[filter]} size={48} color={colors.secondaryText + '60'} />
              <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
                {getEmptyMessage()}
              </Text>
            </View>
          ) : null
        }
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    ...typography.cardTitle,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: layout.screenPadding,
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  filterLabel: {
    ...typography.micro,
  },
  listContent: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  card: {
    borderRadius: radius.md,
    padding: layout.cardPadding,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  cardIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  reference: {
    ...typography.bodyStrong,
  },
  date: {
    ...typography.micro,
  },
  content: {
    ...typography.body,
    marginTop: spacing.xs,
  },
  colorStrip: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: radius.md,
    borderBottomLeftRadius: radius.md,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xxxl * 2,
    gap: spacing.lg,
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
  },
});
