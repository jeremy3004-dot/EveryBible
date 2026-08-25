import { type ReactNode } from 'react';
import {
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
import { useTheme } from '../../contexts/ThemeContext';
import { useDisplayFont } from '../../hooks';
import { motion, radius, shadows, spacing, typography } from '../../design/system';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  contentStyle?: StyleProp<ViewStyle>;
  /** Accessible label for the dismiss backdrop. */
  closeLabel?: string;
}

// THE bottom sheet: sheet-radius top corners, one pill-handle recipe, a blurred
// (iOS) + dimmed backdrop, a spring slide-in, keyboard avoidance, and the
// floating shadow. All modal surfaces adopt this so sheets feel identical.
export function Sheet({ visible, onClose, children, title, contentStyle, closeLabel }: SheetProps) {
  const { colors, isDark } = useTheme();
  const displayFont = useDisplayFont();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const entering = reduceMotion
    ? FadeIn.duration(motion.duration.base)
    : SlideInDown.springify().damping(motion.spring.damping).stiffness(motion.spring.stiffness);

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
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
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.avoider}
          pointerEvents="box-none"
        >
          <Animated.View
            entering={entering}
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
              <Text style={[typography.pageTitle, displayFont.bold, styles.title, { color: colors.primaryText }]}>
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
