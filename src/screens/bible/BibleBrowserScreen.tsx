import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  TextInput,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import {
  bibleBooks,
  type BibleBook,
  config,
  getBookById,
  getTranslatedBookName,
} from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';
import { useBibleStore } from '../../stores/bibleStore';
import { useI18n } from '../../hooks';
import {
  BibleSearchUnavailableError,
  buildBibleBrowserRows,
  parsePassageReferenceLocale,
  searchBible,
  type BibleBrowserRow,
  type PassageReferenceTarget,
} from '../../services/bible';
import type { BibleStackParamList } from '../../navigation/types';
import type { Verse } from '../../types';
import {
  BIBLE_SEARCH_DEBOUNCE_MS,
  formatBibleSearchReference,
  resolveBibleSearchIntent,
} from './bibleSearchModel';
import { layout, radius, spacing, typography } from '../../design/system';
import { getBookIcon } from '../../constants/bookIcons';
import { TranslationPickerList } from './TranslationPickerList';

type NavigationProp = NativeStackNavigationProp<BibleStackParamList>;
type BibleBrowserRoute =
  | RouteProp<BibleStackParamList, 'BibleBrowser'>
  | RouteProp<BibleStackParamList, 'BiblePicker'>;

const bibleBrowserRows = buildBibleBrowserRows(bibleBooks);
const BIBLE_BROWSER_ROW_ESTIMATED_SIZE = 52;
const SEARCH_RESULT_ESTIMATED_SIZE = 118;

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

export function BibleBrowserScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<BibleBrowserRoute>();
  const { colors } = useTheme();
  const { t, currentLanguage } = useI18n();
  const initialBookId = route.params?.initialBookId ?? null;
  const initialExpandedBookId =
    initialBookId != null && getBookById(initialBookId) ? initialBookId : null;
  const [expandedBookId, setExpandedBookId] = useState<string | null>(initialExpandedBookId);
  const [showTranslationModal, setShowTranslationModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Verse[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchRequestIdRef = useRef(0);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const currentTranslation = useBibleStore((state) => state.currentTranslation);
  const translations = useBibleStore((state) => state.translations);
  const preferredChapterLaunchMode = useBibleStore((state) => state.preferredChapterLaunchMode);

  const currentTranslationInfo = translations.find((translation) => translation.id === currentTranslation);
  const isPickerModal = route.name === 'BiblePicker';
  const canDismissModal = isPickerModal;
  const canOpenTranslationPicker =
    !isPickerModal && config.features.multipleTranslations;
  const parseRef = useCallback(
    (q: string) => parsePassageReferenceLocale(q, currentLanguage),
    [currentLanguage],
  );
  const searchIntent = resolveBibleSearchIntent(deferredSearchQuery, parseRef);
  const failedToLoadMessage = t('bible.failedToLoad');
  const searchUnavailableMessage = t('bible.searchUnavailable');

  useEffect(() => {
    setExpandedBookId(initialExpandedBookId);
  }, [initialExpandedBookId]);

  useEffect(() => {
    let isCancelled = false;
    const deferredSearchIntent = resolveBibleSearchIntent(
      deferredSearchQuery,
      parseRef
    );

    if (deferredSearchIntent.kind !== 'full-text') {
      searchRequestIdRef.current += 1;
      setSearchResults([]);
      setSearchError(null);
      setIsSearching(false);

      return () => {
        isCancelled = true;
      };
    }

    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;
    setIsSearching(true);
    setSearchError(null);

    const timeoutId = setTimeout(() => {
      void (async () => {
        try {
          const results = await searchBible(currentTranslation, deferredSearchIntent.query);

          if (!isCancelled && requestId === searchRequestIdRef.current) {
            setSearchResults(results);
          }
        } catch (error) {
          if (!isCancelled && requestId === searchRequestIdRef.current) {
            console.error('Error searching Bible:', error);
            setSearchResults([]);
            setSearchError(
              error instanceof BibleSearchUnavailableError
                ? searchUnavailableMessage
                : failedToLoadMessage
            );
          }
        } finally {
          if (!isCancelled && requestId === searchRequestIdRef.current) {
            setIsSearching(false);
          }
        }
      })();
    }, BIBLE_SEARCH_DEBOUNCE_MS);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [
    currentTranslation,
    deferredSearchQuery,
    failedToLoadMessage,
    parseRef,
    searchUnavailableMessage,
  ]);

  const handleBookPress = (book: BibleBook) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedBookId((prev) => (prev === book.id ? null : book.id));
  };

  const navigateToReader = (params: BibleStackParamList['BibleReader']) => {
    // Use navigate so BiblePicker returns to the in-tab reader route instead
    // of replacing inside modal presentation (which can keep tabs hidden on iOS).
    navigation.navigate('BibleReader', params);
  };

  const buildReaderLaunchParams = (
    params: Pick<BibleStackParamList['BibleReader'], 'bookId' | 'chapter' | 'focusVerse'>
  ): BibleStackParamList['BibleReader'] => ({
    ...params,
    ...(preferredChapterLaunchMode === 'listen' ? { autoplayAudio: true } : {}),
    preferredMode: preferredChapterLaunchMode,
  });

  const handleChapterPress = (bookId: string, chapter: number) => {
    navigateToReader(buildReaderLaunchParams({ bookId, chapter, focusVerse: undefined }));
  };

  const handleReferencePress = (target: PassageReferenceTarget) => {
    navigateToReader(
      buildReaderLaunchParams({
        bookId: target.bookId,
        chapter: target.chapter,
        focusVerse: target.focusVerse,
      })
    );
  };

  const handleSearchResultPress = (verse: Verse) => {
    navigateToReader(
      buildReaderLaunchParams({
        bookId: verse.bookId,
        chapter: verse.chapter,
        focusVerse: verse.verse,
      })
    );
  };

  const handleSearchSubmit = () => {
    const submitIntent = resolveBibleSearchIntent(searchQuery, parseRef);
    if (submitIntent.kind === 'reference') {
      handleReferencePress(submitIntent.target);
    }
  };

  const renderRow = ({ item }: { item: BibleBrowserRow }) => {
    if (item.type === 'divider') {
      return (
        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: colors.bibleDivider }]} />
          <Text style={[styles.dividerLabel, { color: colors.bibleSecondaryText }]}>
            {t(item.testament === 'NT' ? 'bible.newTestament' : 'bible.oldTestament')}
          </Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.bibleDivider }]} />
        </View>
      );
    }

    const book = item.books[0];
    if (!book) return null;
    const isExpanded = book.id === expandedBookId;

    return (
      <View>
        <TouchableOpacity
          style={[styles.bookRow, { borderBottomColor: colors.bibleDivider }]}
          onPress={() => handleBookPress(book)}
          activeOpacity={0.7}
        >
          <View style={styles.bookRowLeft}>
            <Image
              source={getBookIcon(book.id)}
              style={[styles.bookIcon, { tintColor: colors.biblePrimaryText }]}
              resizeMode="contain"
            />
            <Text style={[styles.bookName, { color: colors.biblePrimaryText }]}>
              {getTranslatedBookName(book.id, t)}
            </Text>
          </View>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={colors.bibleSecondaryText}
          />
        </TouchableOpacity>

        {isExpanded && (
          <View
            style={[
              styles.chapterGrid,
              { backgroundColor: colors.bibleElevatedSurface },
            ]}
          >
            <View style={styles.chapterGridInner}>
              {Array.from({ length: book.chapters }, (_, i) => i + 1).map((chapter) => (
                <TouchableOpacity
                  key={chapter}
                  style={[
                    styles.chapterButton,
                    {
                      backgroundColor: colors.bibleSurface,
                      borderColor: colors.bibleDivider,
                    },
                  ]}
                  onPress={() => handleChapterPress(book.id, chapter)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chapterNumber, { color: colors.biblePrimaryText }]}>
                    {chapter}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderSearchResult = ({ item }: { item: Verse }) => {
    const bookName = getTranslatedBookName(item.bookId, t);
    const referenceLabel = formatBibleSearchReference(item, (bookId) => getTranslatedBookName(bookId, t));

    return (
      <TouchableOpacity
        style={[
          styles.searchResultCard,
          {
            backgroundColor: colors.bibleSurface,
            borderColor: colors.bibleDivider,
          },
        ]}
        onPress={() => handleSearchResultPress(item)}
        activeOpacity={0.85}
      >
        <View style={styles.searchResultHeader}>
          <Text style={[styles.searchReference, { color: colors.bibleAccent }]}>
            {referenceLabel}
          </Text>
          {bookName ? (
            <Ionicons name="arrow-forward" size={18} color={colors.bibleSecondaryText} />
          ) : null}
        </View>
        <Text style={[styles.searchExcerpt, { color: colors.biblePrimaryText }]} numberOfLines={3}>
          <Text style={[styles.searchVerseNumber, { color: colors.bibleAccent }]}>
            {item.verse}{' '}
          </Text>
          {item.text}
        </Text>
      </TouchableOpacity>
    );
  };

  const referenceMeta = searchIntent.kind === 'reference'
    ? searchIntent.target.focusVerse
      ? `${t('bible.chapter')} ${searchIntent.target.chapter} • ${t('bible.verse')} ${searchIntent.target.focusVerse}`
      : `${t('bible.chapter')} ${searchIntent.target.chapter}`
    : null;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.bibleBackground }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerTitleCluster}>
            {canDismissModal ? (
              <TouchableOpacity
                style={[
                  styles.modalDismissButton,
                  { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
                ]}
                onPress={() => navigation.goBack()}
                activeOpacity={0.85}
              >
                <Ionicons name="close" size={18} color={colors.biblePrimaryText} />
              </TouchableOpacity>
            ) : null}
            <View>
              <Text style={[styles.title, { color: colors.biblePrimaryText }]}>
                {t('bible.title')}
              </Text>
              <Text style={[styles.subtitle, { color: colors.bibleSecondaryText }]}>
                {currentTranslationInfo?.name || t('about.bereanBible')}
              </Text>
            </View>
          </View>

          {canOpenTranslationPicker ? (
            <TouchableOpacity
              style={[
                styles.translationButton,
                { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
              ]}
              onPress={() => {
                setShowTranslationModal(true);
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="book-outline" size={16} color={colors.bibleSecondaryText} />
              <Text style={[styles.translationButtonText, { color: colors.biblePrimaryText }]}>
                {currentTranslationInfo?.abbreviation || 'BSB'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.bibleSecondaryText} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View
          style={[
            styles.searchInputShell,
            { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
          ]}
        >
          <Ionicons name="search" size={18} color={colors.bibleSecondaryText} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('common.search')}
            placeholderTextColor={colors.bibleSecondaryText}
            style={[styles.searchInput, { color: colors.biblePrimaryText }]}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={handleSearchSubmit}
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity style={styles.clearSearchButton} onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.bibleSecondaryText} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {searchIntent.kind === 'full-text' ? (
        isSearching ? (
          <View style={styles.searchLoadingState}>
            <ActivityIndicator color={colors.bibleAccent} />
          </View>
        ) : searchError ? (
          <View
            style={[
              styles.searchFeedbackCard,
              { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
            ]}
          >
            <Text style={[styles.searchFeedbackText, { color: colors.biblePrimaryText }]}>
              {searchError}
            </Text>
          </View>
        ) : (
          <FlashList
            data={searchResults}
            renderItem={renderSearchResult}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.searchResultsContent}
            showsVerticalScrollIndicator={false}
            estimatedItemSize={SEARCH_RESULT_ESTIMATED_SIZE}
          />
        )
      ) : searchIntent.kind === 'reference' ? (
        <TouchableOpacity
          style={[
            styles.referenceActionCard,
            {
              backgroundColor: colors.bibleSurface,
              borderColor: colors.bibleDivider,
            },
          ]}
          onPress={() => handleReferencePress(searchIntent.target)}
          activeOpacity={0.85}
        >
          <View style={styles.searchResultHeader}>
            <Text style={[styles.searchReference, { color: colors.bibleAccent }]}>
              {searchIntent.target.label}
            </Text>
            <Ionicons name="arrow-forward" size={18} color={colors.bibleSecondaryText} />
          </View>
          {referenceMeta ? (
            <Text style={[styles.referenceMetaText, { color: colors.biblePrimaryText }]}>
              {referenceMeta}
            </Text>
          ) : null}
        </TouchableOpacity>
      ) : (
        <FlashList
          data={bibleBrowserRows}
          renderItem={renderRow}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          estimatedItemSize={BIBLE_BROWSER_ROW_ESTIMATED_SIZE}
          getItemType={(item) => item.type}
          extraData={{ colors, expandedBookId }}
        />
      )}

      {config.features.multipleTranslations ? (
        <Modal
          visible={showTranslationModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowTranslationModal(false)}
        >
          <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
            <View
              style={[
                styles.modalContent,
                { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
              ]}
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.biblePrimaryText }]}>
                  {t('bible.selectTranslation')}
                </Text>
                <TouchableOpacity onPress={() => setShowTranslationModal(false)}>
                  <Ionicons name="close" size={22} color={colors.bibleSecondaryText} />
                </TouchableOpacity>
              </View>
              <TranslationPickerList onRequestClose={() => setShowTranslationModal(false)} />
            </View>
          </View>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: 18,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTitleCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    ...typography.screenTitle,
    fontSize: 32,
    lineHeight: 36,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.micro,
  },
  translationButton: {
    minHeight: 42,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  translationButtonText: {
    ...typography.label,
  },
  modalDismissButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: 28,
    paddingTop: spacing.sm,
  },
  searchInputShell: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    paddingVertical: 0,
  },
  clearSearchButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchLoadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchResultsContent: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: 28,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  searchResultCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 18,
    gap: spacing.sm,
  },
  searchResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  searchReference: {
    ...typography.label,
  },
  searchExcerpt: {
    ...typography.body,
    fontSize: 16,
    lineHeight: 24,
  },
  searchVerseNumber: {
    fontWeight: '700',
  },
  searchFeedbackCard: {
    marginHorizontal: layout.screenPadding,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 18,
  },
  searchFeedbackText: {
    ...typography.bodyStrong,
  },
  referenceActionCard: {
    marginHorizontal: layout.screenPadding,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 18,
    gap: spacing.sm,
  },
  referenceMetaText: {
    ...typography.label,
  },
  bookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 60,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bookRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bookIcon: {
    width: 40,
    height: 40,
  },
  bookName: {
    fontSize: 19,
    fontWeight: '500',
  },
  chapterGrid: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  chapterGridInner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chapterButton: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterNumber: {
    fontSize: 15,
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: 10,
    marginBottom: spacing.lg,
    paddingHorizontal: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerLabel: {
    ...typography.eyebrow,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    paddingTop: layout.denseCardPadding,
    height: '60%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    marginBottom: spacing.xs,
  },
  modalTitle: {
    ...typography.cardTitle,
  },
  translationLanguageScroller: {
    marginBottom: spacing.sm,
  },
  translationLanguageFilters: {
    paddingHorizontal: layout.screenPadding,
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  translationLanguageChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  translationLanguageChipText: {
    ...typography.label,
    fontWeight: '600',
  },
  translationList: {
    paddingHorizontal: layout.screenPadding,
  },
  translationCard: {
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  translationItem: {
    minHeight: 88,
    paddingVertical: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  translationInfo: {
    flex: 1,
  },
  translationNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  translationName: {
    ...typography.cardTitle,
  },
  translationAbbr: {
    fontSize: 12,
    fontWeight: '700',
  },
  translationDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  translationMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  translationSize: {
    fontSize: 12,
    fontWeight: '500',
  },
  downloadedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  downloadedText: {
    fontSize: 12,
    fontWeight: '600',
  },
  audioDownloadSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10,
  },
  audioDownloadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  audioDownloadTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  audioDownloadButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  audioDownloadChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  audioDownloadChipLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  audioDownloadByBook: {
    alignSelf: 'flex-start',
    paddingTop: 2,
  },
  audioDownloadByBookLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  audioModalSubtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  downloadAllCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  downloadAllInfo: {
    flex: 1,
    paddingRight: 12,
  },
  downloadAllTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  downloadAllDescription: {
    fontSize: 13,
  },
  downloadProgressTrack: {
    height: 4,
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  downloadProgressFill: {
    height: 4,
    borderRadius: 2,
  },
  chipProgressWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  audioBookRow: {
    minHeight: 60,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: 1,
  },
  audioBookName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  audioBookAction: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
