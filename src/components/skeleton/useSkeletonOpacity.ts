import { useEffect, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Animated, Easing, unstable_batchedUpdates } from 'react-native';

// Mid-point of the pulse, held while the OS asks for reduced motion.
const STILL_OPACITY = 0.5;

// One pulse drives every bar on screen (a chapter skeleton mounts ~20), so one loop runs
// however many bars are mounted. Created on first use so importing costs nothing.
let pulseOpacity: Animated.AnimatedInterpolation<number> | null = null;
let pulseLoop: Animated.CompositeAnimation | null = null;
let subscribers = 0;

function getPulse(): Animated.AnimatedInterpolation<number> {
  if (!pulseOpacity) {
    const value = new Animated.Value(0);
    pulseOpacity = value.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });
    pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
  }
  return pulseOpacity;
}

function acquirePulse() {
  getPulse();
  if (subscribers === 0) {
    // Animated.loop stays finished after stop(); without reset() a later start() does
    // nothing and every skeleton after the first would sit still.
    pulseLoop?.reset();
    pulseLoop?.start();
  }
  subscribers += 1;
}

function releasePulse() {
  subscribers -= 1;
  if (subscribers === 0) pulseLoop?.stop();
}

// The OS reduce-motion setting as last read, shared by every bar: one query and one
// listener per skeleton instead of one per bar. Each bar's own answer used to re-render
// the app tree separately (the old architecture does not batch updates made outside
// events), ~20 passes for one chapter skeleton.
let reduceMotionSetting: boolean | null = null;
const reduceMotionListeners = new Set<() => void>();
let reduceMotionSubscription: { remove: () => void } | null = null;

function setReduceMotionSetting(enabled: boolean) {
  if (enabled === reduceMotionSetting) return;
  reduceMotionSetting = enabled;
  unstable_batchedUpdates(() => reduceMotionListeners.forEach((listener) => listener()));
}

function subscribeToReduceMotion(listener: () => void) {
  if (reduceMotionListeners.size === 0) {
    // Read again for each skeleton, in case the setting changed while none was mounted.
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotionSetting)
      .catch(() => setReduceMotionSetting(reduceMotionSetting ?? false));
    reduceMotionSubscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotionSetting
    );
  }
  reduceMotionListeners.add(listener);
  return () => {
    reduceMotionListeners.delete(listener);
    if (reduceMotionListeners.size === 0) {
      reduceMotionSubscription?.remove();
      reduceMotionSubscription = null;
    }
  };
}

const getReduceMotionSetting = () => reduceMotionSetting;

/**
 * The opacity a skeleton bar draws with: the shared pulse, or a still mid-point
 * under reduced motion. Nothing animates until the OS setting has been read once;
 * later skeletons start from the last answer while it is read again.
 */
export function useSkeletonOpacity(): Animated.AnimatedInterpolation<number> | number {
  const reduceMotion = useSyncExternalStore(subscribeToReduceMotion, getReduceMotionSetting);

  useEffect(() => {
    if (reduceMotion !== false) return undefined;
    acquirePulse();
    return releasePulse;
  }, [reduceMotion]);

  return reduceMotion === false ? getPulse() : STILL_OPACITY;
}
