import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ImageBackground,
  StyleSheet,
  ScrollView,
  InteractionManager,
  useWindowDimensions,
  Share,
  AppState,
  type AppStateStatus,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronRight, Play, Share as ShareGlyph } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { bibleTranslations } from '../../constants/translations';
import { getBookById, getTranslatedBookName } from '../../constants/books';
import { config } from '../../constants/config';
import { useTheme } from '../../contexts/ThemeContext';
import { useDisplayFont } from '../../hooks/useDisplayFont';
import { useTabBarHeight } from '../../hooks/useTabBarHeight';
import { GatherIconBadge } from '../../components/gather/GatherIconBadge';
import { useAuthStore } from '../../stores/authStore';
import { useBibleStore } from '../../stores/bibleStore';
import { useGatherStore } from '../../stores/gatherStore';
import { useReadingPlansStore } from '../../stores/readingPlansStore';
import {
  FOUNDATION_LESSON_TITLE_KEYS,
  FOUNDATION_TITLE_KEYS,
  gatherFoundations,
} from '../../data/gatherFoundations';
import { getHomeVerseBackground } from '../../data/homeVerseBackgrounds';
import { getHomeScreenLayout } from './homeLayoutModel';
import { selectHomeContinuePlans } from './homeReadingPlansModel';
import { buildHomeVerseShareMessage } from './homeVerseShareModel';
import { getMillisecondsUntilNextLocalMidnight } from '../../services/bible/dailyScriptureRefresh';
import { formatDailyScriptureReferenceLabel } from '../../services/bible/presentation';
import { getAudioAvailability } from '../../services/audio/audioAvailability';
import { isRemoteAudioAvailable } from '../../services/audio/audioRemote';
import { listReadingPlans } from '../../services/plans/readingPlanService';
import { getVisibleCompletedEntryCount } from '../../services/plans/readingPlanModel';
import type { ReadingPlan } from '../../services/plans/types';
import { AppCard } from '../../components/ui/AppCard';
import { IconButton } from '../../components/ui/IconButton';
import { PressableScale } from '../../components/ui/PressableScale';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { getReadingFontFamily } from '../../design/fonts';
import type { DailyScripture } from '../../types';
import type { RootTabParamList } from '../../navigation/types';
import { motion, radius, spacing, typography } from '../../design/system';
import { lightHaptic } from '../../utils/haptics';
import { createHomeReadyReporter } from '../../services/startup/homeStartupTiming';

type NavigationProp = NativeStackNavigationProp<RootTabParamList>;

// The hero is a photograph in both scopes, so its foreground cannot come from
// theme tokens — light ink on a dark scrim is the only readable pairing on the
// vellum scope too. These are the literal on-photo values the design spec names.
const ON_PHOTO_INK = '#FDFAF5';
const ON_PHOTO_EYEBROW = 'rgba(253, 250, 245, 0.82)';
const ON_PHOTO_AVATAR_BORDER = 'rgba(253, 250, 245, 0.45)';
const ON_PHOTO_PILL_FILL = 'rgba(253, 250, 245, 0.92)';
const ON_PHOTO_PILL_INK = '#1A1914';
const ON_PHOTO_PLACEHOLDER = 'rgba(253, 250, 245, 0.18)';
const ON_PHOTO_TEXT_SHADOW = 'rgba(0, 0, 0, 0.25)';

// The scrim darkens the top for the greeting, opens up over the horizon, then
// closes down again under the verse. Its final stop is the page colour, so the
// photograph dissolves into the sheet instead of ending on a hard edge.
const HERO_SCRIM_STOPS = [
  'rgba(12, 11, 9, 0.42)',
  'rgba(12, 11, 9, 0.05)',
  'rgba(12, 11, 9, 0.35)',
  'rgba(12, 11, 9, 0.72)',
] as const;
const HERO_SCRIM_LOCATIONS = [0, 0.28, 0.55, 0.78, 1] as const;

// The action pills hang slightly past the photograph's lower edge. The scrim has
// already dissolved to the page colour there, so the overlap is invisible and
// the sheet's 20pt top padding is measured from the pills, as in the reference.
const HERO_ACTION_OVERHANG = 9;
/** Gap between the status bar and the date eyebrow over the photograph. */
const HERO_TOP_PADDING = 14;
const HERO_PILL_HEIGHT = 36;
const HERO_AVATAR_SIZE = 36;
const SHEET_PADDING_TOP = 20;
const SHEET_GUTTER = spacing.xl;
const SHEET_GAP = spacing.md;
const SHEET_CARD_MIN_HEIGHT = 120;

function getFirstName(displayName: string | null | undefined): string | null {
  const trimmed = displayName?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.split(/\s+/)[0] ?? null;
}

function getGreetingKey(
  date = new Date()
): 'home.goodMorning' | 'home.goodAfternoon' | 'home.goodEvening' {
  const hour = date.getHours();

  if (hour < 12) {
    return 'home.goodMorning';
  }

  if (hour < 17) {
    return 'home.goodAfternoon';
  }

  return 'home.goodEvening';
}

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
        report: () => console.log('[EB-T] Home:interaction-ready', Date.now()),
      }),
    []
  );
  useEffect(() => () => homeReadyReporter.cancel(), [homeReadyReporter]);
  const { colors } = useTheme();
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
  const bottomTabBarHeight = tabBar.height;
  const [dailyScripture, setDailyScripture] = useState<DailyScripture | null>(null);
  const [isLoadingVerse, setIsLoadingVerse] = useState(true);
  const [isSharingVerse, setIsSharingVerse] = useState(false);
  const [readingPlans, setReadingPlans] = useState<ReadingPlan[]>([]);
  const verseRequestIdRef = useRef(0);
  const midnightRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const verseSharePreviewRef = useRef<View | null>(null);
  const verseBackground = getHomeVerseBackground();
  const homeLayout = getHomeScreenLayout(screenWidth, screenHeight, bottomTabBarHeight);
  const user = useAuthStore((state) => state.user);

  const currentTranslation = useBibleStore((state) => state.currentTranslation);
  const currentBook = useBibleStore((state) => state.currentBook);
  const currentChapter = useBibleStore((state) => state.currentChapter);
  const hasReaderHistory = useBibleStore((state) => state.hasReaderHistory);
  const translations = useBibleStore((state) =>
    Array.isArray(state.translations) ? state.translations : bibleTranslations
  );
  const currentTranslationInfo = translations.find(
    (translation) => translation.id === currentTranslation
  );
  const remoteAudioAvailable =
    config.features.audioEnabled && isRemoteAudioAvailable(currentTranslation);
  const progressByPlanId = useReadingPlansStore((state) => state.progressByPlanId);

  const completedLessons = useGatherStore((state) => state.completedLessons);

  // Find the active foundation: first one that has started but isn't fully complete.
  // Falls back to foundation-1 if none started yet.
  const foundation = (() => {
    const inProgress = gatherFoundations.find((item) => {
      const done = completedLessons[item.id]?.length ?? 0;
      return done > 0 && done < item.lessons.length;
    });
    if (inProgress) return inProgress;
    // All complete? Show the last one. Nothing started? Show the first.
    const allDone = gatherFoundations.every(
      (item) => (completedLessons[item.id]?.length ?? 0) >= item.lessons.length
    );
    return allDone ? gatherFoundations[gatherFoundations.length - 1] : gatherFoundations[0];
  })();
  const foundationCompletedLessons = completedLessons[foundation.id] ?? [];
  const nextLesson =
    foundation.lessons.find((lesson) => !foundationCompletedLessons.includes(lesson.id)) ??
    foundation.lessons[0];
  const foundationTitleKey = FOUNDATION_TITLE_KEYS[foundation.id];
  const foundationTitle = foundationTitleKey
    ? t(foundationTitleKey as Parameters<typeof t>[0])
    : foundation.title;
  const nextLessonTitleKey = nextLesson ? FOUNDATION_LESSON_TITLE_KEYS[nextLesson.id] : undefined;
  const nextLessonTitle = nextLessonTitleKey
    ? t(nextLessonTitleKey as Parameters<typeof t>[0])
    : (nextLesson?.title ?? '');
  const continuePlans = useMemo(
    () => selectHomeContinuePlans(readingPlans, progressByPlanId),
    [progressByPlanId, readingPlans]
  );
  const featuredPlanProgress = continuePlans[0];
  const featuredPlan =
    featuredPlanProgress?.plan ??
    readingPlans.find((plan) => plan.id === 'proverbs-31-days') ??
    readingPlans[0] ??
    null;
  const featuredPlanTitle = featuredPlan
    ? t(featuredPlan.title_key as Parameters<typeof t>[0], {
        defaultValue: featuredPlan.title_key,
      })
    : t('readingPlans.title');
  const featuredPlanDay =
    featuredPlanProgress?.progress.current_day ?? (featuredPlan?.duration_days ? 1 : 0);
  const featuredPlanDuration = featuredPlan?.duration_days ?? 0;
  const featuredPlanCompletedCount = featuredPlanProgress
    ? getVisibleCompletedEntryCount(
        featuredPlanProgress.plan,
        featuredPlanProgress.progress.completed_entries
      )
    : 0;
  const featuredPlanFraction =
    featuredPlanDuration > 0 ? featuredPlanCompletedCount / featuredPlanDuration : 0;
  const currentBookName = getTranslatedBookName(currentBook, t);
  const currentBookInfo = getBookById(currentBook);
  const hasContinuePassage = hasReaderHistory && currentBookInfo != null;
  const currentPassageLabel = hasContinuePassage
    ? `${currentBookName} ${currentChapter}`
    : t('home.defaultReference');
  const greetingName = getFirstName(user?.displayName) ?? t('home.guestName');
  const greetingInitial = greetingName.trim().charAt(0).toUpperCase();
  const greetingKey = useMemo(() => getGreetingKey(), []);
  const greetingLabel = t('home.greetingWithName', {
    greeting: t(greetingKey),
    name: greetingName,
  });
  // "TUESDAY · 8 SEPTEMBER": the weekday is split off its own way so every
  // locale keeps the EL separator instead of the locale's own comma.
  const todayLabel = useMemo(() => {
    const parts = new Intl.DateTimeFormat(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).formatToParts(new Date());
    const weekday = parts
      .filter((part) => part.type === 'weekday')
      .map((part) => part.value)
      .join('');
    const rest = parts
      .filter((part) => part.type !== 'weekday')
      .map((part) => part.value)
      .join('')
      .replace(/^[\s,.·、，]+/, '')
      .replace(/[\s,.·、，]+$/, '');
    return weekday && rest ? `${weekday} · ${rest}` : weekday || rest;
  }, [i18n.language]);

  const loadVerseOfDay = useCallback(
    async ({
      allowInitialization = true,
      silent = false,
    }: {
      allowInitialization?: boolean;
      silent?: boolean;
    } = {}) => {
      const requestId = ++verseRequestIdRef.current;
      if (!silent) {
        setIsLoadingVerse(true);
      }

      try {
        if (!currentTranslationInfo) {
          setDailyScripture(null);
          return;
        }

        const { getDailyScripture } = await import('../../services/bible/bibleService');
        if (requestId !== verseRequestIdRef.current) return;
        const scripture = await getDailyScripture(currentTranslationInfo, remoteAudioAvailable, {
          allowInitialization,
        });
        if (requestId === verseRequestIdRef.current) {
          setDailyScripture(scripture);
        }
      } catch (error) {
        if (requestId === verseRequestIdRef.current) {
          console.error('Error loading verse of the day:', error);
        }
      } finally {
        // A silent retry may supersede the initial load, so it must also settle its spinner.
        if (requestId === verseRequestIdRef.current) {
          setIsLoadingVerse(false);
        }
      }
    },
    [currentTranslationInfo, remoteAudioAvailable]
  );

  useEffect(() => {
    const refreshVerseOfDay = () => {
      void loadVerseOfDay({ silent: true });
    };

    const scheduleMidnightRefresh = () => {
      if (midnightRefreshTimerRef.current) {
        clearTimeout(midnightRefreshTimerRef.current);
      }

      midnightRefreshTimerRef.current = setTimeout(() => {
        refreshVerseOfDay();
        scheduleMidnightRefresh();
      }, getMillisecondsUntilNextLocalMidnight());
    };

    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      void loadVerseOfDay();
    });

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        refreshVerseOfDay();
        scheduleMidnightRefresh();
      }

      appStateRef.current = nextAppState;
    });

    scheduleMidnightRefresh();

    return () => {
      verseRequestIdRef.current += 1;
      interactionHandle.cancel();
      subscription.remove();

      if (midnightRefreshTimerRef.current) {
        clearTimeout(midnightRefreshTimerRef.current);
        midnightRefreshTimerRef.current = null;
      }
    };
  }, [loadVerseOfDay]);

  useEffect(() => {
    let cancelled = false;

    const loadReadingPlans = async () => {
      const result = await listReadingPlans();
      if (!cancelled && result.success) {
        setReadingPlans(result.data ?? []);
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
    });
  };

  const handleContinuePlan = useCallback(
    (planId: string) => {
      navigation.navigate('Plans', {
        screen: 'PlanDetail',
        params: { planId },
      });
    },
    [navigation]
  );

  const dailyReferenceLabel = dailyScripture
    ? formatDailyScriptureReferenceLabel(
        getTranslatedBookName(dailyScripture.bookId, t),
        dailyScripture.chapter,
        dailyScripture.verse,
        dailyScripture.verseEnd
      )
    : null;
  const dailyPassageLabel = dailyScripture
    ? `${getTranslatedBookName(dailyScripture.bookId, t)} ${dailyScripture.chapter}`
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
  const shouldShowDailyAudio =
    dailyScripture != null &&
    dailyAudioAvailability?.canPlayAudio &&
    dailyScripture.kind !== 'verse-text';
  const dailyAudioKind =
    shouldShowDailyAudio && dailyScripture?.kind === 'empty'
      ? currentTranslationInfo?.audioGranularity === 'verse'
        ? 'verse-audio'
        : 'section-audio'
      : dailyScripture?.kind;
  const canListenToDailyScripture = dailyScripture != null && dailyAudioAvailability?.canPlayAudio;
  const verseCardTitleLabel =
    dailyAudioKind === 'section-audio' ? t('home.sectionOfTheDay') : t('home.verseOfTheDay');
  const verseShareReferenceLabel = dailyReferenceLabel ?? t('home.defaultReference');
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
  const verseScriptureEyebrow = `${t('home.todaysScripture')} · ${verseShareReferenceLabel}`;
  // Scripture is content, not interface: it renders in the translation's own
  // language, so Lora is swapped for the platform serif on scripts it lacks.
  const verseFontFamily = getReadingFontFamily(currentTranslationInfo?.language);
  const heroScrimColors = useMemo(
    () => [...HERO_SCRIM_STOPS, colors.background] as const,
    [colors.background]
  );

  const handlePlayDailyAudio = () => {
    if (!dailyScripture || !dailyAudioAvailability?.canPlayAudio) {
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
    });
  };

  const handleReadDailyScripture = () => {
    lightHaptic();
    if (!dailyScripture) {
      navigation.navigate('Bible', { screen: 'BibleBrowser' });
      return;
    }

    navigation.navigate('Bible', {
      screen: 'BibleReader',
      params: {
        bookId: dailyScripture.bookId,
        chapter: dailyScripture.chapter,
        focusVerse: dailyScripture.verse,
      },
    });
  };

  const renderVerseShareButton = () => (
    <IconButton
      icon={ShareGlyph}
      onPress={handleShareVerseOfTheDay}
      size={HERO_PILL_HEIGHT}
      iconSize={16}
      variant="onPhoto"
      disabled={isSharingVerse}
      accessibilityLabel={t('groups.share')}
      style={styles.heroShareButton}
    />
  );

  const handleShareVerseOfTheDay = async () => {
    if (isSharingVerse) {
      return;
    }

    lightHaptic();
    setIsSharingVerse(true);

    try {
      const Sharing = await import('expo-sharing');

      if ((await Sharing.isAvailableAsync()) && verseSharePreviewRef.current) {
        const { captureRef } = await import('react-native-view-shot');
        const imageUri = await captureRef(verseSharePreviewRef, {
          format: 'png',
          quality: 1,
          result: 'tmpfile',
        });

        await Sharing.shareAsync(imageUri, {
          dialogTitle: t('groups.share'),
          mimeType: 'image/png',
        });
        return;
      }

      await Share.share({ message: verseShareMessage });
    } catch {
      try {
        await Share.share({ message: verseShareMessage });
      } catch {
        // Ignore share errors.
      }
    } finally {
      setIsSharingVerse(false);
    }
  };

  const renderVerseOfTheDayCard = (showActions: boolean) => (
    <View
      style={[
        styles.hero,
        {
          height: homeLayout.heroPhotoHeight + (showActions ? HERO_ACTION_OVERHANG : 0),
        },
      ]}
    >
      <ImageBackground
        source={verseBackgroundSource}
        style={[styles.heroPhoto, { height: homeLayout.heroPhotoHeight }]}
        resizeMode="cover"
      >
        <LinearGradient
          colors={heroScrimColors}
          locations={HERO_SCRIM_LOCATIONS}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.heroScrim}
        />
      </ImageBackground>

      <View style={[styles.heroContent, { paddingTop: insets.top + HERO_TOP_PADDING }]}>
        <View style={styles.heroHeaderRow}>
          <View style={styles.heroHeaderCopy}>
            <Text style={[styles.heroDate, displayFont.regular]} numberOfLines={1}>
              {todayLabel}
            </Text>
            <Text
              style={[
                styles.heroGreeting,
                displayFont.bold,
                {
                  fontSize: homeLayout.greetingFontSize,
                  lineHeight: homeLayout.greetingLineHeight,
                },
              ]}
              numberOfLines={2}
            >
              {greetingLabel}
            </Text>
          </View>
          <View style={styles.heroAvatar}>
            <Text style={[styles.heroAvatarInitial, displayFont.bold]}>{greetingInitial}</Text>
          </View>
        </View>

        <View style={[styles.heroFooter, showActions ? null : styles.heroFooterCapture]}>
          {isLoadingVerse && !dailyScripture ? (
            <View style={styles.heroPlaceholder}>
              <View style={[styles.heroPlaceholderBar, styles.heroPlaceholderEyebrow]} />
              <View style={styles.heroPlaceholderBar} />
              <View style={[styles.heroPlaceholderBar, styles.heroPlaceholderBarShort]} />
            </View>
          ) : (
            <>
              <Text style={[styles.heroEyebrow, displayFont.regular]} numberOfLines={1}>
                {verseScriptureEyebrow}
              </Text>
              <Text
                style={[
                  styles.verseText,
                  {
                    fontFamily: verseFontFamily,
                    fontSize: homeLayout.verseTextFontSize,
                    lineHeight: homeLayout.verseTextLineHeight,
                  },
                ]}
                numberOfLines={homeLayout.verseTextLines}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {verseShareBodyText}
              </Text>
            </>
          )}
          {showActions ? (
            <View style={styles.heroActionRow}>
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
                  <Text style={styles.heroPillLabel} numberOfLines={1}>
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
                <Text style={styles.heroPillLabel} numberOfLines={1}>
                  {dailyPassageLabel
                    ? t('home.readPassage', { passage: dailyPassageLabel })
                    : t('bible.read')}
                </Text>
              </PressableScale>
              {renderVerseShareButton()}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* The photograph bleeds under the status bar, so its glyphs go light while
          Home owns the screen and revert to the app default on the next tab. */}
      {isFocused ? <StatusBar style="light" /> : null}
      <ScrollView
        onLayout={homeReadyReporter.onLayout}
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
        {renderVerseOfTheDayCard(true)}

        <View style={styles.sheet}>
          <Animated.View entering={sectionEntering(0)} style={styles.sheetCardRow}>
            <AppCard
              pressable
              onPress={handleContinueReading}
              padding={spacing.lg}
              style={styles.sheetCard}
              accessibilityLabel={`${t('common.continue')} ${currentPassageLabel}`}
            >
              <Text
                style={[styles.cardEyebrow, displayFont.regular, { color: colors.secondaryText }]}
                numberOfLines={1}
              >
                {t('common.continue')}
              </Text>
              <View style={styles.cardBody}>
                {hasContinuePassage ? (
                  <View style={styles.numeralRow}>
                    <Text style={[styles.numeral, { color: colors.primaryText }]}>
                      {currentChapter}
                    </Text>
                    <Text
                      style={[styles.numeralCaption, { color: colors.primaryText }]}
                      numberOfLines={1}
                    >
                      {currentBookName}
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.cardBodyText, { color: colors.primaryText }]}>
                    {t('home.defaultReference')}
                  </Text>
                )}
                <Text
                  style={[styles.cardFooter, { color: colors.secondaryText }]}
                  numberOfLines={1}
                >
                  {currentTranslationInfo?.name ?? currentTranslation.toUpperCase()}
                </Text>
              </View>
            </AppCard>

            <AppCard
              pressable
              onPress={() =>
                featuredPlan
                  ? handleContinuePlan(featuredPlan.id)
                  : navigation.navigate('Plans', { screen: 'PlansHome' })
              }
              padding={spacing.lg}
              style={styles.sheetCard}
              accessibilityLabel={
                featuredPlanDuration > 0
                  ? `${featuredPlanTitle} · ${t('readingPlans.dayOf', {
                      current: featuredPlanDay,
                      total: featuredPlanDuration,
                    })}`
                  : t('readingPlans.browsePlans')
              }
            >
              {featuredPlanDuration > 0 ? (
                <>
                  {/* One Text so a long plan title wraps to a second line instead of
                      ellipsising mid-word before the " · Day" suffix. */}
                  <Text
                    style={[
                      styles.cardEyebrow,
                      displayFont.regular,
                      { color: colors.secondaryText },
                    ]}
                    numberOfLines={2}
                  >
                    {`${featuredPlanTitle} · ${t('home.dayEyebrow')}`}
                  </Text>
                  <View style={styles.cardBody}>
                    <View style={styles.numeralRow}>
                      <Text style={[styles.numeral, { color: colors.primaryText }]}>
                        {featuredPlanDay}
                      </Text>
                      <Text style={[styles.numeralDenominator, { color: colors.secondaryText }]}>
                        {`/${featuredPlanDuration}`}
                      </Text>
                    </View>
                    <ProgressBar progress={featuredPlanFraction} style={styles.planProgressBar} />
                  </View>
                </>
              ) : (
                <>
                  <Text
                    style={[
                      styles.cardEyebrow,
                      displayFont.regular,
                      { color: colors.secondaryText },
                    ]}
                    numberOfLines={1}
                  >
                    {t('home.plan')}
                  </Text>
                  <View style={styles.cardBody}>
                    <Text style={[styles.cardBodyText, { color: colors.primaryText }]}>
                      {t('readingPlans.browsePlans')}
                    </Text>
                  </View>
                </>
              )}
            </AppCard>
          </Animated.View>

          <Animated.View entering={sectionEntering(1)}>
            <AppCard
              pressable
              padding={spacing.lg}
              style={styles.gatherCard}
              accessibilityLabel={`${t('tabs.gather')} · ${foundationTitle}`}
              onPress={() =>
                navigation.navigate('Learn', {
                  screen: 'FoundationDetail',
                  params: { foundationId: foundation.id },
                })
              }
            >
              <View style={styles.gatherHeader}>
                <Text
                  style={[
                    styles.cardEyebrow,
                    styles.cardEyebrowName,
                    displayFont.regular,
                    { color: colors.secondaryText },
                  ]}
                  numberOfLines={1}
                >
                  {`${t('tabs.gather')} · ${t('gather.foundationLabel', {
                    number: foundation.number,
                  })}`}
                </Text>
                <Text
                  style={[styles.gatherCount, displayFont.regular, { color: colors.secondaryText }]}
                  numberOfLines={1}
                >
                  {t('home.lessonsProgress', {
                    completed: foundationCompletedLessons.length,
                    total: foundation.lessons.length,
                  })}
                </Text>
              </View>
              <View style={styles.gatherRow}>
                <GatherIconBadge
                  artworkKey={foundation.iconImage}
                  size={28}
                  iconSize={20}
                  iconColor={colors.accentPrimary}
                />
                <View style={styles.gatherCopy}>
                  <Text
                    style={[styles.gatherTitle, { color: colors.primaryText }]}
                    numberOfLines={1}
                  >
                    {foundationTitle}
                  </Text>
                  <Text
                    style={[styles.gatherSubtitle, { color: colors.secondaryText }]}
                    numberOfLines={1}
                  >
                    {t('home.nextLesson', { title: nextLessonTitle })}
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.textTertiary} strokeWidth={2} />
              </View>
            </AppCard>
          </Animated.View>
        </View>
      </ScrollView>

      <View
        ref={verseSharePreviewRef}
        collapsable={false}
        pointerEvents="none"
        style={[styles.sharePreviewMount, { width: screenWidth }]}
      >
        {renderVerseOfTheDayCard(false)}
      </View>
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
  },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  heroContent: {
    flex: 1,
    paddingHorizontal: SHEET_GUTTER,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  heroHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  heroDate: {
    ...typography.eyebrow,
    color: ON_PHOTO_EYEBROW,
  },
  // fontSize/lineHeight come from getHomeScreenLayout so narrow phones drop to 18pt.
  heroGreeting: {
    letterSpacing: -0.66,
    color: ON_PHOTO_INK,
  },
  heroAvatar: {
    width: HERO_AVATAR_SIZE,
    height: HERO_AVATAR_SIZE,
    borderRadius: HERO_AVATAR_SIZE / 2,
    borderWidth: 1,
    borderColor: ON_PHOTO_AVATAR_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarInitial: {
    fontSize: 14,
    lineHeight: 18,
    color: ON_PHOTO_INK,
  },
  heroFooter: {
    marginTop: 'auto',
    gap: spacing.md,
  },
  heroFooterCapture: {
    paddingBottom: spacing.xxl,
  },
  heroEyebrow: {
    ...typography.eyebrow,
    color: ON_PHOTO_EYEBROW,
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
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroPill: {
    height: HERO_PILL_HEIGHT,
    borderRadius: HERO_PILL_HEIGHT / 2,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: ON_PHOTO_PILL_FILL,
  },
  heroPillLabel: {
    ...typography.captionStrong,
    color: ON_PHOTO_PILL_INK,
  },
  heroShareButton: {
    marginLeft: 'auto',
  },
  sheet: {
    paddingTop: SHEET_PADDING_TOP,
    paddingHorizontal: SHEET_GUTTER,
    gap: SHEET_GAP,
  },
  sheetCardRow: {
    flexDirection: 'row',
    gap: SHEET_GAP,
  },
  sheetCard: {
    flex: 1,
    minWidth: 0,
    minHeight: SHEET_CARD_MIN_HEIGHT,
  },
  cardEyebrow: {
    ...typography.eyebrow,
  },
  cardEyebrowName: {
    flexShrink: 1,
    minWidth: 0,
  },
  cardBody: {
    marginTop: 'auto',
    gap: spacing.xs,
  },
  cardBodyText: {
    ...typography.bodyStrong,
  },
  numeralRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  numeral: {
    ...typography.numeralXL,
  },
  numeralCaption: {
    ...typography.bodyStrong,
    flexShrink: 1,
    minWidth: 0,
  },
  numeralDenominator: {
    ...typography.numeralRow,
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: -0.36,
  },
  cardFooter: {
    ...typography.caption,
  },
  planProgressBar: {
    marginTop: spacing.xs,
  },
  gatherCard: {
    gap: 14,
  },
  gatherHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  gatherCount: {
    ...typography.mono,
  },
  gatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  gatherCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  gatherTitle: {
    ...typography.rowTitle,
  },
  gatherSubtitle: {
    ...typography.caption,
  },
  sharePreviewMount: {
    position: 'absolute',
    left: -10000,
    top: 0,
  },
});
