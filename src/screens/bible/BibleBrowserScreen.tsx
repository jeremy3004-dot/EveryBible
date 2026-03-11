import { useDeferredValue, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Modal,
  ScrollView,
  Alert,
  Image,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import {
  bibleBooks,
  type BibleBook,
  config,
  getBookById,
  getBookIcon,
} from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';
import { useBibleStore } from '../../stores/bibleStore';
import { useI18n } from '../../hooks';
import { buildBibleBrowserRows, searchBible, type BibleBrowserRow } from '../../services/bible';
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
  shouldRunBibleSearch,
} from './bibleSearchModel';

type NavigationProp = NativeStackNavigationProp<BibleStackParamList>;

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 56) / 2;
const bibleBrowserRows = buildBibleBrowserRows(bibleBooks);

export function BibleBrowserScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [showTranslationModal, setShowTranslationModal] = useState(false);
  const [audioManagerTranslationId, setAudioManagerTranslationId] = useState<string | null>(null);
  const [activeAudioDownloadKey, setActiveAudioDownloadKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Verse[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const currentTranslation = useBibleStore((state) => state.currentTranslation);
  const translations = useBibleStore((state) => state.translations);
  const setCurrentTranslation = useBibleStore((state) => state.setCurrentTranslation);
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
  const isSearchActive = shouldRunBibleSearch(deferredSearchQuery);

  useEffect(() => {
    let isCancelled = false;

    const runSearch = async () => {
      const trimmedQuery = deferredSearchQuery.trim();

      if (!shouldRunBibleSearch(trimmedQuery)) {
        setSearchResults([]);
        setSearchError(null);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      setSearchError(null);

      try {
        const results = await searchBible(trimmedQuery);

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
  }, [deferredSearchQuery, t]);

  const handleBookPress = (book: BibleBook) => {
    navigation.navigate('ChapterSelector', { bookId: book.id });
  };

  const handleSearchResultPress = (verse: Verse) => {
    navigation.navigate('BibleReader', {
      bookId: verse.bookId,
      chapter: verse.chapter,
      focusVerse: verse.verse,
    });
  };

  const handleTranslationSelect = (translation: BibleTranslation) => {
    setShowTranslationModal(false);

    if (translation.isDownloaded) {
      setCurrentTranslation(translation.id);
      return;
    }

    Alert.alert(
      t('common.comingSoon'),
      t('bible.translationComingSoon', { name: translation.name }),
      [{ text: t('common.ok') }]
    );
  };

  const handleOpenAudioManager = (translationId: string) => {
    setAudioManagerTranslationId(translationId);
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

  const renderBookCard = ({ item }: { item: BibleBook }) => (
    <TouchableOpacity
      style={[
        styles.bookCard,
        {
          backgroundColor: colors.bibleSurface,
          borderColor: colors.bibleDivider,
        },
      ]}
      onPress={() => handleBookPress(item)}
      activeOpacity={0.85}
    >
      <View
        style={[
          styles.iconBadge,
          { backgroundColor: colors.bibleElevatedSurface, borderColor: colors.bibleDivider },
        ]}
      >
        <Image
          source={getBookIcon(item.id)}
          style={styles.bookIcon}
          resizeMode="contain"
          tintColor={colors.biblePrimaryText}
        />
      </View>
      <Text style={[styles.bookName, { color: colors.biblePrimaryText }]} numberOfLines={2}>
        {item.name}
      </Text>
    </TouchableOpacity>
  );

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

    return (
      <View style={styles.row}>
        {item.books.map((book) => renderBookCard({ item: book }))}
        {item.books.length === 1 ? <View style={styles.bookCardSpacer} /> : null}
      </View>
    );
  };

  const renderSearchResult = ({ item }: { item: Verse }) => {
    const bookName = getBookById(item.bookId)?.name;
    const referenceLabel = formatBibleSearchReference(item, (bookId) => getBookById(bookId)?.name);

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
              {currentTranslationInfo?.name || 'Berean Standard Bible'}
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
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity style={styles.clearSearchButton} onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.bibleSecondaryText} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {isSearchActive ? (
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
          <FlatList
            data={searchResults}
            renderItem={renderSearchResult}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.searchResultsContent}
            showsVerticalScrollIndicator={false}
          />
        )
      ) : (
        <FlatList
          data={bibleBrowserRows}
          renderItem={renderRow}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
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

              <ScrollView style={styles.translationList} showsVerticalScrollIndicator={false}>
                {translations.map((translation) => {
                  const isSelected = currentTranslation === translation.id;
                  const audioAvailability = getTranslationAudioAvailability(translation);
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
                            {translation.isDownloaded ? (
                              <View style={styles.downloadedBadge}>
                                <Ionicons
                                  name="checkmark-circle"
                                  size={14}
                                  color={colors.success}
                                />
                                <Text style={[styles.downloadedText, { color: colors.success }]}>
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
                                  {t('common.comingSoon')}
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
                        <View style={styles.translationActionRow}>
                          <TouchableOpacity
                            style={[
                              styles.manageAudioButton,
                              {
                                backgroundColor: colors.bibleElevatedSurface,
                                borderColor: colors.bibleDivider,
                              },
                            ]}
                            onPress={() => handleOpenAudioManager(translation.id)}
                            activeOpacity={0.85}
                          >
                            <Ionicons
                              name={
                                translation.downloadedAudioBooks.length > 0
                                  ? 'checkmark-circle'
                                  : audioAvailability.canDownloadAudio
                                    ? 'download-outline'
                                    : 'cloud-offline-outline'
                              }
                              size={16}
                              color={
                                translation.downloadedAudioBooks.length > 0
                                  ? colors.success
                                  : colors.bibleSecondaryText
                              }
                            />
                            <Text
                              style={[
                                styles.manageAudioText,
                                { color: colors.biblePrimaryText },
                              ]}
                            >
                              {translation.downloadedAudioBooks.length > 0
                                ? t('bible.audioSavedOffline')
                                : t('bible.manageAudio')}
                            </Text>
                          </TouchableOpacity>
                          <Text
                            style={[
                              styles.audioCountText,
                              { color: colors.bibleSecondaryText },
                            ]}
                          >
                            {translation.downloadedAudioBooks.length}/{translation.totalBooks}
                          </Text>
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
                    <Text
                      style={[
                        styles.downloadAllDescription,
                        { color: colors.bibleSecondaryText },
                      ]}
                    >
                      {audioManagerTranslation.downloadedAudioBooks.length}/
                      {audioManagerTranslation.totalBooks}
                    </Text>
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
                        {book.name}
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
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
    gap: 12,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
  },
  translationButton: {
    minHeight: 42,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  translationButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    paddingTop: 8,
  },
  searchInputShell: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
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
    paddingHorizontal: 16,
    paddingBottom: 28,
    paddingTop: 8,
    gap: 12,
  },
  searchResultCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    gap: 10,
  },
  searchResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  searchReference: {
    fontSize: 13,
    fontWeight: '700',
  },
  searchExcerpt: {
    fontSize: 16,
    lineHeight: 24,
  },
  searchVerseNumber: {
    fontWeight: '700',
  },
  searchFeedbackCard: {
    marginHorizontal: 16,
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
  },
  searchFeedbackText: {
    fontSize: 15,
    fontWeight: '600',
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: 12,
    flexDirection: 'row',
  },
  bookCard: {
    width: CARD_WIDTH,
    minHeight: 136,
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    justifyContent: 'flex-start',
  },
  iconBadge: {
    width: 54,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  bookIcon: {
    width: 28,
    height: 28,
  },
  bookName: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
  },
  bookCardSpacer: {
    width: CARD_WIDTH,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingTop: 20,
    maxHeight: '82%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  translationList: {
    paddingHorizontal: 20,
  },
  translationCard: {
    marginBottom: 12,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  translationItem: {
    minHeight: 88,
    paddingVertical: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
    fontSize: 16,
    fontWeight: '700',
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
  translationActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 12,
  },
  manageAudioButton: {
    borderWidth: 1,
    borderRadius: 999,
    minHeight: 36,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  manageAudioText: {
    fontSize: 13,
    fontWeight: '700',
  },
  audioCountText: {
    fontSize: 12,
    fontWeight: '600',
  },
  audioModalSubtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  downloadAllCard: {
    borderWidth: 1,
    borderRadius: 20,
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
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
