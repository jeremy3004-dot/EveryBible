import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { OutlinedPlayPauseGlyph } from '../../components/audio/OutlinedPlayPauseGlyph';
import { SelahButton } from '../../components/audio/SelahButton';
import { SoundIcon } from '../../components/audio/SoundIcon';
import { layout } from '../../design/system';
import { mediumHaptic } from '../../utils/haptics';
import { PLAYER_BAR_ROW_HEIGHT, PLAYER_BAR_STRIP_HEIGHT } from '../readerTabBarMotion';
import type { PlayerBarPalette } from './playerBarModel';
import type { PlayerBarController } from './usePlayerBarController';

type Variant = 'expanded' | 'strip';

const PLAY_TILE_SIZE = 42;
const PLAY_TILE_RADIUS = 12;
const SOUND_BADGE_SIZE = 32;
const TOUCH = layout.minTouchTarget;
// The strip is 38pt tall; its buttons reach 44pt through slop above and below.
const STRIP_SLOP_Y = (TOUCH - PLAYER_BAR_STRIP_HEIGHT) / 2;
const STRIP_SLOP = { top: STRIP_SLOP_Y, bottom: STRIP_SLOP_Y, left: 0, right: 0 };

interface PlayerBarTransportProps {
  controller: PlayerBarController;
  palette: PlayerBarPalette;
  variant: Variant;
}

/**
 * The player row's five controls, left to right: the background sound, previous,
 * play/pause, next and Selah. The expanded row draws the play glyph on a soft tile
 * and the sound in a round badge; the collapsed strip keeps the same controls as
 * bare glyphs. No text: the chapter, verse and time are left to the screen.
 */
export const PlayerBarTransport = memo(function PlayerBarTransport({
  controller,
  palette,
  variant,
}: PlayerBarTransportProps) {
  const { t } = useTranslation();
  const isStrip = variant === 'strip';
  const hitSlop = isStrip ? STRIP_SLOP : undefined;
  const chevronSize = isStrip ? 20 : 24;
  const NextIcon = controller.nextIsCompletion ? Check : ChevronRight;
  const playLabel = t(
    controller.showsPause ? 'interface.pauseChapterAudio' : 'interface.playChapterAudio'
  );

  const row = (
    <View style={[styles.row, isStrip ? styles.stripRow : styles.expandedRow]}>
      <Pressable
        onPress={controller.onSound}
        hitSlop={isStrip ? hitSlop : (TOUCH - SOUND_BADGE_SIZE) / 2}
        accessibilityRole="button"
        accessibilityLabel={controller.soundAccessibilityLabel}
        accessibilityHint={controller.soundAccessibilityHint}
        testID={`player-bar-sound-${variant}`}
        style={[
          isStrip ? styles.stripButton : styles.soundBadge,
          isStrip ? null : { backgroundColor: palette.tile, borderColor: palette.hairline },
        ]}
      >
        <SoundIcon
          choice={controller.soundChoice}
          size={isStrip ? 18 : 16}
          color={palette.ink}
          strokeWidth={1.8}
        />
      </Pressable>

      <View style={isStrip ? styles.stripTransport : styles.transport}>
        <Pressable
          onPress={controller.onPrevious}
          disabled={!controller.hasPrevious}
          hitSlop={hitSlop}
          accessibilityRole="button"
          accessibilityLabel={t('audio.previousChapter')}
          accessibilityState={{ disabled: !controller.hasPrevious }}
          style={isStrip ? styles.stripButton : styles.button}
        >
          <ChevronLeft
            size={chevronSize}
            strokeWidth={2}
            color={controller.hasPrevious ? palette.ink : palette.muted}
          />
        </Pressable>

        {controller.showPlayButton ? (
          <Pressable
            onPress={() => {
              mediumHaptic();
              controller.onPlayPause();
            }}
            disabled={controller.isLoading}
            hitSlop={hitSlop}
            accessibilityRole="button"
            accessibilityLabel={playLabel}
            accessibilityState={{ busy: controller.isLoading, disabled: controller.isLoading }}
            testID={isStrip ? 'player-bar-play-strip' : 'reader-play-pause'}
            style={isStrip ? styles.stripButton : styles.button}
          >
            {isStrip ? (
              <OutlinedPlayPauseGlyph
                playing={controller.showsPause}
                size={22}
                color={palette.accent}
              />
            ) : (
              <View
                style={[
                  styles.playTile,
                  { backgroundColor: palette.tile, borderColor: palette.hairline },
                ]}
              >
                <OutlinedPlayPauseGlyph
                  playing={controller.showsPause}
                  size={24}
                  color={palette.accent}
                />
              </View>
            )}
          </Pressable>
        ) : (
          <View style={isStrip ? styles.stripButton : styles.button} />
        )}

        <Pressable
          onPress={controller.onNext}
          disabled={!controller.hasNext}
          hitSlop={hitSlop}
          accessibilityRole="button"
          accessibilityLabel={controller.nextAccessibilityLabel}
          accessibilityHint={controller.nextAccessibilityHint}
          accessibilityState={{ disabled: !controller.hasNext }}
          style={isStrip ? styles.stripButton : styles.button}
        >
          <NextIcon
            size={chevronSize}
            strokeWidth={2}
            color={
              !controller.hasNext
                ? palette.muted
                : controller.nextIsCompletion
                  ? palette.accent
                  : palette.ink
            }
          />
        </Pressable>
      </View>

      {/* Keeps its slot while Selah is unavailable, so the transport stays centred. */}
      <View style={isStrip ? styles.stripButton : styles.button}>
        <SelahButton
          size={isStrip ? 'compact' : 'regular'}
          tone={controller.scope === 'reader' ? 'reader' : 'app'}
        />
      </View>
    </View>
  );

  if (!controller.onRowPress) return row;
  // Off the reader, the row's empty space goes back to what is playing. The sound
  // button does the same for screen readers, so this wrapper is not an element.
  return (
    <Pressable onPress={controller.onRowPress} accessible={false} style={styles.fill}>
      {row}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  expandedRow: {
    height: PLAYER_BAR_ROW_HEIGHT,
    paddingHorizontal: 8,
    justifyContent: 'space-between',
  },
  stripRow: {
    height: PLAYER_BAR_STRIP_HEIGHT,
    paddingHorizontal: 12,
    justifyContent: 'space-between',
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stripTransport: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  button: {
    width: TOUCH,
    height: TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripButton: {
    width: TOUCH,
    height: PLAYER_BAR_STRIP_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soundBadge: {
    width: SOUND_BADGE_SIZE,
    height: SOUND_BADGE_SIZE,
    marginHorizontal: (TOUCH - SOUND_BADGE_SIZE) / 2,
    borderRadius: SOUND_BADGE_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playTile: {
    width: PLAY_TILE_SIZE,
    height: PLAY_TILE_SIZE,
    borderRadius: PLAY_TILE_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
