import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

// Home Stack
export type HomeStackParamList = {
  HomeScreen: undefined;
};

// Bible Stack
export type BibleStackParamList = {
  BibleBrowser: undefined;
  BibleReader: {
    bookId: string;
    chapter: number;
    autoplayAudio?: boolean;
    focusVerse?: number;
  };
  ChapterSelector: {
    bookId: string;
  };
};

// Learn Stack
export type LearnStackParamList = {
  CourseList: undefined;
  CourseDetail: {
    courseId: string;
  };
  LessonView: {
    courseId: string;
    lessonId: string;
  };
  // Four Fields screens
  FourFieldsJourney: undefined;
  FieldOverview: {
    field: 'entry' | 'gospel' | 'discipleship' | 'church' | 'multiplication';
  };
  FourFieldsLessonView: {
    courseId: string;
    lessonId: string;
  };
  GroupList: undefined;
  GroupDetail: {
    groupId: string;
  };
  GroupSession: {
    groupId: string;
  };
};

// More Stack
export type MoreStackParamList = {
  MoreScreen: undefined;
  Settings: undefined;
  LocalePreferences: undefined;
  PrivacyPreferences: undefined;
  Profile: undefined;
  ReadingActivity: undefined;
  About: undefined;
  Auth: NavigatorScreenParams<AuthStackParamList> | undefined;
};

// Auth Stack
export type AuthStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
};

// Root Tab Navigator
export type RootTabParamList = {
  Home: NavigatorScreenParams<HomeStackParamList>;
  Bible: NavigatorScreenParams<BibleStackParamList>;
  Learn: NavigatorScreenParams<LearnStackParamList>;
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

export type CourseListScreenProps = NativeStackScreenProps<LearnStackParamList, 'CourseList'>;
export type CourseDetailScreenProps = NativeStackScreenProps<LearnStackParamList, 'CourseDetail'>;
export type LessonViewScreenProps = NativeStackScreenProps<LearnStackParamList, 'LessonView'>;

// Four Fields screen props
export type FourFieldsJourneyScreenProps = NativeStackScreenProps<
  LearnStackParamList,
  'FourFieldsJourney'
>;
export type FieldOverviewScreenProps = NativeStackScreenProps<LearnStackParamList, 'FieldOverview'>;
export type FourFieldsLessonViewScreenProps = NativeStackScreenProps<
  LearnStackParamList,
  'FourFieldsLessonView'
>;
export type GroupListScreenProps = NativeStackScreenProps<LearnStackParamList, 'GroupList'>;
export type GroupDetailScreenProps = NativeStackScreenProps<LearnStackParamList, 'GroupDetail'>;
export type GroupSessionScreenProps = NativeStackScreenProps<LearnStackParamList, 'GroupSession'>;

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
export type AboutScreenProps = NativeStackScreenProps<MoreStackParamList, 'About'>;

// Tab screen props
export type HomeTabProps = BottomTabScreenProps<RootTabParamList, 'Home'>;
export type BibleTabProps = BottomTabScreenProps<RootTabParamList, 'Bible'>;
export type LearnTabProps = BottomTabScreenProps<RootTabParamList, 'Learn'>;
export type MoreTabProps = BottomTabScreenProps<RootTabParamList, 'More'>;

// Global navigation type declaration
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootTabParamList {}
  }
}
