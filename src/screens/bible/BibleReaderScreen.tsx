import { ChapterFeedbackSummary } from '../../components/feedback';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import {
  Alert,
  AppState,
  BackHandler,
  FlatList,
  LayoutAnimation,
  InteractionManager,
  Platform,
  ScrollView,
  Share,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Animated, {
  useSharedValue,
  useReducedMotion,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  getAdjacentBibleChapter,
  getBookById,
  getCompactTranslatedBookName,
  getTranslatedBookName,
} from '../../constants';
import { config } from '../../constants/config';
import { useTheme, type ThemeMode } from '../../contexts/ThemeContext';
import { layout, spacing, typography } from '../../design/system';
import { getReadingFontFamily } from '../../design/fonts';
import { useTabBarHeight } from '../../hooks/useTabBarHeight';
import { buildTabBarCapsuleStyle } from '../../navigation/tabBarCapsuleStyle';
import { useReaderChromeOwner, useReaderChromeProgress } from '../../stores/readerChromeStore';
import { getNextReaderChromeProgress, READER_PLAY_COLLAPSE_TRAVEL } from './readerChromeMotion';
import { trackAnonymousUsageEvent, flushAnonymousUsageEvents } from '../../services/analytics';
import { createReadingTimer } from '../../services/analytics/readingTimer';
import { trackBibleExperienceEvent } from '../../services/analytics/bibleExperienceAnalytics';
import {
  getAnnotationsForChapter,
  softDeleteAnnotation,
  upsertAnnotation,
} from '../../services/annotations/annotationService';
import { getChapter, prefetchNextChapter } from '../../services/bible/bibleService';
import { buildBibleDeepLink } from '../../services/bible/deepLinkParser';
import {
  getChapterPresentationMode,
  type ChapterPresentationMode,
} from '../../services/bible/presentation';
import {
  findAdjacentAvailableChapter,
  getChapterContentAvailability,
} from '../../services/bible/contentAvailability';
import { useTranslationContentSummary } from '../../hooks/useTranslationContentSummary';
import { isRemoteAudioAvailable } from '../../services/audio/audioRemote';
import { getAudioAvailability } from '../../services/audio/audioAvailability';
import { describeAudioDownloadError } from '../../services/audio/audioDownloadErrorMessage';
import { READING_PLAN_ENTRIES_BY_PLAN_ID, readingPlans } from '../../data/readingPlans.generated';
import {
  buildPlanDayPlaybackSequenceEntries,
  getCurrentPlanDaySummary,
  getPlanChapterListenStatus,
  getPlanStepReadChapters,
  getRhythmSessionSegmentAtIndex,
  PLAN_LISTEN_COMPLETION_THRESHOLD,
  resolvePlaybackSequenceIndex,
} from '../../services/plans/readingPlanActivity';
import { markDayComplete, markPlanSessionComplete } from '../../services/plans/readingPlanService';
import { getPlanChapterFocusVerse } from '../../services/plans';
import { formatLocalDateKey } from '../../services/progress/readingActivity';
import {
  buildPlanSessionCompletionKey,
  getDaySessionEntries,
  isMultiSessionPlan,
} from '../../services/plans/readingPlanModel';
import { syncPreferences } from '../../services/sync';
import { useAudioStore } from '../../stores/audioStore';
import { useAuthStore } from '../../stores/authStore';
import { useBibleStore } from '../../stores/bibleStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useProgressStore } from '../../stores/progressStore';
import { useReadingPlansStore } from '../../stores/readingPlansStore';
import { getAdjacentAudioPlaybackSequenceEntry } from '../../stores/audioPlaybackSequenceModel';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { useFontSize } from '../../hooks/useFontSize';
import { useLargeText } from '../../hooks/useLargeText';
import { useShallow } from 'zustand/react/shallow';
import { lightHaptic, selectionHaptic } from '../../utils/haptics';
import { announceForAccessibility } from '../../utils/a11y';
import { ReaderPlaybackDock } from '../../components/audio/ReaderPlaybackDock';
import {
  ReaderAudioPortionPreviewGuard,
  ReaderAudioPositionBridge,
} from './ReaderAudioPositionParts';
import type {
  ReaderAudioPositionBridgeHandle,
  ReaderAudioPositionSnapshot,
  ReaderFollowAlongPlaybackState,
} from './ReaderAudioPositionParts';
import { AnnotationActionSheet } from '../../components/annotations/AnnotationActionSheet';
import { VersesSkeleton } from '../../components/skeleton/VersesSkeleton';
import type { BibleTranslation, Verse } from '../../types';
import type { UserAnnotation } from '../../services/supabase/types';
import type { BibleStackParamList, BibleReaderScreenProps } from '../../navigation/types';
import {
  buildBibleSelectionShareText,
  buildBibleSelectionVerseRanges,
  extractBibleSelectionText,
  formatBibleSelectionReference,
  getBibleSelectionShareTranslationLabel,
} from './bibleSelectionModel';
import {
  buildReaderHighlightIndex,
  buildReaderParagraphRenderSignature,
} from './bibleReaderRenderModel';
import { createReaderFocusScroll } from './readerFocusScroll';
import { HOME_VERSE_BACKGROUND_SOURCES } from '../../data/homeVerseBackgrounds';
import { SHARE_VERSE_BACKGROUND_SOURCES } from '../../data/shareVerseBackgrounds';
import { getHomeVerseBackgroundIndex } from '../../data/homeVerseBackgroundSelection';
import {
  buildReaderParagraphs,
  buildReaderChapterRouteParams,
  getPlanSessionTrailingActionState,
  getNextBibleTabBarVisibility,
  getReaderAutoScrollTarget,
  getReaderInlineActiveVerse,
  getAnnotationsForDisplayedVerses,
  getReaderVerseContentOffset,
  getInitialChapterSessionMode,
  getReaderVerseLineHeight,
  resolveSwipeChapterNavigation,
  isActiveAudioTrackMatch,
  getNextFontSizeSheetVisibility,
  getNextTranslationSheetVisibility,
  shouldAutoplayChapterAudio,
  shouldReplayActiveAudioForTranslationChange,
  shouldSyncReaderToActiveAudioChapter,
} from './bibleReaderModel';
import type { ReaderParagraph } from './bibleReaderModel';
import {
  invalidateReaderChapterLoad,
  loadReaderChapter,
  readerChapterKey,
  type CancellableTask,
} from './readerChapterLoader';
import { navigateListenChapter } from './readerListenNavigation';
import {
  applyReaderAnnotationEdits,
  planReaderHighlightApply,
  planReaderHighlightRemove,
  planReaderNoteSave,
  type ReaderAnnotationEdits,
} from './readerAnnotationEdits';
import { rootNavigationRef } from '../../navigation/rootNavigation';
import {
  AudioOptionsSheet,
  AudioPortionShareSheet,
  ChapterActionsSheet,
  ChapterAudioShareLoadingOverlay,
  ChapterAudioShareSheet,
  ChapterFeedbackModal,
  FollowAlongTextSheet,
  PlanSessionBottomBar,
  ReaderFontSheet,
  ReaderListenMode,
  ReaderParagraphBlock,
  ReaderTranslationSheet,
  ReaderVerseList,
  VerseImageShareSheet,
  TOP_ACTION_HIT_SLOP,
  TOP_ACTION_ICON_SIZE,
  READER_REFERENCE_PILL_MAX_FONT_SCALE,
  READER_SCROLL_JS_UPDATE_INTERVAL_PX,
  styles,
  useAudioPortionShare,
  useChapterAudioShare,
  useChapterFeedback,
} from './reader';

type NavigationProp = NativeStackNavigationProp<BibleStackParamList>;
type VerseTimestamps = import('../../services/bible/verseTimestamps').VerseTimestamps;
type RootTabNavigationHandle = {
  setOptions: (options: { tabBarStyle?: unknown }) => void;
} | null;

export function BibleReaderScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<BibleReaderScreenProps['route']>();
  const { isLargeText } = useLargeText();
  const {
    bookId,
    chapter,
    autoplayAudio,
    preferredMode,
    focusVerse: requestedFocusVerse,
    playbackSequenceEntries = [],
    planId: activePlanId,
    planDayNumber,
    planSessionKey,
    returnToPlanOnComplete = false,
    sessionContext,
  } = route.params;
  const { colors, themeMode, setTheme } = useTheme();
  const { t } = useTranslation();
  const safeInsets = useSafeAreaInsets();
  const autoplayKeyRef = useRef<string | null>(null);
  const sessionKeyRef = useRef<string | null>(null);
  const planDayCompletionGuardRef = useRef<string | null>(null);
  const listenCountedNoticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenCountedBaselineRef = useRef<{ key: string; alreadyCountedForPlan: boolean } | null>(
    null
  );
  const lastListenCountedNoticeKeyRef = useRef<string | null>(null);
  const previousActiveAudioBookIdRef = useRef<string | null>(null);
  const previousActiveAudioChapterRef = useRef<number | null>(null);
  const scrollViewRef = useRef<Animated.ScrollView | null>(null);
  const premiumReaderListRef = useRef<FlatList<ReaderParagraph> | null>(null);
  const followAlongScrollViewRef = useRef<ScrollView | null>(null);
  const verseImageSharePreviewRef = useRef<View | null>(null);
  const verseOffsetsRef = useRef<Record<number, number>>({});
  const readerFocusScrollRef = useRef(createReaderFocusScroll());
  const measuredChapterKeyRef = useRef<string | null>(null);
  const renderParagraphRef = useRef<(paragraph: ReaderParagraph, index: number) => ReactElement>(
    () => null as never
  );
  const pendingReaderAutoScrollVerseRef = useRef<number | null>(null);
  const paragraphHeightsRef = useRef<Record<string, number>>({});
  // Translator review tools render above the paragraphs, pushing every verse
  // down by their measured height.
  const readerListHeaderHeightRef = useRef(0);
  const followAlongOffsetsRef = useRef<Record<number, number>>({});
  // The live audio position is consumed exclusively by the leaf components in
  // ReaderAudioPositionParts so the ~250ms tick never re-renders this screen.
  // The bridge mirrors it here for the async handlers that need a one-shot read,
  // and owns the monotonic follow-along clamp behind its imperative handle.
  const audioPositionRef = useRef<ReaderAudioPositionSnapshot>({
    currentPosition: 0,
    duration: 0,
  });
  const followAlongBridgeRef = useRef<ReaderAudioPositionBridgeHandle | null>(null);
  const resetFollowAlongClamp = useCallback(() => {
    followAlongBridgeRef.current?.reset();
  }, []);
  const [followAlongPlaybackState, setFollowAlongPlaybackState] =
    useState<ReaderFollowAlongPlaybackState>({ verse: null, didRestart: false });
  const handleFollowAlongPlaybackChange = useCallback((next: ReaderFollowAlongPlaybackState) => {
    setFollowAlongPlaybackState((current) =>
      current.verse === next.verse && current.didRestart === next.didRestart ? current : next
    );
  }, []);
  const [verses, setVerses] = useState<Verse[]>([]);
  // Which chapter `verses` holds. A chapter change keeps the old verses visible
  // until the new ones load, so this can lag the route's bookId/chapter.
  const [versesChapterKey, setVersesChapterKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFontSizeSheet, setShowFontSizeSheet] = useState(false);
  const [showTranslationSheet, setShowTranslationSheet] = useState(false);
  const [showAudioOptionsSheet, setShowAudioOptionsSheet] = useState(false);
  const [showFollowAlongText, setShowFollowAlongText] = useState(false);
  const [chapterTimestamps, setChapterTimestamps] = useState<VerseTimestamps | null>(null);
  const [showChapterActionsSheet, setShowChapterActionsSheet] = useState(false);
  const [showVerseImageSheet, setShowVerseImageSheet] = useState(false);
  const [isSharingVerseImage, setIsSharingVerseImage] = useState(false);
  const [listenCountedNotice, setListenCountedNotice] = useState<string | null>(null);
  const [chapterSessionMode, setChapterSessionMode] = useState<'listen' | 'read'>('read');
  const [annotations, setAnnotations] = useState<UserAnnotation[]>([]);
  const [selectedVerses, setSelectedVerses] = useState<number[]>([]);
  const [selectedVerseImageBackgroundIndex, setSelectedVerseImageBackgroundIndex] = useState(() =>
    getHomeVerseBackgroundIndex(new Date(), HOME_VERSE_BACKGROUND_SOURCES.length)
  );
  const [isReadBottomChromeCollapsed, setIsReadBottomChromeCollapsed] = useState(false);
  const chapterLoadRequestIdRef = useRef(0);
  const chapterPrefetchTaskRef = useRef<CancellableTask | null>(null);
  const annotationLoadRequestIdRef = useRef(0);
  const lastStableSessionModeRef = useRef(chapterSessionMode);
  const readerBottomChromeCollapsedRef = useRef(false);
  const rootTabBarCollapseProgressRef = useRef(0);
  const selectedVersePreviousTabBarCollapseProgressRef = useRef<number | null>(null);
  const readerLastScrollOffsetYRef = useRef(0);
  const readerScrollViewportHeightRef = useRef(0);
  const readerBottomChromeProgressShared = useSharedValue(0);
  const rootTabBarScrollProgress = useReaderChromeProgress();
  const readerChromeOwner = useReaderChromeOwner();
  const readerChromeOffsetShared = useSharedValue(0);
  const readerChromeChapterKeyRef = useRef('');
  const readerChromeCollapsedShared = useSharedValue(false);
  const reduceMotion = useReducedMotion();
  const readerRouteKey = route.key;

  // Retained readers keep local motion. Only the focused route may publish to
  // the root bar; late scroll events and old cleanup cannot overwrite a new one.
  useFocusEffect(
    useCallback(() => {
      readerBottomChromeProgressShared.value = 0;
      const chapterKey = `${bookId}:${chapter}`;
      if (readerChromeChapterKeyRef.current !== chapterKey) {
        readerChromeChapterKeyRef.current = chapterKey;
        readerChromeOffsetShared.value = 0;
      }
      readerChromeCollapsedShared.value = false;
      readerBottomChromeCollapsedRef.current = false;
      setIsReadBottomChromeCollapsed(false);
      readerChromeOwner.value = readerRouteKey;
      rootTabBarScrollProgress.value = 0;
      return () => {
        if (readerChromeOwner.value === readerRouteKey) {
          readerChromeOwner.value = '';
          rootTabBarScrollProgress.value = 0;
        }
      };
    }, [
      bookId,
      chapter,
      readerRouteKey,
      readerBottomChromeProgressShared,
      readerChromeOffsetShared,
      readerChromeCollapsedShared,
      readerChromeOwner,
      rootTabBarScrollProgress,
    ])
  );
  const rootTabBarVisibleRef = useRef<boolean | null>(null);
  const {
    bottomPadding: rootTabBarBottomPadding,
    barHeight: rootTabBarBarHeight,
    sideInset: rootTabBarSideInset,
    height: rootTabBarHeight,
  } = useTabBarHeight();
  const shouldForceHideRootTabBar =
    Boolean(activePlanId) && typeof planDayNumber === 'number' && returnToPlanOnComplete;
  const premiumReaderBaseBottomPadding =
    rootTabBarHeight + layout.minTouchTarget + spacing.xxxl + spacing.lg;
  const getRootTabNavigation = useCallback((): RootTabNavigationHandle => {
    // Runtime contract: navigation.getParent('RootTab') ?? navigation.getParent()?.getParent()
    const getParentById = navigation.getParent as unknown as (
      id?: string
    ) => RootTabNavigationHandle;

    return (
      getParentById('RootTab') ??
      (navigation.getParent()?.getParent() as RootTabNavigationHandle | undefined) ??
      null
    );
  }, [navigation]);
  // The reader drives a scroll-linked collapse of the ROOT tab bar, so it has to
  // rebuild that bar's style. It must be the same capsule the navigator draws —
  // this used to be a second, full-width copy, which made the bar visibly change
  // shape on entering and leaving the reader.
  const getRootTabBarStyle = useCallback(
    (collapseProgress: number) =>
      buildTabBarCapsuleStyle({
        sideInset: rootTabBarSideInset,
        bottomPadding: rootTabBarBottomPadding,
        barHeight: rootTabBarBarHeight,
        collapseProgress,
      }),
    [rootTabBarSideInset, rootTabBarBottomPadding, rootTabBarBarHeight]
  );
  const rootTabBarStyleBuilderRef = useRef(getRootTabBarStyle);
  rootTabBarStyleBuilderRef.current = getRootTabBarStyle;
  // Keep the chapter content padding stable so dock taps do not reflow the
  // ScrollView when the user is already pinned at the bottom of the chapter.
  const premiumReaderBottomPadding = premiumReaderBaseBottomPadding;

  const syncRootTabBarVisibility = useCallback(
    (nextVisible: boolean) => {
      if (rootTabBarVisibleRef.current === nextVisible) {
        return;
      }

      if (rootTabBarVisibleRef.current != null) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }

      rootTabBarVisibleRef.current = nextVisible;
      navigation.setParams({ tabBarVisible: nextVisible });
    },
    [navigation]
  );

  const syncRootTabBarCollapseProgress = useCallback(
    (nextProgress: number) => {
      const clampedProgress = Math.max(0, Math.min(nextProgress, 1));
      if (
        Math.abs(clampedProgress - rootTabBarCollapseProgressRef.current) < 0.02 &&
        !(clampedProgress === 0 && rootTabBarCollapseProgressRef.current !== 0) &&
        !(clampedProgress === 1 && rootTabBarCollapseProgressRef.current !== 1)
      ) {
        return;
      }

      rootTabBarCollapseProgressRef.current = clampedProgress;
      const rootTabNavigation = getRootTabNavigation();
      if (rootTabNavigation) {
        rootTabNavigation.setOptions({
          tabBarStyle: rootTabBarStyleBuilderRef.current(clampedProgress),
        });
      }
      navigation.setParams({ tabBarCollapseProgress: clampedProgress });
    },
    [getRootTabNavigation, navigation]
  );

  useEffect(() => {
    const rootTabNavigation = getRootTabNavigation();
    if (!rootTabNavigation || shouldForceHideRootTabBar) {
      return;
    }

    rootTabNavigation.setOptions({
      tabBarStyle: getRootTabBarStyle(rootTabBarCollapseProgressRef.current),
    });
    navigation.setParams({ tabBarCollapseProgress: rootTabBarCollapseProgressRef.current });
  }, [getRootTabBarStyle, getRootTabNavigation, navigation, shouldForceHideRootTabBar]);

  useEffect(() => {
    syncRootTabBarVisibility(
      shouldForceHideRootTabBar
        ? false
        : getNextBibleTabBarVisibility({
            sessionMode: chapterSessionMode,
            action: 'enter',
          })
    );
    syncRootTabBarCollapseProgress(shouldForceHideRootTabBar ? 1 : 0);
  }, [
    chapterSessionMode,
    shouldForceHideRootTabBar,
    syncRootTabBarCollapseProgress,
    syncRootTabBarVisibility,
  ]);

  useEffect(() => {
    if (selectedVerses.length > 0) {
      if (selectedVersePreviousTabBarCollapseProgressRef.current == null) {
        selectedVersePreviousTabBarCollapseProgressRef.current =
          rootTabBarCollapseProgressRef.current;
      }

      syncRootTabBarVisibility(!shouldForceHideRootTabBar);
      syncRootTabBarCollapseProgress(1);
      return;
    }

    const previousProgress = selectedVersePreviousTabBarCollapseProgressRef.current;
    if (previousProgress == null) {
      return;
    }

    selectedVersePreviousTabBarCollapseProgressRef.current = null;
    syncRootTabBarVisibility(
      shouldForceHideRootTabBar
        ? false
        : getNextBibleTabBarVisibility({
            sessionMode: chapterSessionMode,
            action: 'enter',
          })
    );
    syncRootTabBarCollapseProgress(shouldForceHideRootTabBar ? 1 : previousProgress);
  }, [
    chapterSessionMode,
    selectedVerses.length,
    shouldForceHideRootTabBar,
    syncRootTabBarCollapseProgress,
    syncRootTabBarVisibility,
  ]);

  const handleReaderScrollBeginDrag = useCallback(() => {
    if (chapterSessionMode !== 'read') {
      return;
    }
  }, [chapterSessionMode]);

  const handleReaderScrollEndDrag = useCallback(() => {
    if (chapterSessionMode !== 'read') {
      return;
    }
  }, [chapterSessionMode]);

  const handleReaderMomentumScrollEnd = useCallback(() => {
    if (chapterSessionMode !== 'read') {
      return;
    }
  }, [chapterSessionMode]);

  const verseImageBackgroundCount = SHARE_VERSE_BACKGROUND_SOURCES.length;
  const selectedVerseImageBackground =
    SHARE_VERSE_BACKGROUND_SOURCES[
      verseImageBackgroundCount > 0
        ? selectedVerseImageBackgroundIndex % verseImageBackgroundCount
        : 0
    ] ?? SHARE_VERSE_BACKGROUND_SOURCES[0];
  const dismissSelectedVerseSelection = useCallback(() => {
    setShowVerseImageSheet(false);
    setSelectedVerses([]);
  }, []);

  const hidePlayButtonFromReadingTab = useAuthStore(
    (state) => state.preferences.hidePlayButtonFromReadingTab
  );
  const markChapterRead = useProgressStore((state) => state.markChapterRead);
  const chaptersRead = useProgressStore((state) => state.chaptersRead);
  const setCurrentBook = useBibleStore((state) => state.setCurrentBook);
  const setCurrentChapter = useBibleStore((state) => state.setCurrentChapter);
  const setPreferredChapterLaunchMode = useBibleStore(
    (state) => state.setPreferredChapterLaunchMode
  );
  const currentTranslation = useBibleStore((state) => state.currentTranslation);
  const translations = useBibleStore(useShallow((state) => state.translations));
  const downloadAudioForBook = useBibleStore((state) => state.downloadAudioForBook);
  const setPlaybackSequence = useAudioStore((state) => state.setPlaybackSequence);
  const setAudioReturnTarget = useAudioStore((state) => state.setAudioReturnTarget);
  const setAudioTrack = useAudioStore((state) => state.setCurrentTrack);
  const clearAudioPlaybackSequence = useAudioStore((state) => state.clearPlaybackSequence);
  const toggleFavorite = useLibraryStore((state) => state.toggleFavorite);
  const addChapterToDefaultPlaylist = useLibraryStore((state) => state.addChapterToDefaultPlaylist);
  const listeningHistory = useLibraryStore((state) => state.history);
  const isFavorite = useLibraryStore((state) =>
    state.favorites.some((f) => f.id === `${bookId}:${chapter}`)
  );
  const activePlanProgress = useReadingPlansStore((state) =>
    activePlanId ? (state.progressByPlanId[activePlanId] ?? null) : null
  );
  const setPlanDayResume = useReadingPlansStore((state) => state.setPlanDayResume);
  const clearPlanDayResume = useReadingPlansStore((state) => state.clearPlanDayResume);
  const currentTranslationInfo = translations.find(
    (translation) => translation.id === currentTranslation
  );
  // Every Language translations describe their audio only through a signed manifest, so
  // the catalog row cannot say whether *this* chapter exists. Until the manifest resolves
  // `audioChapters` is undefined and the reader behaves exactly as before.
  const audioChapterMap = useTranslationContentSummary(currentTranslationInfo)?.audioChapters;
  const getTranslationAudioAvailability = (
    translation: Pick<BibleTranslation, 'id' | 'hasAudio' | 'downloadedAudioBooks'>,
    targetBookId?: string
  ) =>
    getAudioAvailability({
      featureEnabled: config.features.audioEnabled,
      translationHasAudio: Boolean(translation.hasAudio),
      remoteAudioAvailable: isRemoteAudioAvailable(translation.id, targetBookId),
      downloadedAudioBooks: translation.downloadedAudioBooks,
      bookId: targetBookId,
    });
  const { scaleValue, increase, decrease, canIncrease, canDecrease } = useFontSize();
  const {
    status,
    currentTranslationId: activeAudioTranslationId,
    currentBookId: activeAudioBookId,
    currentChapter: activeAudioChapter,
    lastPlayedTranslationId,
    lastPlayedBookId,
    lastPlayedChapter,
    playbackRate,
    repeatMode,
    sleepTimerRemaining,
    backgroundMusicChoice,
    playChapter,
    navigateChapterForTranslation,
    addToQueue,
    stop,
    togglePlayPause,
    previousChapter,
    nextChapter,
    seekTo,
    skipBackward,
    skipForward,
    changePlaybackRate,
    cycleRepeatMode,
    startSleepTimer,
    changeBackgroundMusicChoice,
  } = useAudioPlayer(currentTranslation);
  const readerAudioTrack = useMemo(
    () => ({ translationId: currentTranslation, bookId, chapter }),
    [currentTranslation, bookId, chapter]
  );

  const book = getBookById(bookId);
  // isRemoteAudioAvailable() can only say the manifest is addressable, not that this
  // chapter is in it, so an uncovered chapter used to render the audio-first artwork
  // behind a play button that could never play. With an exact map the chapter decides.
  const chapterHasCoveredAudio =
    audioChapterMap && book
      ? getChapterContentAvailability(book, chapter, {
          hasText: Boolean(currentTranslationInfo?.hasText),
          hasAudio: Boolean(currentTranslationInfo?.hasAudio),
          audioChapters: audioChapterMap,
        }).hasAudio
      : true;
  const audioEnabled =
    getAudioAvailability({
      featureEnabled: config.features.audioEnabled,
      translationHasAudio: Boolean(currentTranslationInfo?.hasAudio),
      remoteAudioAvailable: isRemoteAudioAvailable(currentTranslation, bookId),
      downloadedAudioBooks: currentTranslationInfo?.downloadedAudioBooks ?? [],
      bookId,
    }).canPlayAudio && chapterHasCoveredAudio;
  const translationLabel = currentTranslationInfo?.abbreviation || 'BSB';
  const feedback = useChapterFeedback({
    currentTranslation,
    currentTranslationInfo,
    translationLabel,
    bookId,
    chapter,
    onOpenChapterFeedback: () => setShowChapterActionsSheet(false),
  });
  const { chapterFeedbackEnabled, handleOpenChapterFeedback } = feedback;
  // Reading-surface serif family for this translation's script. Latin → Lora;
  // Devanagari/unsupported (e.g. Hindi, Nepali) → undefined = platform serif so
  // glyphs render instead of tofu. `language` is a display name ('Hindi').
  const readingFontFamily = getReadingFontFamily(currentTranslationInfo?.language);
  // Bold face for the editorial section titles ("Jesus like His Brothers"). React Native will
  // not synthesise a bold weight for a named custom family, so the 700 face has to be asked
  // for by name; non-Latin scripts get undefined and fall back to the platform serif.
  const readingFontFamilyBold = getReadingFontFamily(currentTranslationInfo?.language, 700);
  const compactBookName = getCompactTranslatedBookName(bookId, t);
  const activeChapterKey = `${bookId}_${chapter}`;
  const todayDateKey = formatLocalDateKey(new Date());
  const activeRhythmSession = sessionContext?.type === 'rhythm' ? sessionContext : null;
  const activePlanEntries = useMemo(
    () => (activePlanId ? (READING_PLAN_ENTRIES_BY_PLAN_ID.get(activePlanId) ?? []) : []),
    [activePlanId]
  );
  const activePlanRecord = useMemo(
    () => (activePlanId ? (readingPlans.find((plan) => plan.id === activePlanId) ?? null) : null),
    [activePlanId]
  );
  const activePlanIsMultiSession = isMultiSessionPlan(activePlanRecord);
  const activePlanDayEntries = useMemo(
    () =>
      typeof planDayNumber === 'number'
        ? activePlanEntries.filter((entry) => entry.day_number === planDayNumber)
        : [],
    [activePlanEntries, planDayNumber]
  );
  const activePlanSessionGroups = useMemo(
    () =>
      typeof planDayNumber === 'number'
        ? getDaySessionEntries(activePlanEntries, planDayNumber)
        : [],
    [activePlanEntries, planDayNumber]
  );
  const activePlanSessionKey = useMemo(
    () =>
      activePlanIsMultiSession
        ? (planSessionKey ?? activePlanSessionGroups[0]?.sessionKey ?? null)
        : null,
    [activePlanIsMultiSession, activePlanSessionGroups, planSessionKey]
  );
  const activePlanSessionEntries = useMemo(() => {
    if (!activePlanIsMultiSession || !activePlanSessionKey) {
      return activePlanDayEntries;
    }

    return (
      activePlanSessionGroups.find((group) => group.sessionKey === activePlanSessionKey)?.entries ??
      activePlanDayEntries
    );
  }, [
    activePlanDayEntries,
    activePlanIsMultiSession,
    activePlanSessionGroups,
    activePlanSessionKey,
  ]);
  const activePlanDayChapterItems = useMemo(
    () =>
      activePlanSessionEntries.flatMap((entry) => {
        const endChapter = entry.chapter_end ?? entry.chapter_start;
        const chapterItems: Array<{ bookId: string; chapter: number; entryId: string }> = [];

        for (
          let chapterNumber = entry.chapter_start;
          chapterNumber <= endChapter;
          chapterNumber += 1
        ) {
          chapterItems.push({
            bookId: entry.book,
            chapter: chapterNumber,
            entryId: entry.id,
          });
        }

        return chapterItems;
      }),
    [activePlanSessionEntries]
  );
  const activePlanChapterIndex = useMemo(
    () =>
      activePlanDayChapterItems.findIndex(
        (item) => item.bookId === bookId && item.chapter === chapter
      ),
    [activePlanDayChapterItems, bookId, chapter]
  );
  const isInActivePlanSession =
    Boolean(activePlanId) &&
    typeof planDayNumber === 'number' &&
    returnToPlanOnComplete &&
    activePlanChapterIndex >= 0;
  const activePlanTitle = activePlanRecord
    ? t(activePlanRecord.title_key as Parameters<typeof t>[0], {
        defaultValue: activePlanRecord.title_key,
      })
    : null;
  const showPlanSessionChrome =
    isInActivePlanSession &&
    activePlanTitle != null &&
    typeof planDayNumber === 'number' &&
    activePlanDayChapterItems.length > 0;
  const isLastPlanChapter = activePlanChapterIndex === activePlanDayChapterItems.length - 1;
  const activePlanPlaybackSequenceEntries = useMemo(() => {
    if (showPlanSessionChrome && !activeRhythmSession) {
      return buildPlanDayPlaybackSequenceEntries(activePlanSessionEntries);
    }

    return playbackSequenceEntries;
  }, [
    activePlanSessionEntries,
    activeRhythmSession,
    playbackSequenceEntries,
    showPlanSessionChrome,
  ]);
  const playbackSequenceEntriesForAudio = useMemo(() => {
    if (activeRhythmSession) {
      const activeSegment =
        activeRhythmSession.segments.find((segment) =>
          playbackSequenceEntries
            .slice(segment.startIndex, segment.endIndex)
            .some((entry) => entry.bookId === bookId && entry.chapter === chapter)
        ) ??
        (activePlanId && typeof planDayNumber === 'number'
          ? (activeRhythmSession.segments.find(
              (segment) => segment.planId === activePlanId && segment.dayNumber === planDayNumber
            ) ?? null)
          : null);

      if (activeSegment) {
        return playbackSequenceEntries.slice(activeSegment.startIndex, activeSegment.endIndex);
      }
    }

    return activePlanPlaybackSequenceEntries;
  }, [
    activePlanId,
    activePlanPlaybackSequenceEntries,
    activeRhythmSession,
    bookId,
    chapter,
    planDayNumber,
    playbackSequenceEntries,
  ]);
  useEffect(() => {
    const rootTabNavigation = getRootTabNavigation();
    if (!rootTabNavigation) {
      return;
    }

    if (showPlanSessionChrome) {
      rootTabNavigation.setOptions({
        tabBarStyle: { display: 'none' },
      });

      return () => {
        rootTabNavigation.setOptions({
          tabBarStyle: getRootTabBarStyle(0),
        });
      };
    }

    return undefined;
  }, [getRootTabBarStyle, getRootTabNavigation, showPlanSessionChrome]);
  useEffect(() => {
    if (!activePlanId || typeof planDayNumber !== 'number' || activePlanChapterIndex < 0) {
      return;
    }

    setPlanDayResume(activePlanId, planDayNumber, bookId, chapter);
  }, [activePlanChapterIndex, activePlanId, bookId, chapter, planDayNumber, setPlanDayResume]);
  const activePlanDaySummary = useMemo(() => {
    if (!activePlanId || typeof planDayNumber !== 'number' || !activePlanProgress) {
      return null;
    }

    return getCurrentPlanDaySummary({
      plan: activePlanRecord,
      entries: activePlanEntries,
      progress: activePlanProgress,
      chaptersRead,
      listeningHistory,
      dayNumber: planDayNumber,
    });
  }, [
    activePlanEntries,
    activePlanId,
    activePlanRecord,
    activePlanProgress,
    chaptersRead,
    listeningHistory,
    planDayNumber,
  ]);
  const activePlanSessionSummary = useMemo(
    () =>
      activePlanSessionKey
        ? (activePlanDaySummary?.sessionSummaries.find(
            (session) => session.sessionKey === activePlanSessionKey
          ) ?? null)
        : null,
    [activePlanDaySummary, activePlanSessionKey]
  );
  const focusVerse =
    requestedFocusVerse ?? getPlanChapterFocusVerse(activePlanSessionEntries, bookId, chapter);
  const hasOtherIncompletePlanSessions =
    activePlanRecord != null &&
    planDayNumber != null &&
    activePlanIsMultiSession &&
    activePlanSessionGroups.some(
      (group) =>
        group.sessionKey !== activePlanSessionKey &&
        !activePlanProgress?.completed_sessions?.[
          buildPlanSessionCompletionKey(activePlanRecord, planDayNumber, group.sessionKey)
        ]
    );
  const activePlanSessionTitle = activePlanSessionKey
    ? t(
        activePlanSessionKey === 'morning'
          ? 'readingPlans.morningLabel'
          : activePlanSessionKey === 'midday'
            ? 'readingPlans.middayLabel'
            : 'readingPlans.eveningLabel',
        {
          defaultValue:
            activePlanSessionKey.charAt(0).toUpperCase() + activePlanSessionKey.slice(1),
        }
      )
    : null;
  const resolvePlanSessionRouteParams = useCallback(
    (nextBookId: string, nextChapter: number) => {
      if (activeRhythmSession) {
        const nextPlaybackIndex = resolvePlaybackSequenceIndex({
          playbackSequenceEntries: activePlanPlaybackSequenceEntries,
          bookId: nextBookId,
          chapter: nextChapter,
          session: activeRhythmSession,
          preferredPlanId: activePlanId,
          preferredDayNumber: planDayNumber,
        });
        const nextSegment = getRhythmSessionSegmentAtIndex(activeRhythmSession, nextPlaybackIndex);

        if (!nextSegment) {
          return {};
        }

        return {
          planId: nextSegment.type === 'plan' ? nextSegment.planId : undefined,
          planDayNumber: nextSegment.type === 'plan' ? nextSegment.dayNumber : undefined,
          returnToPlanOnComplete: true,
          sessionContext: activeRhythmSession,
        };
      }

      if (activePlanId && typeof planDayNumber === 'number' && returnToPlanOnComplete) {
        return {
          planId: activePlanId,
          planDayNumber,
          ...(activePlanSessionKey ? { planSessionKey: activePlanSessionKey } : {}),
          returnToPlanOnComplete: true,
        };
      }

      return {};
    },
    [
      activePlanId,
      activePlanSessionKey,
      activeRhythmSession,
      planDayNumber,
      activePlanPlaybackSequenceEntries,
      returnToPlanOnComplete,
    ]
  );
  useEffect(() => {
    const resolvedBookId = activeAudioBookId ?? bookId;
    const resolvedChapter = activeAudioChapter ?? chapter;
    const hasActivePlaybackTarget =
      resolvedBookId != null &&
      resolvedChapter != null &&
      (status === 'playing' || status === 'paused' || status === 'loading');

    if (!hasActivePlaybackTarget) {
      return;
    }

    setAudioReturnTarget({
      translationId: activeAudioTranslationId ?? currentTranslation,
      bookId: resolvedBookId,
      chapter: resolvedChapter,
      preferredMode: chapterSessionMode,
      ...resolvePlanSessionRouteParams(resolvedBookId, resolvedChapter),
    });
  }, [
    activeAudioBookId,
    activeAudioChapter,
    activeAudioTranslationId,
    bookId,
    chapter,
    chapterSessionMode,
    currentTranslation,
    resolvePlanSessionRouteParams,
    setAudioReturnTarget,
    status,
  ]);
  const currentChapterListenStatus = useMemo(() => {
    if (!activePlanDaySummary) {
      return null;
    }

    const targetSummary = activePlanSessionSummary ?? activePlanDaySummary;

    return getPlanChapterListenStatus({
      chapterKey: activeChapterKey,
      bookId,
      chapter,
      targetChapterKeys: targetSummary.targetChapterKeys,
      completedChapterKeys: targetSummary.completedChapterKeys,
      listeningHistory,
      dateKey: todayDateKey,
      listenCompletionThreshold: PLAN_LISTEN_COMPLETION_THRESHOLD,
    });
  }, [
    activeChapterKey,
    activePlanDaySummary,
    activePlanSessionSummary,
    bookId,
    chapter,
    listeningHistory,
    todayDateKey,
  ]);
  const translationShareLabel =
    getBibleSelectionShareTranslationLabel({
      translationName: currentTranslationInfo?.name,
      translationAbbreviation: currentTranslationInfo?.abbreviation,
      translationLanguage: currentTranslationInfo?.language,
    }) || translationLabel;
  const chapterShareTitle = `${getTranslatedBookName(bookId, t)} ${chapter}`;
  const rawPresentationMode = getChapterPresentationMode({
    verses,
    translation: currentTranslationInfo,
    audioAvailable: audioEnabled,
  });
  // Seed the stable ref to 'text' when the translation has text so the initial
  // loading state shows a text skeleton instead of the audio-first UI. Without
  // this, BSB (which has audio) would show the audio player while verses are
  // fetching on first mount, even though text is expected.
  const lastStablePresentationModeRef = useRef<ChapterPresentationMode>(
    currentTranslationInfo?.hasText ? 'text' : rawPresentationMode
  );
  if (!isLoading) {
    lastStablePresentationModeRef.current = rawPresentationMode;
    lastStableSessionModeRef.current = chapterSessionMode;
  }
  const chapterPresentationMode = isLoading
    ? lastStablePresentationModeRef.current
    : rawPresentationMode;
  const canReadDisplayedChapter = chapterPresentationMode === 'text' && verses.length > 0;
  const canAdjustFontSize = canReadDisplayedChapter;
  const canShowTranslationSheet = config.features.multipleTranslations;
  const stableSessionMode = isLoading ? lastStableSessionModeRef.current : chapterSessionMode;
  const showMinimalListenChrome =
    chapterPresentationMode === 'audio-first' ||
    (stableSessionMode === 'listen' && !canReadDisplayedChapter);
  const showInlineChapterFeedbackComposer =
    config.features.chapterFeedbackInlineComposer &&
    chapterFeedbackEnabled &&
    showMinimalListenChrome;
  const selectedVerseReferenceLabel =
    selectedVerses.length > 0
      ? formatBibleSelectionReference({
          bookName: getTranslatedBookName(bookId, t),
          chapter,
          verses: selectedVerses,
          translationLabel: translationShareLabel,
        })
      : '';
  const selectedVerseText =
    selectedVerses.length > 0 ? extractBibleSelectionText(verses, selectedVerses) : '';
  const selectedVerseShareText =
    selectedVerses.length > 0
      ? buildBibleSelectionShareText({
          referenceLabel: selectedVerseReferenceLabel,
          selectedText: selectedVerseText,
        })
      : '';
  const selectedVerseRanges = useMemo(
    () => buildBibleSelectionVerseRanges(selectedVerses),
    [selectedVerses]
  );

  const getAnnotationVerseEnd = (annotation: Pick<UserAnnotation, 'verse_start' | 'verse_end'>) =>
    annotation.verse_end ?? annotation.verse_start;
  const annotationOverlapsSelectionRange = (
    annotation: Pick<UserAnnotation, 'verse_start' | 'verse_end'>,
    range: (typeof selectedVerseRanges)[number]
  ) =>
    annotation.verse_start <= range.verse_end &&
    getAnnotationVerseEnd(annotation) >= range.verse_start;
  const selectedVerseDecorationStyle = useMemo(
    () =>
      ({
        textDecorationLine: 'underline',
        textDecorationStyle: 'dotted',
        textDecorationColor: colors.bibleAccent,
      }) as const,
    [colors.bibleAccent]
  );
  const selectedVerseSet = useMemo(() => new Set(selectedVerses), [selectedVerses]);
  const isShowingRouteChapter =
    versesChapterKey === readerChapterKey(currentTranslation, bookId, chapter);
  // Read at press time: memoized paragraph blocks keep the verse press handler they last
  // rendered with, which can predate the chapter change.
  const isShowingRouteChapterRef = useRef(isShowingRouteChapter);
  isShowingRouteChapterRef.current = isShowingRouteChapter;
  const displayedAnnotations = getAnnotationsForDisplayedVerses({
    annotations,
    isShowingRouteChapter,
  });
  const highlightByVerse = useMemo(
    () =>
      buildReaderHighlightIndex(
        displayedAnnotations,
        verses.reduce((lastVerse, verse) => Math.max(lastVerse, verse.verse), 0)
      ),
    [displayedAnnotations, verses]
  );
  // One pass over the annotation list per selection change instead of three
  // chained filters on every render (this used to run on every position tick).
  const { selectedHighlightColors, selectedNoteAnnotation } = useMemo(() => {
    const matching =
      selectedVerseRanges.length > 0
        ? annotations.filter(
            (annotation) =>
              annotation.deleted_at == null &&
              selectedVerseRanges.some((range) =>
                annotationOverlapsSelectionRange(annotation, range)
              )
          )
        : [];
    const highlights = matching.filter((annotation) => annotation.type === 'highlight');
    return {
      selectedHighlightColors: Array.from(
        new Set(
          highlights
            .map((annotation) => annotation.color)
            .filter(
              (color): color is string => typeof color === 'string' && color.trim().length > 0
            )
        )
      ),
      selectedNoteAnnotation: matching.find((annotation) => annotation.type === 'note'),
    };
    // annotationOverlapsSelectionRange is a pure local helper over its arguments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations, selectedVerseRanges]);
  const isCurrentAudioChapter = isActiveAudioTrackMatch({
    translationId: currentTranslation,
    bookId,
    chapter,
    activeAudioTranslationId,
    activeAudioBookId,
    activeAudioChapter,
  });
  // The follow-along verse is resolved inside <ReaderAudioPositionBridge/>, which
  // owns the position subscription and the monotonic clamp. It calls back here
  // only when the resolved verse (or a playback restart) actually changes, so
  // this screen re-renders roughly once per verse instead of ~4x per second.
  const followAlongActiveTrackKey = isCurrentAudioChapter
    ? `${activeAudioTranslationId ?? currentTranslation}:${activeAudioBookId}:${activeAudioChapter}`
    : null;
  const activeFollowAlongVerse = followAlongPlaybackState.verse;
  const didRestartFollowAlongPlayback = followAlongPlaybackState.didRestart;
  const readerInlineActiveVerse = getReaderInlineActiveVerse({
    isCurrentAudioChapter,
    activeFollowAlongVerse,
    focusVerse,
    isShowingRouteChapter,
  });
  const showPremiumReadMode =
    chapterPresentationMode === 'text' && verses.length > 0 && !isLoading && error == null;
  const premiumBottomInset = 18;
  // The squared controls carry a visible surface, so a bare inset let them butt
  // against the status bar / Dynamic Island. This restores the breathing gap the
  // capsule used to get from its own 6pt inset inside the row.
  const sharedTopChromeTop = safeInsets.top + spacing.xs;
  // The floating top chrome is one `minTouchTarget`-tall pill pinned at
  // `sharedTopChromeTop`, so content only needs to clear that plus a gap. The old
  // flat 98 left ~54pt of dead space above the first line.
  const readerContentTopPadding = sharedTopChromeTop + layout.minTouchTarget + spacing.xl;
  const lastReaderScrollJsOffset = useSharedValue(0);
  const lastReaderScrollJsAtBottom = useSharedValue(false);
  const premiumReaderParagraphs = useMemo(() => buildReaderParagraphs(verses), [verses]);
  const scrollReaderToOffset = useCallback(
    (offsetY: number, animated: boolean) => {
      const y = Math.max(offsetY, 0);
      if (showPremiumReadMode) {
        premiumReaderListRef.current?.scrollToOffset({ offset: y, animated });
        return;
      }

      scrollViewRef.current?.scrollTo({
        y,
        animated,
      });
    },
    [showPremiumReadMode]
  );
  const scrollReaderToVerseParagraph = useCallback(
    (verseNumber: number, animated: boolean) => {
      if (!showPremiumReadMode) {
        return false;
      }

      const paragraphIndex = premiumReaderParagraphs.findIndex((paragraph) =>
        paragraph.verses.some((verse) => verse.verse === verseNumber)
      );
      if (paragraphIndex < 0) {
        return false;
      }

      try {
        premiumReaderListRef.current?.scrollToIndex({
          index: paragraphIndex,
          animated,
          viewPosition: 0,
          viewOffset: sharedTopChromeTop + spacing.md,
        });
        return true;
      } catch {
        return false;
      }
    },
    [premiumReaderParagraphs, sharedTopChromeTop, showPremiumReadMode]
  );
  // Scroll-content position of a verse. The premium reader is a virtualized
  // FlatList, so a paragraph's own onLayout `y` is cell-relative and unusable as
  // a scroll offset; offsets are accumulated from measured paragraph heights
  // instead. Only the legacy ScrollView reader lays paragraphs out directly in
  // content space, so only it can read verseOffsetsRef.
  const getReaderVerseOffset = useCallback(
    (verseNumber: number) => {
      if (showPremiumReadMode) {
        return getReaderVerseContentOffset({
          paragraphs: premiumReaderParagraphs,
          paragraphHeights: paragraphHeightsRef.current,
          contentTopOffset: readerContentTopPadding + readerListHeaderHeightRef.current,
          verseNumber,
        });
      }

      return verseOffsetsRef.current[verseNumber] ?? null;
    },
    [premiumReaderParagraphs, readerContentTopPadding, showPremiumReadMode]
  );
  const scrollReaderToMeasuredVerse = useCallback(
    (verseNumber: number, animated: boolean) => {
      const verseOffset = getReaderVerseOffset(verseNumber);
      if (verseOffset == null) {
        return false;
      }

      const targetOffset = getReaderAutoScrollTarget({
        currentScrollOffsetY: readerLastScrollOffsetYRef.current,
        viewportHeight: readerScrollViewportHeightRef.current,
        verseOffsetY: verseOffset,
        triggerViewportFraction: 0.48,
        targetTopOffset: readerContentTopPadding,
      });

      pendingReaderAutoScrollVerseRef.current = null;
      if (targetOffset == null) {
        return true;
      }

      scrollReaderToOffset(targetOffset, animated);
      return true;
    },
    [getReaderVerseOffset, readerContentTopPadding, scrollReaderToOffset]
  );
  const flushPendingReaderFocus = useCallback(
    () =>
      readerFocusScrollRef.current.flush(getReaderVerseOffset, (offset) =>
        scrollReaderToOffset(offset - readerContentTopPadding, false)
      ),
    [getReaderVerseOffset, readerContentTopPadding, scrollReaderToOffset]
  );
  const flushPendingReaderAutoScroll = useCallback(
    (animated: boolean) => {
      if (flushPendingReaderFocus()) return;
      const pendingVerse = pendingReaderAutoScrollVerseRef.current;
      if (
        pendingVerse == null ||
        !showPremiumReadMode ||
        !isCurrentAudioChapter ||
        pendingVerse !== readerInlineActiveVerse
      ) {
        return;
      }

      scrollReaderToMeasuredVerse(pendingVerse, animated);
    },
    [
      flushPendingReaderFocus,
      isCurrentAudioChapter,
      readerInlineActiveVerse,
      scrollReaderToMeasuredVerse,
      showPremiumReadMode,
    ]
  );
  const updateReaderBottomChromeState = useCallback(
    (offsetY: number, viewportHeight: number, nextCollapsed: boolean) => {
      if (readerChromeOwner.value !== readerRouteKey) return;
      readerLastScrollOffsetYRef.current = offsetY;
      readerScrollViewportHeightRef.current = viewportHeight;
      if (nextCollapsed !== readerBottomChromeCollapsedRef.current) {
        readerBottomChromeCollapsedRef.current = nextCollapsed;
        setIsReadBottomChromeCollapsed(nextCollapsed);
      }
    },
    [readerChromeOwner, readerRouteKey]
  );

  useEffect(() => {
    if (showPremiumReadMode) {
      return;
    }

    readerBottomChromeCollapsedRef.current = false;
    rootTabBarCollapseProgressRef.current = 0;
    readerLastScrollOffsetYRef.current = 0;
    readerBottomChromeProgressShared.value = 0;
    if (readerChromeOwner.value === readerRouteKey) {
      rootTabBarScrollProgress.value = 0;
    }
    setIsReadBottomChromeCollapsed(false);
    const rootTabNavigation = getRootTabNavigation();
    if (rootTabNavigation) {
      rootTabNavigation.setOptions({
        tabBarStyle: shouldForceHideRootTabBar ? { display: 'none' } : getRootTabBarStyle(0),
      });
    }
    navigation.setParams({ tabBarCollapseProgress: shouldForceHideRootTabBar ? 1 : 0 });
  }, [
    getRootTabNavigation,
    getRootTabBarStyle,
    navigation,
    readerBottomChromeProgressShared,
    readerChromeOwner,
    readerRouteKey,
    rootTabBarScrollProgress,
    showPremiumReadMode,
    shouldForceHideRootTabBar,
  ]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      const nextOffsetY = event.contentOffset.y;
      const viewportHeight = event.layoutMeasurement.height;
      const contentHeight = event.contentSize.height;
      const isAtBottom =
        viewportHeight > 0 && contentHeight > 0
          ? nextOffsetY + viewportHeight >= contentHeight - spacing.lg
          : false;
      if (readerChromeOwner.value !== readerRouteKey) return;

      const nextProgress = getNextReaderChromeProgress({
        progress: readerBottomChromeProgressShared.value,
        previousOffset: readerChromeOffsetShared.value,
        offset: nextOffsetY,
        viewportHeight,
        contentHeight,
        reduceMotion,
      });
      readerChromeOffsetShared.value = nextOffsetY;
      readerBottomChromeProgressShared.value = nextProgress;
      rootTabBarScrollProgress.value = nextProgress;
      const nextCollapsed = nextProgress >= 0.98;
      // Only bookkeeping crosses to JS. All visible motion above runs for
      // every native scroll frame, including the small deltas of a slow drag.
      const shouldNotifyJs =
        nextCollapsed !== readerChromeCollapsedShared.value ||
        Math.abs(nextOffsetY - lastReaderScrollJsOffset.value) >=
          READER_SCROLL_JS_UPDATE_INTERVAL_PX ||
        isAtBottom !== lastReaderScrollJsAtBottom.value;
      if (!shouldNotifyJs) {
        return;
      }
      readerChromeCollapsedShared.value = nextCollapsed;
      lastReaderScrollJsOffset.value = nextOffsetY;
      lastReaderScrollJsAtBottom.value = isAtBottom;
      runOnJS(updateReaderBottomChromeState)(nextOffsetY, viewportHeight, nextCollapsed);
    },
  });

  const topChromeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      readerBottomChromeProgressShared.value,
      [0, 1],
      [1, 0],
      Extrapolation.CLAMP
    ),
    transform: [
      {
        translateY: interpolate(
          readerBottomChromeProgressShared.value,
          [0, 1],
          [0, -12],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  // Resting play center is 50pt above the capsule top; it lowers 65pt
  // while the tabs and arrows travel 132pt. These paths never intersect.
  const readerDockBaseBottom = rootTabBarHeight + 18;
  const readerDockCollapsedTranslateY = READER_PLAY_COLLAPSE_TRAVEL;

  const bottomDockAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          readerBottomChromeProgressShared.value,
          [0, 1],
          [0, readerDockCollapsedTranslateY],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const planSessionBottomBarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: rootTabBarHeight * readerBottomChromeProgressShared.value,
      },
    ],
    opacity: interpolate(
      readerBottomChromeProgressShared.value,
      [0, 1],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  const swipeX = useSharedValue(0);
  const swipeInFlightRef = useRef(false);

  const handleSwipeNavigation = (direction: 'next' | 'prev') => {
    if (swipeInFlightRef.current) return;
    swipeInFlightRef.current = true;

    // The swipe repaints the page silently; a screen reader would otherwise
    // land in a new chapter with no signal that the reference changed.
    const swipeTarget = direction === 'next' ? nextNavigationTarget : previousNavigationTarget;
    if (swipeTarget) {
      announceForAccessibility(
        `${getTranslatedBookName(swipeTarget.bookId, t)} ${swipeTarget.chapter}`
      );
    }

    if (direction === 'next') {
      void handleNextReadChapter().finally(() => {
        setTimeout(() => {
          swipeInFlightRef.current = false;
        }, 150);
      });
    } else {
      void handlePreviousReadChapter().finally(() => {
        setTimeout(() => {
          swipeInFlightRef.current = false;
        }, 150);
      });
    }
  };

  // A plan session is opened from the Plans tab into the Bible tab's stack, so
  // nothing native sits behind it: every way out (top chevron, back swipe past
  // the first session chapter, Android back) routes through here to the plan.
  const handleExitPlanSession = useCallback(() => {
    if (!showPlanSessionChrome || !activePlanId || !rootNavigationRef.isReady()) {
      return;
    }

    if (activeRhythmSession) {
      rootNavigationRef.navigate('Plans', {
        screen: 'RhythmDetail',
        params: { rhythmId: activeRhythmSession.rhythmId },
      });
      return;
    }

    rootNavigationRef.navigate('Plans', {
      screen: 'PlanDetail',
      params: { planId: activePlanId },
    });
  }, [activePlanId, activeRhythmSession, showPlanSessionChrome]);

  useFocusEffect(
    useCallback(() => {
      if (!showPlanSessionChrome) {
        return undefined;
      }

      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        handleExitPlanSession();
        return true;
      });
      return () => subscription.remove();
    }, [handleExitPlanSession, showPlanSessionChrome])
  );

  // Resolved on the JS thread so the shared, tested swipe model stays the single
  // source of truth for thresholds (worklets cannot call non-worklet functions).
  const handleSwipeEnd = (translationX: number, velocityX: number) => {
    if (swipeInFlightRef.current) return;

    const direction = resolveSwipeChapterNavigation({
      translationX,
      velocityX,
      hasNextChapter,
      hasPrevChapter,
      canExitSession: showPlanSessionChrome,
    });
    if (!direction) return;

    lightHaptic();
    if (direction === 'exit') {
      handleExitPlanSession();
      return;
    }
    handleSwipeNavigation(direction);
  };

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      'worklet';
      swipeX.value = event.translationX;
    })
    .onEnd((event) => {
      'worklet';
      runOnJS(handleSwipeEnd)(event.translationX, event.velocityX);
      swipeX.value = withSpring(0, { damping: 30, stiffness: 300 });
    });

  const swipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipeX.value }],
  }));

  useEffect(() => {
    setCurrentBook(bookId);
    setCurrentChapter(chapter);
  }, [bookId, chapter, setCurrentBook, setCurrentChapter]);

  useEffect(() => {
    if (playbackSequenceEntriesForAudio.length === 0) {
      return;
    }

    setPlaybackSequence(playbackSequenceEntriesForAudio);
  }, [playbackSequenceEntriesForAudio, setPlaybackSequence]);

  useEffect(() => {
    void loadChapter();
    return () => {
      invalidateReaderChapterLoad({
        requestIdRef: chapterLoadRequestIdRef,
        prefetchTaskRef: chapterPrefetchTaskRef,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, chapter, currentTranslation]);

  useEffect(() => {
    if (!activePlanId || typeof planDayNumber !== 'number' || !returnToPlanOnComplete) {
      return;
    }

    setPlanDayResume(activePlanId, planDayNumber, bookId, chapter);
  }, [activePlanId, bookId, chapter, planDayNumber, returnToPlanOnComplete, setPlanDayResume]);

  useEffect(() => {
    const chapterKey = `${currentTranslation}:${bookId}:${chapter}`;
    if (measuredChapterKeyRef.current !== chapterKey) {
      measuredChapterKeyRef.current = chapterKey;
      verseOffsetsRef.current = {};
      paragraphHeightsRef.current = {};
      readerListHeaderHeightRef.current = 0;
      followAlongOffsetsRef.current = {};
    }
    readerFocusScrollRef.current.request(focusVerse ?? null);
    pendingReaderAutoScrollVerseRef.current = null;
    setSelectedVerses([]);
    // Reset monotonic follow-along state on chapter change
    resetFollowAlongClamp();
    if (focusVerse == null) {
      scrollReaderToOffset(0, false);
    }
  }, [
    bookId,
    chapter,
    currentTranslation,
    focusVerse,
    resetFollowAlongClamp,
    scrollReaderToOffset,
  ]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const sessionKey = `${bookId}:${chapter}:${currentTranslation}`;
    if (sessionKeyRef.current === sessionKey) {
      return;
    }

    sessionKeyRef.current = sessionKey;
    const hasText = verses.length > 0;
    const nextSessionMode = hasText
      ? 'read'
      : getInitialChapterSessionMode({
          translationId: currentTranslation,
          audioEnabled,
          hasText,
          autoplayAudio: Boolean(autoplayAudio),
          preferredMode: preferredMode ?? null,
          bookId,
          chapter,
          activeAudioTranslationId,
          activeAudioBookId,
          activeAudioChapter,
        });

    setShowFollowAlongText((current) => {
      if (hasText || nextSessionMode === 'read') {
        return false;
      }

      return current;
    });
    setChapterSessionMode(nextSessionMode);
  }, [
    activeAudioTranslationId,
    activeAudioBookId,
    activeAudioChapter,
    audioEnabled,
    autoplayAudio,
    bookId,
    chapter,
    currentTranslation,
    isLoading,
    preferredMode,
    verses.length,
  ]);

  useEffect(() => {
    if (chapterPresentationMode === 'audio-first') {
      setShowFontSizeSheet(false);
      dismissSelectedVerseSelection();
    }
  }, [chapterPresentationMode, dismissSelectedVerseSelection]);

  useEffect(() => {
    if (isLoading || focusVerse == null) {
      return;
    }

    if (!flushPendingReaderFocus() && readerFocusScrollRef.current.pendingVerse != null) {
      scrollReaderToVerseParagraph(focusVerse, false);
    }
  }, [focusVerse, flushPendingReaderFocus, isLoading, scrollReaderToVerseParagraph, verses]);

  useEffect(() => {
    if (!showFollowAlongText || activeFollowAlongVerse == null) {
      return;
    }

    const verseOffset = followAlongOffsetsRef.current[activeFollowAlongVerse];
    if (verseOffset == null) {
      return;
    }

    followAlongScrollViewRef.current?.scrollTo({
      y: Math.max(verseOffset - 140, 0),
      animated: true,
    });
  }, [activeFollowAlongVerse, showFollowAlongText]);

  useEffect(() => {
    if (!showPremiumReadMode || !isCurrentAudioChapter || readerInlineActiveVerse == null) {
      pendingReaderAutoScrollVerseRef.current = null;
      return;
    }

    if (didRestartFollowAlongPlayback) {
      pendingReaderAutoScrollVerseRef.current = null;
      scrollReaderToOffset(0, true);
      return;
    }

    // Until the paragraphs above the verse have been measured its content
    // offset is unknown, so fall back to FlatList's own index scrolling and
    // retry from onLayout once the measurements land.
    if (!scrollReaderToMeasuredVerse(readerInlineActiveVerse, true)) {
      pendingReaderAutoScrollVerseRef.current = readerInlineActiveVerse;
      scrollReaderToVerseParagraph(readerInlineActiveVerse, true);
    }
  }, [
    didRestartFollowAlongPlayback,
    isCurrentAudioChapter,
    readerInlineActiveVerse,
    scrollReaderToOffset,
    scrollReaderToMeasuredVerse,
    scrollReaderToVerseParagraph,
    showPremiumReadMode,
  ]);

  // Fetch verse timestamps for the active text-backed audio chapter; clear when chapter changes.
  useEffect(() => {
    if (!showFollowAlongText && (!isCurrentAudioChapter || verses.length === 0)) return;

    let isCancelled = false;
    setChapterTimestamps(null);

    void import('../../services/bible/verseTimestamps')
      .then(({ getChapterTimestamps }) => getChapterTimestamps(currentTranslation, bookId, chapter))
      .then((timestamps) => {
        if (!isCancelled) {
          setChapterTimestamps(timestamps);
        }
      })
      .catch((timestampsError) => {
        if (!isCancelled) {
          console.error('Error loading verse timestamps:', timestampsError);
          setChapterTimestamps(null);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [
    showFollowAlongText,
    isCurrentAudioChapter,
    verses.length,
    currentTranslation,
    bookId,
    chapter,
  ]);

  useEffect(() => {
    if (
      !shouldAutoplayChapterAudio({
        translationId: currentTranslation,
        autoplayAudio: Boolean(autoplayAudio),
        audioEnabled,
        isLoading,
        bookId,
        chapter,
        activeAudioTranslationId,
        activeAudioBookId,
        activeAudioChapter,
      })
    ) {
      return;
    }

    const autoplayKey = `${currentTranslation}:${bookId}:${chapter}:${focusVerse ?? 'chapter'}:${chapterPresentationMode}`;
    if (autoplayKeyRef.current === autoplayKey) {
      return;
    }

    autoplayKeyRef.current = autoplayKey;
    // The autoplay param is a one-shot request from the screen that opened the reader.
    // Left set, a later translation switch produced a new key and started audio again,
    // even after the listener had paused or stopped it.
    navigation.setParams({ autoplayAudio: false });

    void playChapter(
      bookId,
      chapter,
      currentTranslationInfo?.audioGranularity === 'verse' ? focusVerse : undefined
    );
  }, [
    activeAudioTranslationId,
    activeAudioBookId,
    activeAudioChapter,
    autoplayAudio,
    audioEnabled,
    bookId,
    chapter,
    chapterPresentationMode,
    currentTranslation,
    currentTranslationInfo,
    focusVerse,
    isLoading,
    navigation,
    playChapter,
  ]);

  useEffect(() => {
    const shouldSync = shouldSyncReaderToActiveAudioChapter({
      audioEnabled,
      bookId,
      chapter,
      activeAudioBookId,
      activeAudioChapter,
      previousActiveAudioBookId: previousActiveAudioBookIdRef.current,
      previousActiveAudioChapter: previousActiveAudioChapterRef.current,
    });

    previousActiveAudioBookIdRef.current = activeAudioBookId;
    previousActiveAudioChapterRef.current = activeAudioChapter;

    if (!shouldSync || activeAudioChapter == null) {
      return;
    }

    navigation.setParams(
      buildReaderChapterRouteParams({
        bookId: activeAudioBookId ?? bookId,
        chapter: activeAudioChapter,
        preferredMode: chapterSessionMode,
        ...resolvePlanSessionRouteParams(activeAudioBookId ?? bookId, activeAudioChapter),
      })
    );
  }, [
    audioEnabled,
    activeAudioBookId,
    activeAudioChapter,
    bookId,
    chapter,
    chapterSessionMode,
    navigation,
    resolvePlanSessionRouteParams,
  ]);

  useEffect(() => {
    const loadAnnotations = async () => {
      const requestId = ++annotationLoadRequestIdRef.current;
      const result = await getAnnotationsForChapter(bookId, chapter);
      if (requestId !== annotationLoadRequestIdRef.current) {
        return;
      }
      if (result.success && result.data) {
        setAnnotations(result.data);
      }
    };
    void loadAnnotations();
  }, [bookId, chapter]);

  // Checkpoint focused foreground reading so a background force-quit does not
  // lose the visit. Hidden tabs remain mounted, so mount/unmount is insufficient.
  useFocusEffect(
    useCallback(() => {
      if (chapterSessionMode !== 'read') return;
      const timer = createReadingTimer((durationSeconds) => {
        trackAnonymousUsageEvent('reading_ended', {
          book_id: bookId,
          chapter,
          translation_id: currentTranslation,
          duration_seconds: durationSeconds,
        });
      });
      timer.setActive(AppState.currentState === 'active');
      const interval = setInterval(timer.checkpoint, 30_000);
      const subscription = AppState.addEventListener('change', (nextState) => {
        timer.setActive(nextState === 'active');
        if (nextState !== 'active') void flushAnonymousUsageEvents();
      });
      return () => {
        subscription.remove();
        clearInterval(interval);
        timer.finish();
        void flushAnonymousUsageEvents();
      };
    }, [bookId, chapter, currentTranslation, chapterSessionMode])
  );

  const {
    audioPortionEndMs,
    audioPortionRangeDurationMs,
    audioPortionShareDraft,
    audioPortionStartMs,
    handleAudioPortionEndSeek,
    handleAudioPortionPreviewEnd,
    handleAudioPortionStartSeek,
    handleCloseAudioPortionSheet,
    handleConfirmAudioPortionShare,
    handleToggleAudioPortionPreview,
    isPreviewingAudioPortion,
    isSharingAudioPortion,
    isWatchingAudioPortionPreview,
    setAudioPortionEndMs,
    setAudioPortionShareDraft,
    setAudioPortionStartMs,
  } = useAudioPortionShare({
    audioPositionRef,
    bookId,
    chapter,
    chapterShareTitle,
    isCurrentAudioChapter,
    resetFollowAlongClamp,
    seekTo,
    status,
    togglePlayPause,
  });

  function loadChapter() {
    return loadReaderChapter({
      requestIdRef: chapterLoadRequestIdRef,
      prefetchTaskRef: chapterPrefetchTaskRef,
      translationId: currentTranslation,
      bookId,
      chapter,
      translation: currentTranslationInfo,
      currentVerseCount: verses.length,
      returnToPlanOnComplete,
      getChapter,
      prefetchNextChapter,
      runAfterInteractions: (task) => InteractionManager.runAfterInteractions(task),
      markChapterRead,
      recoverMissingInstalledPack: (translationId) =>
        useBibleStore.getState().recoverMissingInstalledPack(translationId),
      setIsLoading,
      setError,
      setVerses,
      setVersesChapterKey,
      t,
    });
  }

  const handleCompletePlanDay = useCallback(async () => {
    if (
      !activePlanId ||
      typeof planDayNumber !== 'number' ||
      !returnToPlanOnComplete ||
      !activePlanProgress ||
      activePlanProgress.is_completed
    ) {
      return;
    }

    if (activePlanChapterIndex < 0 || !isLastPlanChapter) {
      return;
    }

    const completionKey = `${activePlanId}:${planDayNumber}:${activePlanSessionKey ?? 'day'}:${activeChapterKey}`;
    if (planDayCompletionGuardRef.current === completionKey) {
      return;
    }

    planDayCompletionGuardRef.current = completionKey;
    try {
      // Ticking the step is the read: record it today even for chapters read on
      // an earlier day (a weekly Kathisma, a second year through the Bible), or
      // the streak and reading calendar would never see a plan reader's day.
      if (chapterSessionMode === 'read') {
        for (const read of getPlanStepReadChapters(activePlanSessionEntries)) {
          markChapterRead(read.bookId, read.chapter);
        }
      }

      // L20: both service calls apply the completion to the local plan store
      // synchronously and push to Supabase in the background, so this await resolves
      // immediately without gating navigation on an un-timed network round-trip.
      const completionResult =
        activePlanIsMultiSession && activePlanSessionKey
          ? await markPlanSessionComplete(activePlanId, planDayNumber, activePlanSessionKey)
          : await markDayComplete(activePlanId, planDayNumber);

      if (!completionResult.success) {
        return;
      }

      const shouldReturnToPlanDetail =
        activePlanIsMultiSession && Boolean(completionResult.data?.current_session);

      await stop();
      clearAudioPlaybackSequence();
      setAudioTrack(null, null, null);

      clearPlanDayResume(activePlanId, planDayNumber);

      if (!rootNavigationRef.isReady()) {
        return;
      }

      rootNavigationRef.navigate(
        'Plans',
        shouldReturnToPlanDetail
          ? {
              screen: 'PlanDetail',
              params: { planId: activePlanId },
            }
          : {
              screen: 'PlansHome',
            }
      );
    } finally {
      planDayCompletionGuardRef.current = null;
    }
  }, [
    activeChapterKey,
    activePlanChapterIndex,
    activePlanId,
    activePlanProgress,
    activePlanIsMultiSession,
    activePlanSessionEntries,
    activePlanSessionKey,
    chapterSessionMode,
    clearAudioPlaybackSequence,
    clearPlanDayResume,
    isLastPlanChapter,
    markChapterRead,
    planDayNumber,
    returnToPlanOnComplete,
    setAudioTrack,
    stop,
  ]);

  useEffect(
    () => () => {
      if (listenCountedNoticeTimeoutRef.current) {
        clearTimeout(listenCountedNoticeTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    const activePlanListenTargetKeys =
      activePlanSessionSummary?.targetChapterKeys ?? activePlanDaySummary?.targetChapterKeys ?? [];

    if (
      chapterSessionMode !== 'listen' ||
      !activePlanId ||
      typeof planDayNumber !== 'number' ||
      !activePlanListenTargetKeys.includes(activeChapterKey)
    ) {
      listenCountedBaselineRef.current = null;
      setListenCountedNotice(null);
      return;
    }

    const noticeKey = `${activePlanId}:${planDayNumber}:${activeChapterKey}`;
    if (listenCountedBaselineRef.current?.key === noticeKey) {
      return;
    }

    listenCountedBaselineRef.current = {
      key: noticeKey,
      alreadyCountedForPlan:
        currentChapterListenStatus?.currentChapterListenCountedAt !== null ||
        currentChapterListenStatus?.alreadyCountedForPlan === true,
    };
    setListenCountedNotice(null);
  }, [
    activeChapterKey,
    activePlanDaySummary?.targetChapterKeys,
    activePlanSessionSummary?.targetChapterKeys,
    activePlanId,
    chapterSessionMode,
    currentChapterListenStatus,
    planDayNumber,
  ]);

  useEffect(() => {
    if (
      chapterSessionMode !== 'listen' ||
      !activePlanId ||
      typeof planDayNumber !== 'number' ||
      currentChapterListenStatus?.currentChapterListenCountedAt === null
    ) {
      return;
    }

    const noticeKey = `${activePlanId}:${planDayNumber}:${activeChapterKey}`;
    const baseline = listenCountedBaselineRef.current;
    if (
      !baseline ||
      baseline.key !== noticeKey ||
      baseline.alreadyCountedForPlan ||
      lastListenCountedNoticeKeyRef.current === noticeKey
    ) {
      return;
    }

    lastListenCountedNoticeKeyRef.current = noticeKey;
    const chapterReference = `${getTranslatedBookName(bookId, t)} ${chapter}`;
    setListenCountedNotice(
      t('readingPlans.listenChapterCounted', {
        reference: chapterReference,
        defaultValue: `${chapterReference} counted for today's plan`,
      })
    );

    if (listenCountedNoticeTimeoutRef.current) {
      clearTimeout(listenCountedNoticeTimeoutRef.current);
    }

    listenCountedNoticeTimeoutRef.current = setTimeout(() => {
      setListenCountedNotice((currentNotice) => (currentNotice === null ? currentNotice : null));
      listenCountedNoticeTimeoutRef.current = null;
    }, 2200);
  }, [
    activeChapterKey,
    activePlanId,
    bookId,
    chapter,
    chapterSessionMode,
    currentChapterListenStatus,
    planDayNumber,
    t,
  ]);

  useEffect(
    () => () => {
      if (listenCountedNoticeTimeoutRef.current) {
        clearTimeout(listenCountedNoticeTimeoutRef.current);
        listenCountedNoticeTimeoutRef.current = null;
      }
    },
    []
  );

  const previousSequenceEntry = getAdjacentAudioPlaybackSequenceEntry(
    activePlanPlaybackSequenceEntries,
    bookId,
    chapter,
    -1
  );
  const nextSequenceEntry = getAdjacentAudioPlaybackSequenceEntry(
    activePlanPlaybackSequenceEntries,
    bookId,
    chapter,
    1
  );
  const shouldConstrainChapterNavigationToSession =
    activeRhythmSession != null || showPlanSessionChrome;
  // With an exact chapter map the chevrons skip past everything the translation does not
  // cover — Bhujel runs Joshua 2 past Judges and Ruth to 1 Samuel 1 — and go dead at the ends
  // instead of walking the reader into a chapter with nothing to show.
  const resolveChapterNavigationTarget = (direction: -1 | 1) => {
    if (shouldConstrainChapterNavigationToSession) {
      return null;
    }

    return audioChapterMap
      ? findAdjacentAvailableChapter(bookId, chapter, direction, audioChapterMap)
      : getAdjacentBibleChapter(bookId, chapter, direction);
  };
  const previousNavigationTarget = previousSequenceEntry ?? resolveChapterNavigationTarget(-1);
  const nextNavigationTarget = nextSequenceEntry ?? resolveChapterNavigationTarget(1);
  const hasPrevChapter = previousNavigationTarget != null;
  const hasNextChapter = nextNavigationTarget != null;
  const shouldFillReaderCanvas = chapterPresentationMode === 'audio-first';
  const syncReaderReference = (nextBookId: string, nextChapter: number) => {
    navigation.setParams(
      buildReaderChapterRouteParams({
        bookId: nextBookId,
        chapter: nextChapter,
        preferredMode: chapterSessionMode,
        ...resolvePlanSessionRouteParams(nextBookId, nextChapter),
      })
    );
  };
  const handleCloseFontSizeSheet = () => {
    setShowFontSizeSheet(false);
  };
  const handleReaderThemeChange = (mode: ThemeMode) => {
    setTheme(mode);
    syncPreferences().catch(() => {});
  };
  const handleOpenAllSettings = () => {
    handleCloseFontSizeSheet();

    if (rootNavigationRef.isReady()) {
      rootNavigationRef.navigate('More', { screen: 'Settings' });
    }
  };
  const handleOpenBookPicker = () => {
    navigation.push('BiblePicker', {
      initialBookId: bookId,
    });
  };

  const handleOpenBibleSearch = () => {
    setShowAudioOptionsSheet(false);
    setShowFontSizeSheet(false);
    setShowTranslationSheet(false);
    setShowChapterActionsSheet(false);
    navigation.navigate('BibleBrowser', {
      initialBookId: bookId,
      focusSearch: true,
    });
  };

  const handleCloseTranslationSheet = () => {
    setShowTranslationSheet((current) =>
      getNextTranslationSheetVisibility(current, canShowTranslationSheet, 'dismiss')
    );
  };

  const handleTranslationActivated = (translation: BibleTranslation) => {
    const audioAvailability = getTranslationAudioAvailability(translation, bookId);
    const shouldReplayAudio = shouldReplayActiveAudioForTranslationChange({
      currentTranslationId: currentTranslation,
      nextTranslationId: translation.id,
      audioEnabled: audioAvailability.canPlayAudio,
      bookId,
      chapter,
      activeAudioTranslationId,
      activeAudioBookId,
      activeAudioChapter,
    });

    // Keeps the listener's intent: a playing chapter continues in the new
    // translation, a paused one is re-targeted and stays paused until Play.
    if (shouldReplayAudio) {
      void navigateChapterForTranslation(
        translation.id,
        bookId,
        chapter,
        translation.audioGranularity === 'verse' ? focusVerse : undefined
      );
    }
  };

  const handleToggleFavorite = () => {
    toggleFavorite(bookId, chapter);
    trackBibleExperienceEvent({
      name: 'library_action',
      bookId,
      chapter,
      source: 'reader-actions',
      detail: isFavorite ? 'unfavorite' : 'favorite',
    });
    setShowChapterActionsSheet(false);
  };

  const handleAddToPlaylist = () => {
    addChapterToDefaultPlaylist(bookId, chapter);
    trackBibleExperienceEvent({
      name: 'library_action',
      bookId,
      chapter,
      source: 'reader-actions',
      detail: 'playlist',
    });
    setShowChapterActionsSheet(false);
  };

  const handleAddToQueue = () => {
    addToQueue(bookId, chapter);
    trackBibleExperienceEvent({
      name: 'library_action',
      bookId,
      chapter,
      source: 'reader-actions',
      detail: 'queue',
    });
    setShowChapterActionsSheet(false);
  };

  const handleShareChapter = async () => {
    setShowChapterActionsSheet(false);
    trackBibleExperienceEvent({
      name: 'library_action',
      bookId,
      chapter,
      source: 'reader-actions',
      detail: 'share',
    });
    const bookName = getTranslatedBookName(bookId, t);
    const url = buildBibleDeepLink(bookId, chapter);
    const text = `${bookName} ${chapter}`;
    await Share.share(
      Platform.OS === 'android'
        ? { message: url ? `${text}\n${url}` : text }
        : { message: text, url }
    );
  };

  const {
    chapterAudioShareActionLabel,
    handleOpenChapterAudioShareSheet,
    handleShareAudioPortion,
    handleShareFullChapterAudio,
    pendingChapterAudioShareAction,
    setShowChapterAudioShareSheet,
    showChapterAudioShareSheet,
  } = useChapterAudioShare({
    audioPositionRef,
    bookId,
    chapter,
    chapterShareTitle,
    currentTranslation,
    isCurrentAudioChapter,
    setAudioPortionEndMs,
    setAudioPortionShareDraft,
    setAudioPortionStartMs,
    setShowAudioOptionsSheet,
    setShowChapterActionsSheet,
  });

  const handleDownloadCurrentBookAudio = async () => {
    setShowChapterActionsSheet(false);

    if (!currentTranslationInfo?.hasAudio || !audioEnabled) {
      Alert.alert(t('common.error'), t('bible.audioDownloadFailed'));
      return;
    }

    try {
      await downloadAudioForBook(currentTranslation, bookId);
      trackBibleExperienceEvent({
        name: 'library_action',
        bookId,
        chapter,
        source: 'reader-actions',
        detail: 'download',
      });
      Alert.alert(t('common.ok'), t('bible.audioSavedOffline'));
    } catch (downloadError) {
      Alert.alert(t('common.error'), describeAudioDownloadError(downloadError, t));
    }
  };

  const handleOpenFontSizeOptions = () => {
    setShowAudioOptionsSheet(false);
    setShowChapterActionsSheet(false);
    setShowTranslationSheet(false);

    if (!canAdjustFontSize) {
      return;
    }

    setChapterSessionMode('read');
    setPreferredChapterLaunchMode('read');
    navigation.setParams({ preferredMode: 'read', autoplayAudio: false });
    setShowFontSizeSheet(true);
  };

  const handleOpenTranslationOptions = () => {
    setShowAudioOptionsSheet(false);
    setShowChapterActionsSheet(false);
    setShowFontSizeSheet(false);

    if (!canShowTranslationSheet) {
      return;
    }

    setShowTranslationSheet(true);
  };

  const handlePlayDisplayedChapter = () => {
    // After a relaunch nothing is loaded and only the persisted last track remains.
    // togglePlayPause resumes it from its saved offset; playChapter would restart it.
    const resumesLastPlayedChapter =
      activeAudioBookId == null &&
      isActiveAudioTrackMatch({
        translationId: currentTranslation,
        bookId,
        chapter,
        activeAudioTranslationId: lastPlayedTranslationId,
        activeAudioBookId: lastPlayedBookId,
        activeAudioChapter: lastPlayedChapter,
      });
    if (!isCurrentAudioChapter && !resumesLastPlayedChapter) {
      void playChapter(bookId, chapter);
      return;
    }

    void togglePlayPause();
  };

  const handleListenModeSeek = useCallback(
    (positionMs: number) => {
      const { duration: liveDurationMs } = audioPositionRef.current;
      if (liveDurationMs <= 0 || !isCurrentAudioChapter) {
        return;
      }

      // Allow the verse highlight to jump backward after a user seek
      resetFollowAlongClamp();
      void seekTo(Math.max(0, Math.min(liveDurationMs, positionMs)));
    },
    [isCurrentAudioChapter, resetFollowAlongClamp, seekTo]
  );

  const listenNavigation = {
    isCurrentAudioChapter,
    getAudioStatus: () => useAudioStore.getState().status,
    playChapter,
    syncReaderReference,
    // The arrows keep focus while the chapter swaps under them; say where they went,
    // as the read-mode swipe does.
    announceTarget: (target: { bookId: string; chapter: number }) => {
      announceForAccessibility(`${getTranslatedBookName(target.bookId, t)} ${target.chapter}`);
    },
  };

  const handlePreviousListenChapter = () => {
    return navigateListenChapter({
      ...listenNavigation,
      stepPlayer: previousChapter,
      fallbackTarget: previousNavigationTarget,
    });
  };

  const handleNextListenChapter = () => {
    return navigateListenChapter({
      ...listenNavigation,
      stepPlayer: nextChapter,
      fallbackTarget: nextNavigationTarget,
    });
  };

  const handleReadChapterNavigation = async (
    target: { bookId: string; chapter: number } | null
  ) => {
    if (!target) {
      return;
    }

    // chapter_completed was a write-only event (no RPC/admin consumer) gated on
    // this fragile read-mode navigation path; chapter completion is derived from
    // reading_ended instead (see P1 S7). Emission removed.

    setShowFontSizeSheet((current) => getNextFontSizeSheetVisibility(current, 'chapterChange'));
    setShowTranslationSheet((current) =>
      getNextTranslationSheetVisibility(current, canShowTranslationSheet, 'dismiss')
    );
    setShowChapterActionsSheet(false);

    syncReaderReference(target.bookId, target.chapter);
  };

  const handlePreviousReadChapter = async () => {
    if (isCurrentAudioChapter) {
      const target = await previousChapter();
      if (target) {
        syncReaderReference(target.bookId, target.chapter);
      }
      return;
    }

    await handleReadChapterNavigation(previousNavigationTarget);
  };

  const handleNextReadChapter = async () => {
    if (
      showPlanSessionChrome &&
      chapterSessionMode === 'read' &&
      planReadDockTrailingActionState?.showCompletionAction &&
      hasPlanReadDockNextAction
    ) {
      await handleCompletePlanDay();
      return;
    }

    if (isCurrentAudioChapter) {
      const target = await nextChapter();
      if (target) {
        syncReaderReference(target.bookId, target.chapter);
      }
      return;
    }

    await handleReadChapterNavigation(nextNavigationTarget);
  };

  const planReadDockTrailingActionState =
    showPlanSessionChrome && chapterSessionMode === 'read'
      ? getPlanSessionTrailingActionState({
          isLastPlanChapter,
          hasNextChapter,
        })
      : null;
  const hasPlanReadDockNextAction = Boolean(
    planReadDockTrailingActionState?.showCompletionAction &&
    planReadDockTrailingActionState.isEnabled
  );
  const showPlanReadDockSessionCompletionCopy = hasOtherIncompletePlanSessions;
  const readerPlaybackDockNextIconName =
    planReadDockTrailingActionState?.iconName ?? 'chevron-forward';
  const readerPlaybackDockNextButtonColor =
    showPlanSessionChrome && chapterSessionMode === 'read' && hasPlanReadDockNextAction
      ? colors.accentPrimary
      : undefined;
  const readerPlaybackDockNextIconColor =
    showPlanSessionChrome && chapterSessionMode === 'read' && hasPlanReadDockNextAction
      ? colors.onAccent
      : undefined;
  const readerPlaybackDockNextAccessibilityLabel =
    showPlanSessionChrome &&
    chapterSessionMode === 'read' &&
    planReadDockTrailingActionState?.showCompletionAction
      ? showPlanReadDockSessionCompletionCopy
        ? t('readingPlans.completeSessionCta', {
            defaultValue: 'Complete session',
          })
        : t('readingPlans.completeDayCta', {
            defaultValue: 'Complete day',
          })
      : t('bible.nextChapterHint');
  const readerPlaybackDockNextAccessibilityHint =
    showPlanSessionChrome &&
    chapterSessionMode === 'read' &&
    planReadDockTrailingActionState?.showCompletionAction
      ? showPlanReadDockSessionCompletionCopy
        ? t('readingPlans.completeSessionHint')
        : t('readingPlans.completeDayHint')
      : undefined;
  const hasReaderPlaybackDockNextChapter =
    showPlanSessionChrome && chapterSessionMode === 'read'
      ? hasNextChapter || hasPlanReadDockNextAction
      : hasNextChapter;

  const reloadAnnotations = async () => {
    const result = await getAnnotationsForChapter(bookId, chapter);
    if (result.success && result.data) {
      setAnnotations(result.data);
    }
  };

  const handleCopySelectedVerses = async () => {
    if (!selectedVerseShareText) {
      return;
    }

    await Clipboard.setStringAsync(selectedVerseShareText);
    selectionHaptic();
  };

  const handleCloseSelectedVerses = () => {
    dismissSelectedVerseSelection();
  };

  const handleShareSelectedVerses = async () => {
    if (!selectedVerseShareText) {
      return;
    }

    await Share.share({ message: selectedVerseShareText });
  };

  const handleOpenVerseImageShare = () => {
    if (!selectedVerseShareText) {
      return;
    }

    setShowVerseImageSheet(true);
  };

  const handleSelectVerseImageBackground = (backgroundIndex: number) => {
    setSelectedVerseImageBackgroundIndex(backgroundIndex);
  };

  const handleShareSelectedVerseImage = async () => {
    if (!selectedVerseShareText || isSharingVerseImage) {
      return;
    }

    setIsSharingVerseImage(true);

    try {
      const Sharing = await import('expo-sharing');

      if (await Sharing.isAvailableAsync()) {
        if (verseImageSharePreviewRef.current) {
          const { captureRef } = await import('react-native-view-shot');
          const imageUri = await captureRef(verseImageSharePreviewRef, {
            format: 'png',
            quality: 1,
            result: 'tmpfile',
          });

          setShowVerseImageSheet(false);

          await Sharing.shareAsync(imageUri, {
            dialogTitle: t('groups.share'),
            mimeType: 'image/png',
          });
          return;
        }
      }

      setShowVerseImageSheet(false);
      await Share.share({ message: selectedVerseShareText });
    } catch {
      try {
        setShowVerseImageSheet(false);
        await Share.share({ message: selectedVerseShareText });
      } catch {
        // Ignore share errors.
      }
    } finally {
      setIsSharingVerseImage(false);
    }
  };

  const commitAnnotationEdits = async (edits: ReaderAnnotationEdits) => {
    const succeeded = await applyReaderAnnotationEdits(edits, {
      softDelete: softDeleteAnnotation,
      upsert: upsertAnnotation,
    });
    if (!succeeded) {
      Alert.alert(t('common.error'), t('common.unexpectedError'));
    }
    await reloadAnnotations();
    return succeeded;
  };

  const readerAnnotationEditInput = () => ({
    book: bookId,
    chapter,
    annotations,
    selectedVerses,
    createId: () => Math.random().toString(36).slice(2),
  });

  const handleHighlightSelectedVerses = async (color: string) => {
    if (selectedVerseRanges.length === 0) {
      return;
    }

    if (
      await commitAnnotationEdits(
        planReaderHighlightApply({ ...readerAnnotationEditInput(), color })
      )
    ) {
      setSelectedVerses([]);
      announceForAccessibility(t('interface.highlightAdded'));
    }
  };

  const handleRemoveHighlightSelectedVerses = async (color: string) => {
    if (selectedVerseRanges.length === 0) {
      return;
    }

    if (
      await commitAnnotationEdits(
        planReaderHighlightRemove({ ...readerAnnotationEditInput(), color })
      )
    ) {
      setSelectedVerses([]);
      announceForAccessibility(t('interface.highlightRemoved'));
    }
  };

  const handleNoteSelectedVerses = async (text: string) => {
    if (selectedVerseRanges.length === 0) {
      return;
    }

    if (
      await commitAnnotationEdits(
        planReaderNoteSave({ ...readerAnnotationEditInput(), content: text })
      )
    ) {
      announceForAccessibility(t('annotations.saved'));
    }
  };

  const renderTranslatorFeedbackReviewTools = () => (
    <ChapterFeedbackSummary translationId={currentTranslation} bookId={bookId} chapter={chapter} />
  );

  // The virtualized reader always uses premium typography, so its render signature
  // and FlatList renderItem can be hoisted here and kept stable across renders.
  // Only the inputs `readerParagraphBlockPropsAreEqual` actually compares appear.
  const premiumParagraphRenderSignature = useMemo(
    () =>
      buildReaderParagraphRenderSignature({
        premium: true,
        verseFontSize: scaleValue(typography.readingBody.fontSize),
        verseLineHeight: getReaderVerseLineHeight(scaleValue(typography.readingBody.fontSize)),
        verseNumberSize: scaleValue(typography.readingVerseNumber.fontSize),
        headingFontSize: scaleValue(typography.readingHeading.fontSize),
        readingFontFamily,
        readingFontFamilyBold,
        colors,
        selectedVerses,
        annotations: displayedAnnotations,
      }),
    [
      displayedAnnotations,
      colors,
      readingFontFamily,
      readingFontFamilyBold,
      scaleValue,
      selectedVerses,
    ]
  );
  const renderParagraphBlock = useCallback(
    ({ item, index }: { item: ReaderParagraph; index: number }): ReactElement => (
      <ReaderParagraphBlock
        paragraph={item}
        index={index}
        renderSignature={premiumParagraphRenderSignature}
        activeVerse={readerInlineActiveVerse}
        renderParagraphRef={renderParagraphRef}
      />
    ),
    [premiumParagraphRenderSignature, readerInlineActiveVerse]
  );

  const renderLegacyContent = () => {
    if (isLoading) {
      return <VersesSkeleton count={10} />;
    }

    if (error) {
      return (
        <View
          style={[
            styles.feedbackCard,
            {
              backgroundColor: colors.bibleSurface,
              borderColor: colors.bibleDivider,
            },
          ]}
        >
          <Text style={[styles.feedbackTitle, { color: colors.biblePrimaryText }]}>{error}</Text>
          <TouchableOpacity
            style={[styles.feedbackButton, { backgroundColor: colors.bibleControlBackground }]}
            onPress={loadChapter}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={[styles.feedbackButtonText, { color: colors.bibleBackground }]}>
              {t('common.retry')}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (verses.length === 0 && chapterPresentationMode === 'audio-first') {
      return (
        <View style={styles.audioFirstShell}>
          <ReaderListenMode
            backgroundMusicChoice={backgroundMusicChoice}
            bookId={bookId}
            changeBackgroundMusicChoice={changeBackgroundMusicChoice}
            changePlaybackRate={changePlaybackRate}
            cycleRepeatMode={cycleRepeatMode}
            feedback={feedback}
            handleListenModeSeek={handleListenModeSeek}
            handleNextListenChapter={handleNextListenChapter}
            handlePlayDisplayedChapter={handlePlayDisplayedChapter}
            handlePreviousListenChapter={handlePreviousListenChapter}
            hasNextChapter={hasNextChapter}
            hasPrevChapter={hasPrevChapter}
            isCurrentAudioChapter={isCurrentAudioChapter}
            isLargeText={isLargeText}
            listenCountedNotice={listenCountedNotice}
            playbackRate={playbackRate}
            readerAudioTrack={readerAudioTrack}
            repeatMode={repeatMode}
            showInlineChapterFeedbackComposer={showInlineChapterFeedbackComposer}
            showPlanSessionChrome={showPlanSessionChrome}
            skipBackward={skipBackward}
            skipForward={skipForward}
            sleepTimerRemaining={sleepTimerRemaining}
            startSleepTimer={startSleepTimer}
            status={status}
          />
        </View>
      );
    }

    if (verses.length === 0) {
      return (
        <View
          style={[
            styles.feedbackCard,
            {
              backgroundColor: colors.bibleSurface,
              borderColor: colors.bibleDivider,
            },
          ]}
        >
          <Text style={[styles.feedbackTitle, { color: colors.biblePrimaryText }]}>
            {t('bible.noVersesAvailable', { book: getTranslatedBookName(bookId, t), chapter })}
          </Text>
          <Text style={[styles.feedbackBody, { color: colors.bibleSecondaryText }]}>
            {t('bible.fullBibleComingSoon')}
          </Text>
        </View>
      );
    }

    return (
      <ReaderVerseList
        usePremiumTypography={false}
        canShowTranslationSheet={canShowTranslationSheet}
        displayedAnnotations={displayedAnnotations}
        flushPendingReaderAutoScroll={flushPendingReaderAutoScroll}
        flushPendingReaderFocus={flushPendingReaderFocus}
        handleReaderMomentumScrollEnd={handleReaderMomentumScrollEnd}
        handleReaderScrollBeginDrag={handleReaderScrollBeginDrag}
        handleReaderScrollEndDrag={handleReaderScrollEndDrag}
        highlightByVerse={highlightByVerse}
        isShowingRouteChapterRef={isShowingRouteChapterRef}
        paragraphHeightsRef={paragraphHeightsRef}
        pendingReaderAutoScrollVerseRef={pendingReaderAutoScrollVerseRef}
        premiumParagraphRenderSignature={premiumParagraphRenderSignature}
        premiumReaderBottomPadding={premiumReaderBottomPadding}
        premiumReaderListRef={premiumReaderListRef}
        premiumReaderParagraphs={premiumReaderParagraphs}
        readerContentTopPadding={readerContentTopPadding}
        readerFocusScrollRef={readerFocusScrollRef}
        readerInlineActiveVerse={readerInlineActiveVerse}
        readerScrollViewportHeightRef={readerScrollViewportHeightRef}
        readingFontFamily={readingFontFamily}
        readingFontFamilyBold={readingFontFamilyBold}
        renderParagraphBlock={renderParagraphBlock}
        renderParagraphRef={renderParagraphRef}
        renderTranslatorFeedbackReviewTools={renderTranslatorFeedbackReviewTools}
        scaleValue={scaleValue}
        scrollHandler={scrollHandler}
        scrollReaderToVerseParagraph={scrollReaderToVerseParagraph}
        selectedVerseDecorationStyle={selectedVerseDecorationStyle}
        selectedVerseSet={selectedVerseSet}
        selectedVerses={selectedVerses}
        setSelectedVerses={setSelectedVerses}
        setShowFontSizeSheet={setShowFontSizeSheet}
        setShowTranslationSheet={setShowTranslationSheet}
        sharedTopChromeTop={sharedTopChromeTop}
        verseOffsetsRef={verseOffsetsRef}
        verses={verses}
      />
    );
  };

  const renderPremiumReadLayout = () => (
    <View style={styles.premiumReaderLayout}>
      <GestureDetector gesture={swipeGesture}>
        <Animated.View style={[{ flex: 1 }, swipeStyle]}>
          {renderSharedTopChrome(true)}

          <ReaderVerseList
            usePremiumTypography={true}
            renderVirtualized={true}
            canShowTranslationSheet={canShowTranslationSheet}
            displayedAnnotations={displayedAnnotations}
            flushPendingReaderAutoScroll={flushPendingReaderAutoScroll}
            flushPendingReaderFocus={flushPendingReaderFocus}
            handleReaderMomentumScrollEnd={handleReaderMomentumScrollEnd}
            handleReaderScrollBeginDrag={handleReaderScrollBeginDrag}
            handleReaderScrollEndDrag={handleReaderScrollEndDrag}
            highlightByVerse={highlightByVerse}
            isShowingRouteChapterRef={isShowingRouteChapterRef}
            paragraphHeightsRef={paragraphHeightsRef}
            pendingReaderAutoScrollVerseRef={pendingReaderAutoScrollVerseRef}
            premiumParagraphRenderSignature={premiumParagraphRenderSignature}
            premiumReaderBottomPadding={premiumReaderBottomPadding}
            premiumReaderListRef={premiumReaderListRef}
            premiumReaderParagraphs={premiumReaderParagraphs}
            readerContentTopPadding={readerContentTopPadding}
            readerFocusScrollRef={readerFocusScrollRef}
            readerInlineActiveVerse={readerInlineActiveVerse}
            readerScrollViewportHeightRef={readerScrollViewportHeightRef}
            readingFontFamily={readingFontFamily}
            readingFontFamilyBold={readingFontFamilyBold}
            renderParagraphBlock={renderParagraphBlock}
            renderParagraphRef={renderParagraphRef}
            renderTranslatorFeedbackReviewTools={renderTranslatorFeedbackReviewTools}
            scaleValue={scaleValue}
            scrollHandler={scrollHandler}
            scrollReaderToVerseParagraph={scrollReaderToVerseParagraph}
            selectedVerseDecorationStyle={selectedVerseDecorationStyle}
            selectedVerseSet={selectedVerseSet}
            selectedVerses={selectedVerses}
            setSelectedVerses={setSelectedVerses}
            setShowFontSizeSheet={setShowFontSizeSheet}
            setShowTranslationSheet={setShowTranslationSheet}
            sharedTopChromeTop={sharedTopChromeTop}
            verseOffsetsRef={verseOffsetsRef}
            verses={verses}
          />

          <Animated.View
            pointerEvents="box-none"
            style={[
              styles.floatingReaderChapterNavOverlay,
              { bottom: readerDockBaseBottom },
              bottomDockAnimatedStyle,
            ]}
          >
            {/* Locked-in plan reader behavior: read-mode plans reuse the exact shared floating dock above the red plan strip. Do not move the play button into the strip or swap this for a custom plan-only transport without explicit user approval. */}
            <ReaderPlaybackDock
              collapseProgress={readerBottomChromeProgressShared}
              isCollapsed={isReadBottomChromeCollapsed}
              isPlaying={isCurrentAudioChapter && status === 'playing'}
              isLoading={isCurrentAudioChapter && status === 'loading'}
              hidePlayButton={showPlanSessionChrome ? false : hidePlayButtonFromReadingTab}
              hasPreviousChapter={hasPrevChapter}
              hasNextChapter={hasReaderPlaybackDockNextChapter}
              nextAccessibilityHint={readerPlaybackDockNextAccessibilityHint}
              nextAccessibilityLabel={readerPlaybackDockNextAccessibilityLabel}
              nextButtonColor={readerPlaybackDockNextButtonColor}
              nextIconColor={readerPlaybackDockNextIconColor}
              nextIconName={readerPlaybackDockNextIconName}
              onPreviousChapter={() => void handlePreviousReadChapter()}
              onNextChapter={() => void handleNextReadChapter()}
              onPlayPause={handlePlayDisplayedChapter}
            />
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );

  const renderSharedTopChrome = (useAnimatedChrome: boolean) => (
    <Animated.View
      pointerEvents={useAnimatedChrome && isReadBottomChromeCollapsed ? 'none' : 'box-none'}
      accessibilityElementsHidden={useAnimatedChrome && isReadBottomChromeCollapsed}
      importantForAccessibility={
        useAnimatedChrome && isReadBottomChromeCollapsed ? 'no-hide-descendants' : 'auto'
      }
      style={[
        styles.floatingReaderTopBar,
        { top: sharedTopChromeTop },
        useAnimatedChrome ? topChromeAnimatedStyle : null,
      ]}
    >
      <View style={styles.floatingReaderReferenceCluster}>
        {showPlanSessionChrome ? (
          <TouchableOpacity
            style={[styles.floatingReaderPlanExitButton]}
            activeOpacity={0.85}
            onPress={handleExitPlanSession}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            accessibilityHint={t('bible.returnToPlanHint')}
          >
            <Ionicons name="chevron-back" size={18} color={colors.biblePrimaryText} />
          </TouchableOpacity>
        ) : null}

        <View style={styles.floatingReaderReferencePill}>
          <View
            pointerEvents="none"
            style={[
              styles.floatingReaderReferencePillBackground,
              { backgroundColor: colors.bibleElevatedSurface, borderColor: colors.bibleDivider },
            ]}
          />
          <TouchableOpacity
            style={[
              styles.floatingReaderReferencePillSegment,
              styles.floatingReaderReferencePillBookSegment,
            ]}
            activeOpacity={0.85}
            onPress={handleOpenBookPicker}
            accessibilityRole="button"
            accessibilityLabel={`${getTranslatedBookName(bookId, t)} ${chapter}`}
            accessibilityHint={t('bible.openBookAndChapterPickerHint')}
          >
            <Text
              style={[
                styles.floatingReaderReferencePillPrimary,
                { color: colors.biblePrimaryText },
              ]}
              numberOfLines={1}
              maxFontSizeMultiplier={READER_REFERENCE_PILL_MAX_FONT_SCALE}
            >
              {compactBookName} {chapter}
            </Text>
          </TouchableOpacity>

          <View
            style={[
              styles.floatingReaderReferencePillDivider,
              { backgroundColor: colors.bibleDivider },
            ]}
          />

          <TouchableOpacity
            style={styles.floatingReaderReferencePillSegment}
            activeOpacity={0.85}
            onPress={handleOpenTranslationOptions}
            accessibilityRole="button"
            accessibilityLabel={translationLabel}
            accessibilityHint={t('bible.openTranslationOptionsHint')}
            disabled={!canShowTranslationSheet}
          >
            <Text
              style={[
                styles.floatingReaderReferencePillTranslation,
                { color: colors.biblePrimaryText },
              ]}
              numberOfLines={1}
              maxFontSizeMultiplier={READER_REFERENCE_PILL_MAX_FONT_SCALE}
            >
              {translationLabel}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.floatingReaderTopActionGroup}>
        {audioEnabled ? (
          <TouchableOpacity
            style={[
              styles.floatingReaderMenuButton,
              { backgroundColor: colors.bibleElevatedSurface, borderColor: colors.bibleDivider },
            ]}
            activeOpacity={0.85}
            hitSlop={TOP_ACTION_HIT_SLOP}
            onPress={() => {
              setShowFontSizeSheet(false);
              setShowTranslationSheet(false);
              setShowChapterActionsSheet(false);
              setShowAudioOptionsSheet(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('audio.nowPlaying')}
          >
            <View style={styles.floatingReaderMenuButtonContent}>
              <Ionicons
                name="volume-medium-outline"
                size={TOP_ACTION_ICON_SIZE}
                color={colors.biblePrimaryText}
              />
            </View>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={[
            styles.floatingReaderMenuButton,
            { backgroundColor: colors.bibleElevatedSurface, borderColor: colors.bibleDivider },
          ]}
          activeOpacity={0.85}
          hitSlop={TOP_ACTION_HIT_SLOP}
          onPress={handleOpenBibleSearch}
          accessibilityRole="button"
          accessibilityLabel={t('common.search')}
        >
          <View style={styles.floatingReaderMenuButtonContent}>
            <Ionicons name="search" size={TOP_ACTION_ICON_SIZE} color={colors.biblePrimaryText} />
          </View>
        </TouchableOpacity>

        {chapterFeedbackEnabled ? (
          <TouchableOpacity
            style={[
              styles.floatingReaderMenuButton,
              { backgroundColor: colors.bibleElevatedSurface, borderColor: colors.bibleDivider },
            ]}
            activeOpacity={0.85}
            hitSlop={TOP_ACTION_HIT_SLOP}
            onPress={handleOpenChapterFeedback}
            accessibilityRole="button"
            accessibilityLabel={t('bible.chapterFeedback')}
          >
            <View style={styles.floatingReaderMenuButtonContent}>
              <Ionicons
                name="chatbox-ellipses-outline"
                size={TOP_ACTION_ICON_SIZE}
                color={colors.biblePrimaryText}
              />
            </View>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={[
            styles.floatingReaderMenuButton,
            { backgroundColor: colors.bibleElevatedSurface, borderColor: colors.bibleDivider },
          ]}
          activeOpacity={0.85}
          hitSlop={TOP_ACTION_HIT_SLOP}
          onPress={() => {
            setShowAudioOptionsSheet(false);
            setShowFontSizeSheet(false);
            setShowTranslationSheet(false);
            setShowChapterActionsSheet(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('tabs.more')}
        >
          <View style={styles.floatingReaderMenuButtonContent}>
            <Ionicons
              name="ellipsis-horizontal"
              size={TOP_ACTION_ICON_SIZE}
              color={colors.biblePrimaryText}
            />
          </View>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  const renderLegacyReaderLayout = () => (
    <>
      {renderSharedTopChrome(false)}

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        onScrollBeginDrag={() => {
          handleReaderScrollBeginDrag();
          setShowFontSizeSheet((current) => getNextFontSizeSheetVisibility(current, 'scrollStart'));
          setShowTranslationSheet((current) =>
            getNextTranslationSheetVisibility(current, canShowTranslationSheet, 'dismiss')
          );
        }}
        onScrollEndDrag={handleReaderScrollEndDrag}
        onMomentumScrollEnd={handleReaderMomentumScrollEnd}
        contentContainerStyle={[
          styles.content,
          shouldFillReaderCanvas ? styles.immersiveContent : null,
          {
            paddingTop: readerContentTopPadding,
            paddingBottom:
              chapterSessionMode === 'listen' ? premiumBottomInset : premiumBottomInset + 20,
          },
        ]}
      >
        <View
          style={[
            styles.readerShell,
            shouldFillReaderCanvas ? styles.immersiveReaderShell : null,
            { backgroundColor: colors.bibleBackground },
          ]}
        >
          {renderTranslatorFeedbackReviewTools()}
          {renderLegacyContent()}
        </View>
      </ScrollView>
    </>
  );

  if (!book) {
    return null;
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.bibleBackground,
        },
      ]}
    >
      <ReaderAudioPositionBridge
        handleRef={followAlongBridgeRef}
        track={readerAudioTrack}
        verses={verses}
        focusVerse={focusVerse}
        timestamps={chapterTimestamps}
        activeTrackKey={followAlongActiveTrackKey}
        positionRef={audioPositionRef}
        onFollowAlongChange={handleFollowAlongPlaybackChange}
      />
      {isWatchingAudioPortionPreview ? (
        <ReaderAudioPortionPreviewGuard
          track={readerAudioTrack}
          endMs={audioPortionEndMs}
          onReachEnd={handleAudioPortionPreviewEnd}
        />
      ) : null}
      {showPremiumReadMode ? renderPremiumReadLayout() : renderLegacyReaderLayout()}
      <PlanSessionBottomBar
        activePlanChapterIndex={activePlanChapterIndex}
        activePlanDayChapterItems={activePlanDayChapterItems}
        activePlanSessionTitle={activePlanSessionTitle}
        activePlanTitle={activePlanTitle}
        chapterSessionMode={chapterSessionMode}
        handleCompletePlanDay={handleCompletePlanDay}
        handleNextListenChapter={handleNextListenChapter}
        handlePreviousListenChapter={handlePreviousListenChapter}
        hasNextChapter={hasNextChapter}
        hasOtherIncompletePlanSessions={hasOtherIncompletePlanSessions}
        hasPrevChapter={hasPrevChapter}
        isLastPlanChapter={isLastPlanChapter}
        planDayNumber={planDayNumber}
        planSessionBottomBarAnimatedStyle={planSessionBottomBarAnimatedStyle}
        rootTabBarBottomPadding={rootTabBarBottomPadding}
        rootTabBarHeight={rootTabBarHeight}
        showPlanSessionChrome={showPlanSessionChrome}
      />

      <AudioOptionsSheet
        backgroundMusicChoice={backgroundMusicChoice}
        changeBackgroundMusicChoice={changeBackgroundMusicChoice}
        changePlaybackRate={changePlaybackRate}
        cycleRepeatMode={cycleRepeatMode}
        handleNextListenChapter={handleNextListenChapter}
        handleOpenChapterAudioShareSheet={handleOpenChapterAudioShareSheet}
        handlePlayDisplayedChapter={handlePlayDisplayedChapter}
        handlePreviousListenChapter={handlePreviousListenChapter}
        hasNextChapter={hasNextChapter}
        hasPrevChapter={hasPrevChapter}
        isCurrentAudioChapter={isCurrentAudioChapter}
        playbackRate={playbackRate}
        repeatMode={repeatMode}
        setShowAudioOptionsSheet={setShowAudioOptionsSheet}
        showAudioOptionsSheet={showAudioOptionsSheet}
        skipBackward={skipBackward}
        skipForward={skipForward}
        sleepTimerRemaining={sleepTimerRemaining}
        startSleepTimer={startSleepTimer}
        status={status}
      />

      {chapterSessionMode === 'read' ? (
        <View
          pointerEvents="none"
          style={[
            styles.dynamicIslandTopMask,
            {
              height: safeInsets.top + spacing.xs,
              backgroundColor: colors.bibleBackground,
            },
          ]}
        />
      ) : null}

      <ReaderFontSheet
        canAdjustFontSize={canAdjustFontSize}
        canDecrease={canDecrease}
        canIncrease={canIncrease}
        decrease={decrease}
        handleCloseFontSizeSheet={handleCloseFontSizeSheet}
        handleOpenAllSettings={handleOpenAllSettings}
        handleReaderThemeChange={handleReaderThemeChange}
        increase={increase}
        readingFontFamily={readingFontFamily}
        scaleValue={scaleValue}
        showFontSizeSheet={showFontSizeSheet}
        themeMode={themeMode}
      />

      <ChapterActionsSheet
        bookId={bookId}
        canAdjustFontSize={canAdjustFontSize}
        canShowTranslationSheet={canShowTranslationSheet}
        chapter={chapter}
        chapterFeedbackEnabled={chapterFeedbackEnabled}
        handleAddToPlaylist={handleAddToPlaylist}
        handleAddToQueue={handleAddToQueue}
        handleDownloadCurrentBookAudio={handleDownloadCurrentBookAudio}
        handleOpenChapterAudioShareSheet={handleOpenChapterAudioShareSheet}
        handleOpenChapterFeedback={handleOpenChapterFeedback}
        handleOpenFontSizeOptions={handleOpenFontSizeOptions}
        handleOpenTranslationOptions={handleOpenTranslationOptions}
        handleShareChapter={handleShareChapter}
        handleToggleFavorite={handleToggleFavorite}
        isFavorite={isFavorite}
        setShowChapterActionsSheet={setShowChapterActionsSheet}
        showChapterActionsSheet={showChapterActionsSheet}
        showInlineChapterFeedbackComposer={showInlineChapterFeedbackComposer}
      />

      <ChapterFeedbackModal feedback={feedback} bookId={bookId} chapter={chapter} />

      <ChapterAudioShareSheet
        chapterShareTitle={chapterShareTitle}
        handleShareAudioPortion={handleShareAudioPortion}
        handleShareFullChapterAudio={handleShareFullChapterAudio}
        setShowChapterAudioShareSheet={setShowChapterAudioShareSheet}
        showChapterAudioShareSheet={showChapterAudioShareSheet}
      />

      <AudioPortionShareSheet
        audioPortionEndMs={audioPortionEndMs}
        audioPortionRangeDurationMs={audioPortionRangeDurationMs}
        audioPortionShareDraft={audioPortionShareDraft}
        audioPortionStartMs={audioPortionStartMs}
        chapterShareTitle={chapterShareTitle}
        handleAudioPortionEndSeek={handleAudioPortionEndSeek}
        handleAudioPortionStartSeek={handleAudioPortionStartSeek}
        handleCloseAudioPortionSheet={handleCloseAudioPortionSheet}
        handleConfirmAudioPortionShare={handleConfirmAudioPortionShare}
        handleToggleAudioPortionPreview={handleToggleAudioPortionPreview}
        isCurrentAudioChapter={isCurrentAudioChapter}
        isPreviewingAudioPortion={isPreviewingAudioPortion}
        isSharingAudioPortion={isSharingAudioPortion}
        readerAudioTrack={readerAudioTrack}
      />

      <ChapterAudioShareLoadingOverlay
        chapterAudioShareActionLabel={chapterAudioShareActionLabel}
        pendingChapterAudioShareAction={pendingChapterAudioShareAction}
      />

      <ReaderTranslationSheet
        canShowTranslationSheet={canShowTranslationSheet}
        handleCloseTranslationSheet={handleCloseTranslationSheet}
        handleTranslationActivated={handleTranslationActivated}
        showTranslationSheet={showTranslationSheet}
      />

      <FollowAlongTextSheet
        activeFollowAlongVerse={activeFollowAlongVerse}
        bookId={bookId}
        chapter={chapter}
        followAlongOffsetsRef={followAlongOffsetsRef}
        followAlongScrollViewRef={followAlongScrollViewRef}
        isShowingRouteChapter={isShowingRouteChapter}
        setShowFollowAlongText={setShowFollowAlongText}
        showFollowAlongText={showFollowAlongText}
        translationLabel={translationLabel}
        verses={verses}
      />

      <AnnotationActionSheet
        visible={selectedVerses.length > 0}
        referenceLabel={selectedVerseReferenceLabel}
        selectedText={selectedVerseText}
        canAnnotate={true}
        closeButtonAccessibilityLabel={t('common.done')}
        bottomInset={safeInsets.bottom}
        activeHighlightColors={selectedHighlightColors}
        onCopy={() => {
          void handleCopySelectedVerses();
        }}
        onShare={() => {
          void handleShareSelectedVerses();
        }}
        onShareImage={handleOpenVerseImageShare}
        onShareAudio={handleOpenChapterAudioShareSheet}
        onHighlight={handleHighlightSelectedVerses}
        onNote={handleNoteSelectedVerses}
        onRemoveHighlight={handleRemoveHighlightSelectedVerses}
        onClose={() => {
          handleCloseSelectedVerses();
        }}
        existingNote={selectedNoteAnnotation?.content ?? undefined}
      />

      <VerseImageShareSheet
        handleSelectVerseImageBackground={handleSelectVerseImageBackground}
        handleShareSelectedVerseImage={handleShareSelectedVerseImage}
        isSharingVerseImage={isSharingVerseImage}
        selectedVerseImageBackground={selectedVerseImageBackground}
        selectedVerseImageBackgroundIndex={selectedVerseImageBackgroundIndex}
        selectedVerseReferenceLabel={selectedVerseReferenceLabel}
        selectedVerseText={selectedVerseText}
        setShowVerseImageSheet={setShowVerseImageSheet}
        showVerseImageSheet={showVerseImageSheet}
        verseImageBackgroundCount={verseImageBackgroundCount}
        verseImageSharePreviewRef={verseImageSharePreviewRef}
      />
    </View>
  );
}
