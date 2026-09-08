import type { RootTabParamList } from './types';

/**
 * The Lucide glyph each root tab draws. Kept as a literal union rather than the
 * component itself so this manifest stays a pure data module — importing
 * `lucide-react-native` here would drag `react-native` into every consumer,
 * including the Node test runner. `TAB_BAR_ICONS` in TabNavigator binds each
 * name to its component.
 */
export type RootTabIconName = 'house' | 'book-open' | 'users' | 'calendar' | 'ellipsis';

export interface RootTabManifestEntry {
  name: keyof RootTabParamList;
  labelKey: string;
  /**
   * Lucide ships one stroke weight per glyph, so the selected state is carried
   * by the accent pill behind the icon rather than a filled variant.
   */
  iconName: RootTabIconName;
}

export const rootTabManifest: RootTabManifestEntry[] = [
  {
    name: 'Home',
    labelKey: 'tabs.home',
    iconName: 'house',
  },
  {
    name: 'Bible',
    labelKey: 'tabs.bible',
    iconName: 'book-open',
  },
  {
    name: 'Learn',
    labelKey: 'tabs.gather',
    iconName: 'users',
  },
  {
    name: 'Plans',
    labelKey: 'tabs.plans',
    iconName: 'calendar',
  },
  {
    name: 'More',
    labelKey: 'tabs.more',
    iconName: 'ellipsis',
  },
];
