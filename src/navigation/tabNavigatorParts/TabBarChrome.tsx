import { StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { BookOpen, Calendar, Ellipsis, House, Users } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { PlatformPressable } from '@react-navigation/elements';
import type { RootTabIconName } from '../tabManifest';
import { typography } from '../../design/system';
import { CONTROL_LABEL_MAX_FONT_SCALE } from '../../design/largeTextLayout';

// The capsule material lives in its own module so the reader can draw it too.
export { TabBarBackground } from './TabBarBackground';

// Lucide ships one stroke weight per glyph, so the selected state is carried by
// the sliding accent pill behind the icon rather than a filled variant.
const TAB_BAR_ICON_SIZE = 22;
const TAB_BAR_ICON_STROKE_WIDTH = 2;
// The capsule is a fixed 64pt tall, so an unbounded accessibility text scale
// clips the label against the glyph. Cap the label's own scaling instead of
// letting it grow past the capsule.
const TAB_BAR_LABEL_MAX_FONT_SCALE = CONTROL_LABEL_MAX_FONT_SCALE;
// Each tab owns a fifth of the capsule (about 69pt on a 375pt phone). A label
// longer than that — Arabic "الكتاب المقدس" at the cap — shrinks to its slot
// rather than truncating, the way UITabBar fits its titles.
const TAB_BAR_LABEL_MIN_FONT_SCALE = 0.7;

// Binds each glyph the manifest names to its Lucide component.
const TAB_BAR_ICONS: Record<RootTabIconName, LucideIcon> = {
  house: House,
  'book-open': BookOpen,
  users: Users,
  calendar: Calendar,
  ellipsis: Ellipsis,
};

export function TabBarIcon({ iconName, color }: { iconName: RootTabIconName; color: string }) {
  const Icon = TAB_BAR_ICONS[iconName];
  return <Icon size={TAB_BAR_ICON_SIZE} color={color} strokeWidth={TAB_BAR_ICON_STROKE_WIDTH} />;
}

// Rendered by the navigator's tabBarLabel rather than left to the library so the
// label can cap its own font scaling inside the fixed-height capsule.
export function TabBarLabel({ label, color }: { label: string; color: string }) {
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={TAB_BAR_LABEL_MIN_FONT_SCALE}
      maxFontSizeMultiplier={TAB_BAR_LABEL_MAX_FONT_SCALE}
      style={[styles.tabLabel, { color }]}
    >
      {label}
    </Text>
  );
}

// Keep React Navigation semantics, test IDs, links, and all press callbacks intact.
export function TabBarButton(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable {...props} style={[props.style, styles.tabButton]}>
      <View style={styles.tabContent}>{props.children}</View>
    </PlatformPressable>
  );
}

const styles = StyleSheet.create({
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  // EL tab labels are a notch smaller than the shared tabLabel token so the
  // glyph and label both sit inside the 52pt selection pill.
  tabLabel: {
    ...typography.tabLabel,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
});

/**
 * The library boxes each glyph in 28pt; ours is 22, so that box added 3pt of air under
 * the icon before the gap. Sized to the glyph, the icon and its label sit closer (the
 * owner asked for this) while the capsule keeps its height.
 */
export const tabIconStyle = StyleSheet.create({
  tabIcon: {
    height: TAB_BAR_ICON_SIZE,
  },
}).tabIcon;

/** Fills the capsule height; the item adds no padding of its own. */
export const tabItemStyle = StyleSheet.create({
  tabItem: {
    height: '100%',
    paddingTop: 0,
    paddingBottom: 0,
  },
}).tabItem;
