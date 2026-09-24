import { memo } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProgressBar } from '../../../components/ui';
import { useTheme } from '../../../contexts/ThemeContext';
import { useI18n } from '../../../hooks/useI18n';
import { useBibleStore } from '../../../stores/bibleStore';
import type { BibleTranslation } from '../../../types';
import { hexWithAlpha } from '../../../utils';
import { getTranslationAvailabilitySummary } from '../bibleTranslationModel';
import { DOWNLOAD_PROGRESS_HEIGHT, groupRowStyle, pickerStyles as styles } from './pickerStyles';
import { getTranslationRowDownloadState } from './translationDownloadStatusModel';
import type { GroupPosition } from './translationPickerRowsModel';
import { useTranslationDownloadProgress } from './useTranslationDownloadProgress';

interface TranslationRowProps {
  translation: BibleTranslation;
  position: GroupPosition;
  isSelected: boolean;
  disabled: boolean;
  /** Waiting for the running download to finish before its own starts. */
  isQueued: boolean;
  handleTranslationSelect: (translation: BibleTranslation) => Promise<void>;
  onManage: (id: string) => void;
  onCancelQueued: (id: string) => void;
}

const CANCEL_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };
const MORE_HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 };

// One row per Bible. Tap the row to read it (or start its download); the
// trailing glyph says which of those will happen. Everything else — audio,
// pinning, hiding, deleting — lives behind the "more" button so the list stays
// a list of Bibles rather than a wall of chips.
export const TranslationRow = memo(function TranslationRow({
  translation,
  position,
  isSelected,
  disabled,
  isQueued,
  handleTranslationSelect,
  onManage,
  onCancelQueued,
}: TranslationRowProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const downloadProgress = useTranslationDownloadProgress(translation.id);
  const cancelDownload = useBibleStore((state) => state.cancelDownload);

  const {
    isTextDownloadActive,
    activeDownloadProgress,
    isTextDownloadIndeterminate,
    showsQueued,
    needsTextDownload,
  } = getTranslationRowDownloadState(translation, downloadProgress, isQueued);
  const isDownloading = activeDownloadProgress != null;

  const cancelRowDownload = () => {
    if (showsQueued) {
      onCancelQueued(translation.id);
    } else {
      cancelDownload();
    }
  };

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
        disabled={disabled || isTextDownloadActive || showsQueued}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={[translation.name, meta].filter(Boolean).join(', ')}
        accessibilityValue={
          activeDownloadProgress != null
            ? {
                text: isTextDownloadIndeterminate
                  ? t('translations.downloading')
                  : `${activeDownloadProgress}%`,
              }
            : showsQueued
              ? { text: t('translations.queued') }
              : needsTextDownload && !isSelected
                ? // Only the download glyph says a tap fetches it rather than opens it.
                  { text: t('translations.download') }
                : undefined
        }
        // The nested cancel button is not reachable by VoiceOver inside this
        // row, so it is also offered as a custom action.
        accessibilityActions={
          isDownloading || showsQueued
            ? [{ name: 'cancelDownload', label: t('translations.cancelDownload') }]
            : undefined
        }
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'cancelDownload') cancelRowDownload();
        }}
      >
        <View style={styles.rowText}>
          {/* Two lines each: at large text sizes one line cut the name to
              "Bible in O…", which is the only thing that tells rows apart. */}
          <Text
            style={[styles.rowTitle, { color: colors.biblePrimaryText }]}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {translation.name}
          </Text>
          <Text style={[styles.rowMeta, { color: colors.bibleSecondaryText }]} numberOfLines={2}>
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
                indeterminate={isTextDownloadIndeterminate}
                height={DOWNLOAD_PROGRESS_HEIGHT}
                trackColor={colors.bibleDivider}
                fillColor={colors.bibleAccent}
                style={styles.downloadProgressTrack}
                accessibilityLabel={t('translations.downloading')}
              />
            </View>
          ) : showsQueued ? (
            <Text style={[styles.rowMeta, { color: colors.bibleAccent }]} numberOfLines={2}>
              {t('translations.queued')}
            </Text>
          ) : null}
        </View>

        <View style={styles.rowTrailing}>
          {activeDownloadProgress != null ? (
            <>
              <Text style={[styles.rowProgressLabel, { color: colors.bibleAccent }]}>
                {isTextDownloadIndeterminate ? '…' : `${activeDownloadProgress}%`}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('translations.cancelDownload')}
                hitSlop={CANCEL_HIT_SLOP}
                onPress={() => cancelDownload()}
              >
                <Ionicons name="close-circle" size={20} color={colors.bibleSecondaryText} />
              </TouchableOpacity>
            </>
          ) : showsQueued ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('translations.cancelDownload')}
              hitSlop={CANCEL_HIT_SLOP}
              onPress={() => onCancelQueued(translation.id)}
            >
              <Ionicons name="close-circle" size={20} color={colors.bibleSecondaryText} />
            </TouchableOpacity>
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
        hitSlop={MORE_HIT_SLOP}
        accessibilityRole="button"
        // Every row has one; naming the Bible tells them apart (and gives Voice
        // Control a unique name).
        accessibilityLabel={`${t('gather.moreOptions')}, ${translation.name}`}
        testID={`translation-picker-more-${translation.id}`}
      >
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.bibleSecondaryText} />
      </TouchableOpacity>
    </View>
  );
});
