import { ChapterFeedbackSummary } from '../../components/feedback';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import {
  StyleSheet,
  FlatList,
  InteractionManager,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getBookById, getCompactTranslatedBookName, getTranslatedBookName } from '../../constants';
import { config } from '../../constants/config';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../design/system';
import { getReadingFontFamily } from '../../design/fonts';
import {
  getAnnotationsForChapter,
  subscribeToAnnotationChanges,
} from '../../services/annotations/annotationService';
import { getChapter, prefetchNextChapter } from '../../services/bible/bibleService';
import { getChapterPresentationMode } from '../../services/bible/presentation';
import { getChapterContentAvailability } from '../../services/bible/contentAvailability';
import { useTranslationContentSummary } from '../../hooks/useTranslationContentSummary';
import { isRemoteAudioAvailable } from '../../services/audio/audioRemote';
import { getAudioAvailability } from '../../services/audio/audioAvailability';
import { formatLocalDateKey } from '../../services/progress/readingActivity';
import { useAudioStore } from '../../stores/audioStore';
import { useAuthStore } from '../../stores/authStore';
import { useBibleStore } from '../../stores/bibleStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useProgressStore } from '../../stores/progressStore';
import { useReadingPlansStore } from '../../stores/readingPlansStore';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { useFontSize } from '../../hooks/useFontSize';
import { useLargeText } from '../../hooks/useLargeText';
import { useLocalToday } from '../../hooks/useLocalToday';
import { TAB_BAR_CAPSULE_SIDE_INSET } from '../../hooks/useTabBarHeight';
import { PlayerBar } from '../../navigation/playerBar/PlayerBar';
import { getTabBarCapsuleFill } from '../../navigation/tabBarCapsuleStyle';
import { TabBarBackground } from '../../navigation/tabNavigatorParts/TabBarBackground';
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
import type { BibleReaderScreenProps } from '../../navigation/types';
import { getBibleSelectionShareTranslationLabel } from './bibleSelectionModel';
import { buildReaderParagraphRenderSignature } from './bibleReaderRenderModel';
import { createReaderFocusScroll } from './readerFocusScroll';
import { HOME_VERSE_BACKGROUND_SOURCES } from '../../data/homeVerseBackgrounds';
import { SHARE_VERSE_BACKGROUND_SOURCES } from '../../data/shareVerseBackgrounds';
import { getHomeVerseBackgroundIndex } from '../../data/homeVerseBackgroundSelection';
import {
  buildReaderParagraphs,
  getReaderInlineActiveVerse,
  getReaderVerseLineHeight,
  isActiveAudioTrackMatch,
  getNextFontSizeSheetVisibility,
  getNextTranslationSheetVisibility,
} from './bibleReaderModel';
import type { ReaderParagraph } from './bibleReaderModel';
import { loadReaderChapter, readerChapterKey, type CancellableTask } from './readerChapterLoader';
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
  ReaderTopChrome,
  ReaderTranslationSheet,
  ReaderVerseList,
  VerseImageShareSheet,
  readerSharedStyles,
  useAudioPortionShare,
  useAudioReturnTarget,
  useChapterFeedback,
  usePlanDayCompletion,
  useReaderAudioSync,
  useReaderChapterActions,
  useReaderChapterLifecycle,
  useReaderChapterNavigation,
  useReaderFollowAlongScroll,
  useReaderPlanSession,
  useReaderPlayerBar,
  useReaderReadingTimer,
  useReaderScrollChrome,
  useReaderScrollTargets,
  useReaderTabBarMotion,
  useStableChapterPresentation,
  useVerseSelection,
} from './reader';
import type { NavigationProp } from './reader';
import { useLatestCallback } from '../../components/audio/playbackControlsParts/useLatestCallback';

// Read Along's text while the reader shows none for the chapter (it loads its own).
const NO_READ_ALONG_VERSES: Verse[] = [];

type VerseTimestamps = import('../../services/bible/verseTimestamps').VerseTimestamps;

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
  const { colors, isDark, themeMode, setTheme } = useTheme();
  const { t } = useTranslation();
  const safeInsets = useSafeAreaInsets();
  const scrollViewRef = useRef<Animated.ScrollView | null>(null);
  const premiumReaderListRef = useRef<FlatList<ReaderParagraph> | null>(null);
  const verseImageSharePreviewRef = useRef<View | null>(null);
  const verseOffsetsRef = useRef<Record<number, number>>({});
  const readerFocusScrollRef = useRef(createReaderFocusScroll());
  const renderParagraphRef = useRef<(paragraph: ReaderParagraph, index: number) => ReactElement>(
    () => null as never
  );
  const pendingReaderAutoScrollVerseRef = useRef<number | null>(null);
  const paragraphHeightsRef = useRef<Record<string, number>>({});
  // Translator review tools render above the paragraphs, pushing every verse
  // down by their measured height.
  const readerListHeaderHeightRef = useRef(0);
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
  const hasDisplayedChapterAudioError = useAudioStore(
    (state) =>
      state.status === 'error' && state.currentBookId === bookId && state.currentChapter === chapter
  );
  // The chapter the reader is stepping to itself (arrows, swipe, audio moving on), which
  // opens with the chrome as it was; see useReaderTabBarMotion.
  const chromeCarryRef = useRef<string | null>(null);
  const chapterLoadRequestIdRef = useRef(0);
  const chapterPrefetchTaskRef = useRef<CancellableTask | null>(null);
  const annotationLoadRequestIdRef = useRef(0);
  const {
    getRootTabBarStyle,
    getRootTabNavigation,
    handleReaderMomentumScrollEnd,
    handleReaderScrollBeginDrag,
    handleReaderScrollEndDrag,
    premiumReaderBottomPadding,
    readerBottomChromeCollapsedRef,
    readerBottomChromeProgressShared,
    readerChromeCollapsedShared,
    readerChromeFingerScrollShared,
    readerChromeOffsetShared,
    readerChromeOwner,
    readerLastScrollOffsetYRef,
    readerRouteKey,
    readerScrollViewportHeightRef,
    reduceMotion,
    rootTabBarBottomPadding,
    rootTabBarCollapseProgressRef,
    rootTabBarHeight,
    rootTabBarScrollProgress,
    screenReaderEnabled,
    shouldForceHideRootTabBar,
  } = useReaderTabBarMotion({
    activePlanId,
    bookId,
    chapter,
    chapterSessionMode,
    chromeCarryRef,
    hasPlayerBarNotice: hasDisplayedChapterAudioError,
    navigation,
    planDayNumber,
    returnToPlanOnComplete,
    route,
    selectedVerses,
    setIsReadBottomChromeCollapsed,
  });

  const verseImageBackgroundCount = SHARE_VERSE_BACKGROUND_SOURCES.length;
  const selectedVerseImageBackground =
    SHARE_VERSE_BACKGROUND_SOURCES[
      verseImageBackgroundCount > 0
        ? selectedVerseImageBackgroundIndex % verseImageBackgroundCount
        : 0
    ] ?? SHARE_VERSE_BACKGROUND_SOURCES[0];
  const dismissSelectedVerseSelection = useCallback(() => {
    setShowVerseImageSheet(false);
    setSelectedVerses((current) => (current.length === 0 ? current : []));
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
  // Only the current translation: another translation's download progress or
  // catalog refresh replaces its own row in `translations`, which must not
  // re-render the whole reader.
  const currentTranslationInfo = useBibleStore((state) =>
    state.translations.find((translation) => translation.id === state.currentTranslation)
  );
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
  const {
    label: fontSizeLabel,
    scaleValue,
    increase,
    decrease,
    canIncrease,
    canDecrease,
  } = useFontSize();
  const {
    status,
    error: audioError,
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
  // A translation the store has no entry for is named by its own id (as the Bible
  // browser does); only BSB itself reads as BSB.
  const translationLabel = currentTranslationInfo?.abbreviation || currentTranslation.toUpperCase();
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
  // A reader left open past midnight (or resumed the next morning) must count today's
  // reads and listens toward today's plan day, not yesterday's.
  const today = useLocalToday();
  const todayDateKey = useMemo(() => formatLocalDateKey(today), [today]);
  const {
    activePlanChapterIndex,
    activePlanDayChapterItems,
    activePlanDaySummary,
    activePlanIsMultiSession,
    activePlanPlaybackSequenceEntries,
    activePlanSessionEntries,
    activePlanSessionKey,
    activePlanSessionSummary,
    activePlanSessionTitle,
    activePlanTitle,
    activeRhythmSession,
    currentChapterListenStatus,
    focusVerse,
    hasOtherIncompletePlanSessions,
    isLastPlanChapter,
    playbackSequenceEntriesForAudio,
    resolvePlanSessionRouteParams,
    showPlanSessionChrome,
  } = useReaderPlanSession({
    activeChapterKey,
    activePlanId,
    activePlanProgress,
    bookId,
    chapter,
    chaptersRead,
    getRootTabBarStyle,
    getRootTabNavigation,
    listeningHistory,
    planDayNumber,
    planSessionKey,
    playbackSequenceEntries,
    requestedFocusVerse,
    returnToPlanOnComplete,
    sessionContext,
    setPlanDayResume,
    today,
    todayDateKey,
  });
  useAudioReturnTarget({
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
  });
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
  const { chapterPresentationMode, stableSessionMode } = useStableChapterPresentation({
    isLoading,
    rawPresentationMode,
    chapterSessionMode,
    initialPresentationMode: currentTranslationInfo?.hasText ? 'text' : rawPresentationMode,
  });
  const canReadDisplayedChapter = chapterPresentationMode === 'text' && verses.length > 0;
  const canAdjustFontSize = canReadDisplayedChapter;
  const canShowTranslationSheet = config.features.multipleTranslations;
  const showMinimalListenChrome =
    chapterPresentationMode === 'audio-first' ||
    (stableSessionMode === 'listen' && !canReadDisplayedChapter);
  const showInlineChapterFeedbackComposer =
    config.features.chapterFeedbackInlineComposer &&
    chapterFeedbackEnabled &&
    showMinimalListenChrome;
  const isShowingRouteChapter =
    versesChapterKey === readerChapterKey(currentTranslation, bookId, chapter);
  // Read at press time: memoized paragraph blocks keep the verse press handler they last
  // rendered with, which can predate the chapter change.
  const isShowingRouteChapterRef = useRef(isShowingRouteChapter);
  // eslint-disable-next-line react-hooks/refs -- latest value for press handlers, see above
  isShowingRouteChapterRef.current = isShowingRouteChapter;
  const {
    displayedAnnotations,
    handleCloseSelectedVerses,
    handleCopySelectedVerses,
    handleHighlightSelectedVerses,
    handleNoteSelectedVerses,
    handleOpenVerseImageShare,
    handleRemoveHighlightSelectedVerses,
    handleSelectVerseImageBackground,
    handleShareSelectedVerseImage,
    handleShareSelectedVerses,
    handleVerseImageSheetDismissed,
    highlightByVerse,
    selectedHighlightColors,
    selectedNoteAnnotation,
    selectedVerseDecorationStyle,
    selectedVerseReferenceLabel,
    selectedVerseSet,
    selectedVerseText,
  } = useVerseSelection({
    annotations,
    bookId,
    chapter,
    dismissSelectedVerseSelection,
    isSharingVerseImage,
    isShowingRouteChapter,
    selectedVerses,
    setAnnotations,
    setIsSharingVerseImage,
    setSelectedVerseImageBackgroundIndex,
    setSelectedVerses,
    setShowVerseImageSheet,
    translationShareLabel,
    verseImageSharePreviewRef,
    verses,
  });
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
  const premiumReaderParagraphs = useMemo(() => buildReaderParagraphs(verses), [verses]);
  const {
    flushPendingReaderAutoScroll,
    flushPendingReaderFocus,
    scrollReaderToMeasuredVerse,
    scrollReaderToOffset,
    scrollReaderToVerseParagraph,
  } = useReaderScrollTargets({
    isCurrentAudioChapter,
    paragraphHeightsRef,
    pendingReaderAutoScrollVerseRef,
    premiumReaderListRef,
    premiumReaderParagraphs,
    readerContentTopPadding,
    readerFocusScrollRef,
    readerInlineActiveVerse,
    readerLastScrollOffsetYRef,
    readerListHeaderHeightRef,
    readerScrollViewportHeightRef,
    scrollViewRef,
    sharedTopChromeTop,
    showPremiumReadMode,
    verseOffsetsRef,
  });
  const { planSessionBottomBarAnimatedStyle, scrollHandler, topChromeAnimatedStyle } =
    useReaderScrollChrome({
      getRootTabBarStyle,
      getRootTabNavigation,
      navigation,
      readerBottomChromeCollapsedRef,
      readerBottomChromeProgressShared,
      readerChromeCollapsedShared,
      readerChromeFingerScrollShared,
      readerChromeOffsetShared,
      readerChromeOwner,
      readerLastScrollOffsetYRef,
      readerRouteKey,
      readerScrollViewportHeightRef,
      reduceMotion,
      rootTabBarCollapseProgressRef,
      rootTabBarHeight,
      rootTabBarScrollProgress,
      screenReaderEnabled,
      setIsReadBottomChromeCollapsed,
      shouldForceHideRootTabBar,
      showPremiumReadMode,
    });
  useReaderChapterLifecycle({
    activeAudioBookId,
    activeAudioChapter,
    activeAudioTranslationId,
    activePlanId,
    audioEnabled,
    autoplayAudio,
    bookId,
    chapter,
    chapterLoadRequestIdRef,
    chapterPrefetchTaskRef,
    chapterPresentationMode,
    currentTranslation,
    dismissSelectedVerseSelection,
    focusVerse,
    hasLoadedRouteChapter: isShowingRouteChapter && !isLoading && error == null,
    loadChapter,
    paragraphHeightsRef,
    pendingReaderAutoScrollVerseRef,
    planDayNumber,
    playbackSequenceEntriesForAudio,
    preferredMode,
    readerFocusScrollRef,
    readerListHeaderHeightRef,
    resetFollowAlongClamp,
    returnToPlanOnComplete,
    scrollReaderToOffset,
    setChapterSessionMode,
    setCurrentBook,
    setCurrentChapter,
    setPlanDayResume,
    setPlaybackSequence,
    setSelectedVerses,
    setShowFontSizeSheet,
    verseOffsetsRef,
    verses,
  });

  useReaderFollowAlongScroll({
    bookId,
    chapter,
    currentTranslation,
    didRestartFollowAlongPlayback,
    flushPendingReaderFocus,
    focusVerse,
    isCurrentAudioChapter,
    isLoading,
    pendingReaderAutoScrollVerseRef,
    readerFocusScrollRef,
    readerInlineActiveVerse,
    scrollReaderToMeasuredVerse,
    scrollReaderToOffset,
    scrollReaderToVerseParagraph,
    setChapterTimestamps,
    showPremiumReadMode,
    verses,
  });

  useReaderAudioSync({
    activeAudioBookId,
    activeAudioChapter,
    activeAudioTranslationId,
    audioEnabled,
    autoplayAudio,
    bookId,
    chapter,
    chapterPresentationMode,
    chapterSessionMode,
    chromeCarryRef,
    currentTranslation,
    currentTranslationInfo,
    focusVerse,
    holdChapterFollow: selectedVerses.length > 0,
    isLoading,
    navigation,
    playChapter,
    routeKey: route.key,
    resolvePlanSessionRouteParams,
  });

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
    // A sign-in or sign-out elsewhere swaps whose annotations the store holds while this
    // chapter stays open; without a reload it kept drawing the previous account's.
    return subscribeToAnnotationChanges(() => {
      void loadAnnotations();
    });
  }, [bookId, chapter]);

  useReaderReadingTimer({ bookId, chapter, chapterSessionMode, currentTranslation });

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

  const { handleCompletePlanDay } = usePlanDayCompletion({
    activeChapterKey,
    activePlanChapterIndex,
    activePlanDaySummary,
    activePlanId,
    activePlanIsMultiSession,
    activePlanProgress,
    activePlanSessionEntries,
    activePlanSessionKey,
    activePlanSessionSummary,
    bookId,
    chapter,
    chapterSessionMode,
    clearAudioPlaybackSequence,
    clearPlanDayResume,
    currentChapterListenStatus,
    isLastPlanChapter,
    markChapterRead,
    planDayNumber,
    returnToPlanOnComplete,
    setAudioTrack,
    setListenCountedNotice,
    stop,
  });

  const {
    handleExitPlanSession,
    handleListenModeSeek,
    handleNextListenChapter,
    handleNextReadChapter,
    handlePlayDisplayedChapter,
    handlePreviousListenChapter,
    handlePreviousReadChapter,
    hasNextChapter,
    hasPrevChapter,
    hasReaderBarNextChapter,
    readerBarNextAccessibilityHint,
    readerBarNextAccessibilityLabel,
    readerBarNextIsCompletion,
    shouldFillReaderCanvas,
    swipeGesture,
    swipeStyle,
  } = useReaderChapterNavigation({
    activeAudioBookId,
    activePlanId,
    activePlanPlaybackSequenceEntries,
    activeRhythmSession,
    audioChapterMap,
    audioPositionRef,
    bookId,
    canShowTranslationSheet,
    chapter,
    chapterPresentationMode,
    chapterSessionMode,
    chromeCarryRef,
    currentTranslation,
    handleCompletePlanDay,
    hasOtherIncompletePlanSessions,
    isCurrentAudioChapter,
    isLastPlanChapter,
    lastPlayedBookId,
    lastPlayedChapter,
    lastPlayedTranslationId,
    navigation,
    nextChapter,
    playChapter,
    previousChapter,
    resetFollowAlongClamp,
    resolvePlanSessionRouteParams,
    seekTo,
    setShowChapterActionsSheet,
    setShowFontSizeSheet,
    setShowTranslationSheet,
    showPlanSessionChrome,
    togglePlayPause,
  });
  // Read Along is memoized; the reader's transport handlers are rebuilt every render.
  const handleOpenReadAlong = useCallback(() => setShowFollowAlongText(true), []);
  const handleCloseReadAlong = useCallback(() => setShowFollowAlongText(false), []);
  const handleReadAlongPreviousChapter = useLatestCallback(() => {
    void handlePreviousListenChapter();
  });
  const handleReadAlongNextChapter = useLatestCallback(() => {
    void handleNextListenChapter();
  });
  const handleReadAlongPlayPause = useLatestCallback(handlePlayDisplayedChapter);
  const {
    chapterAudioShareActionLabel,
    handleAddToPlaylist,
    handleAddToQueue,
    handleCloseFontSizeSheet,
    handleCloseTranslationSheet,
    handleDownloadCurrentBookAudio,
    handleOpenAllSettings,
    handleOpenBibleSearch,
    handleOpenBookPicker,
    handleOpenChapterAudioShareSheet,
    handleOpenFontSizeOptions,
    handleOpenTranslationOptions,
    handleReaderThemeChange,
    handleShareAudioPortion,
    handleShareChapter,
    handleShareFullChapterAudio,
    handleToggleFavorite,
    handleTranslationActivated,
    pendingChapterAudioShareAction,
    setShowChapterAudioShareSheet,
    showChapterAudioShareSheet,
  } = useReaderChapterActions({
    activeAudioBookId,
    activeAudioChapter,
    activeAudioTranslationId,
    addChapterToDefaultPlaylist,
    addToQueue,
    audioEnabled,
    audioPositionRef,
    bookId,
    canAdjustFontSize,
    canShowTranslationSheet,
    chapter,
    chapterShareTitle,
    currentTranslation,
    currentTranslationInfo,
    downloadAudioForBook,
    focusVerse,
    getTranslationAudioAvailability,
    isCurrentAudioChapter,
    isFavorite,
    navigateChapterForTranslation,
    navigation,
    setAudioPortionEndMs,
    setAudioPortionShareDraft,
    setAudioPortionStartMs,
    setChapterSessionMode,
    setPreferredChapterLaunchMode,
    setShowAudioOptionsSheet,
    setShowChapterActionsSheet,
    setShowFontSizeSheet,
    setShowTranslationSheet,
    setTheme,
    toggleFavorite,
  });

  const readerShowsPlayerRow = !showMinimalListenChrome && (verses.length > 0 || !isLoading);

  // The player bar (in the tab bar, or above the plan strip) carries this reader's
  // transport: Play starts the displayed chapter, the chevrons follow the plan or
  // rhythm session, and the sound button opens the Audio sheet.
  useReaderPlayerBar({
    routeKey: route.key,
    controls: {
      // Not on the listen page (it has its own transport), and not before a first
      // chapter has loaded, so an audio-only chapter never flashes the row on its way in.
      showsPlayer: readerShowsPlayerRow,
      showPlayButton: showPlanSessionChrome || !hidePlayButtonFromReadingTab,
      isPlaying: isCurrentAudioChapter && status === 'playing',
      isLoading: isCurrentAudioChapter && status === 'loading',
      errorMessage:
        readerShowsPlayerRow && isCurrentAudioChapter && status === 'error' ? audioError : null,
      hasPrevious: hasPrevChapter,
      hasNext: hasReaderBarNextChapter,
      nextIsCompletion: readerBarNextIsCompletion,
      nextAccessibilityLabel: readerBarNextAccessibilityLabel,
      nextAccessibilityHint: readerBarNextAccessibilityHint,
      showsProgress: isCurrentAudioChapter,
    },
    actions: {
      playPause: handlePlayDisplayedChapter,
      previous: () => void handlePreviousReadChapter(),
      next: () => void handleNextReadChapter(),
      openAudioSheet: () => setShowAudioOptionsSheet(true),
    },
  });

  // The read list takes this as its header component, so it must keep its identity across
  // renders: a new function each render is a new component type, which remounted the
  // summary (and refetched it for council reviewers) on every reader re-render.
  const renderTranslatorFeedbackReviewTools = useCallback(
    () => (
      <ChapterFeedbackSummary
        translationId={currentTranslation}
        bookId={bookId}
        chapter={chapter}
      />
    ),
    [bookId, chapter, currentTranslation]
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
        annotations: displayedAnnotations,
        screenReaderEnabled,
      }),
    [
      displayedAnnotations,
      colors,
      readingFontFamily,
      readingFontFamilyBold,
      scaleValue,
      screenReaderEnabled,
    ]
  );
  const renderParagraphBlock = useCallback(
    ({ item, index }: { item: ReaderParagraph; index: number }): ReactElement => (
      <ReaderParagraphBlock
        paragraph={item}
        index={index}
        renderSignature={premiumParagraphRenderSignature}
        activeVerse={readerInlineActiveVerse}
        selectedVerses={selectedVerseSet}
        renderParagraphRef={renderParagraphRef}
      />
    ),
    [premiumParagraphRenderSignature, readerInlineActiveVerse, selectedVerseSet]
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
            errorMessage={audioError}
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
            onOpenReadAlong={handleOpenReadAlong}
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
        screenReaderEnabled={screenReaderEnabled}
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
          <ReaderTopChrome
            useAnimatedChrome={true}
            audioEnabled={audioEnabled}
            bookId={bookId}
            canShowTranslationSheet={canShowTranslationSheet}
            chapter={chapter}
            chapterFeedbackEnabled={chapterFeedbackEnabled}
            compactBookName={compactBookName}
            handleExitPlanSession={handleExitPlanSession}
            handleOpenBibleSearch={handleOpenBibleSearch}
            handleOpenBookPicker={handleOpenBookPicker}
            handleOpenChapterFeedback={handleOpenChapterFeedback}
            handleOpenTranslationOptions={handleOpenTranslationOptions}
            isReadBottomChromeCollapsed={isReadBottomChromeCollapsed}
            setShowAudioOptionsSheet={setShowAudioOptionsSheet}
            setShowChapterActionsSheet={setShowChapterActionsSheet}
            setShowFontSizeSheet={setShowFontSizeSheet}
            setShowTranslationSheet={setShowTranslationSheet}
            sharedTopChromeTop={sharedTopChromeTop}
            showPlanSessionChrome={showPlanSessionChrome}
            topChromeAnimatedStyle={topChromeAnimatedStyle}
            translationLabel={translationLabel}
          />

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
            screenReaderEnabled={screenReaderEnabled}
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
        </Animated.View>
      </GestureDetector>
    </View>
  );

  const renderLegacyReaderLayout = () => (
    <>
      <ReaderTopChrome
        useAnimatedChrome={false}
        audioEnabled={audioEnabled}
        bookId={bookId}
        canShowTranslationSheet={canShowTranslationSheet}
        chapter={chapter}
        chapterFeedbackEnabled={chapterFeedbackEnabled}
        compactBookName={compactBookName}
        handleExitPlanSession={handleExitPlanSession}
        handleOpenBibleSearch={handleOpenBibleSearch}
        handleOpenBookPicker={handleOpenBookPicker}
        handleOpenChapterFeedback={handleOpenChapterFeedback}
        handleOpenTranslationOptions={handleOpenTranslationOptions}
        isReadBottomChromeCollapsed={isReadBottomChromeCollapsed}
        setShowAudioOptionsSheet={setShowAudioOptionsSheet}
        setShowChapterActionsSheet={setShowChapterActionsSheet}
        setShowFontSizeSheet={setShowFontSizeSheet}
        setShowTranslationSheet={setShowTranslationSheet}
        sharedTopChromeTop={sharedTopChromeTop}
        showPlanSessionChrome={showPlanSessionChrome}
        topChromeAnimatedStyle={topChromeAnimatedStyle}
        translationLabel={translationLabel}
      />

      <ScrollView
        ref={scrollViewRef}
        style={readerSharedStyles.scrollView}
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
    // BibleStack's route guard returns an unknown book to the browser before the reader
    // mounts; this covers anything that still renders it, so the page is never a dead end.
    return (
      <View
        style={[
          styles.container,
          styles.missingBook,
          { backgroundColor: colors.bibleBackground, paddingTop: safeInsets.top },
        ]}
      >
        <Text
          accessibilityRole="header"
          style={[styles.feedbackTitle, { color: colors.biblePrimaryText }]}
        >
          {t('common.error')}
        </Text>
        <TouchableOpacity
          style={[styles.feedbackButton, { backgroundColor: colors.bibleControlBackground }]}
          onPress={() => navigation.popTo('BibleBrowser')}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <Text style={[styles.feedbackButtonText, { color: colors.bibleBackground }]}>
            {t('common.back')}
          </Text>
        </TouchableOpacity>
      </View>
    );
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
        isCollapsed={isReadBottomChromeCollapsed}
        isLastPlanChapter={isLastPlanChapter}
        planDayNumber={planDayNumber}
        planSessionBottomBarAnimatedStyle={planSessionBottomBarAnimatedStyle}
        rootTabBarBottomPadding={rootTabBarBottomPadding}
        rootTabBarHeight={rootTabBarHeight}
        showPlanSessionChrome={showPlanSessionChrome}
      />

      {typeof activePlanId === 'string' && readerShowsPlayerRow ? (
        // Locked-in plan reader behavior: a plan route hides the root tabs, and the same
        // player capsule the tab bar carries floats above the red plan strip instead. Do
        // not move the play button into the strip or swap this for a custom plan-only
        // transport without explicit user approval.
        <PlayerBar
          scope="reader"
          progress={rootTabBarScrollProgress}
          followsScroll={true}
          bottomOffset={
            showPlanSessionChrome ? rootTabBarHeight + spacing.sm : rootTabBarBottomPadding
          }
          collapsedBottomOffset={rootTabBarBottomPadding}
          sideInset={TAB_BAR_CAPSULE_SIDE_INSET}
          // A fresh element per render on purpose: the plan capsule redraws with the
          // reader, as the dock did, so its collapse styles are re-read whenever the
          // reader resets its chrome (a chapter change) rather than kept from the render
          // before the reset.
          background={
            <TabBarBackground
              isDark={isDark}
              fill={getTabBarCapsuleFill(colors.bibleSurface)}
              stroke={colors.bibleDivider}
            />
          }
          frameStyle={styles.planSessionPlayerBar}
        />
      ) : null}

      <AudioOptionsSheet
        backgroundMusicChoice={backgroundMusicChoice}
        changeBackgroundMusicChoice={changeBackgroundMusicChoice}
        changePlaybackRate={changePlaybackRate}
        handleDownloadCurrentBookAudio={handleDownloadCurrentBookAudio}
        handleOpenChapterAudioShareSheet={handleOpenChapterAudioShareSheet}
        isCurrentAudioChapter={isCurrentAudioChapter}
        onOpenReadAlong={handleOpenReadAlong}
        playbackRate={playbackRate}
        readerAudioTrack={readerAudioTrack}
        repeatMode={repeatMode}
        setShowAudioOptionsSheet={setShowAudioOptionsSheet}
        showAudioOptionsSheet={showAudioOptionsSheet}
        sleepTimerRemaining={sleepTimerRemaining}
        startSleepTimer={startSleepTimer}
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
        fontSizeLabel={fontSizeLabel}
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
        visible={showFollowAlongText}
        onClose={handleCloseReadAlong}
        track={readerAudioTrack}
        isCurrentAudioChapter={isCurrentAudioChapter}
        readerVerses={isShowingRouteChapter ? verses : NO_READ_ALONG_VERSES}
        translation={currentTranslationInfo}
        isPlaying={isCurrentAudioChapter && (status === 'playing' || status === 'loading')}
        hasPreviousChapter={!showPlanSessionChrome && hasPrevChapter}
        hasNextChapter={!showPlanSessionChrome && hasNextChapter}
        onPreviousChapter={handleReadAlongPreviousChapter}
        onNextChapter={handleReadAlongNextChapter}
        onPlayPause={handleReadAlongPlayPause}
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
        handleVerseImageSheetDismissed={handleVerseImageSheetDismissed}
        isSharingVerseImage={isSharingVerseImage}
        selectedVerseImageBackground={selectedVerseImageBackground}
        selectedVerseImageBackgroundIndex={selectedVerseImageBackgroundIndex}
        selectedVerseReferenceLabel={selectedVerseReferenceLabel}
        selectedVerseText={selectedVerseText}
        setShowVerseImageSheet={setShowVerseImageSheet}
        showVerseImageSheet={showVerseImageSheet}
        translationLanguage={currentTranslationInfo?.language}
        verseImageBackgroundCount={verseImageBackgroundCount}
        verseImageSharePreviewRef={verseImageSharePreviewRef}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  missingBook: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  premiumReaderLayout: {
    flex: 1,
  },
  dynamicIslandTopMask: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 29,
  },
  // Above the plan strip (zIndex 40), which it floats over as both collapse.
  planSessionPlayerBar: {
    zIndex: 41,
  },
  content: {
    paddingHorizontal: 12,
    paddingTop: spacing.lg,
  },
  immersiveContent: {
    flexGrow: 1,
  },
  readerShell: {
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  immersiveReaderShell: {
    flex: 1,
  },
  audioFirstShell: {
    flex: 1,
  },
  feedbackCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 24,
    gap: 14,
    minHeight: 220,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  feedbackTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  feedbackBody: {
    fontSize: 15,
    lineHeight: 24,
  },
  feedbackButton: {
    borderRadius: radius.lg,
    paddingHorizontal: 18,
    paddingVertical: 12,
    minHeight: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
