import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { AudioPlaybackSequenceEntry } from '../types';
import type { PlanSessionKey, RhythmSessionContext } from '../services/plans/types';

// Home Stack
export type HomeStackParamList = {
  HomeScreen: undefined;
};

// Bible Stack
export type BibleStackParamList = {
  BibleBrowser: {
    initialBookId?: string;
  } | undefined;
  BiblePicker: {
    initialBookId?: string;
  } | undefined;
  BibleReader: {
    bookId: string;
    chapter: number;
    autoplayAudio?: boolean;
    preferredMode?: 'listen' | 'read';
    focusVerse?: number;
    playbackSequenceEntries?: AudioPlaybackSequenceEntry[];
    planId?: string;
    planDayNumber?: number;
    planSessionKey?: PlanSessionKey;
    returnToPlanOnComplete?: boolean;
    sessionContext?: RhythmSessionContext;
  };
  ChapterSelector: {
    bookId: string;
  };
};

// Learn Stack
export type LearnStackParamList = {
  GatherHome: undefined;
  FoundationDetail: {
    foundationId: string;
  };
  LessonDetail: {
    parentId: string;
    lessonId: string;
    parentType: 'foundation' | 'wisdom';
  };
  GroupList: undefined;
  GroupDetail: {
    groupId: string;
  };
  GroupSession: {
    groupId: string;
  };
  PrayerWall: {
    groupId: string;
    groupName: string;
  };
};

// Plans Stack
export type PlansStackParamList = {
  PlansHome: undefined;
  PlanDetail: { planId: string };
  RhythmDetail: { rhythmId: string };
  RhythmComposer: { rhythmId?: string };
};

// More Stack
export type MoreStackParamList = {
  MoreScreen: undefined;
  Settings: undefined;
  LocalePreferences: undefined;
  PrivacyPreferences: undefined;
  Profile: undefined;
  ReadingActivity: undefined;
  Annotations: undefined;
  TranslationBrowser: undefined;
  About: undefined;
  Auth: NavigatorScreenParams<AuthStackParamList> | undefined;
};

// Auth Stack
export type AuthScreenMode = 'signIn' | 'signUp';

export type AuthStackParamList = {
  AuthScreen:
    | {
        initialMode?: AuthScreenMode;
      }
    | undefined;
};

// Root Tab Navigator
export type RootTabParamList = {
  Home: NavigatorScreenParams<HomeStackParamList>;
  Bible: NavigatorScreenParams<BibleStackParamList>;
  Learn: NavigatorScreenParams<LearnStackParamList>;
  Plans: NavigatorScreenParams<PlansStackParamList>;
  More: NavigatorScreenParams<MoreStackParamList>;
};

// Screen props helpers
export type HomeScreenProps = NativeStackScreenProps<HomeStackParamList, 'HomeScreen'>;

export type BibleBrowserScreenProps = NativeStackScreenProps<BibleStackParamList, 'BibleBrowser'>;
export type BibleReaderScreenProps = NativeStackScreenProps<BibleStackParamList, 'BibleReader'>;
export type ChapterSelectorScreenProps = NativeStackScreenProps<
  BibleStackParamList,
  'ChapterSelector'
>;

export type GatherHomeScreenProps = NativeStackScreenProps<LearnStackParamList, 'GatherHome'>;
export type FoundationDetailScreenProps = NativeStackScreenProps<
  LearnStackParamList,
  'FoundationDetail'
>;
export type LessonDetailScreenProps = NativeStackScreenProps<LearnStackParamList, 'LessonDetail'>;
export type GroupListScreenProps = NativeStackScreenProps<LearnStackParamList, 'GroupList'>;
export type GroupDetailScreenProps = NativeStackScreenProps<LearnStackParamList, 'GroupDetail'>;
export type GroupSessionScreenProps = NativeStackScreenProps<LearnStackParamList, 'GroupSession'>;
export type PrayerWallScreenProps = NativeStackScreenProps<LearnStackParamList, 'PrayerWall'>;

export type PlansHomeScreenProps = NativeStackScreenProps<PlansStackParamList, 'PlansHome'>;
export type PlanDetailScreenProps = NativeStackScreenProps<PlansStackParamList, 'PlanDetail'>;
export type RhythmDetailScreenProps = NativeStackScreenProps<PlansStackParamList, 'RhythmDetail'>;
export type RhythmComposerScreenProps = NativeStackScreenProps<
  PlansStackParamList,
  'RhythmComposer'
>;

export type MoreScreenProps = NativeStackScreenProps<MoreStackParamList, 'MoreScreen'>;
export type SettingsScreenProps = NativeStackScreenProps<MoreStackParamList, 'Settings'>;
export type PrivacyPreferencesScreenProps = NativeStackScreenProps<
  MoreStackParamList,
  'PrivacyPreferences'
>;
export type ProfileScreenProps = NativeStackScreenProps<MoreStackParamList, 'Profile'>;
export type ReadingActivityScreenProps = NativeStackScreenProps<
  MoreStackParamList,
  'ReadingActivity'
>;
export type AnnotationsScreenProps = NativeStackScreenProps<MoreStackParamList, 'Annotations'>;
export type TranslationBrowserScreenProps = NativeStackScreenProps<MoreStackParamList, 'TranslationBrowser'>;
export type AboutScreenProps = NativeStackScreenProps<MoreStackParamList, 'About'>;

// Tab screen props
export type HomeTabProps = BottomTabScreenProps<RootTabParamList, 'Home'>;
export type BibleTabProps = BottomTabScreenProps<RootTabParamList, 'Bible'>;
export type LearnTabProps = BottomTabScreenProps<RootTabParamList, 'Learn'>;
export type PlansTabProps = BottomTabScreenProps<RootTabParamList, 'Plans'>;
export type MoreTabProps = BottomTabScreenProps<RootTabParamList, 'More'>;

// Global navigation type declaration
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootTabParamList {}
  }
}
