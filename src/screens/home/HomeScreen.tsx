import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import {
  Alert,
  View,
  Text,
  ImageBackground,
  StyleSheet,
  ScrollView,
  InteractionManager,
  useWindowDimensions,
  AppState,
  type AppStateStatus,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useShallow } from 'zustand/react/shallow';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BookOpen, Flame, Play, Share as ShareGlyph } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { bibleTranslations } from '../../constants/translations';
import {
  getBookById,
  getTranslatedBookName,
  getTranslatedPassageBookName,
} from '../../constants/books';
import { config } from '../../constants/config';
import { FONT_SIZE_SCALES } from '../../constants/fontSizeScales';
import { createThemeColors, useTheme } from '../../contexts/ThemeContext';
import { useDisplayFont } from '../../hooks/useDisplayFont';
import { useLargeText } from '../../hooks/useLargeText';
import { useTabBarHeight } from '../../hooks/useTabBarHeight';
import { useDeviceOffline } from '../../hooks/useDeviceOffline';
import { useTranslationContentSummary } from '../../hooks/useTranslationContentSummary';
import { useAuthStore } from '../../stores/authStore';
import { useBibleStore } from '../../stores/bibleStore';
import { useGatherStore } from '../../stores/gatherStore';
import { selectCurrentStreakDays, useProgressStore } from '../../stores/progressStore';
import { formatLocalDateKey, quantizeListeningMs } from '../../services/progress/readingActivity';
import { useReadingPlansStore } from '../../stores/readingPlansStore';
import {
  FOUNDATION_LESSON_TITLE_KEYS,
  FOUNDATION_TITLE_KEYS,
  gatherFoundations,
} from '../../data/gatherFoundations';
import {
  getHomeVerseBackground,
  HOME_VERSE_BACKGROUND_SOURCES,
} from '../../data/homeVerseBackgrounds';
import { getHomeVerseBackgroundIndex } from '../../data/homeVerseBackgroundSelection';
import { SHARE_VERSE_BACKGROUND_SOURCES } from '../../data/shareVerseBackgrounds';
import { VerseImageShareSheet } from '../bible/reader/VerseImageShareSheet';
import { useVerseImageShare } from '../bible/reader/useVerseImageShare';
import { getHeroScrimLocations, getHomeScreenLayout } from './homeLayoutModel';
import { selectHomePlanShelf } from './homePlanShelfModel';
import { HomePlanShelf } from './HomePlanShelf';
import { HomeSeasonCard } from './HomeSeasonCard';
import { selectHomeSeasonPlan } from './homeSeasonPlanModel';
import { getHomeReadingStats } from './homeReadingStatsModel';
import { HomeReadingHeatmap } from './HomeReadingHeatmap';
import { buildHomeVerseShareMessage } from './homeVerseShareModel';
import { getMillisecondsUntilNextLocalMidnight } from '../../services/bible/dailyScriptureRefresh';
import {
  getMillisecondsUntilNextGreetingChange,
  loadVerseOfDay as loadVerseOfDayFromBible,
  startVerseOfDayRefresh,
  type VerseOfDayLoadOptions,
} from './homeVerseOfDay';
import { formatDailyScriptureReferenceLabel } from '../../services/bible/presentation';
import { getDailyScriptureReference } from '../../services/bible/dailyScripture';
import { isChapterAudioCovered } from '../../services/bible/contentAvailability';
import { getAudioAvailability } from '../../services/audio/audioAvailability';
import { isRemoteAudioAvailable } from '../../services/audio/audioRemote';
import type { ReadingPlan } from '../../services/plans/types';
import { IconButton } from '../../components/ui/IconButton';
import { PressableScale } from '../../components/ui/PressableScale';
import { getReadingFontFamily } from '../../design/fonts';
import type { DailyScripture } from '../../types';
import type { RootTabParamList } from '../../navigation/types';
import { gatherFoundationRoute } from '../../navigation/learnRoutes';
import { countCompletedLessons } from '../learn/gatherPathModel';
import { motion, radius, spacing, typography } from '../../design/system';
import { assertDefined } from '../../utils/assertDefined';
import { hexWithAlpha } from '../../utils/color';
import { lightHaptic } from '../../utils/haptics';
import { createHomeReadyReporter } from '../../services/startup/homeStartupTiming';
import { DISPLAY_TEXT_MAX_FONT_SCALE } from '../../design/largeTextLayout';

type NavigationProp = NativeStackNavigationProp<RootTabParamList>;

/** Records a failed verse-of-the-day share. The crash queue loads only when something failed. */
function reportHomeVerseShareFailure(error: unknown) {
  void import('../../services/diagnostics/crashReportQueue')
    .then(({ reportHandledError }) => reportHandledError('home.shareImage', error))
    .catch(() => undefined);
}

/** Records a plan shelf that failed to load. The crash queue loads only when something failed. */
function reportHomePlansFailure(error: unknown) {
  void import('../../services/diagnostics/crashReportQueue')
    .then(({ reportHandledError }) => reportHandledError('home.readingPlans', error))
    .catch(() => undefined);
}

// The hero is a photograph in both scopes, so its foreground cannot come from
// theme tokens — light ink on a dark scrim is the only readable pairing on the
// vellum scope too. These are the literal on-photo values the design spec names.
const ON_PHOTO_INK = '#FDFAF5';
const ON_PHOTO_EYEBROW = 'rgba(253, 250, 245, 0.94)';
const ON_PHOTO_PILL_FILL = 'rgba(253, 250, 245, 0.92)';
const ON_PHOTO_PILL_INK = '#1A1914';
const ON_PHOTO_PLACEHOLDER = 'rgba(253, 250, 245, 0.18)';
const ON_PHOTO_TEXT_SHADOW = 'rgba(0, 0, 0, 0.25)';

// The scrim darkens the top for the greeting, opens up over the horizon, then
// closes down again under the verse (getHeroScrimLocations). Its final stop is the page colour, so the
// photograph dissolves into the sheet instead of ending on a hard edge.
const HERO_SCRIM_STOPS = [
  'rgba(12, 11, 9, 0.55)',
  'rgba(12, 11, 9, 0.1)',
  'rgba(12, 11, 9, 0.35)',
  'rgba(12, 11, 9, 0.72)',
] as const;

// The action pills hang slightly past the photograph's lower edge. The scrim has
// already dissolved to the page colour there, so the overlap is invisible and
// the sheet's 20pt top padding is measured from the pills, as in the reference.
const HERO_ACTION_OVERHANG = 9;
/**
 * The hero renders twice: once on screen, and once off screen for the share
 * sheet. The shared image is the photograph and the Scripture only — the date,
 * the greeting and the reader's own name stay on their device.
 */

/** Gap between the status bar and the date eyebrow over the photograph. */
const HERO_TOP_PADDING = 14;
const HERO_PILL_HEIGHT = 36;
const SHEET_PADDING_TOP = 20;
const SHEET_GUTTER = spacing.xl;
const SHEET_GAP = spacing.md;
const CHIP_TRACK_HEIGHT = 3;

export function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const homeReadyReporter = useMemo(
    () =>
      createHomeReadyReporter({
        schedule: (report) => {
          let frame: number | undefined;
          const interaction = InteractionManager.runAfterInteractions(() => {
            frame = requestAnimationFrame(report);
          });
          return () => {
            interaction.cancel();
            if (frame !== undefined) cancelAnimationFrame(frame);
          };
        },
        report: () => {
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.log('[EB-T] Home:interaction-ready', Date.now());
          }
        },
      }),
    []
  );
  useEffect(() => () => homeReadyReporter.cancel(), [homeReadyReporter]);
  const { colors, isDark, appearancePalette } = useTheme();
  // The reading card is always the dark scope, in either theme: on vellum it is
  // the one ink object under the photograph, and in dark it is an ordinary card.
  const readingCardScope = useMemo(
    () => ({ colors: createThemeColors('dark', appearancePalette), isDark: true }),
    [appearancePalette]
  );
  const cardColors = readingCardScope.colors;
  const displayFont = useDisplayFont();
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  // Top-to-bottom entrance choreography on first mount; opacity-only when the
  // system asks for reduced motion.
  const sectionEntering = (step: number) =>
    (reduceMotion ? FadeIn : FadeInDown).duration(motion.duration.base).delay(step * 60);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const tabBar = useTabBarHeight();
  // The chips sit side by side at normal sizes; at large text a third of
  // the card held a word per line, so they stack.
  const { rowDirection: chipDirection, isLargeText } = useLargeText();
  const bottomTabBarHeight = tabBar.height;
  const [dailyScripture, setDailyScripture] = useState<DailyScripture | null>(null);
  const [isLoadingVerse, setIsLoadingVerse] = useState(true);
  // Sharing opens the reader's verse-picture editor on today's verse and photograph.
  const [isSharingVerse, setIsSharingVerse] = useState(false);
  const [showVerseImageSheet, setShowVerseImageSheet] = useState(false);
  // Null follows the day's own photograph; a pick in the editor holds until the next day.
  const [verseImageBackgroundPick, setVerseImageBackgroundPick] = useState<{
    index: number;
    day: string;
  } | null>(null);
  const closeVerseImageShareRef = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    // Home freezes off-screen, so the editor closes from the event without waiting for a render.
    const close = () => closeVerseImageShareRef.current();
    const unsubscribeBlur = navigation.addListener('blur', close);
    const unsubscribeFocus = navigation.addListener('focus', close);
    return () => {
      unsubscribeBlur();
      unsubscribeFocus();
    };
  }, [navigation]);
  const [readingPlans, setReadingPlans] = useState<ReadingPlan[]>([]);
  // Everything on Home that depends on the day reads this, not a fresh Date: it
  // advances at local midnight and on each return to the foreground, so a Home left open
  // overnight or resumed hours later does not keep the date and greeting it opened with.
  const [clockMs, setClockMs] = useState(() => Date.now());
  const verseRequestIdRef = useRef(0);
  // Edge-to-edge: the photograph owns the status-bar strip at rest, but once it
  // scrolls away the page would run under the glyphs. From then on the strip
  // gets a page-coloured backdrop (the reader's mask) and theme-coloured glyphs.
  const [heroHeight, setHeroHeight] = useState<number | null>(null);
  const [isStatusBarOverPage, setIsStatusBarOverPage] = useState(false);
  const scrollOffsetRef = useRef(0);
  const photoLeavesStatusBarAt =
    heroHeight === null ? null : heroHeight - HERO_ACTION_OVERHANG - insets.top;
  useEffect(() => {
    setIsStatusBarOverPage(
      photoLeavesStatusBarAt !== null && scrollOffsetRef.current > photoLeavesStatusBarAt
    );
  }, [photoLeavesStatusBarAt]);
  const handleHeroLayout = useCallback((event: LayoutChangeEvent) => {
    setHeroHeight(event.nativeEvent.layout.height);
  }, []);
  // The pills wrap and grow with the OS text size; the verse ends above them.
  const [heroActionRowHeight, setHeroActionRowHeight] = useState<number | null>(null);
  const handleHeroActionRowLayout = useCallback((event: LayoutChangeEvent) => {
    setHeroActionRowHeight(event.nativeEvent.layout.height);
  }, []);
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = event.nativeEvent.contentOffset.y;
      scrollOffsetRef.current = offset;
      // Only a crossing re-renders: the same boolean is a no-op for React.
      setIsStatusBarOverPage(photoLeavesStatusBarAt !== null && offset > photoLeavesStatusBarAt);
    },
    [photoLeavesStatusBarAt]
  );
  const midnightRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const verseSharePreviewRef = useRef<View | null>(null);
  const verseBackground = getHomeVerseBackground(new Date(clockMs));
  // Scripture on the hero follows the in-app reading size like the reader does;
  // the OS text size is applied on top by RN, and the hero grows to fit both.
  const readingFontSize = useAuthStore((state) => state.preferences.fontSize);
  const homeLayout = getHomeScreenLayout(
    screenWidth,
    screenHeight,
    bottomTabBarHeight,
    FONT_SIZE_SCALES[readingFontSize]
  );

  const currentTranslation = useBibleStore((state) => state.currentTranslation);
  const currentBook = useBibleStore((state) => state.currentBook);
  const currentChapter = useBibleStore((state) => state.currentChapter);
  const hasReaderHistory = useBibleStore((state) => state.hasReaderHistory);
  // Home needs content and availability changes, not the selected Bible's download
  // job ticks. Keep all catalog/install fields live while omitting that transient job.
  const currentTranslationInfo = useBibleStore(
    useShallow((state) => {
      const translation = (
        Array.isArray(state.translations) ? state.translations : bibleTranslations
      ).find((entry) => entry.id === state.currentTranslation);
      return translation ? { ...translation, activeDownloadJob: null } : undefined;
    })
  );
  // Borrowed Scripture uses only its source label and reading font, not download state.
  const dailyFallbackTranslationId = dailyScripture?.fallbackTranslationId;
  const dailyFallbackTranslationInfo = useBibleStore(
    useShallow((state) => {
      const translation = dailyFallbackTranslationId
        ? (Array.isArray(state.translations) ? state.translations : bibleTranslations).find(
            (entry) => entry.id === dailyFallbackTranslationId
          )
        : undefined;
      return translation
        ? { abbreviation: translation.abbreviation, language: translation.language }
        : undefined;
    })
  );
  // The verse load reads four fields, plus the text pack it reads them from.
  // Keying it on those rather than on the row object stops a rebuilt-but-equal
  // row (download ticks, catalog hydration) from reloading the verse behind a
  // spinner, while an installed or replaced text pack still reloads it.
  const verseTranslationId = currentTranslationInfo?.id;
  const verseTranslationHasText = currentTranslationInfo?.hasText;
  const verseTranslationHasAudio = currentTranslationInfo?.hasAudio;
  const verseTranslationAudioGranularity = currentTranslationInfo?.audioGranularity;
  const verseTranslationIsDownloaded = currentTranslationInfo?.isDownloaded;
  const verseTranslationTextPackPath = currentTranslationInfo?.textPackLocalPath;
  const verseTranslation = useMemo(
    () =>
      verseTranslationId === undefined
        ? undefined
        : {
            id: verseTranslationId,
            hasText: Boolean(verseTranslationHasText),
            hasAudio: Boolean(verseTranslationHasAudio),
            audioGranularity: verseTranslationAudioGranularity ?? 'none',
            isDownloaded: Boolean(verseTranslationIsDownloaded),
            textPackLocalPath: verseTranslationTextPackPath,
          },
    [
      verseTranslationAudioGranularity,
      verseTranslationHasAudio,
      verseTranslationHasText,
      verseTranslationId,
      verseTranslationIsDownloaded,
      verseTranslationTextPackPath,
    ]
  );
  // isRemoteAudioAvailable() can only say an Every Language manifest is addressable, never
  // that today's chapter is inside it, so an audio-only set with no Matthew (Bhujel) used to
  // offer "available as audio" plus a Listen button for Matthew 7:7. The exact chapter map
  // decides instead; until the manifest resolves it is undefined and Home stays optimistic.
  const dailyAudioChapters = useTranslationContentSummary(currentTranslationInfo)?.audioChapters;
  const dailyScriptureReference = getDailyScriptureReference(new Date(clockMs));
  // Streaming needs the network and a stream that carries today's book (a New Testament
  // audio set has no Isaiah); downloaded audio plays either way.
  const isOffline = useDeviceOffline();
  const remoteAudioAvailable =
    config.features.audioEnabled &&
    !isOffline &&
    isRemoteAudioAvailable(currentTranslation, dailyScriptureReference.bookId) &&
    isChapterAudioCovered(
      dailyAudioChapters,
      dailyScriptureReference.bookId,
      dailyScriptureReference.chapter
    );
  const dailyAudioPlayable =
    currentTranslationInfo != null &&
    getAudioAvailability({
      featureEnabled: config.features.audioEnabled,
      translationHasAudio: currentTranslationInfo.hasAudio,
      remoteAudioAvailable,
      downloadedAudioBooks: currentTranslationInfo.downloadedAudioBooks,
      bookId: dailyScriptureReference.bookId,
    }).canPlayAudio &&
    isChapterAudioCovered(
      dailyAudioChapters,
      dailyScriptureReference.bookId,
      dailyScriptureReference.chapter
    );
  const progressByPlanId = useReadingPlansStore((state) => state.progressByPlanId);

  const completedLessons = useGatherStore((state) => state.completedLessons);

  // Find the active foundation: first one that has started but isn't fully complete.
  // Falls back to foundation-1 if none started yet.
  const foundation = assertDefined(
    (() => {
      const inProgress = gatherFoundations.find((item) => {
        const done = countCompletedLessons(completedLessons[item.id], item.lessons);
        return done > 0 && done < item.lessons.length;
      });
      if (inProgress) return inProgress;
      // All complete? Show the last one. Nothing started? Show the first.
      const allDone = gatherFoundations.every(
        (item) =>
          countCompletedLessons(completedLessons[item.id], item.lessons) >= item.lessons.length
      );
      return allDone ? gatherFoundations[gatherFoundations.length - 1] : gatherFoundations[0];
    })(),
    'a bundled Gather foundation'
  );
  const foundationCompletedLessons = completedLessons[foundation.id] ?? [];
  const foundationCompletedCount = countCompletedLessons(
    foundationCompletedLessons,
    foundation.lessons
  );
  const nextLessonIndex = Math.max(
    0,
    foundation.lessons.findIndex((lesson) => !foundationCompletedLessons.includes(lesson.id))
  );
  const nextLesson = foundation.lessons[nextLessonIndex];
  const foundationTitleKey = FOUNDATION_TITLE_KEYS[foundation.id];
  const foundationTitle = foundationTitleKey
    ? t(foundationTitleKey as Parameters<typeof t>[0])
    : foundation.title;
  const nextLessonTitleKey = nextLesson ? FOUNDATION_LESSON_TITLE_KEYS[nextLesson.id] : undefined;
  const nextLessonTitle = nextLessonTitleKey
    ? t(nextLessonTitleKey as Parameters<typeof t>[0])
    : (nextLesson?.title ?? '');
  const planShelf = useMemo(
    () =>
      selectHomePlanShelf({
        plans: readingPlans,
        progressByPlanId,
        today: new Date(clockMs),
      }),
    [clockMs, progressByPlanId, readingPlans]
  );
  const seasonPlan = useMemo(
    () =>
      selectHomeSeasonPlan({
        plans: readingPlans,
        progressByPlanId,
        today: new Date(clockMs),
      }),
    [clockMs, progressByPlanId, readingPlans]
  );
  const currentBookName = getTranslatedBookName(currentBook, t);
  const currentBookInfo = getBookById(currentBook);
  const hasContinuePassage = hasReaderHistory && currentBookInfo != null;
  const currentPassageLabel = hasContinuePassage
    ? `${currentBookName} ${currentChapter}`
    : t('home.defaultReference');
  const continueFraction =
    hasContinuePassage && currentBookInfo.chapters > 0
      ? currentChapter / currentBookInfo.chapters
      : 0;
  // The weekday alone: the verse's reference shares its line, and the date, the
  // greeting and a "Today's scripture" label all said what the page already shows.
  const weekdayLabel = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { weekday: 'long' }).format(new Date(clockMs)),
    [clockMs, i18n.language]
  );

  // ---- Reading ledger -------------------------------------------------------
  // The streak is the store's own count; the all-time total and the heatmap are
  // derived from the progress maps (homeReadingStatsModel, homeReadingHeatmapModel)
  // so their boundaries stay testable.
  const chaptersRead = useProgressStore((state) => state.chaptersRead);
  const chaptersListened = useProgressStore((state) => state.chaptersListened);
  // Listening time is banked every 30 seconds while audio plays, in any tab; only its
  // per-day chapter equivalent reaches the heatmap, so a tick that crosses no chapter
  // boundary does not rebuild it.
  const listeningMsByDate = useProgressStore(
    useShallow((state) => quantizeListeningMs(state.listeningMsByDate))
  );
  const chaptersByDate = useProgressStore((state) => state.chaptersByDate);
  const streakDays = useProgressStore(selectCurrentStreakDays);

  const heatmapActivity = useMemo(
    () => ({ chaptersRead, chaptersListened, listeningMsByDate, chaptersByDate }),
    [chaptersByDate, chaptersListened, chaptersRead, listeningMsByDate]
  );

  const allTimeStats = useMemo(
    () => getHomeReadingStats({ chaptersRead, chaptersListened }, 'allTime', new Date(clockMs)),
    [chaptersRead, chaptersListened, clockMs]
  );

  const ledgerTotalLabel =
    allTimeStats.firstActivityAt === null
      ? t('home.ledgerNoChapters')
      : t('readingPlans.chapterCount', { count: allTimeStats.chaptersCovered });

  // initial: false keeps More's own list under the calendar, so back returns there.
  const openReadingActivity = useCallback(() => {
    lightHaptic();
    navigation.navigate('More', { screen: 'ReadingActivity', initial: false });
  }, [navigation]);

  const loadVerseOfDay = useCallback(
    (options?: VerseOfDayLoadOptions) =>
      loadVerseOfDayFromBible(
        {
          requestIdRef: verseRequestIdRef,
          translation: verseTranslation,
          audioAvailable: dailyAudioPlayable,
          loadBibleService: () => import('../../services/bible/bibleService'),
          setIsLoadingVerse,
          setDailyScripture,
        },
        options
      ),
    [verseTranslation, dailyAudioPlayable]
  );

  useEffect(
    () =>
      startVerseOfDayRefresh({
        load: loadVerseOfDay,
        requestIdRef: verseRequestIdRef,
        appStateRef,
        midnightTimerRef: midnightRefreshTimerRef,
        addAppStateListener: (listener) => AppState.addEventListener('change', listener),
        runAfterInteractions: (task) => InteractionManager.runAfterInteractions(task),
        msUntilNextLocalMidnight: () => getMillisecondsUntilNextLocalMidnight(),
        msUntilNextGreetingChange: () => getMillisecondsUntilNextGreetingChange(new Date()),
        // Everything keyed on the clock works in whole days, so a return to the
        // foreground within the same day keeps the old value rather than rebuilding
        // the heatmap, plan shelf and ledger for nothing.
        onClockAdvance: () =>
          setClockMs((previous) => {
            const now = Date.now();
            return formatLocalDateKey(new Date(previous)) === formatLocalDateKey(new Date(now))
              ? previous
              : now;
          }),
      }),
    [loadVerseOfDay]
  );

  useEffect(() => {
    let cancelled = false;

    const loadReadingPlans = async () => {
      try {
        // The plan service and its bundled catalog load here rather than with
        // Home, so they stay off the cold-start path until the card needs them.
        const { listReadingPlans } = await import('../../services/plans/readingPlanService');
        if (cancelled) {
          return;
        }
        const result = await listReadingPlans();
        if (!cancelled && result.success) {
          setReadingPlans(result.data ?? []);
        }
      } catch (error) {
        // The shelf is optional on Home: stay without it rather than reject unhandled.
        reportHomePlansFailure(error);
      }
    };

    void loadReadingPlans();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleContinueReading = () => {
    lightHaptic();
    if (!hasReaderHistory) {
      navigation.navigate('Bible', { screen: 'BibleBrowser' });
      return;
    }

    navigation.navigate('Bible', {
      screen: 'BibleReader',
      params: {
        bookId: currentBook,
        chapter: currentChapter,
      },
      initial: false,
    });
  };

  // The shelf's cards own their haptic; these only route.
  const handleOpenPlan = (planId: string) => {
    navigation.navigate('Plans', {
      screen: 'PlanDetail',
      params: { planId },
      initial: false,
    });
  };

  const handleBrowsePlans = () => {
    navigation.navigate('Plans', { screen: 'PlansHome' });
  };

  const handleOpenGather = () => {
    lightHaptic();
    navigation.navigate('Learn', gatherFoundationRoute(foundation.id));
  };

  const dailyReferenceLabel = dailyScripture
    ? formatDailyScriptureReferenceLabel(
        getTranslatedPassageBookName(dailyScripture.bookId, t),
        dailyScripture.chapter,
        dailyScripture.verse,
        dailyScripture.verseEnd
      )
    : null;
  const dailyPassageLabel = dailyScripture
    ? `${getTranslatedPassageBookName(dailyScripture.bookId, t)} ${dailyScripture.chapter}`
    : null;
  const dailyAudioAvailability =
    dailyScripture && currentTranslationInfo
      ? getAudioAvailability({
          featureEnabled: config.features.audioEnabled,
          translationHasAudio: currentTranslationInfo.hasAudio,
          remoteAudioAvailable,
          downloadedAudioBooks: currentTranslationInfo.downloadedAudioBooks,
          bookId: dailyScripture.bookId,
        })
      : null;
  // Downloaded audio is tracked per book, so a partially covered book (Joshua 1-2) would
  // otherwise re-enable Listen for an uncovered chapter of that same book.
  const canPlayDailyAudio =
    dailyScripture != null &&
    Boolean(dailyAudioAvailability?.canPlayAudio) &&
    isChapterAudioCovered(dailyAudioChapters, dailyScripture.bookId, dailyScripture.chapter);
  const shouldShowDailyAudio =
    dailyScripture != null && canPlayDailyAudio && dailyScripture.kind !== 'verse-text';
  const dailyAudioKind =
    shouldShowDailyAudio && dailyScripture?.kind === 'empty'
      ? currentTranslationInfo?.audioGranularity === 'verse'
        ? 'verse-audio'
        : 'section-audio'
      : dailyScripture?.kind;
  const canListenToDailyScripture = canPlayDailyAudio;
  const verseCardTitleLabel =
    dailyAudioKind === 'section-audio' ? t('home.sectionOfTheDay') : t('home.verseOfTheDay');
  // Scripture borrowed from the bundled BSB (the reader's own translation lacks today's
  // passage) names its source, on screen and in what is shared.
  const dailyTextTranslation = dailyFallbackTranslationId
    ? (dailyFallbackTranslationInfo ??
      bibleTranslations.find((translation) => translation.id === dailyFallbackTranslationId))
    : currentTranslationInfo;
  const dailyFallbackAbbreviation = dailyScripture?.fallbackTranslationId
    ? (dailyTextTranslation?.abbreviation ?? dailyScripture.fallbackTranslationId.toUpperCase())
    : null;
  const verseShareReferenceLabel =
    dailyReferenceLabel && dailyFallbackAbbreviation
      ? `${dailyReferenceLabel} · ${dailyFallbackAbbreviation}`
      : (dailyReferenceLabel ?? t('home.defaultReference'));
  const verseShareBodyText =
    dailyScripture?.kind === 'verse-text'
      ? dailyScripture.text?.trim() || t('home.defaultVerse')
      : shouldShowDailyAudio
        ? dailyAudioKind === 'section-audio'
          ? t('home.sectionOfTheDayBody')
          : t('home.verseAudioBody')
        : t('home.defaultVerse');
  const verseBackgroundSource = verseBackground;
  const verseShareMessage = buildHomeVerseShareMessage({
    cardTitle: verseCardTitleLabel,
    referenceLabel: verseShareReferenceLabel,
    bodyText: verseShareBodyText,
  });
  const verseDayKey = new Date(clockMs).toDateString();
  const verseImageBackgroundIndex =
    verseImageBackgroundPick?.day === verseDayKey
      ? verseImageBackgroundPick.index
      : getHomeVerseBackgroundIndex(new Date(clockMs), HOME_VERSE_BACKGROUND_SOURCES.length);
  const verseImageBackground =
    SHARE_VERSE_BACKGROUND_SOURCES[
      verseImageBackgroundIndex % SHARE_VERSE_BACKGROUND_SOURCES.length
    ] ?? verseBackground;
  const { handleCloseVerseImageSheet, handleVerseImageSheetDismissed, shareVerseImage } =
    useVerseImageShare({
      shareText: verseShareMessage,
      isSharingVerseImage: isSharingVerse,
      setIsSharingVerseImage: setIsSharingVerse,
      setShowVerseImageSheet,
      verseImageSharePreviewRef: verseSharePreviewRef,
      resetKey: verseDayKey,
      reportFailure: reportHomeVerseShareFailure,
    });
  closeVerseImageShareRef.current = handleCloseVerseImageSheet;
  const verseScreenEyebrow = `${weekdayLabel} · ${verseShareReferenceLabel}`;
  // Scripture is content, not interface: it renders in the translation's own
  // language, so Lora is swapped for the platform serif on scripts it lacks.
  const verseFontFamily = getReadingFontFamily(dailyTextTranslation?.language);
  // The page-colour fade starts where the verse text ends: the pills' height plus
  // the footer gap, less the part of that which hangs past the photograph.
  const heroScrimLocations = getHeroScrimLocations(
    heroHeight === null ? null : heroHeight - HERO_ACTION_OVERHANG,
    (heroActionRowHeight ?? HERO_PILL_HEIGHT) + spacing.md - HERO_ACTION_OVERHANG
  );
  const heroScrimColors = useMemo(
    () => [...HERO_SCRIM_STOPS, colors.background] as const,
    [colors.background]
  );

  const handlePlayDailyAudio = () => {
    if (!dailyScripture || !canPlayDailyAudio) {
      return;
    }

    lightHaptic();
    navigation.navigate('Bible', {
      screen: 'BibleReader',
      params: {
        bookId: dailyScripture.bookId,
        chapter: dailyScripture.chapter,
        autoplayAudio: true,
        preferredMode: 'listen',
        focusVerse: dailyScripture.verse,
      },
      initial: false,
    });
  };

  const handleReadDailyScripture = () => {
    lightHaptic();
    if (!dailyScripture) {
      navigation.navigate('Bible', { screen: 'BibleBrowser' });
      return;
    }

    const openDailyChapter = () =>
      navigation.navigate('Bible', {
        screen: 'BibleReader',
        params: {
          bookId: dailyScripture.bookId,
          chapter: dailyScripture.chapter,
          focusVerse: dailyScripture.verse,
        },
        initial: false,
      });

    // The reader always shows the selected translation, and borrowed text means that
    // translation cannot show this passage. Reading it in BSB changes the reader's Bible,
    // so ask rather than switch silently.
    const fallbackTranslationId = dailyScripture.fallbackTranslationId;
    if (fallbackTranslationId && dailyFallbackAbbreviation && dailyPassageLabel) {
      Alert.alert(
        t('home.borrowedPassageTitle', {
          passage: dailyPassageLabel,
          translation: currentTranslationInfo?.name ?? currentTranslation.toUpperCase(),
        }),
        t('home.borrowedPassageBody', { fallback: dailyFallbackAbbreviation }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('home.readInTranslation', { translation: dailyFallbackAbbreviation }),
            onPress: () => {
              useBibleStore.getState().setCurrentTranslation(fallbackTranslationId);
              openDailyChapter();
            },
          },
        ]
      );
      return;
    }

    openDailyChapter();
  };

  const renderVerseShareButton = () => (
    <IconButton
      icon={ShareGlyph}
      onPress={handleShareVerseOfTheDay}
      size={HERO_PILL_HEIGHT}
      iconSize={16}
      variant="onPhoto"
      disabled={isSharingVerse}
      accessibilityLabel={t('home.shareVerseOfTheDay')}
      style={styles.heroShareButton}
    />
  );

  const handleShareVerseOfTheDay = () => {
    lightHaptic();
    setShowVerseImageSheet(true);
  };

  const renderVerseOfTheDayCard = () => {
    return (
      <View
        onLayout={handleHeroLayout}
        style={[
          styles.hero,
          {
            // minHeight, not height: a long verse or a large text size grows the
            // hero (and the photograph behind it) instead of shrinking the text.
            minHeight: homeLayout.heroPhotoHeight + HERO_ACTION_OVERHANG,
          },
        ]}
      >
        <ImageBackground
          source={verseBackgroundSource}
          style={[styles.heroPhoto, styles.heroPhotoOverhang]}
          imageStyle={styles.heroPhotoImage}
          resizeMode="cover"
          accessible={false}
        >
          <LinearGradient
            colors={heroScrimColors}
            locations={heroScrimLocations}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.heroScrim}
          />
        </ImageBackground>

        <View style={[styles.heroContent, { paddingTop: insets.top + HERO_TOP_PADDING }]}>
          <View style={styles.heroFooter}>
            {isLoadingVerse && !dailyScripture ? (
              <View style={styles.heroPlaceholder}>
                <View style={[styles.heroPlaceholderBar, styles.heroPlaceholderEyebrow]} />
                <View style={styles.heroPlaceholderBar} />
                <View style={[styles.heroPlaceholderBar, styles.heroPlaceholderBarShort]} />
              </View>
            ) : (
              <>
                <Text style={[styles.heroEyebrow, displayFont.regular]}>{verseScreenEyebrow}</Text>
                <Text
                  style={[
                    styles.verseText,
                    {
                      fontFamily: verseFontFamily,
                      fontSize: homeLayout.verseTextFontSize,
                      lineHeight: homeLayout.verseTextLineHeight,
                    },
                  ]}
                >
                  {verseShareBodyText}
                </Text>
              </>
            )}
            <View style={styles.heroActionRow} onLayout={handleHeroActionRowLayout}>
              {canListenToDailyScripture ? (
                <PressableScale
                  onPress={handlePlayDailyAudio}
                  pressEffect="translate"
                  haptic="light"
                  accessibilityRole="button"
                  accessibilityLabel={t('bible.listen')}
                  style={styles.heroPill}
                >
                  <Play
                    size={14}
                    color={ON_PHOTO_PILL_INK}
                    fill={ON_PHOTO_PILL_INK}
                    strokeWidth={2}
                  />
                  <Text style={styles.heroPillLabel} numberOfLines={2}>
                    {t('bible.listen')}
                  </Text>
                </PressableScale>
              ) : null}
              <PressableScale
                onPress={handleReadDailyScripture}
                pressEffect="translate"
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel={
                  dailyPassageLabel
                    ? t('home.readPassage', { passage: dailyPassageLabel })
                    : t('bible.read')
                }
                style={styles.heroPill}
              >
                <BookOpen size={15} color={ON_PHOTO_PILL_INK} strokeWidth={2} />
                <Text style={styles.heroPillLabel} numberOfLines={2}>
                  {t('bible.read')}
                </Text>
              </PressableScale>
              {renderVerseShareButton()}
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderReadingChip = ({
    label,
    value,
    fraction,
    onPress,
    accessibilityLabel,
  }: {
    label: string;
    value: string;
    fraction: number;
    onPress: () => void;
    accessibilityLabel: string;
  }) => (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.chip,
        chipDirection === 'column' && styles.chipStacked,
        { backgroundColor: hexWithAlpha(cardColors.primaryText, 0.08) },
      ]}
    >
      <Text
        style={[styles.chipLabel, displayFont.regular, { color: cardColors.secondaryText }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
        style={[styles.chipValue, displayFont.bold, { color: cardColors.primaryText }]}
        numberOfLines={isLargeText ? 2 : 1}
      >
        {value}
      </Text>
      <View
        style={[styles.chipTrack, { backgroundColor: hexWithAlpha(cardColors.primaryText, 0.14) }]}
      >
        <View
          testID="reading-chip-progress"
          style={[
            styles.chipTrackFill,
            {
              width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`,
              backgroundColor: cardColors.accentPrimary,
            },
          ]}
        />
      </View>
    </PressableScale>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* The photograph bleeds under the status bar, so its glyphs go light while
          Home owns the screen and revert to the app default on the next tab. */}
      {isFocused ? (
        <StatusBar style={isStatusBarOverPage ? (isDark ? 'light' : 'dark') : 'light'} />
      ) : null}
      <ScrollView
        onLayout={homeReadyReporter.onLayout}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: tabBar.contentClearance,
          },
        ]}
        showsVerticalScrollIndicator={false}
        bounces
        alwaysBounceVertical
        overScrollMode="always"
        contentInsetAdjustmentBehavior="never"
      >
        {renderVerseOfTheDayCard()}

        <View style={styles.sheet}>
          {/* One dark card under the photograph: the streak, a day-by-day heatmap
              of recent reading, then where to pick up. */}
          <Animated.View
            entering={sectionEntering(0)}
            style={[styles.readingCard, { backgroundColor: cardColors.cardBackground }]}
          >
            <View style={styles.ledgerHeader}>
              {/* One element: "12, day streak" rather than a bare number. */}
              <View style={styles.ledgerStreak} accessible>
                <Flame size={18} color={cardColors.accentPrimary} strokeWidth={2} />
                <Text style={[styles.ledgerStreakCount, { color: cardColors.primaryText }]}>
                  {streakDays}
                </Text>
                <Text style={[styles.ledgerStreakUnit, { color: cardColors.primaryText }]}>
                  {t('home.streakUnitLabel', { count: streakDays })}
                </Text>
              </View>
              <Text
                style={[styles.ledgerTotal, { color: cardColors.secondaryText }]}
                numberOfLines={2}
              >
                {ledgerTotalLabel}
              </Text>
            </View>

            <HomeReadingHeatmap
              activity={heatmapActivity}
              nowMs={clockMs}
              onPress={openReadingActivity}
              scope={readingCardScope}
              hideFooter
            />

            <View style={[styles.chipRow, { flexDirection: chipDirection }]}>
              {renderReadingChip({
                label: t('common.continue'),
                value: currentPassageLabel,
                fraction: continueFraction,
                onPress: handleContinueReading,
                accessibilityLabel: `${t('common.continue')} ${currentPassageLabel}`,
              })}
              {renderReadingChip({
                label: t('tabs.gather'),
                value: t('home.lessonChip', { number: nextLessonIndex + 1 }),
                fraction:
                  foundation.lessons.length > 0
                    ? foundationCompletedCount / foundation.lessons.length
                    : 0,
                onPress: handleOpenGather,
                accessibilityLabel: [
                  `${t('tabs.gather')} · ${foundationTitle}`,
                  t('home.lessonsProgress', {
                    completed: foundationCompletedCount,
                    total: foundation.lessons.length,
                  }),
                  t('home.nextLesson', { title: nextLessonTitle }),
                ].join(', '),
              })}
            </View>
          </Animated.View>

          {seasonPlan ? (
            <Animated.View entering={sectionEntering(1)}>
              <HomeSeasonCard seasonPlan={seasonPlan} onOpenPlan={handleOpenPlan} />
            </Animated.View>
          ) : null}

          {planShelf.items.length > 0 ? (
            <Animated.View entering={sectionEntering(1)}>
              <HomePlanShelf
                shelf={planShelf}
                gutter={SHEET_GUTTER}
                onOpenPlan={handleOpenPlan}
                onBrowsePlans={handleBrowsePlans}
              />
            </Animated.View>
          ) : null}
        </View>
      </ScrollView>

      {isStatusBarOverPage ? (
        <View
          pointerEvents="none"
          style={[styles.statusBarMask, { height: insets.top, backgroundColor: colors.background }]}
        />
      ) : null}

      <VerseImageShareSheet
        handleSelectVerseImageBackground={(index) =>
          setVerseImageBackgroundPick({ index, day: verseDayKey })
        }
        handleShareSelectedVerseImage={shareVerseImage}
        handleVerseImageSheetDismissed={handleVerseImageSheetDismissed}
        isSharingVerseImage={isSharingVerse}
        selectedVerseImageBackground={verseImageBackground}
        selectedVerseImageBackgroundIndex={verseImageBackgroundIndex}
        selectedVerseReferenceLabel={verseShareReferenceLabel}
        selectedVerseText={verseShareBodyText}
        handleCloseVerseImageSheet={handleCloseVerseImageSheet}
        showVerseImageSheet={showVerseImageSheet}
        verseImageBackgroundCount={SHARE_VERSE_BACKGROUND_SOURCES.length}
        verseImageSharePreviewRef={verseSharePreviewRef}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  statusBarMask: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  content: {
    flexGrow: 1,
  },
  hero: {
    width: '100%',
  },
  heroPhoto: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // The action pills hang past the photograph's lower edge on screen.
  heroPhotoOverhang: {
    bottom: HERO_ACTION_OVERHANG,
  },
  // ImageBackground proxies only an explicit width/height to its image, so the
  // stretched frame is restated here or the photo would keep its intrinsic size.
  heroPhotoImage: {
    width: '100%',
    height: '100%',
  },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  heroContent: {
    flexGrow: 1,
    paddingHorizontal: SHEET_GUTTER,
  },
  heroFooter: {
    marginTop: 'auto',
    gap: spacing.md,
  },
  heroEyebrow: {
    ...typography.eyebrow,
    color: ON_PHOTO_EYEBROW,
    textShadowColor: ON_PHOTO_TEXT_SHADOW,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  verseText: {
    color: ON_PHOTO_INK,
    letterSpacing: -0.2,
    textShadowColor: ON_PHOTO_TEXT_SHADOW,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 12,
  },
  heroPlaceholder: {
    gap: spacing.md,
  },
  heroPlaceholderBar: {
    height: 18,
    borderRadius: radius.xs,
    backgroundColor: ON_PHOTO_PLACEHOLDER,
  },
  heroPlaceholderEyebrow: {
    height: 10,
    width: '58%',
  },
  heroPlaceholderBarShort: {
    width: '72%',
  },
  heroActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // minHeight, not height: the pill labels grow with the OS text size.
  heroPill: {
    minHeight: HERO_PILL_HEIGHT,
    borderRadius: HERO_PILL_HEIGHT / 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: ON_PHOTO_PILL_FILL,
  },
  heroPillLabel: {
    ...typography.captionStrong,
    color: ON_PHOTO_PILL_INK,
    flexShrink: 1,
  },
  heroShareButton: {
    marginLeft: 'auto',
  },
  sheet: {
    paddingTop: SHEET_PADDING_TOP,
    paddingHorizontal: SHEET_GUTTER,
    gap: SHEET_GAP,
  },
  readingCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  // Wraps so the chapter total drops under the streak at large text sizes.
  ledgerHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  ledgerStreak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
    minWidth: 0,
  },
  ledgerStreakCount: {
    ...typography.numeralRow,
  },
  ledgerStreakUnit: {
    ...typography.captionStrong,
    flexShrink: 1,
  },
  ledgerTotal: {
    ...typography.caption,
    flexShrink: 1,
    textAlign: 'right',
  },
  chipRow: {
    gap: spacing.sm,
  },
  chip: {
    flex: 1,
    minWidth: 0,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 2,
  },
  // Stacked at large text, each chip sizes to its content.
  chipStacked: {
    flex: 0,
  },
  chipLabel: {
    ...typography.eyebrow,
    fontSize: 9.5,
    letterSpacing: 1.2,
  },
  chipValue: {
    fontSize: 15,
    lineHeight: 19,
    letterSpacing: -0.2,
  },
  chipTrack: {
    height: CHIP_TRACK_HEIGHT,
    borderRadius: CHIP_TRACK_HEIGHT / 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  chipTrackFill: {
    height: '100%',
  },
});
