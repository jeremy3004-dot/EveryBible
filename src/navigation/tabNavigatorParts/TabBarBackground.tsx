import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { TAB_BAR_CAPSULE_RADIUS } from '../../hooks/useTabBarHeight';
import { TAB_BAR_GLASS_EFFECT_STYLE } from '../tabBarCapsuleStyle';

// Liquid glass capsule. On iOS 26+ the paper backing sits BEHIND frosted
// regular glass, so the glass samples mostly paper and verse text under the bar
// cannot lens through the labels; older platforms get a blur under the same
// paper tint. Both keep a little translucency so the bar floats over the page.
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
        <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
        <GlassView
          pointerEvents="none"
          glassEffectStyle={TAB_BAR_GLASS_EFFECT_STYLE}
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
