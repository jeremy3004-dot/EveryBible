import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { TAB_BAR_CAPSULE_RADIUS } from '../../hooks/useTabBarHeight';
import { getTabBarGlassTint, TAB_BAR_GLASS_EFFECT_STYLE } from '../tabBarCapsuleStyle';

// Liquid glass capsule. On iOS 26+ it is frosted regular glass tinted lightly with
// the page colour, with nothing opaque behind it, so it reads as glass; the frosting
// (not clear, lensing glass) keeps verse text behind it from smearing through the
// labels. Older platforms get a blur under the paper fill and a hairline edge.
export function TabBarBackground({
  isDark,
  fill,
  stroke,
}: {
  isDark: boolean;
  fill: string;
  stroke: string;
}) {
  if (Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable()) {
    return (
      <View style={styles.capsule} pointerEvents="none">
        <GlassView
          pointerEvents="none"
          glassEffectStyle={TAB_BAR_GLASS_EFFECT_STYLE}
          tintColor={getTabBarGlassTint(fill)}
          colorScheme={isDark ? 'dark' : 'light'}
          style={styles.capsule}
        />
      </View>
    );
  }
  return (
    <View style={styles.capsule} pointerEvents="none">
      <BlurView
        intensity={Platform.OS === 'ios' ? 40 : 24}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
      <View style={[StyleSheet.absoluteFill, styles.capsuleStroke, { borderColor: stroke }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  capsule: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: TAB_BAR_CAPSULE_RADIUS,
    overflow: 'hidden',
  },
  capsuleStroke: {
    borderRadius: TAB_BAR_CAPSULE_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
