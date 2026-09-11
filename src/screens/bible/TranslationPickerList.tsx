import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { bibleBooks, config, getTranslatedBookName, newTestamentBooks } from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';
import { useBibleStore } from '../../stores/bibleStore';
import { useI18n, useKeyboardBottomInset } from '../../hooks';
import { getAudioAvailability } from '../../services/audio/audioAvailability';
import {
  isAudioBookDownloaded,
  isTranslationAudioDownloaded,
} from '../../services/audio/audioDownloads';
import {
  getFirstAvailableAudioBook,
  isRemoteAudioAvailable,
} from '../../services/audio/audioRemote';
import { ProgressBar } from '../../components/ui';
import { layout, radius, spacing, typography } from '../../design/system';
import { announceForAccessibility, hexWithAlpha } from '../../utils';
import type { BibleTranslation } from '../../types';
import {
  ensureRuntimeCatalogLoaded,
  hasRuntimeCatalogTranslations,
} from '../../services/translations';
import {
  buildTranslationPickerSections,
  buildTranslationLanguageFilters,
  filterTranslationLanguagesBySearchQuery,
  filterTranslationsByLanguage,
  buildTranslationSearchIndex,
  buildTranslationLanguageSearchIndex,
  searchTranslationIndex,
  getTranslationAvailabilitySummary,
  getTranslationAudioCollectionActions,
  getTranslationAudioBookIds,
  getVisibleTranslationsForPicker,
  getTranslationLanguageDisplayLabel,
  getTranslationSelectionState,
  normalizeTranslationLanguage,
  resolvePreferredTranslationLanguage,
} from './bibleTranslationModel';
import { useTranslationPreferenceStore } from '../../stores/translationPreferenceStore';
import { hasTranslationDownloadData } from '../../stores/bibleStoreModel';

interface TranslationPickerListProps {
  onRequestClose?: () => void;
  onTranslationActivated?: (translation: BibleTranslation) => void;
}

type TranslationLanguageSearchResult = ReturnType<
  typeof filterTranslationLanguagesBySearchQuery
>[number];

// Rows inside a section are drawn as one grouped list (shared border, hairline
// dividers, radius only on the outer corners), so each row needs to know where
// it sits in its group.
type GroupPosition = 'only' | 'first' | 'middle' | 'last';

type TranslationPickerRow =
  | { type: 'language-search-result'; id: string; language: TranslationLanguageSearchResult }
  | { type: 'preference'; id: string }
  | { type: 'section-header'; id: string; label: string }
  | {
      type: 'translation';
      id: string;
      translation: BibleTranslation;
      position: GroupPosition;
    };

const TRANSLATION_PICKER_ROW_ESTIMATED_SIZE = 76;

const groupPosition = (index: number, count: number): GroupPosition =>
  count === 1 ? 'only' : index === 0 ? 'first' : index === count - 1 ? 'last' : 'middle';

export function TranslationPickerList({
  onRequestClose,
  onTranslationActivated,
}: TranslationPickerListProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  // Android cannot get the overlap from the keyboard frame alone — edge-to-edge
  // means this surface is never resized for the IME — so the picker measures its
  // own bottom edge against the keyboard top instead.
  const listSurfaceRef = useRef<View>(null);
  const keyboardBottomInset = useKeyboardBottomInset({ surfaceRef: listSurfaceRef });

  // The search box sits above this list, and the picker's own sheet is a plain
  // Modal that iOS never resizes for the keyboard. Growing the scrollable extent
  // by the keyboard height is what lets the bottom rows reach above it.
  // FlashList wants a plain ContentStyle object, not a StyleSheet reference.
  const translationListContentStyle = useMemo(
    () => ({
      // FlashList ignores `style`, so the screen gutter has to live here or the
      // rows render edge-to-edge against the sheet.
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.sm,
      paddingBottom: layout.sectionGap + keyboardBottomInset,
    }),
    [keyboardBottomInset]
  );

  const currentBook = useBibleStore((state) => state.currentBook);
  const currentTranslation = useBibleStore((state) => state.currentTranslation);
  const preferredTranslationLanguage = useBibleStore((state) => state.preferredTranslationLanguage);
  const translations = useBibleStore((state) => state.translations);
  const pinnedIds = useTranslationPreferenceStore((state) => state.pinnedIds);
  const hiddenIds = useTranslationPreferenceStore((state) => state.hiddenIds);
  const setCurrentTranslation = useBibleStore((state) => state.setCurrentTranslation);
  const setCurrentBook = useBibleStore((state) => state.setCurrentBook);
  const setCurrentChapter = useBibleStore((state) => state.setCurrentChapter);
  const setPreferredTranslationLanguage = useBibleStore(
    (state) => state.setPreferredTranslationLanguage
  );
  const downloadTranslation = useBibleStore((state) => state.downloadTranslation);

  const [pickerMode, setPickerMode] = useState<'translations' | 'languages'>('translations');
  const [manageTranslationId, setManageTranslationId] = useState<string | null>(null);
  const [isHydratingRuntimeCatalog, setIsHydratingRuntimeCatalog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const hasActiveSearchQuery = searchQuery.trim().length > 0;
  const hasHydratedRuntimeCatalog = useMemo(
    () => hasRuntimeCatalogTranslations(translations),
    [translations]
  );

  const manageTranslation = translations.find(
    (translation) => translation.id === manageTranslationId
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
  const searchIndex = useMemo(
    () => buildTranslationSearchIndex(visibleTranslations),
    [visibleTranslations]
  );
  // Indexed equivalent of filterTranslationsBySearchQuery: catalog normalization is reused.
  const filteredTranslations = useMemo(
    () => searchTranslationIndex(searchIndex, searchQuery),
    [searchQuery, searchIndex]
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
    () =>
      buildTranslationPickerSections(filteredTranslations, resolvedPreferredLanguage, {
        includeAllAvailableTranslations: hasActiveSearchQuery,
        pinnedIds,
        hiddenIds,
        currentTranslationId: currentTranslation,
      }),
    [
      filteredTranslations,
      hasActiveSearchQuery,
      resolvedPreferredLanguage,
      pinnedIds,
      hiddenIds,
      currentTranslation,
    ]
  );
  const languageSearchIndex = useMemo(
    () => buildTranslationLanguageSearchIndex(visibleTranslations),
    [visibleTranslations]
  );
  const languageSearchResults = useMemo(
    () => (searchQuery.trim() ? searchTranslationIndex(languageSearchIndex, searchQuery) : []),
    [searchQuery, languageSearchIndex]
  );
  const languageOptions = useMemo(() => {
    const countsByLanguage = new Map<string, number>();
    for (const translation of visibleTranslations) {
      const language = normalizeTranslationLanguage(translation.language);
      countsByLanguage.set(language, (countsByLanguage.get(language) ?? 0) + 1);
    }
    return languageFilters.map((filter) => ({
      ...filter,
      count: countsByLanguage.get(filter.value) ?? 0,
    }));
  }, [languageFilters, visibleTranslations]);

  useEffect(() => {
    if (resolvedPreferredLanguage && preferredTranslationLanguage !== resolvedPreferredLanguage) {
      setPreferredTranslationLanguage(resolvedPreferredLanguage);
    }
  }, [preferredTranslationLanguage, resolvedPreferredLanguage, setPreferredTranslationLanguage]);

  useEffect(() => {
    if (pickerMode === 'languages' && languageOptions.length <= 1) {
      setPickerMode('translations');
    }
  }, [languageOptions.length, pickerMode]);

  useEffect(() => {
    let isMounted = true;

    // Cached rows can belong to only one source. Let the shared per-launch gate decide
    // whether a refresh is needed so reopening the picker retries partial failures.
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
  }, []);

  const handleDownloadTextTranslation = useCallback(
    async (translation: BibleTranslation) => {
      if (!translation.catalog?.text?.downloadUrl) {
        return;
      }

      try {
        await downloadTranslation(translation.id);
        setPreferredTranslationLanguage(normalizeTranslationLanguage(translation.language));
        setCurrentTranslation(translation.id);
        onRequestClose?.();
        onTranslationActivated?.(
          useBibleStore
            .getState()
            .translations.find((candidate) => candidate.id === translation.id) ?? translation
        );
      } catch {
        Alert.alert(t('common.error'), t('bible.failedToLoad'), [{ text: t('common.ok') }]);
      }
    },
    [
      downloadTranslation,
      setPreferredTranslationLanguage,
      setCurrentTranslation,
      onRequestClose,
      onTranslationActivated,
      t,
    ]
  );

  const handleTranslationSelect = useCallback(
    async (translation: BibleTranslation) => {
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

      const audioAvailability = getAudioAvailability({
        featureEnabled: config.features.audioEnabled,
        translationHasAudio: nextTranslation.hasAudio,
        remoteAudioAvailable: isRemoteAudioAvailable(nextTranslation.id, currentBook),
        downloadedAudioBooks: nextTranslation.downloadedAudioBooks,
        bookId: currentBook,
      });
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
        const isCurrentBookOT = !newTestamentBooks.some((b) => b.id === currentBook);
        const isNTOnlyText = nextTranslation.totalBooks === newTestamentBooks.length;

        setPreferredTranslationLanguage(normalizeTranslationLanguage(nextTranslation.language));

        if (isCurrentBookOT && isNTOnlyText) {
          setCurrentBook('MAT');
          setCurrentChapter(1);
        }

        setCurrentTranslation(nextTranslation.id);
        onRequestClose?.();
        onTranslationActivated?.(nextTranslation);
        return;
      }

      if (selectionState.reason === 'audio-unavailable') {
        // The translation has audio, just not for the book the reader is currently in
        // (e.g. a New-Testament-only audio translation selected from an Old Testament
        // chapter). Jump to the first book it does cover so it "just works" instead of
        // showing a misleading download error.
        const targetBook = getFirstAvailableAudioBook(nextTranslation.id);
        if (
          config.features.audioEnabled &&
          targetBook &&
          targetBook !== currentBook &&
          isRemoteAudioAvailable(nextTranslation.id, targetBook)
        ) {
          setPreferredTranslationLanguage(normalizeTranslationLanguage(nextTranslation.language));
          setCurrentBook(targetBook);
          setCurrentChapter(1);
          setCurrentTranslation(nextTranslation.id);
          onRequestClose?.();
          onTranslationActivated?.(nextTranslation);
          return;
        }

        Alert.alert(t('common.error'), t('bible.audioDownloadFailed'), [{ text: t('common.ok') }]);
        return;
      }

      if (selectionState.reason === 'download-required') {
        Alert.alert(
          nextTranslation.name,
          t('translations.downloadPrompt', {
            name: nextTranslation.name,
            size: nextTranslation.sizeInMB,
          }),
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
    },
    [
      hasHydratedRuntimeCatalog,
      currentBook,
      setPreferredTranslationLanguage,
      setCurrentBook,
      setCurrentChapter,
      setCurrentTranslation,
      onRequestClose,
      onTranslationActivated,
      t,
      handleDownloadTextTranslation,
    ]
  );

  const handleLanguageSearchResultSelect = (language: string) => {
    const matchingTranslations = filterTranslationsByLanguage(visibleTranslations, language);

    setPreferredTranslationLanguage(language);

    if (matchingTranslations.length === 1) {
      void handleTranslationSelect(matchingTranslations[0]);
      return;
    }

    setSearchQuery('');
    setPickerMode('translations');
  };

  const translationRows = useMemo<TranslationPickerRow[]>(() => {
    const rows: TranslationPickerRow[] = [];

    if (hasActiveSearchQuery) {
      languageSearchResults.forEach((language) => {
        rows.push({
          type: 'language-search-result',
          id: `search-language-${language.value}`,
          language,
        });
      });
    } else if (languageOptions.length > 1) {
      rows.push({ type: 'preference', id: 'preference' });
    }

    // Fixed order, always: the Bibles the reader already has (the one they are
    // reading first), then more Bibles in their chosen language. A stable order
    // is what makes the sheet learnable — the reader knows where to look.
    if (sections.myTranslations.length > 0) {
      rows.push({
        type: 'section-header',
        id: 'section-my-translations',
        label: t('translations.myTranslations'),
      });

      sections.myTranslations.forEach((translation, index) => {
        rows.push({
          type: 'translation',
          id: `my-${translation.id}`,
          translation,
          position: groupPosition(index, sections.myTranslations.length),
        });
      });
    }

    if (sections.availableTranslations.length > 0) {
      const languageLabel = hasActiveSearchQuery
        ? null
        : getTranslationLanguageDisplayLabel(resolvedPreferredLanguage);

      rows.push({
        type: 'section-header',
        id: 'section-available-translations',
        label: languageLabel
          ? `${t('translations.available')} · ${languageLabel}`
          : t('translations.available'),
      });

      sections.availableTranslations.forEach((translation, index) => {
        rows.push({
          type: 'translation',
          id: `available-${translation.id}`,
          translation,
          position: groupPosition(index, sections.availableTranslations.length),
        });
      });
    }

    return rows;
  }, [
    hasActiveSearchQuery,
    languageOptions.length,
    languageSearchResults,
    resolvedPreferredLanguage,
    sections.availableTranslations,
    sections.myTranslations,
    t,
  ]);

  // The search field is deliberately NOT a row: rows are recycled cells, so a
  // scroll far enough down would unmount the focused TextInput and drop the
  // keyboard mid-query. FlashList re-renders a header element in place, which
  // keeps focus — the same shape the onboarding locale list uses. It has to be
  // an element of a stable type (never an inline component) or React remounts
  // it on every keystroke and steals focus anyway.
  const searchHeader = (
    <View
      style={[
        styles.searchInputShell,
        { backgroundColor: colors.bibleElevatedSurface, borderColor: colors.bibleDivider },
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
        <TouchableOpacity
          style={styles.clearSearchButton}
          onPress={() => setSearchQuery('')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t('settings.clear')}
        >
          <Ionicons name="close-circle" size={18} color={colors.bibleSecondaryText} />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const renderTranslationRow = ({ item }: { item: TranslationPickerRow }) => {
    if (item.type === 'language-search-result') {
      const isSelected = resolvedPreferredLanguage === item.language.value;

      return (
        <TouchableOpacity
          testID="translation-picker-language-search-result"
          style={[
            styles.groupRow,
            groupRowStyle.only,
            styles.languageRow,
            {
              backgroundColor: isSelected
                ? hexWithAlpha(colors.bibleAccent, 0.08)
                : colors.bibleSurface,
              borderColor: colors.bibleDivider,
            },
          ]}
          onPress={() => handleLanguageSearchResultSelect(item.language.value)}
          activeOpacity={0.82}
        >
          <Ionicons name="globe-outline" size={18} color={colors.bibleSecondaryText} />
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: colors.biblePrimaryText }]}>
              {item.language.label}
            </Text>
            <Text style={[styles.rowMeta, { color: colors.bibleSecondaryText }]}>
              {item.language.translationCount}
            </Text>
          </View>
          <Ionicons
            name={isSelected ? 'checkmark' : 'chevron-forward'}
            size={18}
            color={isSelected ? colors.bibleAccent : colors.bibleSecondaryText}
          />
        </TouchableOpacity>
      );
    }

    if (item.type === 'preference') {
      // The language filter is a small control, not a section of its own: a pill
      // that names the current language and opens the language list.
      return (
        <View style={styles.preferenceRow}>
          <TouchableOpacity
            style={[
              styles.languagePill,
              { backgroundColor: colors.bibleElevatedSurface, borderColor: colors.bibleDivider },
            ]}
            onPress={() => setPickerMode('languages')}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel={t('translations.languagePreference')}
            testID="translation-picker-language-pill"
          >
            <Ionicons name="globe-outline" size={15} color={colors.bibleSecondaryText} />
            <Text style={[styles.languagePillLabel, { color: colors.biblePrimaryText }]}>
              {getTranslationLanguageDisplayLabel(resolvedPreferredLanguage)}
            </Text>
            <Ionicons name="chevron-down" size={14} color={colors.bibleSecondaryText} />
          </TouchableOpacity>
        </View>
      );
    }

    if (item.type === 'section-header') {
      return (
        <Text style={[styles.sectionEyebrow, { color: colors.bibleSecondaryText }]}>
          {item.label}
        </Text>
      );
    }

    return (
      <TranslationRow
        translation={item.translation}
        position={item.position}
        isSelected={currentTranslation === item.translation.id}
        disabled={isHydratingRuntimeCatalog && !hasHydratedRuntimeCatalog}
        handleTranslationSelect={handleTranslationSelect}
        onManage={setManageTranslationId}
      />
    );
  };

  return (
    <View ref={listSurfaceRef} style={styles.container} collapsable={false}>
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
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={16} color={colors.bibleAccent} />
            <Text style={[styles.languageModeBackText, { color: colors.bibleAccent }]}>
              {t('translations.languagePreference')}
            </Text>
          </TouchableOpacity>

          {languageOptions.map((language, index) => {
            const isSelected = resolvedPreferredLanguage === language.value;
            const position = groupPosition(index, languageOptions.length);

            return (
              <TouchableOpacity
                key={language.value}
                style={[
                  styles.groupRow,
                  groupRowStyle[position],
                  styles.languageRow,
                  {
                    backgroundColor: isSelected
                      ? hexWithAlpha(colors.bibleAccent, 0.08)
                      : colors.bibleSurface,
                    borderColor: colors.bibleDivider,
                  },
                ]}
                onPress={() => {
                  setPreferredTranslationLanguage(language.value);
                  setPickerMode('translations');
                }}
                activeOpacity={0.82}
              >
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: colors.biblePrimaryText }]}>
                    {language.label}
                  </Text>
                  <Text style={[styles.rowMeta, { color: colors.bibleSecondaryText }]}>
                    {language.count}
                  </Text>
                </View>
                {isSelected ? (
                  <Ionicons name="checkmark" size={18} color={colors.bibleAccent} />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : (
        <FlashList
          style={styles.translationList}
          data={translationRows}
          renderItem={renderTranslationRow}
          ListHeaderComponent={searchHeader}
          keyExtractor={(item) => item.id}
          contentContainerStyle={translationListContentStyle}
          showsVerticalScrollIndicator={false}
          estimatedItemSize={TRANSLATION_PICKER_ROW_ESTIMATED_SIZE}
          getItemType={(item) => item.type}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          extraData={{
            colors,
            currentTranslation,
            isHydratingRuntimeCatalog,
            resolvedPreferredLanguage,
            searchQuery,
          }}
        />
      )}

      <Modal
        visible={manageTranslation != null}
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        animationType="slide"
        onRequestClose={() => setManageTranslationId(null)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setManageTranslationId(null)}
            accessibilityRole="button"
            accessibilityLabel={t('interface.close')}
          />
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: colors.bibleSurface,
                borderColor: colors.bibleDivider,
                // The sheet is a bare Modal, so nothing else keeps its last
                // rows clear of the Android navigation bar.
                paddingBottom: insets.bottom,
              },
            ]}
          >
            {manageTranslation ? (
              <TranslationManageSheet
                translation={manageTranslation}
                currentBook={currentBook}
                isSelected={currentTranslation === manageTranslation.id}
                onClose={() => setManageTranslationId(null)}
                handleDownloadTextTranslation={handleDownloadTextTranslation}
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// One row per Bible. Tap the row to read it (or start its download); the
// trailing glyph says which of those will happen. Everything else — audio,
// pinning, hiding, deleting — lives behind the "more" button so the list stays
// a list of Bibles rather than a wall of chips.
const TranslationRow = memo(function TranslationRow({
  translation,
  position,
  isSelected,
  disabled,
  handleTranslationSelect,
  onManage,
}: {
  translation: BibleTranslation;
  position: GroupPosition;
  isSelected: boolean;
  disabled: boolean;
  handleTranslationSelect: (translation: BibleTranslation) => Promise<void>;
  onManage: (id: string) => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const downloadProgress = useBibleStore((state) =>
    state.downloadProgress?.translationId === translation.id ? state.downloadProgress : null
  );
  const cancelDownload = useBibleStore((state) => state.cancelDownload);

  const activeAudioJob = translation.activeDownloadJob;
  const isActiveAudioJob =
    activeAudioJob != null &&
    activeAudioJob.state !== 'completed' &&
    activeAudioJob.state !== 'failed';
  const isTextDownloadActive =
    downloadProgress?.translationId === translation.id &&
    !downloadProgress.bookId &&
    !isActiveAudioJob;
  const activeDownloadProgress = isActiveAudioJob
    ? activeAudioJob.progress
    : isTextDownloadActive
      ? (downloadProgress?.progress ?? 0)
      : null;
  const isTextDownloaded = translation.isDownloaded || Boolean(translation.textPackLocalPath);

  // A download's only visible signal is a silently growing rule, so speak the
  // same status words the row already shows when it starts and when it settles.
  const wasDownloadingRef = useRef(false);
  useEffect(() => {
    const isDownloading = activeDownloadProgress != null;
    if (isDownloading === wasDownloadingRef.current) return;
    wasDownloadingRef.current = isDownloading;
    if (isDownloading) {
      announceForAccessibility(t('translations.downloading'));
    } else {
      announceForAccessibility(
        isTextDownloaded ? t('translations.installed') : t('translations.available')
      );
    }
  }, [activeDownloadProgress, isTextDownloaded, t]);

  const needsTextDownload =
    !isTextDownloaded && Boolean(translation.catalog?.text?.downloadUrl) && !translation.hasAudio;

  const description = t(`interface.translationDescriptions.${translation.id}`, {
    defaultValue: translation.description,
  });
  const availabilitySummary = getTranslationAvailabilitySummary(translation, t);
  const meta = [translation.abbreviation, availabilitySummary].filter(Boolean).join(' · ');

  return (
    <View
      style={[
        styles.groupRow,
        groupRowStyle[position],
        {
          backgroundColor: isSelected
            ? hexWithAlpha(colors.bibleAccent, 0.08)
            : colors.bibleSurface,
          borderColor: colors.bibleDivider,
        },
      ]}
    >
      {isSelected ? (
        <View style={[styles.selectedRule, { backgroundColor: colors.bibleAccent }]} />
      ) : null}
      <TouchableOpacity
        style={styles.translationItem}
        onPress={() => {
          void handleTranslationSelect(translation);
        }}
        activeOpacity={0.85}
        disabled={disabled || isTextDownloadActive}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={translation.name}
      >
        <View style={styles.rowText}>
          <Text
            style={[styles.rowTitle, { color: colors.biblePrimaryText }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {translation.name}
          </Text>
          <Text style={[styles.rowMeta, { color: colors.bibleSecondaryText }]} numberOfLines={1}>
            {meta}
          </Text>
          {description ? (
            <Text
              style={[styles.rowDescription, { color: colors.bibleSecondaryText }]}
              numberOfLines={1}
            >
              {description}
            </Text>
          ) : null}
          {activeDownloadProgress != null ? (
            <View style={styles.rowProgress}>
              <ProgressBar
                progress={activeDownloadProgress / 100}
                height={DOWNLOAD_PROGRESS_HEIGHT}
                trackColor={colors.bibleDivider}
                fillColor={colors.bibleAccent}
                style={styles.downloadProgressTrack}
                accessibilityLabel={t('translations.downloading')}
              />
            </View>
          ) : null}
        </View>

        <View style={styles.rowTrailing}>
          {activeDownloadProgress != null ? (
            <>
              <Text style={[styles.rowProgressLabel, { color: colors.bibleAccent }]}>
                {activeDownloadProgress}%
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('translations.cancelDownload')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => cancelDownload()}
              >
                <Ionicons name="close-circle" size={20} color={colors.bibleSecondaryText} />
              </TouchableOpacity>
            </>
          ) : isSelected ? (
            <Ionicons name="checkmark-circle" size={22} color={colors.bibleAccent} />
          ) : needsTextDownload ? (
            <Ionicons name="download-outline" size={20} color={colors.bibleAccent} />
          ) : null}
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.moreButton}
        onPress={() => onManage(translation.id)}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        accessibilityRole="button"
        accessibilityLabel={t('gather.moreOptions')}
        testID={`translation-picker-more-${translation.id}`}
      >
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.bibleSecondaryText} />
      </TouchableOpacity>
    </View>
  );
});

// The per-Bible management sheet: where it sits in the reader's library, what
// is stored on the device, and book-by-book audio. Opened from a row's "more".
function TranslationManageSheet({
  translation,
  currentBook,
  isSelected,
  onClose,
  handleDownloadTextTranslation,
}: {
  translation: BibleTranslation;
  currentBook: string;
  isSelected: boolean;
  onClose: () => void;
  handleDownloadTextTranslation: (translation: BibleTranslation) => Promise<void>;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const downloadProgress = useBibleStore((state) =>
    state.downloadProgress?.translationId === translation.id ? state.downloadProgress : null
  );
  const downloadAudioForBook = useBibleStore((state) => state.downloadAudioForBook);
  const downloadAudioForBooks = useBibleStore((state) => state.downloadAudioForBooks);
  const downloadAudioForTranslation = useBibleStore((state) => state.downloadAudioForTranslation);
  const cancelDownload = useBibleStore((state) => state.cancelDownload);
  const deleteTranslation = useBibleStore((state) => state.deleteTranslation);
  const pinned = useTranslationPreferenceStore((state) => state.pinnedIds.includes(translation.id));
  const hidden = useTranslationPreferenceStore((state) => state.hiddenIds.includes(translation.id));
  const pin = useTranslationPreferenceStore((state) => state.pin);
  const unpin = useTranslationPreferenceStore((state) => state.unpin);
  const hide = useTranslationPreferenceStore((state) => state.hide);
  const [activeAudioDownloadKey, setActiveAudioDownloadKey] = useState<string | null>(null);

  const getTranslationAudioAvailability = (bookId?: string) =>
    getAudioAvailability({
      featureEnabled: config.features.audioEnabled,
      translationHasAudio: translation.hasAudio,
      remoteAudioAvailable: isRemoteAudioAvailable(translation.id, bookId ?? currentBook),
      downloadedAudioBooks: translation.downloadedAudioBooks,
      bookId: bookId ?? currentBook,
    });

  const audioAvailability = getTranslationAudioAvailability();
  const collectionActions = getTranslationAudioCollectionActions(translation);
  const audioBookIds = getTranslationAudioBookIds(translation);
  const translationAudioBooks =
    audioBookIds.length > 0 ? bibleBooks.filter((book) => audioBookIds.includes(book.id)) : [];
  const shouldShowAudio = audioAvailability.canManageAudio && translationAudioBooks.length > 0;
  const isAudioDownloaded = isTranslationAudioDownloaded(
    translation.downloadedAudioBooks,
    translationAudioBooks
  );
  const downloadedAudioCount = translation.downloadedAudioBooks.filter((id) =>
    translationAudioBooks.some((book) => book.id === id)
  ).length;

  const activeAudioJob = translation.activeDownloadJob;
  const isActiveAudioJob =
    activeAudioJob != null &&
    activeAudioJob.state !== 'completed' &&
    activeAudioJob.state !== 'failed';
  const isTextDownloadActive =
    downloadProgress?.translationId === translation.id &&
    !downloadProgress.bookId &&
    !isActiveAudioJob;
  const isTextDownloaded = translation.isDownloaded || Boolean(translation.textPackLocalPath);
  const hasTextRow =
    translation.hasText || Boolean(translation.catalog?.text?.downloadUrl) || isTextDownloaded;
  const isBusy = activeAudioDownloadKey !== null || isActiveAudioJob || isTextDownloadActive;

  const description = t(`interface.translationDescriptions.${translation.id}`, {
    defaultValue: translation.description,
  });

  const handleDownloadAudioCollection = async (action: 'full-bible' | 'new-testament') => {
    if (!audioAvailability.canDownloadAudio) {
      return;
    }

    setActiveAudioDownloadKey(action === 'new-testament' ? 'nt' : 'all');

    try {
      if (action === 'new-testament') {
        const ntBookIds = newTestamentBooks
          .map((book) => book.id)
          .filter((id) => audioBookIds.includes(id));
        await downloadAudioForBooks(translation.id, ntBookIds);
      } else {
        await downloadAudioForTranslation(translation.id);
      }
    } catch (downloadError) {
      const message =
        downloadError instanceof Error ? downloadError.message : t('bible.audioDownloadFailed');
      Alert.alert(t('common.error'), message);
    } finally {
      setActiveAudioDownloadKey(null);
    }
  };

  const handleDownloadBookAudio = async (bookId: string) => {
    if (!getTranslationAudioAvailability(bookId).canDownloadAudio) {
      return;
    }

    setActiveAudioDownloadKey(`book:${bookId}`);

    try {
      await downloadAudioForBook(translation.id, bookId);
    } catch (downloadError) {
      const message =
        downloadError instanceof Error ? downloadError.message : t('bible.audioDownloadFailed');
      Alert.alert(t('common.error'), message);
    } finally {
      setActiveAudioDownloadKey(null);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      t('translations.deleteConfirmTitle'),
      t('translations.deleteConfirmMessage', { name: translation.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('translations.delete'),
          style: 'destructive',
          onPress: () => {
            deleteTranslation(translation.id);
            onClose();
          },
        },
      ]
    );
  };

  const renderStatusGlyph = (state: 'done' | 'download' | 'unavailable' | 'busy') => {
    if (state === 'busy') {
      return <ActivityIndicator size="small" color={colors.bibleAccent} />;
    }
    if (state === 'done') {
      return <Ionicons name="checkmark-circle" size={20} color={colors.success} />;
    }
    if (state === 'unavailable') {
      return <Ionicons name="cloud-offline-outline" size={20} color={colors.bibleSecondaryText} />;
    }
    return <Ionicons name="download-outline" size={20} color={colors.bibleAccent} />;
  };

  const libraryRows: {
    key: string;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void;
    destructive?: boolean;
  }[] = [
    {
      key: 'pin',
      icon: pinned ? 'bookmark' : 'bookmark-outline',
      label: t(pinned ? 'translations.unpin' : 'translations.pin'),
      onPress: () => (pinned ? unpin(translation.id) : pin(translation.id)),
    },
  ];
  if (!hidden && !isSelected && (translation.isDownloaded || pinned)) {
    libraryRows.push({
      key: 'hide',
      icon: 'eye-off-outline',
      label: t('translations.hide'),
      onPress: () => {
        hide(translation.id);
        onClose();
      },
    });
  }
  if (hasTranslationDownloadData(translation) && !isBusy) {
    libraryRows.push({
      key: 'delete',
      icon: 'trash-outline',
      label: t('translations.delete'),
      onPress: confirmDelete,
      destructive: true,
    });
  }

  return (
    <>
      <View style={styles.modalHeader}>
        <View style={styles.modalHeaderText}>
          <Text style={[styles.modalTitle, { color: colors.biblePrimaryText }]} numberOfLines={1}>
            {translation.name}
          </Text>
          <Text style={[styles.rowMeta, { color: colors.bibleSecondaryText }]} numberOfLines={2}>
            {[translation.abbreviation, description].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={t('interface.close')}
        >
          <Ionicons name="close" size={22} color={colors.bibleSecondaryText} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.translationList}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={styles.translationListContent}
        showsVerticalScrollIndicator={false}
      >
        {libraryRows.map((row, index) => (
          <TouchableOpacity
            key={row.key}
            style={[
              styles.groupRow,
              groupRowStyle[groupPosition(index, libraryRows.length)],
              styles.manageRow,
              { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
            ]}
            onPress={row.onPress}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel={row.label}
          >
            <Ionicons
              name={row.icon}
              size={18}
              color={row.destructive ? colors.error : colors.bibleSecondaryText}
            />
            <Text
              style={[
                styles.rowTitle,
                { color: row.destructive ? colors.error : colors.biblePrimaryText },
              ]}
            >
              {row.label}
            </Text>
          </TouchableOpacity>
        ))}

        {(() => {
          type DownloadRow = {
            key: string;
            icon: keyof typeof Ionicons.glyphMap;
            label: string;
            meta?: string;
            state: 'done' | 'download' | 'unavailable' | 'busy';
            progress?: number | null;
            onPress?: () => void;
          };
          const textRows: DownloadRow[] = [];
          const audioRows: DownloadRow[] = [];

          if (hasTextRow) {
            textRows.push({
              key: 'text',
              icon: 'chatbox-ellipses-outline',
              label: t('audio.showText'),
              meta:
                !isTextDownloaded && translation.sizeInMB
                  ? `~${translation.sizeInMB} MB`
                  : undefined,
              state: isTextDownloadActive ? 'busy' : isTextDownloaded ? 'done' : 'download',
              progress: isTextDownloadActive ? (downloadProgress?.progress ?? 0) : null,
              onPress:
                isTextDownloaded || isBusy || !translation.catalog?.text?.downloadUrl
                  ? undefined
                  : () => void handleDownloadTextTranslation(translation),
            });
          }

          if (shouldShowAudio) {
            const collectionAction = collectionActions[0] ?? null;
            const isCollectionBusy =
              activeAudioDownloadKey === 'all' ||
              activeAudioDownloadKey === 'nt' ||
              (isActiveAudioJob && activeAudioJob.kind === 'translation-audio');

            if (collectionAction === 'full-bible') {
              audioRows.push({
                key: 'full-bible',
                icon: 'headset-outline',
                label: t('bible.fullBible'),
                meta: `${downloadedAudioCount}/${translationAudioBooks.length}`,
                state: isCollectionBusy
                  ? 'busy'
                  : isAudioDownloaded
                    ? 'done'
                    : audioAvailability.canDownloadAudio
                      ? 'download'
                      : 'unavailable',
                progress: isCollectionBusy ? (activeAudioJob?.progress ?? 0) : null,
                onPress:
                  isAudioDownloaded || isBusy || !audioAvailability.canDownloadAudio
                    ? undefined
                    : () => void handleDownloadAudioCollection('full-bible'),
              });
            }

            if (collectionActions.includes('new-testament')) {
              const ntBookIds = newTestamentBooks
                .map((book) => book.id)
                .filter((id) => audioBookIds.includes(id));
              const ntDownloaded = ntBookIds.every((id) =>
                isAudioBookDownloaded(translation.downloadedAudioBooks, id)
              );
              audioRows.push({
                key: 'new-testament',
                icon: 'headset-outline',
                label: t('bible.newTestament'),
                meta: `${ntBookIds.filter((id) => isAudioBookDownloaded(translation.downloadedAudioBooks, id)).length}/${ntBookIds.length}`,
                state:
                  activeAudioDownloadKey === 'nt'
                    ? 'busy'
                    : ntDownloaded
                      ? 'done'
                      : audioAvailability.canDownloadAudio
                        ? 'download'
                        : 'unavailable',
                progress: activeAudioDownloadKey === 'nt' ? (activeAudioJob?.progress ?? 0) : null,
                onPress:
                  ntDownloaded || isBusy || !audioAvailability.canDownloadAudio
                    ? undefined
                    : () => void handleDownloadAudioCollection('new-testament'),
              });
            }
          }

          const renderDownloadRow = (row: DownloadRow, index: number, count: number) => (
            <TouchableOpacity
              key={row.key}
              style={[
                styles.groupRow,
                groupRowStyle[groupPosition(index, count)],
                styles.manageRow,
                { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
              ]}
              onPress={row.onPress}
              disabled={!row.onPress}
              activeOpacity={row.onPress ? 0.82 : 1}
              accessibilityRole="button"
              accessibilityLabel={row.label}
            >
              <Ionicons name={row.icon} size={18} color={colors.bibleSecondaryText} />
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: colors.biblePrimaryText }]}>
                  {row.label}
                </Text>
                {row.progress != null ? (
                  <ProgressBar
                    progress={row.progress / 100}
                    height={DOWNLOAD_PROGRESS_HEIGHT}
                    trackColor={colors.bibleDivider}
                    fillColor={colors.bibleAccent}
                    style={styles.downloadProgressTrack}
                    accessibilityLabel={t('translations.downloading')}
                  />
                ) : null}
              </View>
              {row.progress != null ? (
                <>
                  <Text style={[styles.rowProgressLabel, { color: colors.bibleAccent }]}>
                    {row.progress}%
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={t('translations.cancelDownload')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={() => cancelDownload()}
                  >
                    <Ionicons name="close-circle" size={20} color={colors.bibleSecondaryText} />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  {row.meta ? (
                    <Text style={[styles.rowValue, { color: colors.bibleSecondaryText }]}>
                      {row.meta}
                    </Text>
                  ) : null}
                  {renderStatusGlyph(row.state)}
                </>
              )}
            </TouchableOpacity>
          );

          return (
            <>
              {textRows.map((row, index) => renderDownloadRow(row, index, textRows.length))}
              {audioRows.length > 0 ? (
                <>
                  <Text style={[styles.sectionEyebrow, { color: colors.bibleSecondaryText }]}>
                    {t('bible.audioDownloads')}
                  </Text>
                  {audioRows.map((row, index) => renderDownloadRow(row, index, audioRows.length))}
                </>
              ) : null}
            </>
          );
        })()}

        {shouldShowAudio ? (
          <>
            <Text style={[styles.sectionEyebrow, { color: colors.bibleSecondaryText }]}>
              {t('bible.byBook')}
            </Text>
            {translationAudioBooks.map((book, index) => {
              const bookAudioDownloaded = isAudioBookDownloaded(
                translation.downloadedAudioBooks,
                book.id
              );
              const bookAudioAvailability = getTranslationAudioAvailability(book.id);
              const isBookDownloading = activeAudioDownloadKey === `book:${book.id}`;
              const canDownload =
                !bookAudioDownloaded && !isBusy && bookAudioAvailability.canDownloadAudio;

              return (
                <TouchableOpacity
                  key={book.id}
                  style={[
                    styles.groupRow,
                    groupRowStyle[groupPosition(index, translationAudioBooks.length)],
                    styles.manageRow,
                    { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
                  ]}
                  onPress={canDownload ? () => void handleDownloadBookAudio(book.id) : undefined}
                  disabled={!canDownload}
                  activeOpacity={canDownload ? 0.82 : 1}
                  accessibilityRole="button"
                  accessibilityLabel={getTranslatedBookName(book.id, t)}
                >
                  <Text
                    style={[styles.rowTitle, styles.rowText, { color: colors.biblePrimaryText }]}
                  >
                    {getTranslatedBookName(book.id, t)}
                  </Text>
                  {renderStatusGlyph(
                    isBookDownloading
                      ? 'busy'
                      : bookAudioDownloaded
                        ? 'done'
                        : bookAudioAvailability.canDownloadAudio
                          ? 'download'
                          : 'unavailable'
                  )}
                </TouchableOpacity>
              );
            })}
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

// The download rule keeps its original 3pt hairline; ProgressBar owns the
// radius, clipping, and the animated fill.
const DOWNLOAD_PROGRESS_HEIGHT = 3;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalContent: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderWidth: 1,
    paddingTop: layout.cardPadding,
    height: '82%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: layout.screenPadding,
    marginBottom: spacing.sm,
  },
  modalHeaderText: {
    flex: 1,
    gap: 2,
  },
  modalTitle: {
    ...typography.cardTitle,
  },
  catalogHydrationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.xs,
  },
  catalogHydrationText: {
    ...typography.caption,
  },
  translationList: {
    flex: 1,
    minHeight: 0,
  },
  translationListContent: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    paddingBottom: layout.sectionGap,
  },
  searchInputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    paddingVertical: 0,
  },
  clearSearchButton: {
    marginLeft: spacing.xs,
  },
  preferenceRow: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },
  languagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingLeft: spacing.md,
    paddingRight: 10,
    height: 34,
  },
  languagePillLabel: {
    ...typography.label,
  },
  // The single heading style in the sheet: one eyebrow, indented to the row text.
  sectionEyebrow: {
    ...typography.eyebrow,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  languageModeBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  languageModeBackText: {
    ...typography.label,
  },
  // Rows in a section share one outline and divide with hairlines, so a section
  // reads as one object rather than a stack of separate cards.
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  translationItem: {
    flex: 1,
    minHeight: 60,
    paddingVertical: 10,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  manageRow: {
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  languageRow: {
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  selectedRule: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  // Three type levels only: title, meta (code and formats), description.
  rowTitle: {
    ...typography.rowTitle,
  },
  rowMeta: {
    ...typography.caption,
    marginTop: 1,
  },
  rowDescription: {
    ...typography.caption,
    opacity: 0.8,
  },
  rowValue: {
    ...typography.mono,
  },
  rowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 24,
    justifyContent: 'flex-end',
  },
  rowProgress: {
    marginTop: 6,
  },
  rowProgressLabel: {
    ...typography.mono,
  },
  moreButton: {
    width: 40,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  downloadProgressTrack: {
    marginTop: 6,
  },
});

// Outer corners only on the first/last row of a group; inner rows butt up
// against each other with a shared hairline.
const groupRowStyle = StyleSheet.create({
  only: {
    borderRadius: radius.lg,
    marginBottom: spacing.xs,
  },
  first: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderBottomWidth: 0,
  },
  middle: {
    borderBottomWidth: 0,
  },
  last: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    marginBottom: spacing.xs,
  },
});
