import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import {
  bibleBooks,
  type BibleBook,
  config,
  getTranslatedBookName,
} from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';
import { useBibleStore } from '../../stores/bibleStore';
import { useI18n } from '../../hooks';
import {
  buildBibleBrowserRows,
  parsePassageReferenceLocale,
  searchBible,
  type BibleBrowserRow,
  type PassageReferenceTarget,
} from '../../services/bible';
import {
  getAudioAvailability,
  isAudioBookDownloaded,
  isRemoteAudioAvailable,
  isTranslationAudioDownloaded,
} from '../../services/audio';
import type { BibleStackParamList } from '../../navigation/types';
import type { BibleTranslation, Verse } from '../../types';
import {
  formatBibleSearchReference,
  resolveBibleSearchIntent,
} from './bibleSearchModel';
import {
  buildTranslationLanguageFilters,
  filterTranslationsByLanguage,
  getTranslationSelectionState,
} from './bibleTranslationModel';
import { layout, radius, spacing, typography } from '../../design/system';
import { getBookIcon } from '../../constants/bookIcons';

type NavigationProp = NativeStackNavigationProp<BibleStackParamList>;

const bibleBrowserRows = buildBibleBrowserRows(bibleBooks);
const BIBLE_BROWSER_ROW_ESTIMATED_SIZE = 52;
const SEARCH_RESULT_ESTIMATED_SIZE = 118;

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

export function BibleBrowserScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { t, currentLanguage } = useI18n();
  const [expandedBookId, setExpandedBookId] = useState<string | null>(null);
  const [showTranslationModal, setShowTranslationModal] = useState(false);
  const [audioManagerTranslationId, setAudioManagerTranslationId] = useState<string | null>(null);
  const [activeAudioDownloadKey, setActiveAudioDownloadKey] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Verse[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const currentTranslation = useBibleStore((state) => state.currentTranslation);
  const translations = useBibleStore((state) => state.translations);
  const setCurrentTranslation = useBibleStore((state) => state.setCurrentTranslation);
  const downloadTranslation = useBibleStore((state) => state.downloadTranslation);
  const downloadAudioForBook = useBibleStore((state) => state.downloadAudioForBook);
  const downloadAudioForTranslation = useBibleStore((state) => state.downloadAudioForTranslation);

  const currentTranslationInfo = translations.find((translation) => translation.id === currentTranslation);
  const audioManagerTranslation = translations.find(
    (translation) => translation.id === audioManagerTranslationId
  );
  const getTranslationAudioAvailability = (
    translation: Pick<BibleTranslation, 'id' | 'hasAudio' | 'downloadedAudioBooks'>,
    bookId?: string
  ) =>
    getAudioAvailability({
      featureEnabled: config.features.audioEnabled,
      translationHasAudio: translation.hasAudio,
      remoteAudioAvailable: isRemoteAudioAvailable(translation.id),
      downloadedAudioBooks: translation.downloadedAudioBooks,
      bookId,
    });
  const translationAudioDownloaded = audioManagerTranslation
    ? isTranslationAudioDownloaded(audioManagerTranslation.downloadedAudioBooks, bibleBooks)
    : false;
  const audioManagerAvailability = audioManagerTranslation
    ? getTranslationAudioAvailability(audioManagerTranslation)
    : null;
  const languageFilters = useMemo(
    () => buildTranslationLanguageFilters(translations),
    [translations]
  );
  const filteredTranslations = useMemo(
    () => filterTranslationsByLanguage(translations, selectedLanguage),
    [translations, selectedLanguage]
  );
  const parseRef = useCallback(
    (q: string) => parsePassageReferenceLocale(q, currentLanguage),
    [currentLanguage],
  );
  const searchIntent = resolveBibleSearchIntent(deferredSearchQuery, parseRef);

  useEffect(() => {
    if (
      selectedLanguage !== 'all' &&
      !languageFilters.some((filter) => filter.value === selectedLanguage)
    ) {
      setSelectedLanguage('all');
    }
  }, [languageFilters, selectedLanguage]);

  useEffect(() => {
    let isCancelled = false;

    const runSearch = async () => {
      const deferredSearchIntent = resolveBibleSearchIntent(
        deferredSearchQuery,
        parseRef
      );

      if (deferredSearchIntent.kind !== 'full-text') {
        setSearchResults([]);
        setSearchError(null);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      setSearchError(null);

      try {
        const results = await searchBible(currentTranslation, deferredSearchIntent.query);

        if (!isCancelled) {
          setSearchResults(results);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Error searching Bible:', error);
          setSearchResults([]);
          setSearchError(t('bible.failedToLoad'));
        }
      } finally {
        if (!isCancelled) {
          setIsSearching(false);
        }
      }
    };

    void runSearch();

    return () => {
      isCancelled = true;
    };
  }, [currentTranslation, deferredSearchQuery, parseRef, t]);

  const handleBookPress = (book: BibleBook) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedBookId((prev) => (prev === book.id ? null : book.id));
  };

  const handleChapterPress = (bookId: string, chapter: number) => {
    navigation.navigate('BibleReader', { bookId, chapter });
  };

  const handleReferencePress = (target: PassageReferenceTarget) => {
    navigation.navigate('BibleReader', {
      bookId: target.bookId,
      chapter: target.chapter,
      focusVerse: target.focusVerse,
    });
  };

  const handleSearchResultPress = (verse: Verse) => {
    navigation.navigate('BibleReader', {
      bookId: verse.bookId,
      chapter: verse.chapter,
      focusVerse: verse.verse,
    });
  };

  const handleSearchSubmit = () => {
    const submitIntent = resolveBibleSearchIntent(searchQuery, parseRef);
    if (submitIntent.kind === 'reference') {
      handleReferencePress(submitIntent.target);
    }
  };

  const handleTranslationSelect = (translation: BibleTranslation) => {
    setShowTranslationModal(false);

    const audioAvailability = getTranslationAudioAvailability(translation);
    const selectionState = getTranslationSelectionState({
      isDownloaded: translation.isDownloaded,
      hasText: translation.hasText,
      hasAudio: translation.hasAudio,
      canPlayAudio: audioAvailability.canPlayAudio,
      source: translation.source,
      textPackLocalPath: translation.textPackLocalPath,
    });

    if (selectionState.isSelectable) {
      setCurrentTranslation(translation.id);
      return;
    }

    if (selectionState.reason === 'audio-unavailable') {
      Alert.alert(t('common.error'), t('bible.audioDownloadFailed'), [{ text: t('common.ok') }]);
      return;
    }

    if (selectionState.reason === 'download-required') {
      Alert.alert(
        translation.name,
        t('translations.downloadPrompt', { name: translation.name, size: translation.sizeInMB }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('translations.download'),
            onPress: () => {
              void downloadTranslation(translation.id).catch((error) => {
                Alert.alert(
                  t('common.error'),
                  error instanceof Error ? error.message : t('bible.failedToLoad'),
                  [{ text: t('common.ok') }]
                );
              });
            },
          },
        ]
      );
      return;
    }

    Alert.alert(t('common.comingSoon'), t('bible.translationComingSoon', { name: translation.name }), [
      { text: t('common.ok') },
    ]);
  };

  const handleOpenAudioManager = (translationId: string) => {
    setShowTranslationModal(false);
    // Small delay so the first modal finishes dismissing before the second opens
    setTimeout(() => setAudioManagerTranslationId(translationId), 350);
  };

  const handleCloseAudioManager = () => {
    setAudioManagerTranslationId(null);
    setActiveAudioDownloadKey(null);
  };

  const handleDownloadEntireBibleAudio = async () => {
    if (!audioManagerTranslation || !audioManagerAvailability?.canDownloadAudio) {
      return;
    }

    setActiveAudioDownloadKey('all');

    try {
      await downloadAudioForTranslation(audioManagerTranslation.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('bible.audioDownloadFailed');
      Alert.alert(t('common.error'), message);
    } finally {
      setActiveAudioDownloadKey(null);
    }
  };

  const handleDownloadTestamentAudio = async (testament: 'OT' | 'NT') => {
    if (!audioManagerTranslation || !audioManagerAvailability?.canDownloadAudio) {
      return;
    }

    setActiveAudioDownloadKey(`testament:${testament}`);

    try {
      const books = bibleBooks.filter((b) => b.testament === testament);
      for (const book of books) {
        const alreadyDownloaded = isAudioBookDownloaded(
          audioManagerTranslation.downloadedAudioBooks,
          book.id
        );
        if (!alreadyDownloaded) {
          await downloadAudioForBook(audioManagerTranslation.id, book.id);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t('bible.audioDownloadFailed');
      Alert.alert(t('common.error'), message);
    } finally {
      setActiveAudioDownloadKey(null);
    }
  };

  const handleDownloadBookAudio = async (bookId: string) => {
    if (!audioManagerTranslation || !audioManagerAvailability?.canDownloadAudio) {
      return;
    }

    setActiveAudioDownloadKey(`book:${bookId}`);

    try {
      await downloadAudioForBook(audioManagerTranslation.id, bookId);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('bible.audioDownloadFailed');
      Alert.alert(t('common.error'), message);
    } finally {
      setActiveAudioDownloadKey(null);
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
          <View>
            <Text style={[styles.title, { color: colors.biblePrimaryText }]}>{t('bible.title')}</Text>
            <Text style={[styles.subtitle, { color: colors.bibleSecondaryText }]}>
              {currentTranslationInfo?.name || t('about.bereanBible')}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.translationButton,
              { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
            ]}
            onPress={() => {
              if (config.features.multipleTranslations) {
                setShowTranslationModal(true);
              }
            }}
            activeOpacity={config.features.multipleTranslations ? 0.85 : 1}
          >
            <Ionicons name="book-outline" size={16} color={colors.bibleSecondaryText} />
            <Text style={[styles.translationButtonText, { color: colors.biblePrimaryText }]}>
              {currentTranslationInfo?.abbreviation || 'BSB'}
            </Text>
            {config.features.multipleTranslations ? (
              <Ionicons name="chevron-down" size={16} color={colors.bibleSecondaryText} />
            ) : null}
          </TouchableOpacity>
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

              {languageFilters.length > 1 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.translationLanguageFilters}
                  style={styles.translationLanguageScroller}
                >
                  {[
                    { value: 'all', label: 'All' },
                    ...languageFilters,
                  ].map((filter) => {
                    const isSelected = selectedLanguage === filter.value;
                    return (
                      <TouchableOpacity
                        key={filter.value}
                        style={[
                          styles.translationLanguageChip,
                          {
                            backgroundColor: isSelected
                              ? colors.bibleAccent
                              : colors.bibleElevatedSurface,
                            borderColor: isSelected ? colors.bibleAccent : colors.bibleDivider,
                          },
                        ]}
                        onPress={() => setSelectedLanguage(filter.value)}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={filter.label}
                      >
                        <Text
                          style={[
                            styles.translationLanguageChipText,
                            {
                              color: isSelected ? '#FFFFFF' : colors.biblePrimaryText,
                            },
                          ]}
                        >
                          {filter.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              ) : null}

              <ScrollView style={styles.translationList} showsVerticalScrollIndicator={false}>
                {filteredTranslations.map((translation) => {
                  const isSelected = currentTranslation === translation.id;
                  const audioAvailability = getTranslationAudioAvailability(translation);
                  const selectionState = getTranslationSelectionState({
                    isDownloaded: translation.isDownloaded,
                    hasText: translation.hasText,
                    hasAudio: translation.hasAudio,
                    canPlayAudio: audioAvailability.canPlayAudio,
                    source: translation.source,
                    textPackLocalPath: translation.textPackLocalPath,
                  });
                  return (
                    <View
                      key={translation.id}
                      style={[
                        styles.translationCard,
                        {
                          backgroundColor: isSelected
                            ? colors.bibleElevatedSurface
                            : 'transparent',
                          borderColor: colors.bibleDivider,
                        },
                      ]}
                    >
                      <TouchableOpacity
                        style={[
                          styles.translationItem,
                          { borderBottomColor: colors.bibleDivider },
                        ]}
                        onPress={() => handleTranslationSelect(translation)}
                        activeOpacity={0.85}
                      >
                        <View style={styles.translationInfo}>
                          <View style={styles.translationNameRow}>
                            <Text
                              style={[styles.translationName, { color: colors.biblePrimaryText }]}
                            >
                              {translation.name}
                            </Text>
                            <Text style={[styles.translationAbbr, { color: colors.bibleAccent }]}>
                              {translation.abbreviation}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.translationDescription,
                              { color: colors.bibleSecondaryText },
                            ]}
                          >
                            {translation.description}
                          </Text>
                          <View style={styles.translationMeta}>
                            <Text
                              style={[styles.translationSize, { color: colors.bibleSecondaryText }]}
                            >
                              {translation.sizeInMB} MB
                            </Text>
                            {selectionState.isSelectable ? (
                              <View style={styles.downloadedBadge}>
                                <Ionicons
                                  name="checkmark-circle"
                                  size={14}
                                  color={
                                    translation.isDownloaded ? colors.success : colors.bibleAccent
                                  }
                                />
                                <Text
                                  style={[
                                    styles.downloadedText,
                                    {
                                      color:
                                        translation.isDownloaded
                                          ? colors.success
                                          : colors.bibleAccent,
                                    },
                                  ]}
                                >
                                  {t('bible.available')}
                                </Text>
                              </View>
                            ) : (
                              <View style={styles.downloadedBadge}>
                                <Ionicons
                                  name="time-outline"
                                  size={14}
                                  color={colors.bibleSecondaryText}
                                />
                                <Text
                                  style={[
                                    styles.downloadedText,
                                    { color: colors.bibleSecondaryText },
                                  ]}
                                >
                                  {selectionState.reason === 'download-required'
                                    ? t('translations.download')
                                    : t('common.comingSoon')}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                        {isSelected ? (
                          <Ionicons name="checkmark" size={22} color={colors.bibleAccent} />
                        ) : null}
                      </TouchableOpacity>

                      {audioAvailability.canManageAudio ? (
                        <View
                          style={[
                            styles.audioDownloadSection,
                            { borderTopColor: colors.bibleDivider },
                          ]}
                        >
                          <View style={styles.audioDownloadHeader}>
                            <Ionicons
                              name="headset-outline"
                              size={14}
                              color={colors.bibleSecondaryText}
                            />
                            <Text
                              style={[
                                styles.audioDownloadTitle,
                                { color: colors.bibleSecondaryText },
                              ]}
                            >
                              Audio Bible — {translation.downloadedAudioBooks.length}/
                              {translation.totalBooks} books offline
                            </Text>
                          </View>

                          <View style={styles.audioDownloadButtons}>
                            {/* Entire Bible */}
                            {(() => {
                              const allDone =
                                translation.downloadedAudioBooks.length ===
                                translation.totalBooks;
                              const isActive = activeAudioDownloadKey === `all-${translation.id}`;
                              const pct = translation.totalBooks > 0
                                ? Math.round((translation.downloadedAudioBooks.length / translation.totalBooks) * 100)
                                : 0;
                              return (
                                <TouchableOpacity
                                  style={[
                                    styles.audioDownloadChip,
                                    {
                                      backgroundColor: allDone
                                        ? colors.success + '22'
                                        : colors.bibleElevatedSurface,
                                      borderColor: allDone ? colors.success : colors.bibleDivider,
                                    },
                                  ]}
                                  disabled={
                                    allDone ||
                                    activeAudioDownloadKey !== null ||
                                    !audioAvailability.canDownloadAudio
                                  }
                                  activeOpacity={0.8}
                                  onPress={async () => {
                                    if (!audioAvailability.canDownloadAudio) return;
                                    setActiveAudioDownloadKey(`all-${translation.id}`);
                                    try {
                                      await downloadAudioForTranslation(translation.id);
                                    } catch (e) {
                                      Alert.alert(
                                        t('common.error'),
                                        e instanceof Error
                                          ? e.message
                                          : t('bible.audioDownloadFailed')
                                      );
                                    } finally {
                                      setActiveAudioDownloadKey(null);
                                    }
                                  }}
                                >
                                  {isActive ? (
                                    <View style={styles.chipProgressWrapper}>
                                      <ActivityIndicator size="small" color={colors.bibleAccent} />
                                      <Text style={[styles.audioDownloadChipLabel, { color: colors.bibleAccent }]}>
                                        {translation.downloadedAudioBooks.length}/{translation.totalBooks} ({pct}%)
                                      </Text>
                                    </View>
                                  ) : (
                                    <>
                                      <Ionicons
                                        name={allDone ? 'checkmark-circle' : 'download-outline'}
                                        size={14}
                                        color={allDone ? colors.success : colors.bibleAccent}
                                      />
                                      <Text
                                        style={[
                                          styles.audioDownloadChipLabel,
                                          { color: allDone ? colors.success : colors.biblePrimaryText },
                                        ]}
                                      >
                                        Whole Bible
                                      </Text>
                                    </>
                                  )}
                                </TouchableOpacity>
                              );
                            })()}

                            {/* OT / NT */}
                            {(['OT', 'NT'] as const).map((testament) => {
                              const testamentBooks = bibleBooks.filter(
                                (b) => b.testament === testament
                              );
                              const doneCount = testamentBooks.filter((b) =>
                                isAudioBookDownloaded(translation.downloadedAudioBooks, b.id)
                              ).length;
                              const allDone = doneCount === testamentBooks.length;
                              const isActive =
                                activeAudioDownloadKey === `testament-inline:${testament}:${translation.id}`;
                              const pct = testamentBooks.length > 0
                                ? Math.round((doneCount / testamentBooks.length) * 100)
                                : 0;
                              return (
                                <TouchableOpacity
                                  key={testament}
                                  style={[
                                    styles.audioDownloadChip,
                                    {
                                      backgroundColor: allDone
                                        ? colors.success + '22'
                                        : colors.bibleElevatedSurface,
                                      borderColor: allDone ? colors.success : colors.bibleDivider,
                                    },
                                  ]}
                                  disabled={
                                    allDone ||
                                    activeAudioDownloadKey !== null ||
                                    !audioAvailability.canDownloadAudio
                                  }
                                  activeOpacity={0.8}
                                  onPress={async () => {
                                    if (!audioAvailability.canDownloadAudio) return;
                                    setActiveAudioDownloadKey(
                                      `testament-inline:${testament}:${translation.id}`
                                    );
                                    try {
                                      for (const book of testamentBooks) {
                                        if (
                                          !isAudioBookDownloaded(
                                            translation.downloadedAudioBooks,
                                            book.id
                                          )
                                        ) {
                                          await downloadAudioForBook(translation.id, book.id);
                                        }
                                      }
                                    } catch (e) {
                                      Alert.alert(
                                        t('common.error'),
                                        e instanceof Error
                                          ? e.message
                                          : t('bible.audioDownloadFailed')
                                      );
                                    } finally {
                                      setActiveAudioDownloadKey(null);
                                    }
                                  }}
                                >
                                  {isActive ? (
                                    <View style={styles.chipProgressWrapper}>
                                      <ActivityIndicator size="small" color={colors.bibleAccent} />
                                      <Text style={[styles.audioDownloadChipLabel, { color: colors.bibleAccent }]}>
                                        {doneCount}/{testamentBooks.length} ({pct}%)
                                      </Text>
                                    </View>
                                  ) : (
                                    <>
                                      <Ionicons
                                        name={allDone ? 'checkmark-circle' : 'download-outline'}
                                        size={14}
                                        color={allDone ? colors.success : colors.bibleAccent}
                                      />
                                      <Text
                                        style={[
                                          styles.audioDownloadChipLabel,
                                          { color: allDone ? colors.success : colors.biblePrimaryText },
                                        ]}
                                      >
                                        {testament === 'OT' ? t('bible.oldTestament') : t('bible.newTestament')}
                                      </Text>
                                    </>
                                  )}
                                </TouchableOpacity>
                              );
                            })}
                          </View>

                          <TouchableOpacity
                            style={styles.audioDownloadByBook}
                            onPress={() => handleOpenAudioManager(translation.id)}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.audioDownloadByBookLabel,
                                { color: colors.bibleAccent },
                              ]}
                            >
                              Download by book →
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}

      <Modal
        visible={audioManagerTranslation != null}
        transparent
        animationType="slide"
        onRequestClose={handleCloseAudioManager}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
            ]}
          >
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.biblePrimaryText }]}>
                  {t('bible.audioDownloads')}
                </Text>
                {audioManagerTranslation ? (
                  <Text
                    style={[styles.audioModalSubtitle, { color: colors.bibleSecondaryText }]}
                  >
                    {audioManagerTranslation.name}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity onPress={handleCloseAudioManager}>
                <Ionicons name="close" size={22} color={colors.bibleSecondaryText} />
              </TouchableOpacity>
            </View>

            {audioManagerTranslation ? (
              <ScrollView style={styles.translationList} showsVerticalScrollIndicator={false}>
                <TouchableOpacity
                  style={[
                    styles.downloadAllCard,
                    {
                      backgroundColor: colors.bibleElevatedSurface,
                      borderColor: colors.bibleDivider,
                    },
                  ]}
                  onPress={
                    translationAudioDownloaded || !audioManagerAvailability?.canDownloadAudio
                      ? undefined
                      : handleDownloadEntireBibleAudio
                  }
                  activeOpacity={
                    translationAudioDownloaded || !audioManagerAvailability?.canDownloadAudio
                      ? 1
                      : 0.85
                  }
                  disabled={
                    translationAudioDownloaded ||
                    activeAudioDownloadKey !== null ||
                    !audioManagerAvailability?.canDownloadAudio
                  }
                >
                  <View style={styles.downloadAllInfo}>
                    <Text style={[styles.downloadAllTitle, { color: colors.biblePrimaryText }]}>
                      {translationAudioDownloaded || !audioManagerAvailability?.canDownloadAudio
                        ? t('bible.audioSavedOffline')
                        : t('bible.downloadBibleAudio')}
                    </Text>
                    {activeAudioDownloadKey === 'all' ? (
                      <>
                        <Text style={[styles.downloadAllDescription, { color: colors.bibleAccent }]}>
                          {audioManagerTranslation.downloadedAudioBooks.length}/{audioManagerTranslation.totalBooks} books
                          {' '}({audioManagerTranslation.totalBooks > 0
                            ? Math.round((audioManagerTranslation.downloadedAudioBooks.length / audioManagerTranslation.totalBooks) * 100)
                            : 0}%)
                        </Text>
                        <View style={[styles.downloadProgressTrack, { backgroundColor: colors.bibleDivider }]}>
                          <View
                            style={[
                              styles.downloadProgressFill,
                              {
                                backgroundColor: colors.bibleAccent,
                                width: `${audioManagerTranslation.totalBooks > 0
                                  ? Math.round((audioManagerTranslation.downloadedAudioBooks.length / audioManagerTranslation.totalBooks) * 100)
                                  : 0}%`,
                              },
                            ]}
                          />
                        </View>
                      </>
                    ) : (
                      <Text style={[styles.downloadAllDescription, { color: colors.bibleSecondaryText }]}>
                        {audioManagerTranslation.downloadedAudioBooks.length}/{audioManagerTranslation.totalBooks}
                      </Text>
                    )}
                  </View>
                  {activeAudioDownloadKey === 'all' ? (
                    <ActivityIndicator color={colors.bibleAccent} />
                  ) : (
                    <Ionicons
                      name={
                        translationAudioDownloaded
                          ? 'checkmark-circle'
                          : audioManagerAvailability?.canDownloadAudio
                            ? 'download-outline'
                            : 'cloud-offline-outline'
                      }
                      size={22}
                      color={
                        translationAudioDownloaded
                          ? colors.success
                          : audioManagerAvailability?.canDownloadAudio
                            ? colors.bibleAccent
                            : colors.bibleSecondaryText
                      }
                    />
                  )}
                </TouchableOpacity>

                {(['OT', 'NT'] as const).map((testament) => {
                  const testamentBooks = bibleBooks.filter((b) => b.testament === testament);
                  const downloadedCount = testamentBooks.filter((b) =>
                    isAudioBookDownloaded(audioManagerTranslation.downloadedAudioBooks, b.id)
                  ).length;
                  const allDownloaded = downloadedCount === testamentBooks.length;
                  const isDownloading = activeAudioDownloadKey === `testament:${testament}`;
                  const label = testament === 'OT' ? t('bible.oldTestament') : t('bible.newTestament');

                  return (
                    <TouchableOpacity
                      key={testament}
                      style={[
                        styles.downloadAllCard,
                        {
                          backgroundColor: colors.bibleElevatedSurface,
                          borderColor: colors.bibleDivider,
                          marginTop: 8,
                        },
                      ]}
                      onPress={
                        allDownloaded || !audioManagerAvailability?.canDownloadAudio
                          ? undefined
                          : () => void handleDownloadTestamentAudio(testament)
                      }
                      activeOpacity={allDownloaded || !audioManagerAvailability?.canDownloadAudio ? 1 : 0.85}
                      disabled={allDownloaded || activeAudioDownloadKey !== null || !audioManagerAvailability?.canDownloadAudio}
                    >
                      <View style={styles.downloadAllInfo}>
                        <Text style={[styles.downloadAllTitle, { color: colors.biblePrimaryText }]}>
                          {label}
                        </Text>
                        {isDownloading ? (
                          <>
                            <Text style={[styles.downloadAllDescription, { color: colors.bibleAccent }]}>
                              {downloadedCount}/{testamentBooks.length} books
                              {' '}({testamentBooks.length > 0 ? Math.round((downloadedCount / testamentBooks.length) * 100) : 0}%)
                            </Text>
                            <View style={[styles.downloadProgressTrack, { backgroundColor: colors.bibleDivider }]}>
                              <View
                                style={[
                                  styles.downloadProgressFill,
                                  {
                                    backgroundColor: colors.bibleAccent,
                                    width: `${testamentBooks.length > 0 ? Math.round((downloadedCount / testamentBooks.length) * 100) : 0}%`,
                                  },
                                ]}
                              />
                            </View>
                          </>
                        ) : (
                          <Text style={[styles.downloadAllDescription, { color: colors.bibleSecondaryText }]}>
                            {downloadedCount}/{testamentBooks.length}
                          </Text>
                        )}
                      </View>
                      {isDownloading ? (
                        <ActivityIndicator color={colors.bibleAccent} />
                      ) : (
                        <Ionicons
                          name={allDownloaded ? 'checkmark-circle' : audioManagerAvailability?.canDownloadAudio ? 'download-outline' : 'cloud-offline-outline'}
                          size={22}
                          color={allDownloaded ? colors.success : audioManagerAvailability?.canDownloadAudio ? colors.bibleAccent : colors.bibleSecondaryText}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}

                {bibleBooks.map((book) => {
                  const bookAudioDownloaded = isAudioBookDownloaded(
                    audioManagerTranslation.downloadedAudioBooks,
                    book.id
                  );
                  const bookAudioAvailability = getTranslationAudioAvailability(
                    audioManagerTranslation,
                    book.id
                  );
                  const isBookDownloading = activeAudioDownloadKey === `book:${book.id}`;
                  return (
                    <View
                      key={book.id}
                      style={[
                        styles.audioBookRow,
                        { borderBottomColor: colors.bibleDivider },
                      ]}
                    >
                      <Text style={[styles.audioBookName, { color: colors.biblePrimaryText }]}>
                        {getTranslatedBookName(book.id, t)}
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.audioBookAction,
                          {
                            backgroundColor: colors.bibleElevatedSurface,
                            borderColor: colors.bibleDivider,
                          },
                        ]}
                        onPress={
                          bookAudioDownloaded ||
                          activeAudioDownloadKey !== null ||
                          !bookAudioAvailability.canDownloadAudio
                            ? undefined
                            : () => handleDownloadBookAudio(book.id)
                        }
                        activeOpacity={
                          bookAudioDownloaded || !bookAudioAvailability.canDownloadAudio ? 1 : 0.85
                        }
                        disabled={
                          bookAudioDownloaded ||
                          activeAudioDownloadKey !== null ||
                          !bookAudioAvailability.canDownloadAudio
                        }
                      >
                        {isBookDownloading ? (
                          <ActivityIndicator color={colors.bibleAccent} size="small" />
                        ) : (
                          <Ionicons
                            name={
                              bookAudioDownloaded
                                ? 'checkmark-circle'
                                : bookAudioAvailability.canDownloadAudio
                                  ? 'download-outline'
                                  : 'cloud-offline-outline'
                            }
                            size={20}
                            color={
                              bookAudioDownloaded
                                ? colors.success
                                : bookAudioAvailability.canDownloadAudio
                                  ? colors.bibleAccent
                                  : colors.bibleSecondaryText
                            }
                          />
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
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
    paddingTop: layout.cardPadding,
    maxHeight: '82%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    marginBottom: spacing.md,
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
