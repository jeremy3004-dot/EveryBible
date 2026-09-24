import { memo, useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { FlashList, type ContentStyle, type ListRenderItem } from '@shopify/flash-list';
import { VersesSkeleton } from '../../../components/skeleton/VersesSkeleton';
import { getTranslatedBookName } from '../../../constants/books';
import { useTheme } from '../../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../../design/system';
import type { Verse } from '../../../types';
import { formatBibleSearchReference } from '../bibleSearchModel';
import { SEARCH_RESULT_ESTIMATED_SIZE, searchResultKey } from './bibleBrowserModel';
import { browserStyles } from './browserStyles';

const SearchResultCard = memo(function SearchResultCard({
  verse,
  onPress,
}: {
  verse: Verse;
  onPress: (verse: Verse) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const bookName = getTranslatedBookName(verse.bookId, t);
  const referenceLabel = formatBibleSearchReference(verse, (bookId) =>
    getTranslatedBookName(bookId, t)
  );

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
      ]}
      onPress={() => onPress(verse)}
      activeOpacity={0.85}
      accessibilityRole="button"
    >
      <View style={browserStyles.resultHeader}>
        <Text style={[browserStyles.resultReference, { color: colors.bibleAccent }]}>
          {referenceLabel}
        </Text>
        {bookName ? (
          <Ionicons name="arrow-forward" size={18} color={colors.bibleSecondaryText} />
        ) : null}
      </View>
      <Text style={[styles.excerpt, { color: colors.biblePrimaryText }]} numberOfLines={3}>
        <Text style={[styles.verseNumber, { color: colors.bibleAccent }]}>{verse.verse} </Text>
        {verse.text}
      </Text>
    </TouchableOpacity>
  );
});

interface BibleSearchResultsProps {
  results: Verse[];
  isSearching: boolean;
  error: string | null;
  contentContainerStyle: ContentStyle;
  onPressResult: (verse: Verse) => void;
}

/** The full-text search surface: skeleton, error, or the matching verses. */
export function BibleSearchResults({
  results,
  isSearching,
  error,
  contentContainerStyle,
  onPressResult,
}: BibleSearchResultsProps) {
  const { colors } = useTheme();
  const renderResult = useCallback<ListRenderItem<Verse>>(
    ({ item }) => <SearchResultCard verse={item} onPress={onPressResult} />,
    [onPressResult]
  );

  // Only take over the whole surface with a skeleton when there are no results
  // yet. Once results exist, keep them rendered so each keystroke does not flash
  // a blank screen.
  if (isSearching && results.length === 0) {
    return (
      <View style={styles.fill}>
        <VersesSkeleton count={6} />
      </View>
    );
  }

  if (error) {
    return (
      <View
        style={[
          styles.feedbackCard,
          { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
        ]}
      >
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.feedbackText, { color: colors.biblePrimaryText }]}
        >
          {error}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <FlashList
        data={results}
        renderItem={renderResult}
        keyExtractor={searchResultKey}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
        estimatedItemSize={SEARCH_RESULT_ESTIMATED_SIZE}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  excerpt: {
    ...typography.body,
    fontSize: 16,
    lineHeight: 24,
  },
  verseNumber: {
    fontWeight: '700',
  },
  feedbackCard: {
    marginHorizontal: layout.screenPadding,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  feedbackText: {
    ...typography.bodyStrong,
  },
});
