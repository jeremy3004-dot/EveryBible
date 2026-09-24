import { useEffect, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, SlideInDown, useReducedMotion } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useDisplayFont } from '../../hooks/useDisplayFont';
import { motion, radius, shadows, spacing, typography } from '../../design/system';
import { DISPLAY_TEXT_MAX_FONT_SCALE } from '../../design/largeTextLayout';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  /**
   * Styles the sheet surface. A caller that sets its own `height` keeps it: the
   * default height cap and the scrolling body are then left out, so a sheet
   * that lays out its own list (or `flex: 1` content) behaves as before.
   */
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
//
// Height: the sheet grows with its content up to a share of the window below
// the status bar, then its body scrolls (handle and title stay put). Without
// the cap a body that outgrows the screen at large text was cut off at the top.
// The cap is a share rather than the full height so a strip of backdrop stays
// visible to tap away.
const SHEET_MAX_HEIGHT_SHARE = 0.9;

export function Sheet({ visible, onClose, children, title, contentStyle, closeLabel }: SheetProps) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const displayFont = useDisplayFont();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const hasOwnHeight = StyleSheet.flatten(contentStyle)?.height != null;
  const maxHeight = Math.round((windowHeight - insets.top) * SHEET_MAX_HEIGHT_SHARE);

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
          // Filling the modal below the status bar, the avoider's keyboard
          // padding (or Android's shrunken height) takes room from the sheet,
          // which shrinks and scrolls rather than pushing its top off screen.
          style={[styles.avoider, { paddingTop: insets.top }]}
          pointerEvents="box-none"
        >
          <Animated.View
            entering={entering}
            // Scope VoiceOver to the sheet while it is up, so swiping does not
            // wander back into the screen behind it. iOS-only: Android uses
            // importantForAccessibility, which the RN Modal already applies.
            accessibilityViewIsModal={Platform.OS === 'ios'}
            // VoiceOver's two-finger scrub ("escape") closes the sheet, as the
            // Android back button does through onRequestClose. An RN Modal does
            // not answer the gesture on its own.
            onAccessibilityEscape={onClose}
            style={[
              styles.sheet,
              shadows.floating,
              {
                backgroundColor: colors.cardBackground,
                paddingBottom: insets.bottom + spacing.lg,
              },
              hasOwnHeight ? null : [styles.boundedSheet, { maxHeight }],
              contentStyle,
            ]}
          >
            <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
            {title ? (
              <Text
                maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
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
            {hasOwnHeight ? (
              children
            ) : (
              <ScrollView
                style={styles.body}
                // A tap on a button while the keyboard is up should press it,
                // not only dismiss the keyboard.
                keyboardShouldPersistTaps="handled"
                alwaysBounceVertical={false}
              >
                {children}
              </ScrollView>
            )}
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
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  boundedSheet: {
    flexShrink: 1,
  },
  body: {
    flexGrow: 0,
    flexShrink: 1,
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
