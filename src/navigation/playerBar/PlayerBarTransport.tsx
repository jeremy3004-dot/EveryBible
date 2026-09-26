import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
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

const PLAY_TILE_SIZE = 42;
const PLAY_TILE_RADIUS = 12;
const SOUND_BADGE_SIZE = 32;
const TOUCH = layout.minTouchTarget;
/** How small the controls get in the collapsed strip (24pt chevrons become ~21pt). */
const STRIP_SCALE = 0.88;

interface PlayerBarTransportProps {
  controller: PlayerBarController;
  palette: PlayerBarPalette;
  /** 0 expanded → 1 collapsed into the strip; the row shrinks with it (UI thread). */
  collapse?: SharedValue<number>;
}

/**
 * The player row's five controls, left to right: the background sound, previous,
 * play/pause, next and Selah. No text: the chapter, verse and time are left to the screen.
 *
 * One row serves both the expanded bar and the collapsed strip. As the bar collapses
 * the row shrinks into the strip and only the play tile and the sound badge fade, so
 * the controls never disappear. (Cross-fading two separate rows left a moment with
 * neither on screen: the owner saw the bar blink.)
 */
export const PlayerBarTransport = memo(function PlayerBarTransport({
  controller,
  palette,
  collapse,
}: PlayerBarTransportProps) {
  const { t } = useTranslation();
  const chevronSize = 24;
  const rowStyle = useAnimatedStyle(() => {
    const c = collapse ? Math.min(1, Math.max(0, collapse.value)) : 0;
    return {
      height: PLAYER_BAR_ROW_HEIGHT + (PLAYER_BAR_STRIP_HEIGHT - PLAYER_BAR_ROW_HEIGHT) * c,
      transform: [{ scale: 1 + (STRIP_SCALE - 1) * c }],
    };
  });
  const decorationStyle = useAnimatedStyle(() => ({
    opacity: collapse ? 1 - Math.min(1, Math.max(0, collapse.value)) : 1,
  }));
  const NextIcon = controller.nextIsCompletion ? Check : ChevronRight;
  const playLabel = t(
    controller.showsPause ? 'interface.pauseChapterAudio' : 'interface.playChapterAudio'
  );

  const row = (
    <Animated.View style={[styles.row, rowStyle]}>
      <Pressable
        onPress={controller.onSound}
        hitSlop={(TOUCH - SOUND_BADGE_SIZE) / 2}
        accessibilityRole="button"
        accessibilityLabel={controller.soundAccessibilityLabel}
        accessibilityHint={controller.soundAccessibilityHint}
        testID="player-bar-sound"
        style={styles.soundBadge}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.badgeBacking,
            { backgroundColor: palette.tile, borderColor: palette.hairline },
            decorationStyle,
          ]}
        />
        <SoundIcon
          choice={controller.soundChoice}
          size={16}
          color={palette.ink}
          strokeWidth={1.8}
        />
      </Pressable>

      <View style={styles.transport}>
        <Pressable
          onPress={controller.onPrevious}
          disabled={!controller.hasPrevious}
          accessibilityRole="button"
          accessibilityLabel={t('audio.previousChapter')}
          accessibilityState={{ disabled: !controller.hasPrevious }}
          style={styles.button}
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
            accessibilityRole="button"
            accessibilityLabel={playLabel}
            accessibilityState={{ busy: controller.isLoading, disabled: controller.isLoading }}
            testID="reader-play-pause"
            style={styles.button}
          >
            <View style={styles.playTile}>
              {/* The tile fades as the bar collapses; the glyph itself stays. */}
              <Animated.View
                pointerEvents="none"
                testID="player-bar-play-tile"
                style={[
                  styles.tileBacking,
                  { backgroundColor: palette.tile, borderColor: palette.hairline },
                  decorationStyle,
                ]}
              />
              <OutlinedPlayPauseGlyph
                playing={controller.showsPause}
                size={24}
                color={palette.accent}
              />
            </View>
          </Pressable>
        ) : (
          <View style={styles.button} />
        )}

        <Pressable
          onPress={controller.onNext}
          disabled={!controller.hasNext}
          accessibilityRole="button"
          accessibilityLabel={controller.nextAccessibilityLabel}
          accessibilityHint={controller.nextAccessibilityHint}
          accessibilityState={{ disabled: !controller.hasNext }}
          style={styles.button}
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
      <View style={styles.button}>
        <SelahButton size="regular" tone={controller.scope === 'reader' ? 'reader' : 'app'} />
      </View>
    </Animated.View>
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
    flexDirection: 'row',
    alignItems: 'center',
    height: PLAYER_BAR_ROW_HEIGHT,
    paddingHorizontal: 8,
    justifyContent: 'space-between',
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  button: {
    width: TOUCH,
    height: TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soundBadge: {
    width: SOUND_BADGE_SIZE,
    height: SOUND_BADGE_SIZE,
    marginHorizontal: (TOUCH - SOUND_BADGE_SIZE) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeBacking: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: SOUND_BADGE_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  playTile: {
    width: PLAY_TILE_SIZE,
    height: PLAY_TILE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileBacking: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: PLAY_TILE_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
