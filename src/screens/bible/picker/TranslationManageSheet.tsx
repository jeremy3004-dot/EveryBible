import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTranslatedBookName } from '../../../constants/books';
import { config } from '../../../constants/config';
import { useTheme } from '../../../contexts/ThemeContext';
import { useI18n } from '../../../hooks/useI18n';
import { getAudioAvailability } from '../../../services/audio/audioAvailability';
import { isRemoteAudioAvailable } from '../../../services/audio/audioRemote';
import { useBibleStore } from '../../../stores/bibleStore';
import { useTranslationPreferenceStore } from '../../../stores/translationPreferenceStore';
import type { BibleTranslation } from '../../../types';
import {
  getTranslationAudioBookIds,
  getTranslationAudioCollectionActions,
} from '../bibleTranslationModel';
import { ManageDownloadRow, ManageStatusGlyph } from './ManageDownloadRow';
import { groupRowStyle, pickerStyles as styles } from './pickerStyles';
import {
  buildTranslationManageModel,
  type ManageDownloadRowModel,
  type ManageLibraryAction,
  getManageRowAccessibilityValue,
} from './translationManageModel';
import { groupPosition } from './translationPickerRowsModel';
import { useManageAudioDownloads } from './useManageAudioDownloads';
import { useTranslationDownloadProgress } from './useTranslationDownloadProgress';

const CLOSE_HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

const DOWNLOAD_ROW_COPY: Record<
  ManageDownloadRowModel['key'],
  { icon: keyof typeof Ionicons.glyphMap; labelKey: string }
> = {
  text: { icon: 'chatbox-ellipses-outline', labelKey: 'audio.showText' },
  'full-bible': { icon: 'headset-outline', labelKey: 'bible.fullBible' },
  'new-testament': { icon: 'headset-outline', labelKey: 'bible.newTestament' },
};

const LIBRARY_ACTION_COPY: Record<
  ManageLibraryAction,
  { icon: keyof typeof Ionicons.glyphMap; labelKey: string; destructive?: boolean }
> = {
  pin: { icon: 'bookmark-outline', labelKey: 'translations.pin' },
  unpin: { icon: 'bookmark', labelKey: 'translations.unpin' },
  hide: { icon: 'eye-off-outline', labelKey: 'translations.hide' },
  delete: { icon: 'trash-outline', labelKey: 'translations.delete', destructive: true },
};

// The per-Bible management sheet: where it sits in the reader's library, what
// is stored on the device, and book-by-book audio. Opened from a row's "more".
export function TranslationManageSheet({
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
  const downloadProgress = useTranslationDownloadProgress(translation.id);
  const cancelDownload = useBibleStore((state) => state.cancelDownload);
  const deleteTranslation = useBibleStore((state) => state.deleteTranslation);
  const pinned = useTranslationPreferenceStore((state) => state.pinnedIds.includes(translation.id));
  const hidden = useTranslationPreferenceStore((state) => state.hiddenIds.includes(translation.id));
  const pin = useTranslationPreferenceStore((state) => state.pin);
  const unpin = useTranslationPreferenceStore((state) => state.unpin);
  const hide = useTranslationPreferenceStore((state) => state.hide);

  // Remote audio differs by book, so each by-book row asks about its own book.
  const getTranslationAudioAvailability = (bookId?: string) =>
    getAudioAvailability({
      featureEnabled: config.features.audioEnabled,
      translationHasAudio: translation.hasAudio,
      remoteAudioAvailable: isRemoteAudioAvailable(translation.id, bookId ?? currentBook),
      downloadedAudioBooks: translation.downloadedAudioBooks,
      bookId: bookId ?? currentBook,
    });
  const canDownloadBookAudio = (bookId: string) =>
    getTranslationAudioAvailability(bookId).canDownloadAudio;

  const audioAvailability = getTranslationAudioAvailability();
  const audioBookIds = getTranslationAudioBookIds(translation);
  const { activeAudioDownloadKey, downloadAudioCollection, downloadBookAudio } =
    useManageAudioDownloads({
      translationId: translation.id,
      audioBookIds,
      canDownloadAudio: audioAvailability.canDownloadAudio,
      canDownloadBookAudio,
    });
  const model = buildTranslationManageModel({
    translation,
    downloadProgress,
    activeAudioDownloadKey,
    pinned,
    hidden,
    isSelected,
    canManageAudio: audioAvailability.canManageAudio,
    canDownloadAudio: audioAvailability.canDownloadAudio,
    canDownloadBookAudio,
    audioBookIds,
    collectionActions: getTranslationAudioCollectionActions(translation),
  });

  const description = t(`interface.translationDescriptions.${translation.id}`, {
    defaultValue: translation.description,
  });

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

  const runLibraryAction = (action: ManageLibraryAction) => {
    if (action === 'pin') {
      pin(translation.id);
    } else if (action === 'unpin') {
      unpin(translation.id);
    } else if (action === 'hide') {
      hide(translation.id);
      onClose();
    } else {
      confirmDelete();
    }
  };

  const startDownloadRow = (key: ManageDownloadRowModel['key']) => {
    if (key === 'text') {
      void handleDownloadTextTranslation(translation);
    } else {
      void downloadAudioCollection(key);
    }
  };

  const renderDownloadRows = (rows: ManageDownloadRowModel[]) =>
    rows.map((row, index) => (
      <ManageDownloadRow
        key={row.key}
        icon={DOWNLOAD_ROW_COPY[row.key].icon}
        label={t(DOWNLOAD_ROW_COPY[row.key].labelKey)}
        meta={row.meta}
        state={row.state}
        progress={row.progress}
        indeterminate={row.indeterminate}
        position={groupPosition(index, rows.length)}
        onPress={row.canStart ? () => startDownloadRow(row.key) : undefined}
        onCancel={cancelDownload}
      />
    ));

  return (
    <>
      <View style={styles.modalHeader}>
        <View style={styles.modalHeaderText}>
          <Text
            accessibilityRole="header"
            style={[styles.modalTitle, { color: colors.biblePrimaryText }]}
            numberOfLines={2}
          >
            {translation.name}
          </Text>
          <Text style={[styles.rowMeta, { color: colors.bibleSecondaryText }]} numberOfLines={2}>
            {[translation.abbreviation, description].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={CLOSE_HIT_SLOP}
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
        {model.libraryActions.map((action, index) => {
          const { icon, labelKey, destructive } = LIBRARY_ACTION_COPY[action];
          const label = t(labelKey);
          return (
            <TouchableOpacity
              key={action === 'unpin' ? 'pin' : action}
              style={[
                styles.groupRow,
                groupRowStyle[groupPosition(index, model.libraryActions.length)],
                styles.manageRow,
                { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
              ]}
              onPress={() => runLibraryAction(action)}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <Ionicons
                name={icon}
                size={18}
                color={destructive ? colors.error : colors.bibleSecondaryText}
              />
              <Text
                style={[
                  styles.rowTitle,
                  { color: destructive ? colors.error : colors.biblePrimaryText },
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}

        {renderDownloadRows(model.textRows)}
        {model.audioRows.length > 0 ? (
          <>
            <Text
              accessibilityRole="header"
              style={[styles.sectionEyebrow, { color: colors.bibleSecondaryText }]}
            >
              {t('bible.audioDownloads')}
            </Text>
            {renderDownloadRows(model.audioRows)}
          </>
        ) : null}

        {model.showsAudio ? (
          <>
            <Text
              accessibilityRole="header"
              style={[styles.sectionEyebrow, { color: colors.bibleSecondaryText }]}
            >
              {t('bible.byBook')}
            </Text>
            {model.audioBookRows.map((row, index) => (
              <TouchableOpacity
                key={row.bookId}
                style={[
                  styles.groupRow,
                  groupRowStyle[groupPosition(index, model.audioBookRows.length)],
                  styles.manageRow,
                  { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
                ]}
                onPress={row.canStart ? () => void downloadBookAudio(row.bookId) : undefined}
                disabled={!row.canStart}
                activeOpacity={row.canStart ? 0.82 : 1}
                accessibilityRole="button"
                accessibilityLabel={getTranslatedBookName(row.bookId, t)}
                accessibilityValue={{ text: getManageRowAccessibilityValue(row, t) }}
                accessibilityState={{ disabled: !row.canStart, busy: row.state === 'busy' }}
              >
                <Text style={[styles.rowTitle, styles.rowText, { color: colors.biblePrimaryText }]}>
                  {getTranslatedBookName(row.bookId, t)}
                </Text>
                <ManageStatusGlyph state={row.state} />
              </TouchableOpacity>
            ))}
          </>
        ) : null}
      </ScrollView>
    </>
  );
}
