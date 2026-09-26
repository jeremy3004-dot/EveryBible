import { memo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';
import { motion } from '../../design/system';
import { TAB_BAR_CAPSULE_RADIUS } from '../../hooks/useTabBarHeight';
import {
  getPlayerBarCapsuleHeight,
  getPlayerBarCollapseMode,
  getPlayerBarHideTranslation,
  getPlayerBarPhase,
  getPlayerBarProgress,
  getPlayerBarProgressLineTop,
  getPlayerBarRowOpacities,
  PLAYER_BAR_PROGRESS_INSET,
  PLAYER_BAR_ROW_HEIGHT,
  PLAYER_BAR_SECTION_HEIGHT,
  PLAYER_BAR_STRIP_HEIGHT,
  type PlayerBarPhase,
} from '../readerTabBarMotion';
import { getPlayerBarPalette, type PlayerBarScope } from './playerBarModel';
import { PlayerBarNotices, PlayerBarProgressFill } from './PlayerBarParts';
import { PlayerBarTransport } from './PlayerBarTransport';
import { usePlayerBarController } from './usePlayerBarController';

const HIDDEN = {
  pointerEvents: 'none',
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;
const LIVE = {
  pointerEvents: 'box-none',
  accessibilityElementsHidden: false,
  importantForAccessibility: 'auto',
} as const;
const liveWhen = (live: boolean) => (live ? LIVE : HIDDEN);

export interface PlayerBarProps {
  scope: PlayerBarScope;
  /** The reader's scroll collapse, 0 (shown) to 1 (collapsed), driven on the UI thread. */
  progress: SharedValue<number>;
  /** Whether this bar collapses with the reader's scroll at all. */
  followsScroll: boolean;
  /** Gap between the capsule's lower edge and the screen bottom. */
  bottomOffset: number;
  /** Where the collapsed strip settles, when that differs (the plan-session bar drops to the edge). */
  collapsedBottomOffset?: number;
  sideInset: number;
  /** The capsule's material (glass over the scope's paper). */
  background: ReactNode;
  /** The tab row under the player, if this bar has one. */
  tabRow?: ReactNode;
  tabRowHeight?: number;
  /** Placement a route's own collapse or hide applies on top (transform, display). */
  frameStyle?: ViewStyle;
}

/**
 * The fused player and tab bar: one capsule holding the player row, its progress
 * line and the tab row. As the reader scrolls down it either shrinks into a 38pt
 * icon-only strip (audio loaded) or slides away leaving a hairline (nothing
 * loaded). The motion runs on the UI thread; only the phase boundary crosses to
 * JS, to hand touch and screen-reader focus to whichever row is live.
 */
export const PlayerBar = memo(function PlayerBar({
  scope,
  progress,
  followsScroll,
  bottomOffset,
  collapsedBottomOffset = bottomOffset,
  sideInset,
  background,
  tabRow,
  tabRowHeight = 0,
  frameStyle,
}: PlayerBarProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const palette = getPlayerBarPalette(colors, scope);
  const { controller, audioLoaded } = usePlayerBarController(scope);
  const hasPlayerRow = controller != null;
  const hasTabRow = tabRow != null;
  const mode = getPlayerBarCollapseMode(hasPlayerRow, audioLoaded);
  const expandedHeight =
    (hasPlayerRow ? PLAYER_BAR_SECTION_HEIGHT : 0) + (hasTabRow ? tabRowHeight : 0);
  const stripDrop = bottomOffset - collapsedBottomOffset;

  const [phase, setPhase] = useState<PlayerBarPhase>('expanded');
  useAnimatedReaction(
    () => getPlayerBarPhase(mode, getPlayerBarProgress(followsScroll, progress.value)),
    (next, previous) => {
      if (next !== previous) {
        runOnJS(setPhase)(next);
      }
    },
    [mode, followsScroll]
  );

  const motionStyle = useAnimatedStyle(() => {
    const p = getPlayerBarProgress(followsScroll, progress.value);
    const drop =
      getPlayerBarHideTranslation(mode, p, expandedHeight, bottomOffset) +
      (mode === 'strip' ? stripDrop * p : 0);
    return { transform: [{ translateY: drop }] };
  });
  const capsuleStyle = useAnimatedStyle(() => {
    const p = getPlayerBarProgress(followsScroll, progress.value);
    const height = getPlayerBarCapsuleHeight(expandedHeight, mode, p);
    return { height, borderRadius: Math.min(TAB_BAR_CAPSULE_RADIUS, height / 2) };
  });
  const expandedRowStyle = useAnimatedStyle(() => ({
    opacity: getPlayerBarRowOpacities(mode, getPlayerBarProgress(followsScroll, progress.value))
      .expanded,
  }));
  const stripRowStyle = useAnimatedStyle(() => ({
    opacity: getPlayerBarRowOpacities(mode, getPlayerBarProgress(followsScroll, progress.value))
      .strip,
  }));
  const tabRowStyle = useAnimatedStyle(() => ({
    opacity:
      mode === 'strip'
        ? getPlayerBarRowOpacities(mode, getPlayerBarProgress(followsScroll, progress.value))
            .expanded
        : 1,
  }));
  const progressLineStyle = useAnimatedStyle(() => ({
    top: getPlayerBarProgressLineTop(mode, getPlayerBarProgress(followsScroll, progress.value)),
  }));
  const hairlineStyle = useAnimatedStyle(() => ({
    opacity: mode === 'hide' ? getPlayerBarProgress(followsScroll, progress.value) : 0,
  }));

  const revealBar = () => {
    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared values are written through `.value`.
    progress.value = reduceMotion ? 0 : withTiming(0, { duration: motion.duration.base });
  };

  const livePhase = followsScroll ? phase : 'expanded';
  const barLive = livePhase !== 'hidden';
  const expandedLive = livePhase === 'expanded';
  const stripLive = livePhase === 'strip';

  return (
    <View
      style={[styles.frame, { start: sideInset, end: sideInset, bottom: bottomOffset }, frameStyle]}
      pointerEvents="box-none"
    >
      <Animated.View style={motionStyle} {...liveWhen(barLive)} testID="player-bar">
        <PlayerBarNotices
          errorMessage={scope === 'reader' ? (controller?.errorMessage ?? null) : null}
        />
        <Animated.View style={[styles.capsule, capsuleStyle]} pointerEvents="box-none">
          <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="player-bar-material">
            {background}
          </View>
          {controller ? (
            <>
              <Animated.View
                style={[styles.expandedRow, expandedRowStyle]}
                {...liveWhen(expandedLive)}
                testID="player-bar-row"
              >
                <PlayerBarTransport controller={controller} palette={palette} variant="expanded" />
              </Animated.View>
              {mode === 'strip' ? (
                <Animated.View
                  style={[styles.stripRow, stripRowStyle]}
                  {...liveWhen(stripLive)}
                  testID="player-bar-strip"
                >
                  <PlayerBarTransport controller={controller} palette={palette} variant="strip" />
                </Animated.View>
              ) : null}
              <Animated.View style={[styles.progressLine, progressLineStyle]} pointerEvents="none">
                <PlayerBarProgressFill active={controller.showsProgress} palette={palette} />
              </Animated.View>
            </>
          ) : null}
          {hasTabRow ? (
            <Animated.View
              style={[
                styles.tabRow,
                { top: hasPlayerRow ? PLAYER_BAR_SECTION_HEIGHT : 0, height: tabRowHeight },
                tabRowStyle,
              ]}
              {...liveWhen(expandedLive)}
              testID="player-bar-tabs"
            >
              {tabRow}
            </Animated.View>
          ) : null}
        </Animated.View>
      </Animated.View>

      {/* Nothing loaded and scrolled away: a hairline at the bottom calls the bar back. */}
      <Animated.View
        style={[styles.hairlineFrame, { bottom: -bottomOffset }, hairlineStyle]}
        {...liveWhen(livePhase === 'hidden')}
      >
        <Pressable
          onPress={revealBar}
          accessibilityRole="button"
          accessibilityLabel={t('audio.playerBar.showControls')}
          accessibilityHint={t('audio.playerBar.showControlsHint')}
          testID="player-bar-hairline"
          style={styles.hairlineTouch}
        >
          <View style={[styles.hairline, { backgroundColor: palette.muted }]} />
        </Pressable>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  frame: {
    position: 'absolute',
  },
  capsule: {
    overflow: 'hidden',
    borderRadius: TAB_BAR_CAPSULE_RADIUS,
  },
  expandedRow: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    height: PLAYER_BAR_ROW_HEIGHT,
  },
  stripRow: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    height: PLAYER_BAR_STRIP_HEIGHT,
  },
  progressLine: {
    position: 'absolute',
    start: PLAYER_BAR_PROGRESS_INSET,
    end: PLAYER_BAR_PROGRESS_INSET,
  },
  tabRow: {
    position: 'absolute',
    start: 0,
    end: 0,
  },
  hairlineFrame: {
    position: 'absolute',
    start: 0,
    end: 0,
    alignItems: 'center',
  },
  hairlineTouch: {
    width: 120,
    height: 44,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 10,
  },
  hairline: {
    width: 44,
    height: 3,
    borderRadius: 1.5,
  },
});
