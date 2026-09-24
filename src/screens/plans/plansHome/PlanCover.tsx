import { Image, StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { TFunction } from 'i18next';
import { serifFamily } from '../../../design/fonts';
import type { ThemeColors } from '../../../contexts/ThemeContext';
import { getReadingPlanCoverSource } from '../../../services/plans/readingPlanAssets';
import type { ReadingPlan } from '../../../services/plans/types';

interface PlanCoverProps {
  plan: ReadingPlan;
  colors: ThemeColors;
  t: TFunction;
  initialSize: number;
}

// Fills whatever frame wraps it, so the caller owns the geometry (16:10 on the
// rhythm cards, 52pt square on the rows) and the 1px cardBorder frame.
export function PlanCover({ plan, colors, t, initialSize }: PlanCoverProps) {
  const source = getReadingPlanCoverSource(plan);
  if (source) {
    // RN injects the asset's intrinsic 320×180 size into the style unless the
    // style states its own frame, so absoluteFill alone would draw a fixed tile.
    return (
      <Image
        source={source}
        style={styles.image}
        resizeMode="cover"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      />
    );
  }
  // No artwork: a warm accent gradient with the plan's serif initial — a cover,
  // distinct from the icon-led empty state.
  const title = t(plan.title_key as Parameters<typeof t>[0], { defaultValue: plan.title_key });
  const initial = title.trim().charAt(0).toUpperCase() || '✦';
  return (
    <LinearGradient
      colors={[colors.accentSecondary, colors.accentPrimary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[StyleSheet.absoluteFill, styles.fallback]}
    >
      <Text
        style={{
          fontFamily: serifFamily(600),
          fontSize: initialSize,
          color: colors.onAccent,
        }}
      >
        {initial}
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  image: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
