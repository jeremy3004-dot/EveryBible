import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, type TextInput as TextInputType } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { config } from '../../constants/config';
import { getBookById } from '../../constants/books';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, spacing } from '../../design/system';
import { useI18n } from '../../hooks/useI18n';
import { useTranslationContentSummary } from '../../hooks/useTranslationContentSummary';
import { useTabBarHeight } from '../../hooks/useTabBarHeight';
import { getChapterContentAvailability } from '../../services/bible/contentAvailability';
import type { PassageReferenceTarget } from '../../services/bible/referenceParser';
import { useBibleStore } from '../../stores/bibleStore';
import { useTranslatorReviewStore } from '../../stores/translatorReviewStore';
import type { BibleStackParamList } from '../../navigation/types';
import type { Verse } from '../../types';
import {
  BibleBookList,
  BibleBrowserHeader,
  BibleSearchField,
  BibleSearchResults,
  buildReaderLaunchParams,
  ReferenceJumpCard,
  TranslationPickerSheet,
  TranslatorSummaryBanner,
  useBibleSearch,
  useBookExpansion,
  useChapterTileLayout,
  useTranslatorFeedbackSummaries,
} from './browser';

type NavigationProp = NativeStackNavigationProp<BibleStackParamList>;
type BibleBrowserRoute =
  | RouteProp<BibleStackParamList, 'BibleBrowser'>
  | RouteProp<BibleStackParamList, 'BiblePicker'>;
type ReaderParams = BibleStackParamList['BibleReader'];

/**
 * The Bible tab's book browser, also presented as the BiblePicker modal from the
 * reader. Books expand to their chapter grids; the search field jumps to a typed
 * reference or runs a full-text search; the tab screen also opens the
 * translation sheet. Sections and state live in ./browser.
 */
export function BibleBrowserScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<BibleBrowserRoute>();
  const { colors } = useTheme();
  const { t, currentLanguage } = useI18n();
  const currentBook = useBibleStore((state) => state.currentBook);
  const currentTranslation = useBibleStore((state) => state.currentTranslation);
  // Selects the one translation shown, not the whole list: download progress on
  // other translations rewrites `translations` and would otherwise re-render the browser.
  const currentTranslationInfo = useBibleStore((state) =>
    state.translations.find((translation) => translation.id === state.currentTranslation)
  );
  const preferredChapterLaunchMode = useBibleStore((state) => state.preferredChapterLaunchMode);
  const translatorReviewEnabled = useTranslatorReviewStore((state) => state.enabled);
  const translatorReviewPasscode = useTranslatorReviewStore((state) => state.accessPasscode);
  const availabilityTranslation = useTranslationContentSummary(currentTranslationInfo);

  const initialBookId = route.params?.initialBookId ?? null;
  const shouldFocusSearch = route.params?.focusSearch === true;
  const isPickerModal = route.name === 'BiblePicker';
  const canOpenTranslationPicker = !isPickerModal && config.features.multipleTranslations;
  const [showTranslationModal, setShowTranslationModal] = useState(false);
  const searchInputRef = useRef<TextInputType | null>(null);

  const expansion = useBookExpansion(currentBook, initialBookId, currentTranslation);
  const { expandedBookId, toggleBook, showUnavailableChapter, clearUnavailableChapter } = expansion;
  const { tileSizeStyle, onPanelLayout } = useChapterTileLayout();
  const search = useBibleSearch(currentTranslation, currentLanguage, t);
  const { resolveSubmitIntent } = search;
  const feedback = useTranslatorFeedbackSummaries(
    currentTranslation,
    translatorReviewEnabled,
    translatorReviewPasscode,
    t
  );

  // As a tab-stack screen the browser sits under the floating tab capsule; as the
  // BiblePicker modal the capsule is hidden, so only the Android navigation bar
  // is in the way. FlashList wants plain ContentStyle objects, not StyleSheet refs.
  const insets = useSafeAreaInsets();
  const { contentClearance } = useTabBarHeight();
  const listBottomClearance = isPickerModal ? insets.bottom : contentClearance;
  const listContentStyle = useMemo(
    () => ({
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl + listBottomClearance,
    }),
    [listBottomClearance]
  );
  const searchResultsContentStyle = useMemo(
    () => ({ ...listContentStyle, gap: spacing.md }),
    [listContentStyle]
  );

  useEffect(() => {
    if (!shouldFocusSearch) {
      return;
    }

    const animationFrameId = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [shouldFocusSearch]);

  const navigateToReader = useCallback(
    (params: Pick<ReaderParams, 'bookId' | 'chapter' | 'focusVerse'>) => {
      const readerParams = buildReaderLaunchParams(params, preferredChapterLaunchMode);
      if (isPickerModal) {
        // Pop directly to the reader route so chapter selection exits modal
        // presentation in one deterministic stack operation.
        navigation.popTo('BibleReader', readerParams);
        return;
      }

      navigation.navigate('BibleReader', readerParams);
    },
    [isPickerModal, navigation, preferredChapterLaunchMode]
  );

  const handleChapterPress = useCallback(
    (bookId: string, chapter: number) => {
      const book = getBookById(bookId);

      if (
        book &&
        !getChapterContentAvailability(book, chapter, availabilityTranslation).isAvailable
      ) {
        showUnavailableChapter(bookId, chapter);
        return;
      }

      clearUnavailableChapter();
      navigateToReader({ bookId, chapter, focusVerse: undefined });
    },
    [availabilityTranslation, clearUnavailableChapter, navigateToReader, showUnavailableChapter]
  );

  const handleReferencePress = useCallback(
    (target: PassageReferenceTarget) =>
      navigateToReader({
        bookId: target.bookId,
        chapter: target.chapter,
        focusVerse: target.focusVerse,
      }),
    [navigateToReader]
  );

  const handleSearchResultPress = useCallback(
    (verse: Verse) =>
      navigateToReader({ bookId: verse.bookId, chapter: verse.chapter, focusVerse: verse.verse }),
    [navigateToReader]
  );

  const handleSearchSubmit = useCallback(() => {
    const submitIntent = resolveSubmitIntent();
    if (submitIntent.kind === 'reference') {
      handleReferencePress(submitIntent.target);
    }
  }, [handleReferencePress, resolveSubmitIntent]);

  const dismissPicker = useCallback(() => navigation.goBack(), [navigation]);
  const openTranslatorQueue = useCallback(
    () => navigation.navigate('TranslatorQueue'),
    [navigation]
  );
  const openTranslationPicker = useCallback(() => setShowTranslationModal(true), []);
  const closeTranslationPicker = useCallback(() => setShowTranslationModal(false), []);

  // Memoised so the book list (a PureComponent) is not re-rendered by a new header element.
  const isLoadingFirstSummary = feedback.isLoading && feedback.summaries.length === 0;
  const summaryBanner = useMemo(
    () => (
      <TranslatorSummaryBanner
        enabled={translatorReviewEnabled}
        translationId={currentTranslation}
        isLoadingFirstSummary={isLoadingFirstSummary}
        error={feedback.error}
        notCovered={feedback.notCovered}
        onRetry={feedback.reload}
      />
    ),
    [
      currentTranslation,
      feedback.error,
      feedback.notCovered,
      feedback.reload,
      isLoadingFirstSummary,
      translatorReviewEnabled,
    ]
  );

  const { searchIntent } = search;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.bibleBackground }]}
      edges={['top']}
    >
      <BibleBrowserHeader
        translationId={currentTranslation}
        translationName={currentTranslationInfo?.name}
        translationAbbreviation={currentTranslationInfo?.abbreviation}
        onDismiss={isPickerModal ? dismissPicker : undefined}
        onOpenTranslatorQueue={translatorReviewEnabled ? openTranslatorQueue : undefined}
        onOpenTranslationPicker={canOpenTranslationPicker ? openTranslationPicker : undefined}
      >
        <BibleSearchField
          inputRef={searchInputRef}
          value={search.searchQuery}
          onChangeText={search.setSearchQuery}
          onClear={search.clearSearch}
          onSubmit={handleSearchSubmit}
        />
      </BibleBrowserHeader>

      {searchIntent.kind === 'full-text' ? (
        <BibleSearchResults
          results={search.searchResults}
          isSearching={search.isSearching}
          error={search.searchError}
          hasNoResults={search.hasNoResults}
          contentContainerStyle={searchResultsContentStyle}
          onPressResult={handleSearchResultPress}
        />
      ) : searchIntent.kind === 'reference' ? (
        <ReferenceJumpCard target={searchIntent.target} onPress={handleReferencePress} />
      ) : (
        <BibleBookList
          listRef={expansion.listRef}
          initialScrollIndex={expansion.initialScrollIndex}
          contentContainerStyle={listContentStyle}
          header={summaryBanner}
          expandedBookId={expandedBookId}
          unavailableChapterKey={expansion.unavailableChapterKey}
          availabilityTranslation={availabilityTranslation}
          showFeedbackBadges={translatorReviewEnabled}
          statusByBook={feedback.statusByBook}
          summaryByChapter={feedback.summaryByChapter}
          tileSizeStyle={tileSizeStyle}
          onPanelLayout={onPanelLayout}
          onPressBook={toggleBook}
          onPressChapter={handleChapterPress}
        />
      )}

      {config.features.multipleTranslations ? (
        <TranslationPickerSheet visible={showTranslationModal} onClose={closeTranslationPicker} />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
