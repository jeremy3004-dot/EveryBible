import { ComponentProps, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { bibleBooks, config } from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';
import { useBibleStore } from '../../stores/bibleStore';
import { useI18n } from '../../hooks';
import {
  getAudioAvailability,
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
  getTranslationAudioBookIds,
  getTranslationAudioCollectionActions,
  getTranslationLanguageDisplayLabel,
  getTranslationSelectionState,
  getVisibleTranslationsForPicker,
  resolvePreferredTranslationLanguage,
} from './bibleTranslationModel';

interface TranslationPickerListProps {
  onRequestClose?: () => void;
  onTranslationActivated?: (translation: BibleTranslation) => void;
}

type IconName = ComponentProps<typeof Ionicons>['name'];

function ActionButton({
  active,
  disabled,
  downloading,
  iconName,
  label,
  onPress,
  testID,
}: {
  active?: boolean;
  disabled?: boolean;
  downloading?: boolean;
  iconName: IconName;
  label: string;
  onPress?: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();

  const iconColor = active
    ? colors.success
    : downloading
      ? colors.bibleAccent
      : disabled
        ? colors.bibleSecondaryText
        : colors.biblePrimaryText;

  const labelColor = active
    ? colors.success
    : downloading
      ? colors.bibleAccent
      : disabled
        ? colors.bibleSecondaryText
        : colors.biblePrimaryText;

  return (
    <TouchableOpacity
      testID={testID}
      style={[
        styles.actionButton,
        {
          backgroundColor: active
            ? colors.success + '12'
            : downloading
              ? colors.bibleElevatedSurface
              : colors.bibleElevatedSurface,
          borderColor: active
            ? colors.success + '55'
            : downloading
              ? colors.bibleAccent + '40'
              : disabled
                ? colors.bibleDivider
                : colors.bibleDivider,
          opacity: disabled && !active ? 0.55 : 1,
        },
      ]}
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled || downloading}
      accessibilityRole="button"
    >
      {downloading ? (
        <ActivityIndicator size="small" color={colors.bibleAccent} />
      ) : (
        <Ionicons name={iconName} size={15} color={iconColor} />
      )}
      <Text style={[styles.actionButtonLabel, { color: labelColor }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
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
  const setPreferredTranslationLanguage = useBibleStore(
    (state) => state.setPreferredTranslationLanguage
  );
  const downloadTranslation = useBibleStore((state) => state.downloadTranslation);
  const downloadAudioForTranslation = useBibleStore((state) => state.downloadAudioForTranslation);

  const [pickerMode, setPickerMode] = useState<'translations' | 'languages'>('translations');
  const [languageSearchQuery, setLanguageSearchQuery] = useState('');
  const [isHydratingRuntimeCatalog, setIsHydratingRuntimeCatalog] = useState(false);

  const hasHydratedRuntimeCatalog = useMemo(
    () => hasRuntimeCatalogTranslations(translations),
    [translations]
  );

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

  const translationSections = useMemo(
    () => [
      {
        key: 'available',
        label: t('translations.available'),
        items: sections.availableTranslations,
      },
      {
        key: 'loaded',
        label: t('translations.myTranslations'),
        items: sections.myTranslations,
      },
    ],
    [sections.availableTranslations, sections.myTranslations, t]
  );

  const filteredLanguageOptions = useMemo(() => {
    const query = languageSearchQuery.trim().toLowerCase();

    if (!query) {
      return languageFilters;
    }

    return languageFilters.filter((language) => {
      const value = language.value.toLowerCase();
      const label = language.label.toLowerCase();
      return value.includes(query) || label.includes(query);
    });
  }, [languageFilters, languageSearchQuery]);

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
    if (pickerMode === 'languages' && languageFilters.length <= 1) {
      setPickerMode('translations');
      setLanguageSearchQuery('');
    }
  }, [languageFilters.length, pickerMode]);

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

  const getTranslationAudioAvailability = (
    translation: Pick<BibleTranslation, 'id' | 'hasAudio' | 'downloadedAudioBooks'>
  ) =>
    getAudioAvailability({
      featureEnabled: config.features.audioEnabled,
      translationHasAudio: translation.hasAudio,
      remoteAudioAvailable: isRemoteAudioAvailable(translation.id),
      downloadedAudioBooks: translation.downloadedAudioBooks,
    });

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
        useBibleStore.getState().translations.find((candidate) => candidate.id === translation.id) ??
        translation;
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

  const handleDownloadAudioTranslation = async (translation: BibleTranslation) => {
    const audioAvailability = getTranslationAudioAvailability(translation);
    const audioBookIds = getTranslationAudioBookIds(translation);
    const audioBooks =
      audioBookIds.length > 0 ? bibleBooks.filter((book) => audioBookIds.includes(book.id)) : [];
    const hasFullBibleAudio = getTranslationAudioCollectionActions(translation).includes('full-bible');
    const canManageAudio = audioAvailability.canManageAudio;

    if (!canManageAudio || !audioAvailability.canDownloadAudio || !hasFullBibleAudio || audioBooks.length === 0) {
      return;
    }

    try {
      await downloadAudioForTranslation(translation.id);
    } catch (error) {
      Alert.alert(
        t('common.error'),
        error instanceof Error ? error.message : t('bible.audioDownloadFailed'),
        [{ text: t('common.ok') }]
      );
    }
  };

  const renderTranslationRow = (translation: BibleTranslation) => {
    const isSelected = currentTranslation === translation.id;
    const audioAvailability = getTranslationAudioAvailability(translation);
    const audioBookIds = getTranslationAudioBookIds(translation);
    const audioBooks =
      audioBookIds.length > 0 ? bibleBooks.filter((book) => audioBookIds.includes(book.id)) : [];
    const isTextDownloaded = translation.isDownloaded || Boolean(translation.textPackLocalPath);
    const isAudioDownloaded = isTranslationAudioDownloaded(
      translation.downloadedAudioBooks,
      audioBooks
    );
    const hasFullBibleAudio = getTranslationAudioCollectionActions(translation).includes('full-bible');
    const canManageAudio = audioAvailability.canManageAudio;
    const isTextDownloading =
      downloadProgress?.translationId === translation.id &&
      !downloadProgress.bookId &&
      !translation.activeDownloadJob;
    const isAudioDownloading =
      translation.activeDownloadJob?.kind === 'translation-audio' &&
      translation.activeDownloadJob.state !== 'completed' &&
      translation.activeDownloadJob.state !== 'failed';
    const canDownloadText = Boolean(
      translation.hasText || translation.catalog?.text?.downloadUrl || isTextDownloaded
    );
    const canDownloadAudio =
      canManageAudio && audioAvailability.canDownloadAudio && hasFullBibleAudio && audioBooks.length > 0;
    const isBusy = isTextDownloading || isAudioDownloading;

    return (
      <TouchableOpacity
        key={translation.id}
        style={[
          styles.translationCard,
          {
            backgroundColor: isSelected
              ? colors.bibleElevatedSurface
              : colors.bibleSurface,
            borderColor: isSelected ? colors.success : colors.bibleDivider,
          },
        ]}
        activeOpacity={0.86}
        onPress={() => {
          void handleTranslationSelect(translation);
        }}
        disabled={(isHydratingRuntimeCatalog && !hasHydratedRuntimeCatalog) || isBusy}
      >
        <View style={styles.translationRow}>
          <View style={styles.translationInfo}>
            <Text
              style={[styles.translationName, { color: colors.biblePrimaryText }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {translation.name}
            </Text>
            <Text style={[styles.translationDescription, { color: colors.bibleSecondaryText }]}>
              {translation.description}
            </Text>
          </View>

          <View style={styles.translationActions}>
            <ActionButton
              testID={`text-action-${translation.id}`}
              label={t('audio.showText')}
              iconName="document-text-outline"
              active={isTextDownloaded}
              downloading={isTextDownloading}
              disabled={!canDownloadText && !isTextDownloaded}
              onPress={() => {
                void handleDownloadTextTranslation(translation);
              }}
            />
            <ActionButton
              testID={`audio-action-${translation.id}`}
              label="Audio"
              iconName="headset-outline"
              active={isAudioDownloaded}
              downloading={isAudioDownloading}
              disabled={!canDownloadAudio && !isAudioDownloaded}
              onPress={() => {
                void handleDownloadAudioTranslation(translation);
              }}
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderTranslationSection = (
    title: string,
    items: BibleTranslation[],
    sectionKey: string
  ) => {
    if (items.length === 0) {
      return null;
    }

    return (
      <View key={sectionKey} style={styles.translationSection}>
        <View
          style={[
            styles.translationSectionTab,
            {
              backgroundColor: colors.bibleSurface,
              borderColor: colors.bibleDivider,
            },
          ]}
        >
          <Text style={[styles.translationSectionLabel, { color: colors.biblePrimaryText }]}>
            {title}
          </Text>
        </View>
        {items.map((translation) => renderTranslationRow(translation))}
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

      <ScrollView
        style={styles.translationList}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={styles.translationListContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {pickerMode === 'languages' ? (
          <>
            <View style={styles.languageModeHeader}>
              <TouchableOpacity
                style={styles.languageModeBackButton}
                onPress={() => {
                  setPickerMode('translations');
                  setLanguageSearchQuery('');
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="chevron-back" size={16} color={colors.bibleAccent} />
                <Text style={[styles.languageModeBackText, { color: colors.bibleAccent }]}>
                  Select Language
                </Text>
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
                value={languageSearchQuery}
                onChangeText={setLanguageSearchQuery}
                testID="language-picker-search"
                accessibilityLabel={t('common.search')}
                placeholder={t('common.search')}
                placeholderTextColor={colors.bibleSecondaryText}
                style={[styles.searchInput, { color: colors.biblePrimaryText }]}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {languageSearchQuery.length > 0 ? (
                <TouchableOpacity
                  style={styles.clearSearchButton}
                  onPress={() => setLanguageSearchQuery('')}
                >
                  <Ionicons name="close-circle" size={18} color={colors.bibleSecondaryText} />
                </TouchableOpacity>
              ) : null}
            </View>

            <View
              style={[
                styles.languagePickerCard,
                {
                  backgroundColor: colors.bibleElevatedSurface,
                  borderColor: colors.bibleDivider,
                },
              ]}
            >
              {filteredLanguageOptions.map((language) => {
                const isSelected = resolvedPreferredLanguage === language.value;

                return (
                  <TouchableOpacity
                    key={language.value}
                    style={[
                      styles.languageOptionRow,
                      {
                        backgroundColor: isSelected
                          ? colors.bibleSurface
                          : 'transparent',
                        borderColor: isSelected ? colors.success : colors.bibleDivider,
                      },
                    ]}
                    onPress={() => {
                      setPreferredTranslationLanguage(language.value);
                      setPickerMode('translations');
                      setLanguageSearchQuery('');
                    }}
                    activeOpacity={0.82}
                  >
                    <Text style={[styles.languageOptionTitle, { color: colors.biblePrimaryText }]}>
                      {language.label}
                    </Text>
                    <Ionicons
                      name={isSelected ? 'checkmark' : 'chevron-forward'}
                      size={18}
                      color={isSelected ? colors.success : colors.bibleSecondaryText}
                    />
                  </TouchableOpacity>
                );
              })}
              {filteredLanguageOptions.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.bibleSecondaryText }]}>
                  No matching languages.
                </Text>
              ) : null}
            </View>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={styles.languageRail}
              onPress={() => setPickerMode('languages')}
              activeOpacity={0.82}
            >
              <View style={styles.languageRailLeft}>
                <Ionicons name="language-outline" size={15} color="#fff" />
                <Text style={styles.languageRailLabel}>{t('translations.languagePreference')}</Text>
              </View>
              <View style={styles.languageRailRight}>
                <Text style={styles.languageRailValue}>
                  {getTranslationLanguageDisplayLabel(resolvedPreferredLanguage)}
                </Text>
                <Ionicons name="chevron-down" size={15} color="#fff" />
              </View>
            </TouchableOpacity>

            {translationSections.some((section) => section.items.length > 0) ? (
              translationSections.map((section) =>
                renderTranslationSection(section.label, section.items, section.key)
              )
            ) : (
              <Text style={[styles.emptyText, { color: colors.bibleSecondaryText }]}>
                No translations available.
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
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
  translationList: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: layout.screenPadding,
  },
  translationListContent: {
    paddingTop: spacing.sm,
    paddingBottom: layout.sectionGap,
  },
  languageRail: {
    marginBottom: spacing.md,
    borderRadius: 10,
    backgroundColor: '#6a2b18',
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  languageRailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  languageRailLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  languageRailRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  languageRailValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  languageModeHeader: {
    marginBottom: spacing.sm,
  },
  languageModeBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
  },
  languageModeBackText: {
    fontSize: 13,
    fontWeight: '700',
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
  languagePickerCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 8,
  },
  languageOptionRow: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  languageOptionTitle: {
    ...typography.cardTitle,
    flex: 1,
    minWidth: 0,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  translationCard: {
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  translationSection: {
    marginBottom: spacing.sm,
  },
  translationSectionTab: {
    alignSelf: 'flex-start',
    marginBottom: spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  translationSectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  translationRow: {
    minHeight: 70,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  translationInfo: {
    flex: 1,
    minWidth: 0,
  },
  translationName: {
    ...typography.cardTitle,
    marginBottom: 2,
  },
  translationDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  translationActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  actionButton: {
    minWidth: 76,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionButtonLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.01,
  },
});
