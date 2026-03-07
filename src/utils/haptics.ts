import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const isHapticsSupported = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * Light haptic feedback for subtle interactions
 * Use for: toggles, minor selections, swipes
 */
export const lightHaptic = () => {
  if (isHapticsSupported) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
};

/**
 * Medium haptic feedback for standard interactions
 * Use for: button taps, page changes, confirming actions
 */
export const mediumHaptic = () => {
  if (isHapticsSupported) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }
};

/**
 * Heavy haptic feedback for important interactions
 * Use for: completing tasks, significant state changes
 */
export const heavyHaptic = () => {
  if (isHapticsSupported) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }
};

/**
 * Success haptic feedback
 * Use for: successful completion of actions
 */
export const successHaptic = () => {
  if (isHapticsSupported) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
};

/**
 * Warning haptic feedback
 * Use for: warnings, confirmations needed
 */
export const warningHaptic = () => {
  if (isHapticsSupported) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }
};

/**
 * Error haptic feedback
 * Use for: errors, failed actions
 */
export const errorHaptic = () => {
  if (isHapticsSupported) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }
};

/**
 * Selection haptic feedback
 * Use for: picker selections, segment controls
 */
export const selectionHaptic = () => {
  if (isHapticsSupported) {
    Haptics.selectionAsync();
  }
};
