import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { useTheme } from '../../contexts/ThemeContext';
import { useI18n } from '../../hooks/useI18n';
import { useKeyboardBottomInset } from '../../hooks/useKeyboardBottomInset';
import { layout, spacing } from '../../design/system';
import { useBibleStore } from '../../stores/bibleStore';
import {
  filterTranslationsByLanguage,
  getTranslationLanguageDisplayLabel,
} from './bibleTranslationModel';
import {
  LanguagePreferencePill,
  LanguageSearchResultRow,
  PickerSectionHeader,
  TranslationLanguageList,
  TranslationManageModal,
  TranslationPickerSearchField,
  TranslationRow,
  pickerStyles as styles,
  translationPickerRowKey,
  translationPickerRowType,
  useDownloadStatusAnnouncements,
  useTranslationPickerCatalog,
  useTranslationPickerDownloads,
  useTranslationPickerRows,
  useTranslationSelection,
  type TranslationPickerCallbacks,
  type TranslationPickerRow,
} from './picker';

const TRANSLATION_PICKER_ROW_ESTIMATED_SIZE = 76;

/**
 * The shared translation picker (Bible browser, reader and Settings open it): search, My
 * Translations first, then Available in the reader's language, a language list, and a
 * per-Bible manage sheet. Sections, rows, hooks and models live in ./picker.
 */
export function TranslationPickerList({
  onRequestClose,
  onTranslationActivated,
}: TranslationPickerCallbacks) {
  const { colors } = useTheme();
  const { t } = useI18n();
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
  const setPreferredTranslationLanguage = useBibleStore(
    (state) => state.setPreferredTranslationLanguage
  );

  const [pickerMode, setPickerMode] = useState<'translations' | 'languages'>('translations');
  const [manageTranslationId, setManageTranslationId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const {
    translations,
    visibleTranslations,
    hasHydratedRuntimeCatalog,
    setIsHydratingRuntimeCatalog,
    isCatalogLoading,
  } = useTranslationPickerCatalog();
  const { rows, languageOptions, resolvedPreferredLanguage, currentTranslation } =
    useTranslationPickerRows(visibleTranslations, searchQuery);
  const { downloadQueue, downloadQueueState, handleDownloadTextTranslation } =
    useTranslationPickerDownloads({ onRequestClose, onTranslationActivated });
  const handleTranslationSelect = useTranslationSelection({
    hasHydratedRuntimeCatalog,
    setIsHydratingRuntimeCatalog,
    downloadQueue,
    handleDownloadTextTranslation,
    onRequestClose,
    onTranslationActivated,
  });

  const manageTranslation = translations.find(
    (translation) => translation.id === manageTranslationId
  );

  // The language list only makes sense with a choice; drop back when the catalog shrinks.
  // Adjusted during render (not in an effect) so the one-language list never draws.
  if (pickerMode === 'languages' && languageOptions.length <= 1) {
    setPickerMode('translations');
  }

  const handleLanguageSearchResultSelect = useCallback(
    (language: string) => {
      const matchingTranslations = filterTranslationsByLanguage(visibleTranslations, language);

      setPreferredTranslationLanguage(language);

      const [onlyTranslation] = matchingTranslations;
      if (matchingTranslations.length === 1 && onlyTranslation) {
        void handleTranslationSelect(onlyTranslation);
        return;
      }

      setSearchQuery('');
      setPickerMode('translations');
    },
    [handleTranslationSelect, setPreferredTranslationLanguage, visibleTranslations]
  );
  const showLanguages = useCallback(() => setPickerMode('languages'), []);
  const showTranslations = useCallback(() => setPickerMode('translations'), []);
  const selectLanguage = useCallback(
    (language: string) => {
      setPreferredTranslationLanguage(language);
      setPickerMode('translations');
    },
    [setPreferredTranslationLanguage]
  );
  const closeManageSheet = useCallback(() => setManageTranslationId(null), []);

  const { downloadingId, queuedId } = downloadQueueState;
  useDownloadStatusAnnouncements(rows, queuedId);
  const renderTranslationRow = useCallback<ListRenderItem<TranslationPickerRow>>(
    ({ item }) => {
      if (item.type === 'language-search-result') {
        return (
          <LanguageSearchResultRow
            language={item.language}
            isSelected={resolvedPreferredLanguage === item.language.value}
            onSelect={handleLanguageSearchResultSelect}
          />
        );
      }

      if (item.type === 'preference') {
        return (
          <LanguagePreferencePill
            languageLabel={getTranslationLanguageDisplayLabel(resolvedPreferredLanguage)}
            onPress={showLanguages}
          />
        );
      }

      if (item.type === 'section-header') {
        return <PickerSectionHeader label={item.label} />;
      }

      return (
        <TranslationRow
          translation={item.translation}
          position={item.position}
          isSelected={currentTranslation === item.translation.id}
          disabled={isCatalogLoading || downloadingId === item.translation.id}
          isQueued={queuedId === item.translation.id}
          handleTranslationSelect={handleTranslationSelect}
          onManage={setManageTranslationId}
          onCancelQueued={downloadQueue.cancelQueued}
        />
      );
    },
    [
      currentTranslation,
      downloadQueue,
      downloadingId,
      handleLanguageSearchResultSelect,
      handleTranslationSelect,
      isCatalogLoading,
      queuedId,
      resolvedPreferredLanguage,
      showLanguages,
    ]
  );

  // Cells redraw when any of these change; a parent render that changes none of them (a
  // keyboard inset, an audio tick on another Bible) leaves the cells to their memoised rows.
  const extraData = useMemo(
    () => ({
      colors,
      currentTranslation,
      downloadQueueState,
      isCatalogLoading,
      resolvedPreferredLanguage,
      searchQuery,
    }),
    [
      colors,
      currentTranslation,
      downloadQueueState,
      isCatalogLoading,
      resolvedPreferredLanguage,
      searchQuery,
    ]
  );

  return (
    <View ref={listSurfaceRef} style={styles.container} collapsable={false}>
      {isCatalogLoading ? (
        <View style={styles.catalogHydrationRow}>
          <ActivityIndicator size="small" color={colors.bibleAccent} />
          <Text style={[styles.catalogHydrationText, { color: colors.bibleSecondaryText }]}>
            {t('common.loading')}
          </Text>
        </View>
      ) : null}

      {pickerMode === 'languages' ? (
        <TranslationLanguageList
          languageOptions={languageOptions}
          selectedLanguage={resolvedPreferredLanguage}
          onSelectLanguage={selectLanguage}
          onBack={showTranslations}
        />
      ) : (
        <FlashList
          style={styles.translationList}
          data={rows}
          renderItem={renderTranslationRow}
          ListHeaderComponent={
            <TranslationPickerSearchField value={searchQuery} onChangeText={setSearchQuery} />
          }
          keyExtractor={translationPickerRowKey}
          contentContainerStyle={translationListContentStyle}
          showsVerticalScrollIndicator={false}
          estimatedItemSize={TRANSLATION_PICKER_ROW_ESTIMATED_SIZE}
          getItemType={translationPickerRowType}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          extraData={extraData}
        />
      )}

      <TranslationManageModal
        translation={manageTranslation}
        currentBook={currentBook}
        isSelected={currentTranslation === manageTranslation?.id}
        onClose={closeManageSheet}
        handleDownloadTextTranslation={handleDownloadTextTranslation}
      />
    </View>
  );
}
