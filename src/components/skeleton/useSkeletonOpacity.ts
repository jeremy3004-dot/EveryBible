import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

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

/**
 * The opacity a skeleton bar draws with: the shared pulse, or a still mid-point
 * under reduced motion. Nothing animates until the OS setting has been read.
 */
export function useSkeletonOpacity(): Animated.AnimatedInterpolation<number> | number {
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => active && setReduceMotion(enabled))
      .catch(() => active && setReduceMotion(false));
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      listener.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion !== false) return undefined;
    acquirePulse();
    return releasePulse;
  }, [reduceMotion]);

  return reduceMotion === false ? getPulse() : STILL_OPACITY;
}
