import { Text } from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { CircleAlert } from 'lucide-react-native';
import { useTheme } from '../../../contexts/ThemeContext';
import { motion } from '../../../design/system';
import { useAuthScreenStyles } from './authScreenStyles';

/** A field's validation message: fades and slides in (opacity only under reduced motion). */
export function AuthFieldError({ message }: { message: string }) {
  const { colors } = useTheme();
  const styles = useAuthScreenStyles();
  const reduceMotion = useReducedMotion();
  const entering = reduceMotion
    ? FadeIn.duration(motion.duration.base)
    : FadeInDown.duration(motion.duration.fast);

  return (
    <Animated.View entering={entering} style={styles.errorRow} accessibilityLiveRegion="polite">
      <CircleAlert size={14} color={colors.error} strokeWidth={2} accessible={false} />
      <Text style={styles.errorText}>{message}</Text>
    </Animated.View>
  );
}
