import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, CloudDownload } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../../contexts/ThemeContext';
import { radius, spacing, typography } from '../../../../design/system';
import { useBackgroundSoundAvailability } from '../../../../hooks/useBackgroundSoundAvailability';
import { BACKGROUND_MUSIC_OPTIONS } from '../../../../services/audio/backgroundMusicCatalog';
import type { BackgroundMusicChoice } from '../../../../types/audio';
import { SoundIcon } from '../../../../components/audio/SoundIcon';
import { soundLabelKey, soundLibraryChoices } from './audioSheetModel';

type SoundAvailability = ReturnType<typeof useBackgroundSoundAvailability>[BackgroundMusicChoice];

const COLUMNS = 3;

const needsDownload = (availability: SoundAvailability | undefined) =>
  availability === 'remote' || availability === 'failed';

interface SoundTileProps {
  choice: BackgroundMusicChoice;
  isSelected: boolean;
  availability: SoundAvailability | undefined;
  onSelect: (choice: BackgroundMusicChoice) => void;
}

function SoundTile({ choice, isSelected, availability, onSelect }: SoundTileProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const name = t(soundLabelKey(choice));
  const isDownloading = availability === 'downloading';
  const foreground = isSelected ? colors.onAccentSurface : colors.biblePrimaryText;
  const status = isDownloading
    ? t('audio.soundDownloading')
    : needsDownload(availability)
      ? t('audio.soundNotDownloaded')
      : undefined;

  return (
    <TouchableOpacity
      style={[
        styles.tile,
        isSelected
          ? { backgroundColor: colors.accentSurface, borderColor: colors.accentSurface }
          : { backgroundColor: colors.bibleElevatedSurface, borderColor: colors.bibleDivider },
      ]}
      onPress={() => onSelect(choice)}
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityValue={status ? { text: status } : undefined}
      accessibilityState={{ selected: isSelected, busy: isDownloading }}
    >
      <SoundIcon choice={choice} size={24} color={foreground} />
      <Text style={[styles.tileName, { color: foreground }]} numberOfLines={2}>
        {name}
      </Text>
      {isSelected ? (
        <View style={[styles.cornerBadge, styles.selectedBadge]} testID="sound-tile-selected">
          <Check size={14} color={foreground} />
        </View>
      ) : null}
      {isDownloading ? (
        <View style={[styles.cornerBadge, styles.statusBadge]} testID="sound-tile-downloading">
          <ActivityIndicator size="small" color={foreground} />
        </View>
      ) : needsDownload(availability) ? (
        <View style={[styles.cornerBadge, styles.statusBadge]} testID="sound-tile-download-badge">
          <CloudDownload size={14} color={isSelected ? foreground : colors.bibleSecondaryText} />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export interface SoundLibraryPageProps {
  backgroundMusicChoice: BackgroundMusicChoice;
  changeBackgroundMusicChoice: (choice: BackgroundMusicChoice) => void;
}

/** Every background sound as one flat grid: Off, Shuffle, then the catalog. */
export function SoundLibraryPage({
  backgroundMusicChoice,
  changeBackgroundMusicChoice,
}: SoundLibraryPageProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const availability = useBackgroundSoundAvailability();
  const choices = soundLibraryChoices(BACKGROUND_MUSIC_OPTIONS);
  const rows: BackgroundMusicChoice[][] = [];
  for (let index = 0; index < choices.length; index += COLUMNS) {
    rows.push(choices.slice(index, index + COLUMNS));
  }

  return (
    <View style={styles.page}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((choice) => (
            <SoundTile
              key={choice}
              choice={choice}
              isSelected={choice === backgroundMusicChoice}
              availability={availability[choice]}
              onSelect={changeBackgroundMusicChoice}
            />
          ))}
          {/* Keep a short last row on the same column grid. */}
          {Array.from({ length: COLUMNS - row.length }, (_, index) => (
            <View key={`spacer-${index}`} style={styles.spacer} />
          ))}
        </View>
      ))}
      <Text style={[styles.footnote, { color: colors.bibleSecondaryText }]}>
        {t('audio.soundLibraryFootnote')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tile: {
    flex: 1,
    minHeight: 92,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.md,
  },
  spacer: {
    flex: 1,
  },
  tileName: {
    ...typography.label,
    textAlign: 'center',
  },
  cornerBadge: {
    position: 'absolute',
    top: spacing.xs,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedBadge: {
    right: spacing.xs,
  },
  statusBadge: {
    left: spacing.xs,
  },
  footnote: {
    ...typography.caption,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
