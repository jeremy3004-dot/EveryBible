import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import type { RootTabParamList } from './types';

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface RootTabManifestEntry {
  name: keyof RootTabParamList;
  labelKey: string;
  focusedIcon: IconName;
  unfocusedIcon: IconName;
}

export const rootTabManifest: RootTabManifestEntry[] = [
  {
    name: 'Home',
    labelKey: 'tabs.home',
    focusedIcon: 'home',
    unfocusedIcon: 'home-outline',
  },
  {
    name: 'Bible',
    labelKey: 'tabs.bible',
    focusedIcon: 'book',
    unfocusedIcon: 'book-outline',
  },
  {
    name: 'Learn',
    labelKey: 'tabs.gather',
    focusedIcon: 'people',
    unfocusedIcon: 'people-outline',
  },
  {
    name: 'Plans',
    labelKey: 'tabs.plans',
    focusedIcon: 'calendar',
    unfocusedIcon: 'calendar-outline',
  },
  {
    name: 'More',
    labelKey: 'tabs.more',
    focusedIcon: 'ellipsis-horizontal',
    unfocusedIcon: 'ellipsis-horizontal-outline',
  },
];
