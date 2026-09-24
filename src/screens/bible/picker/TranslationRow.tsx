import { memo, useEffect, useRef } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProgressBar } from '../../../components/ui';
import { useTheme } from '../../../contexts/ThemeContext';
import { useI18n } from '../../../hooks/useI18n';
import { useBibleStore } from '../../../stores/bibleStore';
import type { BibleTranslation } from '../../../types';
import { announceForAccessibility, hexWithAlpha } from '../../../utils';
import { getTranslationAvailabilitySummary } from '../bibleTranslationModel';
import { DOWNLOAD_PROGRESS_HEIGHT, groupRowStyle, pickerStyles as styles } from './pickerStyles';
import {
  getTranslationRowDownloadState,
  type TranslationRowDownloadStatus,
} from './translationDownloadStatusModel';
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
    isTextDownloaded,
    activeDownloadProgress,
    isTextDownloadIndeterminate,
    showsQueued,
    status: downloadStatus,
    needsTextDownload,
  } = getTranslationRowDownloadState(translation, downloadProgress, isQueued);
  const isDownloading = activeDownloadProgress != null;

  // A download's only visible signal is a silently growing rule, so speak the
  // same status words the row already shows when it starts and when it settles.
  const previousDownloadStatusRef = useRef<TranslationRowDownloadStatus>('idle');
  useEffect(() => {
    const previousStatus = previousDownloadStatusRef.current;
    if (downloadStatus === previousStatus) return;
    previousDownloadStatusRef.current = downloadStatus;
    if (downloadStatus === 'downloading') {
      announceForAccessibility(t('translations.downloading'));
    } else if (downloadStatus === 'queued') {
      announceForAccessibility(t('translations.queued'));
    } else if (previousStatus === 'downloading') {
      announceForAccessibility(
        isTextDownloaded ? t('translations.installed') : t('translations.available')
      );
    }
  }, [downloadStatus, isTextDownloaded, t]);

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
        accessibilityLabel={t('gather.moreOptions')}
        testID={`translation-picker-more-${translation.id}`}
      >
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.bibleSecondaryText} />
      </TouchableOpacity>
    </View>
  );
});
