import { useEffect, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, SlideInDown, useReducedMotion } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useDisplayFont } from '../../hooks';
import { motion, radius, shadows, spacing, typography } from '../../design/system';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  contentStyle?: StyleProp<ViewStyle>;
  /**
   * Accessible label for the dismiss backdrop. Defaults to the translated
   * "Close" — the backdrop is the only dismiss affordance a sheet is guaranteed
   * to have, so it must never be an unnamed button.
   */
  closeLabel?: string;
}

// THE bottom sheet: sheet-radius top corners, one pill-handle recipe, a blurred
// (iOS) + dimmed backdrop, a spring slide-in, keyboard avoidance, and the
// floating shadow. All modal surfaces adopt this so sheets feel identical.
export function Sheet({ visible, onClose, children, title, contentStyle, closeLabel }: SheetProps) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const displayFont = useDisplayFont();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const resolvedCloseLabel = closeLabel ?? t('interface.close');

  // A sheet slides in over the screen without moving focus on its own, so the
  // title is announced when it opens; otherwise the user hears nothing and has
  // to hunt for what changed.
  useEffect(() => {
    if (visible && title) {
      AccessibilityInfo.announceForAccessibility(title);
    }
  }, [visible, title]);

  const entering = reduceMotion
    ? FadeIn.duration(motion.duration.base)
    : SlideInDown.springify().damping(motion.spring.damping).stiffness(motion.spring.stiffness);

  return (
    <Modal
      visible={visible}
      transparent
      // Android edge-to-edge: without both flags the modal is inset by the
      // system bars and the sheet floats above the gesture bar instead of
      // sitting on the bottom edge.
      statusBarTranslucent
      navigationBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        {Platform.OS === 'ios' ? (
          <BlurView
            intensity={20}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {/* The backdrop stays an announced, reachable button rather than being
            hidden from assistive tech: no Sheet call site renders a visible
            close control, so tapping outside is the only way out. Ordering is
            handled instead by accessibilityViewIsModal on the sheet below,
            which scopes VoiceOver to the sheet content on iOS. */}
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={resolvedCloseLabel}
        />
        <KeyboardAvoidingView
          // `undefined` on Android left a focused input under the keyboard,
          // because edge-to-edge makes the window's own adjustResize inert.
          // 'height' re-shrinks the avoider; the offset accounts for the
          // translucent status bar the modal now draws behind.
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'android' ? insets.top : 0}
          style={styles.avoider}
          pointerEvents="box-none"
        >
          <Animated.View
            entering={entering}
            // Scope VoiceOver to the sheet while it is up, so swiping does not
            // wander back into the screen behind it. iOS-only: Android uses
            // importantForAccessibility, which the RN Modal already applies.
            accessibilityViewIsModal={Platform.OS === 'ios'}
            style={[
              styles.sheet,
              shadows.floating,
              {
                backgroundColor: colors.cardBackground,
                paddingBottom: insets.bottom + spacing.lg,
              },
              contentStyle,
            ]}
          >
            <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
            {title ? (
              <Text
                style={[
                  typography.pageTitle,
                  displayFont.bold,
                  styles.title,
                  { color: colors.primaryText },
                ]}
              >
                {title}
              </Text>
            ) : null}
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  avoider: {
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: {
    marginBottom: spacing.md,
  },
});
