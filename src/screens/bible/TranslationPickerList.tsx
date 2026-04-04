import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { bibleBooks, config, getTranslatedBookName, newTestamentBooks } from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';
import { useBibleStore } from '../../stores/bibleStore';
import { useI18n } from '../../hooks';
import {
  getAudioAvailability,
  isAudioBookDownloaded,
  isRemoteAudioAvailable,
  isTranslationAudioDownloaded,
} from '../../services/audio';
import { layout, radius, spacing, typography } from '../../design/system';
import type { BibleTranslation } from '../../types';
import {
  ensureRuntimeCatalogLoaded,
  hasRuntimeCatalogTranslations,
} from '../../services/translations';
import {
  buildTranslationPickerSections,
  buildTranslationLanguageFilters,
  filterTranslationsByLanguage,
  filterTranslationsBySearchQuery,
  getTranslationAudioCollectionActions,
  getVisibleTranslationsForPicker,
  getTranslationLanguageDisplayLabel,
  getTranslationSelectionState,
  resolvePreferredTranslationLanguage,
} from './bibleTranslationModel';

interface TranslationPickerListProps {
  onRequestClose?: () => void;
  onTranslationActivated?: (translation: BibleTranslation) => void;
}

export function TranslationPickerList({
  onRequestClose,
  onTranslationActivated,
}: TranslationPickerListProps) {
  const { colors } = useTheme();
  const { t } = useI18n();

  const currentTranslation = useBibleStore((state) => state.currentTranslation);
  const preferredTranslationLanguage = useBibleStore((state) => state.preferredTranslationLanguage);
  const translations = useBibleStore((state) => state.translations);
  const downloadProgress = useBibleStore((state) => state.downloadProgress);
  const setCurrentTranslation = useBibleStore((state) => state.setCurrentTranslation);
  const setPreferredTranslationLanguage = useBibleStore((state) => state.setPreferredTranslationLanguage);
  const downloadTranslation = useBibleStore((state) => state.downloadTranslation);
  const downloadAudioForBook = useBibleStore((state) => state.downloadAudioForBook);
  const downloadAudioForBooks = useBibleStore((state) => state.downloadAudioForBooks);
  const downloadAudioForTranslation = useBibleStore((state) => state.downloadAudioForTranslation);

  const [pickerMode, setPickerMode] = useState<'translations' | 'languages'>('translations');
  const [audioManagerTranslationId, setAudioManagerTranslationId] = useState<string | null>(null);
  const [activeAudioDownloadKey, setActiveAudioDownloadKey] = useState<string | null>(null);
  const [isHydratingRuntimeCatalog, setIsHydratingRuntimeCatalog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const hasHydratedRuntimeCatalog = useMemo(
    () => hasRuntimeCatalogTranslations(translations),
    [translations]
  );

  const audioManagerTranslation = translations.find(
    (translation) => translation.id === audioManagerTranslationId
  );
  const audioManagerCollectionActions = audioManagerTranslation
    ? getTranslationAudioCollectionActions(audioManagerTranslation)
    : [];
  const audioManagerCollectionAction = audioManagerCollectionActions[0] ?? null;
  const audioManagerCollectionBooks =
    audioManagerCollectionAction === 'new-testament' ? newTestamentBooks : bibleBooks;
  const audioManagerBooks = audioManagerCollectionActions.includes('full-bible')
    ? bibleBooks
    : audioManagerCollectionActions.includes('new-testament')
      ? newTestamentBooks
      : bibleBooks;

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
    ? isTranslationAudioDownloaded(
        audioManagerTranslation.downloadedAudioBooks,
        audioManagerCollectionBooks
      )
    : false;
  const audioManagerAvailability = audioManagerTranslation
    ? getTranslationAudioAvailability(audioManagerTranslation)
    : null;

  const visibleTranslations = useMemo(
    () =>
      getVisibleTranslationsForPicker(translations, {
        isHydratingRuntimeCatalog,
        hasHydratedRuntimeCatalog,
      }),
    [translations, hasHydratedRuntimeCatalog, isHydratingRuntimeCatalog]
  );
  const languageFilters = useMemo(
    () => buildTranslationLanguageFilters(visibleTranslations),
    [visibleTranslations]
  );
  const filteredTranslations = useMemo(
    () => filterTranslationsBySearchQuery(visibleTranslations, searchQuery),
    [searchQuery, visibleTranslations]
  );
  const resolvedPreferredLanguage = useMemo(
    () =>
      resolvePreferredTranslationLanguage(
        visibleTranslations,
        preferredTranslationLanguage,
        currentTranslation
      ),
    [currentTranslation, preferredTranslationLanguage, visibleTranslations]
  );
  const sections = useMemo(
    () => buildTranslationPickerSections(filteredTranslations, resolvedPreferredLanguage),
    [filteredTranslations, resolvedPreferredLanguage]
  );
  const languageOptions = useMemo(
    () =>
      languageFilters.map((filter) => ({
        ...filter,
        count: filterTranslationsByLanguage(visibleTranslations, filter.value).length,
      })),
    [languageFilters, visibleTranslations]
  );

  useEffect(() => {
    if (
      resolvedPreferredLanguage &&
      preferredTranslationLanguage !== resolvedPreferredLanguage
    ) {
      setPreferredTranslationLanguage(resolvedPreferredLanguage);
    }
  }, [
    preferredTranslationLanguage,
    resolvedPreferredLanguage,
    setPreferredTranslationLanguage,
  ]);

  useEffect(() => {
    if (pickerMode === 'languages' && languageOptions.length <= 1) {
      setPickerMode('translations');
    }
  }, [languageOptions.length, pickerMode]);

  useEffect(() => {
    let isMounted = true;

    if (hasHydratedRuntimeCatalog) {
      setIsHydratingRuntimeCatalog(false);
      return () => {
        isMounted = false;
      };
    }

    setIsHydratingRuntimeCatalog(true);
    void ensureRuntimeCatalogLoaded()
      .catch((error) => {
        console.warn('[Bible] Failed to hydrate runtime translation catalog:', error);
      })
      .finally(() => {
        if (isMounted) {
          setIsHydratingRuntimeCatalog(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [hasHydratedRuntimeCatalog]);

  const handleTranslationSelect = async (translation: BibleTranslation) => {
    let nextTranslation = translation;

    if (!hasHydratedRuntimeCatalog && !translation.isDownloaded) {
      setIsHydratingRuntimeCatalog(true);

      try {
        await ensureRuntimeCatalogLoaded();
      } catch (error) {
        console.warn('[Bible] Failed to refresh translation catalog before selection:', error);
      } finally {
        setIsHydratingRuntimeCatalog(false);
      }

      nextTranslation =
        useBibleStore
          .getState()
          .translations.find((candidate) => candidate.id === translation.id) ?? translation;
    }

    const audioAvailability = getTranslationAudioAvailability(nextTranslation);
    const selectionState = getTranslationSelectionState({
      isDownloaded: nextTranslation.isDownloaded,
      hasText: nextTranslation.hasText,
      hasAudio: nextTranslation.hasAudio,
      canPlayAudio: audioAvailability.canPlayAudio,
      hasDownloadableTextPack: Boolean(nextTranslation.catalog?.text?.downloadUrl),
      source: nextTranslation.source,
      textPackLocalPath: nextTranslation.textPackLocalPath,
    });

    if (selectionState.isSelectable) {
      setCurrentTranslation(nextTranslation.id);
      onRequestClose?.();
      onTranslationActivated?.(nextTranslation);
      return;
    }

    if (selectionState.reason === 'audio-unavailable') {
      Alert.alert(t('common.error'), t('bible.audioDownloadFailed'), [{ text: t('common.ok') }]);
      return;
    }

    if (selectionState.reason === 'download-required') {
      Alert.alert(
        nextTranslation.name,
        t('translations.downloadPrompt', { name: nextTranslation.name, size: nextTranslation.sizeInMB }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('translations.download'),
            onPress: () => {
              void handleDownloadTextTranslation(nextTranslation);
            },
          },
        ]
      );
      return;
    }

    Alert.alert(
      t('common.comingSoon'),
      t('bible.translationComingSoon', { name: nextTranslation.name }),
      [{ text: t('common.ok') }]
    );
  };

  const handleDownloadAudioCollection = async (action: 'full-bible' | 'new-testament') => {
    if (!audioManagerTranslation || !audioManagerAvailability?.canDownloadAudio) {
      return;
    }

    setActiveAudioDownloadKey(action === 'new-testament' ? 'nt' : 'all');

    try {
      if (action === 'new-testament') {
        await downloadAudioForBooks(
          audioManagerTranslation.id,
          newTestamentBooks.map((book) => book.id)
        );
      } else {
        await downloadAudioForTranslation(audioManagerTranslation.id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t('bible.audioDownloadFailed');
      Alert.alert(t('common.error'), message);
    } finally {
      setActiveAudioDownloadKey(null);
    }
  };

  const handleDownloadTextTranslation = async (translation: BibleTranslation) => {
    if (!translation.catalog?.text?.downloadUrl) {
      return;
    }

    try {
      await downloadTranslation(translation.id);
    } catch (error) {
      Alert.alert(
        t('common.error'),
        error instanceof Error ? error.message : t('bible.failedToLoad'),
        [{ text: t('common.ok') }]
      );
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

  const renderTranslationCard = (translation: BibleTranslation) => {
    const isSelected = currentTranslation === translation.id;
    const audioAvailability = getTranslationAudioAvailability(translation);
    const audioCollectionActions = getTranslationAudioCollectionActions(translation);
    const isTextDownloadActive =
      downloadProgress?.translationId === translation.id && !downloadProgress.bookId;
    const isTextDownloaded = translation.isDownloaded || Boolean(translation.textPackLocalPath);
    const isAudioDownloaded = isTranslationAudioDownloaded(translation.downloadedAudioBooks, bibleBooks);
    const isNewTestamentAudioDownloaded = isTranslationAudioDownloaded(
      translation.downloadedAudioBooks,
      newTestamentBooks
    );
    const isFullBibleAudioDownloading = activeAudioDownloadKey === `all-${translation.id}`;
    const isNewTestamentAudioDownloading = activeAudioDownloadKey === `nt-${translation.id}`;
    const isTextChipVisible =
      translation.hasText || Boolean(translation.catalog?.text?.downloadUrl) || isTextDownloaded;
    const shouldShowAudioChips = audioAvailability.canManageAudio;
    return (
      <View
        key={translation.id}
        style={[
          styles.translationCard,
          {
            backgroundColor: isSelected ? colors.bibleElevatedSurface : 'transparent',
            borderColor: colors.bibleDivider,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.translationItem, { borderBottomColor: colors.bibleDivider }]}
          onPress={() => {
            void handleTranslationSelect(translation);
          }}
          activeOpacity={0.85}
          disabled={(isHydratingRuntimeCatalog && !hasHydratedRuntimeCatalog) || isTextDownloadActive}
        >
          <View style={styles.translationInfo}>
            <View style={styles.translationNameRow}>
              <Text
                style={[styles.translationName, { color: colors.biblePrimaryText }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {translation.name}
              </Text>
              <Text style={[styles.translationAbbr, { color: colors.bibleAccent }]}>
                {translation.abbreviation}
              </Text>
            </View>
            <Text style={[styles.translationDescription, { color: colors.bibleSecondaryText }]}>
              {translation.description}
            </Text>
          </View>
          {isSelected ? <Ionicons name="checkmark" size={22} color={colors.bibleAccent} /> : null}
        </TouchableOpacity>

        {shouldShowAudioChips || isTextChipVisible ? (
          <View style={[styles.audioDownloadSection, { borderTopColor: colors.bibleDivider }]}>
            <View style={styles.audioDownloadButtons}>
              {shouldShowAudioChips && audioCollectionActions.includes('full-bible') ? (
                <TouchableOpacity
                  style={[
                    styles.audioDownloadChip,
                    {
                      backgroundColor: isAudioDownloaded
                        ? colors.success + '18'
                        : colors.bibleElevatedSurface,
                      borderColor: isAudioDownloaded ? colors.success : colors.bibleDivider,
                    },
                  ]}
                  disabled={
                    activeAudioDownloadKey !== null ||
                    !audioAvailability.canDownloadAudio ||
                    isAudioDownloaded
                  }
                  activeOpacity={0.8}
                  onPress={async () => {
                    if (!audioAvailability.canDownloadAudio) return;
                    setActiveAudioDownloadKey(`all-${translation.id}`);
                    try {
                      await downloadAudioForTranslation(translation.id);
                    } catch (error) {
                      Alert.alert(
                        t('common.error'),
                        error instanceof Error ? error.message : t('bible.audioDownloadFailed')
                      );
                    } finally {
                      setActiveAudioDownloadKey(null);
                    }
                  }}
                >
                  {isFullBibleAudioDownloading ? (
                    <>
                      <ActivityIndicator size="small" color={colors.bibleAccent} />
                      <Ionicons name="headset-outline" size={14} color={colors.bibleAccent} />
                      <Text style={[styles.audioDownloadChipLabel, { color: colors.bibleAccent }]}>
                        {t('bible.fullBible')}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Ionicons
                        name="headset-outline"
                        size={14}
                        color={isAudioDownloaded ? colors.success : colors.bibleAccent}
                      />
                      <Ionicons
                        name={isAudioDownloaded ? 'checkmark-circle' : 'download-outline'}
                        size={14}
                        color={isAudioDownloaded ? colors.success : colors.bibleAccent}
                      />
                      <Text
                        style={[
                          styles.audioDownloadChipLabel,
                          { color: isAudioDownloaded ? colors.success : colors.biblePrimaryText },
                        ]}
                      >
                        {t('bible.fullBible')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : null}

              {shouldShowAudioChips && audioCollectionActions.includes('new-testament') ? (
                <TouchableOpacity
                  style={[
                    styles.audioDownloadChip,
                    {
                      backgroundColor: isNewTestamentAudioDownloaded
                        ? colors.success + '18'
                        : colors.bibleElevatedSurface,
                      borderColor: isNewTestamentAudioDownloaded ? colors.success : colors.bibleDivider,
                    },
                  ]}
                  disabled={
                    activeAudioDownloadKey !== null ||
                    !audioAvailability.canDownloadAudio ||
                    isNewTestamentAudioDownloaded
                  }
                  activeOpacity={0.8}
                  onPress={async () => {
                    if (!audioAvailability.canDownloadAudio) return;
                    setActiveAudioDownloadKey(`nt-${translation.id}`);
                    try {
                      await downloadAudioForBooks(
                        translation.id,
                        newTestamentBooks.map((book) => book.id)
                      );
                    } catch (error) {
                      Alert.alert(
                        t('common.error'),
                        error instanceof Error ? error.message : t('bible.audioDownloadFailed')
                      );
                    } finally {
                      setActiveAudioDownloadKey(null);
                    }
                  }}
                >
                  {isNewTestamentAudioDownloading ? (
                    <>
                      <ActivityIndicator size="small" color={colors.bibleAccent} />
                      <Ionicons name="headset-outline" size={14} color={colors.bibleAccent} />
                      <Text style={[styles.audioDownloadChipLabel, { color: colors.bibleAccent }]}>
                        {t('bible.newTestament')}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Ionicons
                        name="headset-outline"
                        size={14}
                        color={isNewTestamentAudioDownloaded ? colors.success : colors.bibleAccent}
                      />
                      <Ionicons
                        name={isNewTestamentAudioDownloaded ? 'checkmark-circle' : 'download-outline'}
                        size={14}
                        color={isNewTestamentAudioDownloaded ? colors.success : colors.bibleAccent}
                      />
                      <Text
                        style={[
                          styles.audioDownloadChipLabel,
                          {
                            color: isNewTestamentAudioDownloaded
                              ? colors.success
                              : colors.biblePrimaryText,
                          },
                        ]}
                      >
                        {t('bible.newTestament')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : null}

              {shouldShowAudioChips ? (
                <TouchableOpacity
                  style={[
                    styles.audioDownloadChip,
                    {
                      backgroundColor: isAudioDownloaded
                        ? colors.success + '18'
                        : colors.bibleElevatedSurface,
                      borderColor: isAudioDownloaded ? colors.success : colors.bibleDivider,
                    },
                  ]}
                  onPress={() => setAudioManagerTranslationId(translation.id)}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="headset-outline"
                    size={14}
                    color={isAudioDownloaded ? colors.success : colors.bibleAccent}
                  />
                  <Ionicons
                    name={isAudioDownloaded ? 'checkmark-circle' : 'download-outline'}
                    size={14}
                    color={isAudioDownloaded ? colors.success : colors.bibleAccent}
                  />
                  <Text
                    style={[
                      styles.audioDownloadChipLabel,
                      { color: isAudioDownloaded ? colors.success : colors.biblePrimaryText },
                    ]}
                  >
                    {t('bible.byBook')}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {isTextChipVisible ? (
                <TouchableOpacity
                  style={[
                    styles.audioDownloadChip,
                    {
                      backgroundColor: isTextDownloaded
                        ? colors.success + '18'
                        : colors.bibleElevatedSurface,
                      borderColor: isTextDownloaded ? colors.success : colors.bibleDivider,
                    },
                  ]}
                  disabled={isTextDownloaded || isTextDownloadActive || activeAudioDownloadKey !== null}
                  activeOpacity={0.85}
                  onPress={() => {
                    void handleDownloadTextTranslation(translation);
                  }}
                >
                  {isTextDownloadActive ? (
                    <>
                      <Ionicons
                        name="chatbox-ellipses-outline"
                        size={14}
                        color={colors.bibleAccent}
                      />
                      <Text style={[styles.audioDownloadChipLabel, { color: colors.bibleAccent }]}>
                        {t('audio.showText')}
                      </Text>
                      <ActivityIndicator size="small" color={colors.bibleAccent} />
                    </>
                  ) : isTextDownloaded ? (
                    <>
                      <Ionicons name="chatbox-ellipses-outline" size={14} color={colors.success} />
                      <Text style={[styles.audioDownloadChipLabel, { color: colors.success }]}>
                        {t('audio.showText')}
                      </Text>
                      <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                    </>
                  ) : (
                    <>
                      <Ionicons
                        name="chatbox-ellipses-outline"
                        size={14}
                        color={colors.biblePrimaryText}
                      />
                      <Text
                        style={[
                          styles.audioDownloadChipLabel,
                          { color: colors.biblePrimaryText },
                        ]}
                      >
                        {t('audio.showText')}
                      </Text>
                      <Ionicons name="download-outline" size={14} color={colors.bibleAccent} />
                    </>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {isHydratingRuntimeCatalog && !hasHydratedRuntimeCatalog ? (
        <View style={styles.catalogHydrationRow}>
          <ActivityIndicator size="small" color={colors.bibleAccent} />
          <Text style={[styles.catalogHydrationText, { color: colors.bibleSecondaryText }]}>
            {t('common.loading')}
          </Text>
        </View>
      ) : null}

      {pickerMode === 'languages' ? (
        <ScrollView
          style={styles.translationList}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={styles.translationListContent}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={styles.languageModeBackButton}
            onPress={() => setPickerMode('translations')}
            activeOpacity={0.75}
          >
            <Ionicons name="chevron-back" size={16} color={colors.bibleAccent} />
            <Text style={[styles.languageModeBackText, { color: colors.bibleAccent }]}>
              {t('translations.languagePreference')}
            </Text>
          </TouchableOpacity>

          {languageOptions.map((language) => {
            const isSelected = resolvedPreferredLanguage === language.value;

            return (
              <TouchableOpacity
                key={language.value}
                style={[
                  styles.languageOptionCard,
                  {
                    backgroundColor: isSelected
                      ? colors.bibleElevatedSurface
                      : 'transparent',
                    borderColor: colors.bibleDivider,
                  },
                ]}
                onPress={() => {
                  setPreferredTranslationLanguage(language.value);
                  setPickerMode('translations');
                }}
                activeOpacity={0.82}
              >
                <View style={styles.languageOptionInfo}>
                  <Text style={[styles.languageOptionTitle, { color: colors.biblePrimaryText }]}>
                    {language.label}
                  </Text>
                  <Text
                    style={[styles.languageOptionMeta, { color: colors.bibleSecondaryText }]}
                  >
                    {language.count}
                  </Text>
                </View>
                <Ionicons
                  name={isSelected ? 'checkmark' : 'chevron-forward'}
                  size={18}
                  color={isSelected ? colors.bibleAccent : colors.bibleSecondaryText}
                />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.translationList}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={styles.translationListContent}
          showsVerticalScrollIndicator={false}
        >
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
              testID="translation-picker-search"
              accessibilityLabel={t('common.search')}
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

          <View
            style={[
              styles.preferenceCard,
              {
                backgroundColor: colors.bibleElevatedSurface,
                borderColor: colors.bibleDivider,
              },
            ]}
          >
            <Text style={[styles.preferenceEyebrow, { color: colors.bibleSecondaryText }]}>
              {t('translations.languagePreference')}
            </Text>
            <TouchableOpacity
              style={styles.preferenceRow}
              onPress={() => setPickerMode('languages')}
              activeOpacity={0.82}
            >
              <Text style={[styles.preferenceValue, { color: colors.biblePrimaryText }]}>
                {getTranslationLanguageDisplayLabel(resolvedPreferredLanguage)}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.bibleSecondaryText} />
            </TouchableOpacity>
          </View>

          {sections.myTranslations.length > 0 ? (
            <View style={styles.sectionBlock}>
              <Text style={[styles.sectionEyebrow, { color: colors.bibleSecondaryText }]}>
                {t('translations.myTranslations')}
              </Text>
              {sections.myTranslations.map((translation) => renderTranslationCard(translation))}
            </View>
          ) : null}

          {sections.availableTranslations.length > 0 ? (
            <View style={styles.sectionBlock}>
              <Text style={[styles.sectionEyebrow, { color: colors.bibleSecondaryText }]}>
                {t('translations.available')}
              </Text>
              <Text style={[styles.sectionTitle, { color: colors.biblePrimaryText }]}>
                {getTranslationLanguageDisplayLabel(resolvedPreferredLanguage)}
              </Text>
              {sections.availableTranslations.map((translation) =>
                renderTranslationCard(translation)
              )}
            </View>
          ) : null}
        </ScrollView>
      )}

      <Modal
        visible={audioManagerTranslation != null}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setAudioManagerTranslationId(null);
          setActiveAudioDownloadKey(null);
        }}
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
              <TouchableOpacity
                onPress={() => {
                  setAudioManagerTranslationId(null);
                  setActiveAudioDownloadKey(null);
                }}
              >
                <Ionicons name="close" size={22} color={colors.bibleSecondaryText} />
              </TouchableOpacity>
            </View>

            {audioManagerTranslation ? (
            <ScrollView
              style={styles.translationList}
              contentInsetAdjustmentBehavior="never"
              contentContainerStyle={styles.translationListContent}
              showsVerticalScrollIndicator={false}
            >
                {audioManagerCollectionAction ? (
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
                        : () => void handleDownloadAudioCollection(audioManagerCollectionAction)
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
                          : audioManagerCollectionAction === 'new-testament'
                            ? t('bible.newTestament')
                            : t('bible.fullBible')}
                      </Text>
                      {activeAudioDownloadKey === 'all' || activeAudioDownloadKey === 'nt' ? (
                        <>
                          <Text
                            style={[
                              styles.downloadAllDescription,
                              { color: colors.bibleAccent },
                            ]}
                          >
                            {audioManagerTranslation.downloadedAudioBooks.filter((bookId) =>
                              audioManagerCollectionBooks.some((book) => book.id === bookId)
                            ).length}
                            /{audioManagerCollectionBooks.length} books (
                            {audioManagerCollectionBooks.length > 0
                              ? Math.round(
                                  (audioManagerTranslation.downloadedAudioBooks.filter((bookId) =>
                                    audioManagerCollectionBooks.some((book) => book.id === bookId)
                                  ).length /
                                    audioManagerCollectionBooks.length) *
                                    100
                                )
                              : 0}
                            %)
                          </Text>
                          <View
                            style={[
                              styles.downloadProgressTrack,
                              { backgroundColor: colors.bibleDivider },
                            ]}
                          >
                            <View
                              style={[
                                styles.downloadProgressFill,
                                {
                                  backgroundColor: colors.bibleAccent,
                                  width: `${
                                    audioManagerCollectionBooks.length > 0
                                      ? Math.round(
                                          (audioManagerTranslation.downloadedAudioBooks.filter((bookId) =>
                                            audioManagerCollectionBooks.some((book) => book.id === bookId)
                                          ).length /
                                            audioManagerCollectionBooks.length) *
                                            100
                                        )
                                      : 0
                                  }%`,
                                },
                              ]}
                            />
                          </View>
                        </>
                      ) : (
                        <Text
                          style={[
                            styles.downloadAllDescription,
                            { color: colors.bibleSecondaryText },
                          ]}
                        >
                          {
                            audioManagerTranslation.downloadedAudioBooks.filter((bookId) =>
                              audioManagerCollectionBooks.some((book) => book.id === bookId)
                            ).length
                          }
                          /{audioManagerCollectionBooks.length}
                        </Text>
                      )}
                    </View>
                    {activeAudioDownloadKey === 'all' || activeAudioDownloadKey === 'nt' ? (
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
                ) : null}

                {audioManagerBooks.map((book) => {
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
                      style={[styles.audioBookRow, { borderBottomColor: colors.bibleDivider }]}
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
                            : () => void handleDownloadBookAudio(book.id)
                        }
                        activeOpacity={
                          bookAudioDownloaded || !bookAudioAvailability.canDownloadAudio
                            ? 1
                            : 0.85
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
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
    height: '82%',
    overflow: 'hidden',
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
  preferenceCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: spacing.md,
  },
  preferenceEyebrow: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  preferenceValue: {
    ...typography.cardTitle,
  },
  sectionBlock: {
    marginBottom: spacing.md,
  },
  sectionEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sectionTitle: {
    ...typography.cardTitle,
    marginBottom: spacing.sm,
  },
  languageModeBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  languageModeBackText: {
    fontSize: 13,
    fontWeight: '700',
  },
  languageOptionCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  languageOptionInfo: {
    flex: 1,
  },
  languageOptionTitle: {
    ...typography.cardTitle,
    marginBottom: 2,
  },
  languageOptionMeta: {
    fontSize: 12,
    fontWeight: '600',
  },
  translationLanguageScroller: {
    flexGrow: 0,
    flexShrink: 0,
    height: 28,
    marginBottom: 0,
    paddingBottom: 0,
  },
  translationLanguageFilters: {
    paddingHorizontal: layout.screenPadding,
    gap: spacing.sm,
    paddingBottom: 0,
    alignItems: 'center',
  },
  catalogHydrationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.xs,
  },
  catalogHydrationText: {
    fontSize: 13,
    fontWeight: '500',
  },
  translationLanguageChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    minHeight: 28,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  translationLanguageChipText: {
    ...typography.label,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 14,
  },
  translationList: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: layout.screenPadding,
  },
  translationListContent: {
    paddingTop: spacing.sm,
    paddingBottom: layout.sectionGap,
  },
  searchInputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  clearSearchButton: {
    marginLeft: 4,
  },
  translationCard: {
    marginBottom: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  translationItem: {
    minHeight: 68,
    paddingVertical: 10,
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
    gap: 6,
    marginBottom: 2,
    minWidth: 0,
  },
  translationName: {
    ...typography.cardTitle,
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  translationAbbr: {
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 0,
  },
  translationDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  audioDownloadSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },
  audioDownloadButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  audioDownloadChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  audioDownloadChipLabel: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
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
