import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProgressBar } from '../../../components/ui';
import { useTheme } from '../../../contexts/ThemeContext';
import { useI18n } from '../../../hooks/useI18n';
import { DOWNLOAD_PROGRESS_HEIGHT, groupRowStyle, pickerStyles as styles } from './pickerStyles';
import type { ManageRowState } from './translationManageModel';
import type { GroupPosition } from './translationPickerRowsModel';

const CANCEL_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

/** The trailing status of a manage-sheet download row: tick, cloud, download, or spinner. */
export function ManageStatusGlyph({ state }: { state: ManageRowState }) {
  const { colors } = useTheme();

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
}

export interface ManageDownloadRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  meta?: string;
  state: ManageRowState;
  progress: number | null;
  indeterminate?: boolean;
  position: GroupPosition;
  onPress?: () => void;
  onCancel: () => void;
}

/** A text or audio-collection download in the manage sheet, with live progress and cancel. */
export function ManageDownloadRow({
  icon,
  label,
  meta,
  state,
  progress,
  indeterminate,
  position,
  onPress,
  onCancel,
}: ManageDownloadRowProps) {
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <TouchableOpacity
      style={[
        styles.groupRow,
        groupRowStyle[position],
        styles.manageRow,
        { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
      ]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.82 : 1}
      accessibilityRole="button"
      accessibilityLabel={label}
      // The status is otherwise only a glyph (tick, cloud, spinner).
      accessibilityValue={{
        text:
          state === 'busy'
            ? progress != null && !indeterminate
              ? `${progress}%`
              : t('translations.downloading')
            : state === 'done'
              ? t('translations.installed')
              : state === 'unavailable'
                ? t('bible.notAvailableYet')
                : [t('translations.download'), meta].filter(Boolean).join(', '),
      }}
      accessibilityActions={
        progress != null
          ? [{ name: 'cancelDownload', label: t('translations.cancelDownload') }]
          : undefined
      }
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'cancelDownload') onCancel();
      }}
    >
      <Ionicons name={icon} size={18} color={colors.bibleSecondaryText} />
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: colors.biblePrimaryText }]}>{label}</Text>
        {progress != null ? (
          <ProgressBar
            progress={progress / 100}
            indeterminate={indeterminate}
            height={DOWNLOAD_PROGRESS_HEIGHT}
            trackColor={colors.bibleDivider}
            fillColor={colors.bibleAccent}
            style={styles.downloadProgressTrack}
            accessibilityLabel={t('translations.downloading')}
          />
        ) : null}
      </View>
      {progress != null ? (
        <>
          <Text style={[styles.rowProgressLabel, { color: colors.bibleAccent }]}>
            {indeterminate ? '…' : `${progress}%`}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('translations.cancelDownload')}
            hitSlop={CANCEL_HIT_SLOP}
            onPress={() => onCancel()}
          >
            <Ionicons name="close-circle" size={20} color={colors.bibleSecondaryText} />
          </TouchableOpacity>
        </>
      ) : (
        <>
          {meta ? (
            <Text style={[styles.rowValue, { color: colors.bibleSecondaryText }]}>{meta}</Text>
          ) : null}
          <ManageStatusGlyph state={state} />
        </>
      )}
    </TouchableOpacity>
  );
}
