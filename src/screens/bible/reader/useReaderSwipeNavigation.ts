import type { AudioPlaybackSequenceEntry } from '../../../types/audio';
import type { RhythmSessionContext } from '../../../services/plans/types';
import { useCallback, useRef } from 'react';
import { BackHandler } from 'react-native';
import { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { Gesture } from 'react-native-gesture-handler';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getTranslatedBookName } from '../../../constants';
import { lightHaptic } from '../../../utils/haptics';
import { announceForAccessibility } from '../../../utils/a11y';
import { resolveSwipeChapterNavigation } from '../bibleReaderModel';
import { rootNavigationRef } from '../../../navigation/rootNavigation';

export interface UseReaderSwipeNavigationInput {
  activePlanId: string | undefined;
  activeRhythmSession: RhythmSessionContext | null;
  handleNextReadChapter: () => Promise<void>;
  handlePreviousReadChapter: () => Promise<void>;
  hasNextChapter: boolean;
  hasPrevChapter: boolean;
  nextNavigationTarget: AudioPlaybackSequenceEntry | null;
  previousNavigationTarget: AudioPlaybackSequenceEntry | null;
  showPlanSessionChrome: boolean;
}

/** Swiping between chapters in read mode (with haptics and the model's thresholds), plus leaving a plan session back to its plan. */
export function useReaderSwipeNavigation({
  activePlanId,
  activeRhythmSession,
  handleNextReadChapter,
  handlePreviousReadChapter,
  hasNextChapter,
  hasPrevChapter,
  nextNavigationTarget,
  previousNavigationTarget,
  showPlanSessionChrome,
}: UseReaderSwipeNavigationInput) {
  const { t } = useTranslation();
  const swipeX = useSharedValue(0);
  const swipeInFlightRef = useRef(false);

  const handleSwipeNavigation = (direction: 'next' | 'prev') => {
    if (swipeInFlightRef.current) return;
    swipeInFlightRef.current = true;

    // The swipe repaints the page silently; a screen reader would otherwise
    // land in a new chapter with no signal that the reference changed.
    const swipeTarget = direction === 'next' ? nextNavigationTarget : previousNavigationTarget;
    if (swipeTarget) {
      announceForAccessibility(
        `${getTranslatedBookName(swipeTarget.bookId, t)} ${swipeTarget.chapter}`
      );
    }

    if (direction === 'next') {
      void handleNextReadChapter().finally(() => {
        setTimeout(() => {
          swipeInFlightRef.current = false;
        }, 150);
      });
    } else {
      void handlePreviousReadChapter().finally(() => {
        setTimeout(() => {
          swipeInFlightRef.current = false;
        }, 150);
      });
    }
  };

  // A plan session is opened from the Plans tab into the Bible tab's stack, so
  // nothing native sits behind it: every way out (top chevron, back swipe past
  // the first session chapter, Android back) routes through here to the plan.
  const handleExitPlanSession = useCallback(() => {
    if (!showPlanSessionChrome || !activePlanId || !rootNavigationRef.isReady()) {
      return;
    }

    if (activeRhythmSession) {
      rootNavigationRef.navigate('Plans', {
        screen: 'RhythmDetail',
        params: { rhythmId: activeRhythmSession.rhythmId },
      });
      return;
    }

    rootNavigationRef.navigate('Plans', {
      screen: 'PlanDetail',
      params: { planId: activePlanId },
    });
  }, [activePlanId, activeRhythmSession, showPlanSessionChrome]);

  useFocusEffect(
    useCallback(() => {
      if (!showPlanSessionChrome) {
        return undefined;
      }

      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        handleExitPlanSession();
        return true;
      });
      return () => subscription.remove();
    }, [handleExitPlanSession, showPlanSessionChrome])
  );

  // Resolved on the JS thread so the shared, tested swipe model stays the single
  // source of truth for thresholds (worklets cannot call non-worklet functions).
  const handleSwipeEnd = (translationX: number, velocityX: number) => {
    if (swipeInFlightRef.current) return;

    const direction = resolveSwipeChapterNavigation({
      translationX,
      velocityX,
      hasNextChapter,
      hasPrevChapter,
      canExitSession: showPlanSessionChrome,
    });
    if (!direction) return;

    lightHaptic();
    if (direction === 'exit') {
      handleExitPlanSession();
      return;
    }
    handleSwipeNavigation(direction);
  };

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      'worklet';
      swipeX.value = event.translationX;
    })
    .onEnd((event) => {
      'worklet';
      runOnJS(handleSwipeEnd)(event.translationX, event.velocityX);
      swipeX.value = withSpring(0, { damping: 30, stiffness: 300 });
    });

  const swipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipeX.value }],
  }));

  return { handleExitPlanSession, swipeGesture, swipeStyle };
}
