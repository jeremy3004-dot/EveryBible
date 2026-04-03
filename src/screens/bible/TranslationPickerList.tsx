import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { bibleBooks, config, getTranslatedBookName } from '../../constants';
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
  const hasHydratedRuntimeCatalog = useMemo(
    () => hasRuntimeCatalogTranslations(translations),
    [translations]
  );

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
    () => buildTranslationPickerSections(visibleTranslations, resolvedPreferredLanguage),
    [resolvedPreferredLanguage, visibleTranslations]
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
              void downloadTranslation(nextTranslation.id).catch((error) => {
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

    Alert.alert(
      t('common.comingSoon'),
      t('bible.translationComingSoon', { name: nextTranslation.name }),
      [{ text: t('common.ok') }]
    );
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
      const books = bibleBooks
        .filter((book) => book.testament === testament)
        .filter(
          (book) =>
            !isAudioBookDownloaded(audioManagerTranslation.downloadedAudioBooks, book.id)
        )
        .map((book) => book.id);
      await downloadAudioForBooks(audioManagerTranslation.id, books);
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

  const renderTranslationCard = (translation: BibleTranslation) => {
    const isSelected = currentTranslation === translation.id;
    const audioAvailability = getTranslationAudioAvailability(translation);
    const isTextDownloadActive =
      downloadProgress?.translationId === translation.id && !downloadProgress.bookId;
    const textDownloadProgress = isTextDownloadActive ? downloadProgress.progress : 0;
    const textDownloadStatusLabel = isTextDownloadActive
      ? `${t('translations.downloading')} ${downloadProgress.progress}%`
      : null;
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
              <Text style={[styles.translationName, { color: colors.biblePrimaryText }]}>
                {translation.name}
              </Text>
              <Text style={[styles.translationAbbr, { color: colors.bibleAccent }]}>
                {translation.abbreviation}
              </Text>
            </View>
            <Text style={[styles.translationDescription, { color: colors.bibleSecondaryText }]}>
              {translation.description}
            </Text>
            <View style={styles.translationMeta}>
              <Text style={[styles.translationSize, { color: colors.bibleSecondaryText }]}>
                {translation.sizeInMB} MB
              </Text>
              {selectionState.isSelectable ? (
                <View style={styles.downloadedBadge}>
                  <Ionicons
                    name="checkmark-circle"
                    size={14}
                    color={translation.isDownloaded ? colors.success : colors.bibleAccent}
                  />
                  <Text
                    style={[
                      styles.downloadedText,
                      {
                        color: translation.isDownloaded ? colors.success : colors.bibleAccent,
                      },
                    ]}
                  >
                    {t('bible.available')}
                  </Text>
                </View>
              ) : (
                <View style={styles.downloadedBadge}>
                  <Ionicons name="time-outline" size={14} color={colors.bibleSecondaryText} />
                  <Text style={[styles.downloadedText, { color: colors.bibleSecondaryText }]}>
                    {selectionState.reason === 'download-required'
                      ? t('translations.download')
                      : t('common.comingSoon')}
                  </Text>
                </View>
              )}
            </View>
            {isTextDownloadActive ? (
              <View style={styles.translationDownloadProgress}>
                <View style={styles.translationDownloadProgressHeader}>
                  <ActivityIndicator size="small" color={colors.bibleAccent} />
                  <Text
                    style={[
                      styles.translationDownloadProgressText,
                      { color: colors.bibleAccent },
                    ]}
                  >
                    {textDownloadStatusLabel}
                  </Text>
                </View>
                <View
                  style={[
                    styles.downloadProgressTrack,
                    {
                      backgroundColor: colors.bibleDivider,
                      marginTop: 0,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.downloadProgressFill,
                      {
                        backgroundColor: colors.bibleAccent,
                        width: `${textDownloadProgress}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            ) : null}
          </View>
          {isSelected ? <Ionicons name="checkmark" size={22} color={colors.bibleAccent} /> : null}
        </TouchableOpacity>

        {audioAvailability.canManageAudio ? (
          <View style={[styles.audioDownloadSection, { borderTopColor: colors.bibleDivider }]}>
            <View style={styles.audioDownloadHeader}>
              <Ionicons name="headset-outline" size={14} color={colors.bibleSecondaryText} />
              <Text style={[styles.audioDownloadTitle, { color: colors.bibleSecondaryText }]}>
                Audio Bible — {translation.downloadedAudioBooks.length}/{translation.totalBooks}{' '}
                books offline
              </Text>
            </View>

            <View style={styles.audioDownloadButtons}>
              {(() => {
                const allDone = translation.downloadedAudioBooks.length === translation.totalBooks;
                const isActive = activeAudioDownloadKey === `all-${translation.id}`;
                const pct =
                  translation.totalBooks > 0
                    ? Math.round(
                        (translation.downloadedAudioBooks.length / translation.totalBooks) * 100
                      )
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
                      allDone || activeAudioDownloadKey !== null || !audioAvailability.canDownloadAudio
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
                    {isActive ? (
                      <View style={styles.chipProgressWrapper}>
                        <ActivityIndicator size="small" color={colors.bibleAccent} />
                        <Text
                          style={[styles.audioDownloadChipLabel, { color: colors.bibleAccent }]}
                        >
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
                            {
                              color: allDone ? colors.success : colors.biblePrimaryText,
                            },
                          ]}
                        >
                          Whole Bible
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                );
              })()}

              {(['OT', 'NT'] as const).map((testament) => {
                const testamentBooks = bibleBooks.filter((book) => book.testament === testament);
                const doneCount = testamentBooks.filter((book) =>
                  isAudioBookDownloaded(translation.downloadedAudioBooks, book.id)
                ).length;
                const allDone = doneCount === testamentBooks.length;
                const isActive =
                  activeAudioDownloadKey === `testament-inline:${testament}:${translation.id}`;
                const pct =
                  testamentBooks.length > 0
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
                      allDone || activeAudioDownloadKey !== null || !audioAvailability.canDownloadAudio
                    }
                    activeOpacity={0.8}
                    onPress={async () => {
                      if (!audioAvailability.canDownloadAudio) return;
                      setActiveAudioDownloadKey(`testament-inline:${testament}:${translation.id}`);
                      try {
                        await downloadAudioForBooks(
                          translation.id,
                          testamentBooks
                            .filter(
                              (book) =>
                                !isAudioBookDownloaded(translation.downloadedAudioBooks, book.id)
                            )
                            .map((book) => book.id)
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
                    {isActive ? (
                      <View style={styles.chipProgressWrapper}>
                        <ActivityIndicator size="small" color={colors.bibleAccent} />
                        <Text
                          style={[styles.audioDownloadChipLabel, { color: colors.bibleAccent }]}
                        >
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
                            {
                              color: allDone ? colors.success : colors.biblePrimaryText,
                            },
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
              onPress={() => setAudioManagerTranslationId(translation.id)}
              activeOpacity={0.7}
            >
              <Text style={[styles.audioDownloadByBookLabel, { color: colors.bibleAccent }]}>
                Download by book →
              </Text>
            </TouchableOpacity>
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
                        <Text
                          style={[
                            styles.downloadAllDescription,
                            { color: colors.bibleAccent },
                          ]}
                        >
                          {audioManagerTranslation.downloadedAudioBooks.length}/
                          {audioManagerTranslation.totalBooks} books (
                          {audioManagerTranslation.totalBooks > 0
                            ? Math.round(
                                (audioManagerTranslation.downloadedAudioBooks.length /
                                  audioManagerTranslation.totalBooks) *
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
                                  audioManagerTranslation.totalBooks > 0
                                    ? Math.round(
                                        (audioManagerTranslation.downloadedAudioBooks.length /
                                          audioManagerTranslation.totalBooks) *
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
                        {audioManagerTranslation.downloadedAudioBooks.length}/
                        {audioManagerTranslation.totalBooks}
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
                  const testamentBooks = bibleBooks.filter((book) => book.testament === testament);
                  const downloadedCount = testamentBooks.filter((book) =>
                    isAudioBookDownloaded(audioManagerTranslation.downloadedAudioBooks, book.id)
                  ).length;
                  const allDownloaded = downloadedCount === testamentBooks.length;
                  const isDownloading = activeAudioDownloadKey === `testament:${testament}`;
                  const label =
                    testament === 'OT' ? t('bible.oldTestament') : t('bible.newTestament');

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
                      activeOpacity={
                        allDownloaded || !audioManagerAvailability?.canDownloadAudio ? 1 : 0.85
                      }
                      disabled={
                        allDownloaded ||
                        activeAudioDownloadKey !== null ||
                        !audioManagerAvailability?.canDownloadAudio
                      }
                    >
                      <View style={styles.downloadAllInfo}>
                        <Text style={[styles.downloadAllTitle, { color: colors.biblePrimaryText }]}>
                          {label}
                        </Text>
                        {isDownloading ? (
                          <>
                            <Text
                              style={[
                                styles.downloadAllDescription,
                                { color: colors.bibleAccent },
                              ]}
                            >
                              {downloadedCount}/{testamentBooks.length} books (
                              {testamentBooks.length > 0
                                ? Math.round((downloadedCount / testamentBooks.length) * 100)
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
                                      testamentBooks.length > 0
                                        ? Math.round((downloadedCount / testamentBooks.length) * 100)
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
                            {downloadedCount}/{testamentBooks.length}
                          </Text>
                        )}
                      </View>
                      {isDownloading ? (
                        <ActivityIndicator color={colors.bibleAccent} />
                      ) : (
                        <Ionicons
                          name={
                            allDownloaded
                              ? 'checkmark-circle'
                              : audioManagerAvailability?.canDownloadAudio
                                ? 'download-outline'
                                : 'cloud-offline-outline'
                          }
                          size={22}
                          color={
                            allDownloaded
                              ? colors.success
                              : audioManagerAvailability?.canDownloadAudio
                                ? colors.bibleAccent
                                : colors.bibleSecondaryText
                          }
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
  translationCard: {
    marginBottom: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  translationItem: {
    minHeight: 80,
    paddingVertical: 12,
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
  translationDownloadProgress: {
    marginTop: 10,
    gap: 6,
  },
  translationDownloadProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  translationDownloadProgressText: {
    fontSize: 12,
    fontWeight: '700',
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
