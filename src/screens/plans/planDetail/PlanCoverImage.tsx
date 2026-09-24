import { Image, StyleSheet, View } from 'react-native';
import { BookOpen } from 'lucide-react-native';
import { useTheme } from '../../../contexts/ThemeContext';
import { getReadingPlanCoverSource } from '../../../services/plans/readingPlanAssets';
import type { ReadingPlan } from '../../../services/plans/types';

interface PlanCoverImageProps {
  plan: ReadingPlan;
  width: number;
  height: number;
  borderRadius: number;
}

/** A plan's cover photograph at a fixed size, or a book glyph when it has none. */
export function PlanCoverImage({ plan, width, height, borderRadius }: PlanCoverImageProps) {
  const { colors } = useTheme();
  const source = getReadingPlanCoverSource(plan);
  if (!source) {
    return (
      <View
        style={[
          styles.fallback,
          { width, height, borderRadius, backgroundColor: colors.accentSecondary },
        ]}
      >
        <BookOpen size={Math.round(width * 0.28)} color={colors.secondaryText} strokeWidth={2} />
      </View>
    );
  }
  return (
    <Image
      source={source}
      style={{ width, height, borderRadius }}
      resizeMode="cover"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
