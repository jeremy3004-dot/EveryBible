import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ImageBackground,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  InteractionManager,
  useWindowDimensions,
  Share,
  AppState,
  type AppStateStatus,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { bibleTranslations, getBookById, getTranslatedBookName } from '../../constants';
import { config } from '../../constants/config';
import { useTheme } from '../../contexts/ThemeContext';
import { GatherIconBadge } from '../../components/gather/GatherIconBadge';
import { useAuthStore } from '../../stores/authStore';
import { useBibleStore } from '../../stores/bibleStore';
import { useGatherStore } from '../../stores/gatherStore';
import { useReadingPlansStore } from '../../stores/readingPlansStore';
import { gatherFoundations } from '../../data/gatherFoundations';
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
import { CardSkeleton } from '../../components';
import type { DailyScripture } from '../../types';
import type { RootTabParamList } from '../../navigation/types';
import { radius, spacing, typography } from '../../design/system';
import {
  getLiveVerseOfDayOverride,
  type MobileVerseOfDayOverride,
} from '../../services/content/mobileContentService';

type NavigationProp = NativeStackNavigationProp<RootTabParamList>;

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
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const [dailyScripture, setDailyScripture] = useState<DailyScripture | null>(null);
  const [remoteVerseOverride, setRemoteVerseOverride] = useState<MobileVerseOfDayOverride | null>(
    null
  );
  const [isLoadingVerse, setIsLoadingVerse] = useState(true);
  const [isSharingVerse, setIsSharingVerse] = useState(false);
  const [readingPlans, setReadingPlans] = useState<ReadingPlan[]>([]);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const activeFoundation = (() => {
    const inProgress = gatherFoundations.find((f) => {
      const done = completedLessons[f.id]?.length ?? 0;
      return done > 0 && done < f.lessons.length;
    });
    if (inProgress) return inProgress;
    // All complete? Show the last one. Nothing started? Show the first.
    const allDone = gatherFoundations.every(
      (f) => (completedLessons[f.id]?.length ?? 0) >= f.lessons.length
    );
    return allDone ? gatherFoundations[gatherFoundations.length - 1] : gatherFoundations[0];
  })();
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
  const currentPassageLabel =
    hasReaderHistory && currentBookInfo
      ? `${currentBookName} ${currentChapter}`
      : t('home.defaultReference');
  const readingProgressPercent = hasReaderHistory ? 68 : 0;
  const greetingName = getFirstName(user?.displayName) ?? t('home.guestName');
  const greetingKey = useMemo(() => getGreetingKey(), []);
  const greetingLabel = t('home.greetingWithName', {
    greeting: t(greetingKey),
    name: greetingName,
  });
  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date()),
    []
  );

  const loadVerseOfDay = useCallback(
    async ({
      allowInitialization = true,
      silent = false,
    }: {
      allowInitialization?: boolean;
      silent?: boolean;
    } = {}) => {
      if (!silent) {
        setIsLoadingVerse(true);
      }

      try {
        const override = await getLiveVerseOfDayOverride();
        setRemoteVerseOverride(override);

        if (override) {
          setDailyScripture(null);
          return;
        }

        if (!currentTranslationInfo) {
          setDailyScripture(null);
          setRemoteVerseOverride(null);
          return;
        }

        const { getDailyScripture } = await import('../../services/bible/bibleService');
        const scripture = await getDailyScripture(currentTranslationInfo, remoteAudioAvailable, {
          allowInitialization,
        });
        setDailyScripture(scripture);
      } catch (error) {
        console.error('Error loading verse of the day:', error);
        setRemoteVerseOverride(null);
      } finally {
        if (!silent) {
          setIsLoadingVerse(false);
        }
      }
    },
    [currentTranslationInfo, remoteAudioAvailable]
  );

  useEffect(() => {
    const refreshVerseOfDay = () => {
      void loadVerseOfDay({ allowInitialization: false, silent: true });
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
      void loadVerseOfDay({ allowInitialization: false });
    });

    retryTimerRef.current = setTimeout(() => {
      void loadVerseOfDay({ allowInitialization: false, silent: true });
    }, 2500);

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        refreshVerseOfDay();
        scheduleMidnightRefresh();
      }

      appStateRef.current = nextAppState;
    });

    scheduleMidnightRefresh();

    return () => {
      interactionHandle.cancel();
      subscription.remove();

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
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
  const dailyAudioAvailability =
    dailyScripture && !remoteVerseOverride && currentTranslationInfo
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
  const verseCardTitleLabel =
    dailyAudioKind === 'section-audio' ? t('home.sectionOfTheDay') : t('home.verseOfTheDay');
  const verseShareReferenceLabel =
    remoteVerseOverride?.referenceLabel ?? dailyReferenceLabel ?? t('home.defaultReference');
  const verseShareBodyText = remoteVerseOverride?.verseText?.trim()
    ? remoteVerseOverride.verseText.trim()
    : dailyScripture?.kind === 'verse-text'
      ? dailyScripture.text?.trim() || t('home.defaultVerse')
      : shouldShowDailyAudio
        ? dailyAudioKind === 'section-audio'
          ? t('home.sectionOfTheDayBody')
          : t('home.verseAudioBody')
        : t('home.defaultVerse');
  const verseBackgroundSource = remoteVerseOverride?.imageUrl
    ? { uri: remoteVerseOverride.imageUrl }
    : verseBackground;
  const verseShareMessage = buildHomeVerseShareMessage({
    cardTitle: verseCardTitleLabel,
    referenceLabel: verseShareReferenceLabel,
    bodyText: verseShareBodyText,
  });
  const verseShareButtonSize = Math.max(40, Math.round(44 * homeLayout.scale));
  const verseShareIconSize = Math.max(18, Math.round(20 * homeLayout.scale));
  // The verse card is always a photographic hero image, so we keep a dark scrim
  // with light text in every theme. This avoids low-contrast "light on light"
  // text in the light/parchment themes while matching the dark card treatment.
  const verseCardImageOpacity = isDark ? 0.34 : 0.42;
  const verseCardOverlayColors = ['rgba(12, 11, 9, 0.18)', 'rgba(12, 11, 9, 0.78)'] as const;
  const verseCardTextColor = '#FDFAF5';
  const verseCardEyebrowColor = 'rgba(253, 250, 245, 0.88)';

  const renderVerseShareButton = () => (
    <TouchableOpacity
      style={[
        styles.verseShareButton,
        {
          backgroundColor: colors.accentPrimary,
          width: verseShareButtonSize,
          height: verseShareButtonSize,
          borderRadius: verseShareButtonSize / 2,
          opacity: isSharingVerse ? 0.72 : 1,
        },
      ]}
      onPress={handleShareVerseOfTheDay}
      activeOpacity={0.88}
      disabled={isSharingVerse}
      accessibilityRole="button"
      accessibilityLabel={t('groups.share')}
      hitSlop={8}
    >
      <Ionicons name="share-outline" size={verseShareIconSize} color={colors.primaryText} />
    </TouchableOpacity>
  );

  const handleShareVerseOfTheDay = async () => {
    if (isSharingVerse) {
      return;
    }

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
    <ImageBackground
      source={verseBackgroundSource}
      style={[
        styles.card,
        styles.verseCard,
        {
          flex: 1,
          minHeight: homeLayout.verseCardMinHeight,
          backgroundColor: colors.cardBackground,
          borderColor: colors.cardBorder,
        },
      ]}
      imageStyle={[styles.verseCardImage, { opacity: verseCardImageOpacity }]}
      resizeMode="cover"
    >
      <LinearGradient
        colors={verseCardOverlayColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.verseCardOverlay}
      />
      <View
        style={[
          styles.verseCardContent,
          { padding: homeLayout.cardPadding, gap: homeLayout.bodyGap },
        ]}
      >
        <View style={styles.heroEyebrowRow}>
          <Ionicons
            name="partly-sunny-outline"
            size={Math.max(20, Math.round(22 * homeLayout.scale))}
            color={verseCardEyebrowColor}
          />
          <Text
            style={[styles.heroEyebrow, { color: verseCardEyebrowColor }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.78}
          >
            {t('home.todaysScripture')}
          </Text>
        </View>
        <Text
          style={[
            styles.verseText,
            {
              color: verseCardTextColor,
              fontSize: homeLayout.verseTextFontSize,
              lineHeight: homeLayout.verseTextLineHeight,
            },
          ]}
          numberOfLines={homeLayout.verseTextLines}
          adjustsFontSizeToFit
          minimumFontScale={0.66}
        >
          {verseShareBodyText}
        </Text>
        <Text
          style={[
            styles.reference,
            {
              color: verseCardEyebrowColor,
              fontSize: homeLayout.verseReferenceFontSize,
              lineHeight: homeLayout.verseReferenceLineHeight,
            },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
        >
          {verseShareReferenceLabel}
        </Text>
        {showActions ? <View style={styles.verseShareRow}>{renderVerseShareButton()}</View> : null}
      </View>
    </ImageBackground>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: homeLayout.screenPadding,
            paddingTop: Math.max(spacing.sm, homeLayout.screenPadding - spacing.sm),
            paddingBottom: Math.max(spacing.sm, homeLayout.screenPadding - spacing.xs),
            gap: homeLayout.sectionGap,
          },
        ]}
        showsVerticalScrollIndicator={false}
        bounces
        alwaysBounceVertical
        overScrollMode="always"
        contentInsetAdjustmentBehavior="never"
      >
        <View style={[styles.homeStack, { gap: homeLayout.sectionGap }]}>
          <View style={styles.headerRow}>
            <Text
              style={[styles.greetingLine, { color: colors.accentTertiary }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.76}
            >
              {greetingLabel}
            </Text>
            <Text style={[styles.dateLine, { color: colors.secondaryText }]}>{todayLabel}</Text>
          </View>

          {isLoadingVerse ? (
            <CardSkeleton
              lines={3}
              style={{
                flex: 1,
                minHeight: homeLayout.verseCardMinHeight,
              }}
            />
          ) : (
            <>
              {renderVerseOfTheDayCard(true)}
              <View
                ref={verseSharePreviewRef}
                collapsable={false}
                pointerEvents="none"
                style={[
                  styles.sharePreviewMount,
                  {
                    width: screenWidth - homeLayout.screenPadding * 2,
                  },
                ]}
              >
                {renderVerseOfTheDayCard(false)}
              </View>
            </>
          )}

          <View style={styles.progressGrid}>
            <TouchableOpacity
              style={[
                styles.smallCard,
                { borderColor: colors.cardBorder, backgroundColor: colors.cardBackground },
              ]}
              activeOpacity={0.86}
              onPress={handleContinueReading}
              accessibilityRole="button"
            >
              <View style={styles.smallCardHeader}>
                <Text style={[styles.smallCardEyebrow, { color: colors.accentTertiary }]}>
                  {t('common.continue')}
                </Text>
                <Ionicons name="bookmark-outline" size={24} color={colors.accentPrimary} />
              </View>
              <Text
                style={[styles.smallCardTitle, { color: colors.primaryText }]}
                numberOfLines={1}
              >
                {currentPassageLabel}
              </Text>
              <Text
                style={[styles.smallCardMeta, { color: colors.secondaryText }]}
                numberOfLines={1}
              >
                {currentTranslationInfo?.name ?? currentTranslation.toUpperCase()}
              </Text>
              <View
                style={[
                  styles.linearProgressTrack,
                  { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : colors.cardBorder },
                ]}
              >
                <View
                  style={[
                    styles.linearProgressFill,
                    {
                      width: `${readingProgressPercent}%`,
                      backgroundColor: colors.accentPrimary,
                    },
                  ]}
                />
              </View>
              <View style={styles.smallCardFooter}>
                <Text style={[styles.smallCardMeta, { color: colors.secondaryText }]}>
                  {t('home.minutesLeft', { count: hasReaderHistory ? 8 : 0 })}
                </Text>
                <Text style={[styles.smallCardMeta, { color: colors.secondaryText }]}>
                  {t('home.percentComplete', { percent: readingProgressPercent })}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.smallCard,
                { borderColor: colors.cardBorder, backgroundColor: colors.cardBackground },
              ]}
              activeOpacity={0.86}
              onPress={() =>
                featuredPlan
                  ? handleContinuePlan(featuredPlan.id)
                  : navigation.navigate('Plans', { screen: 'PlansHome' })
              }
              accessibilityRole="button"
            >
              <View style={styles.smallCardHeader}>
                <Text style={[styles.smallCardEyebrow, { color: colors.accentTertiary }]}>
                  {t('home.plan')}
                </Text>
                <Ionicons name="calendar-outline" size={24} color={colors.accentPrimary} />
              </View>
              <Text
                style={[styles.smallCardTitle, { color: colors.primaryText }]}
                numberOfLines={1}
              >
                {featuredPlanTitle}
              </Text>
              <Text
                style={[styles.smallCardMeta, { color: colors.secondaryText }]}
                numberOfLines={1}
              >
                {featuredPlanDuration > 0
                  ? t('readingPlans.dayOf', {
                      current: featuredPlanDay,
                      total: featuredPlanDuration,
                    })
                  : t('readingPlans.browsePlans')}
              </Text>
              <View style={styles.dotProgressRow}>
                {Array.from({ length: 8 }).map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.progressDot,
                      {
                        backgroundColor:
                          index / 8 < featuredPlanFraction
                            ? colors.accentPrimary
                            : isDark
                              ? 'rgba(255, 255, 255, 0.22)'
                              : colors.cardBorder,
                      },
                    ]}
                  />
                ))}
              </View>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            activeOpacity={0.86}
            style={[
              styles.gatherStrip,
              { borderColor: colors.cardBorder, backgroundColor: colors.cardBackground },
            ]}
            onPress={() =>
              navigation.navigate('Learn', {
                screen: 'FoundationDetail',
                params: { foundationId: activeFoundation.id },
              })
            }
            accessibilityRole="button"
          >
            <View style={styles.gatherStripHeader}>
              <Text style={[styles.gatherTitle, { color: colors.accentTertiary }]}>
                {t('tabs.gather')}
              </Text>
              <View style={styles.gatherHeaderCta}>
                <Text style={[styles.gatherFoundationLabel, { color: colors.primaryText }]}>
                  {t('gather.foundationLabel', { number: activeFoundation.number })}
                </Text>
                <Ionicons name="chevron-forward" size={22} color={colors.primaryText} />
              </View>
            </View>
            <View style={styles.gatherPath}>
              {gatherFoundations.slice(0, 4).map((foundation, index, visibleFoundations) => {
                const done = completedLessons[foundation.id]?.length ?? 0;
                const isActive = foundation.id === activeFoundation.id;

                return (
                  <View key={foundation.id} style={styles.gatherNodeWrap}>
                    <View style={styles.gatherNodeRow}>
                      {index > 0 ? (
                        <View
                          style={[
                            styles.gatherConnector,
                            { backgroundColor: 'rgba(233, 205, 172, 0.46)' },
                          ]}
                        />
                      ) : null}
                      <GatherIconBadge
                        artworkKey={foundation.iconImage}
                        size={58}
                        iconSize={34}
                        style={[
                          styles.gatherNode,
                          {
                            borderColor: 'transparent',
                            opacity: done > 0 || isActive ? 1 : 0.6,
                          },
                        ]}
                      />
                      {index < visibleFoundations.length - 1 ? (
                        <View
                          style={[
                            styles.gatherConnector,
                            { backgroundColor: 'rgba(233, 205, 172, 0.46)' },
                          ]}
                        />
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
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
  greeting: {
    ...typography.screenTitle,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  verseCard: {
    padding: 0,
    overflow: 'hidden',
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    borderRadius: radius.lg,
  },
  verseCardImage: {
    borderRadius: radius.lg,
  },
  verseCardOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  verseCardContent: {
    flex: 1,
  },
  heroEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroEyebrow: {
    ...typography.bodyStrong,
    fontSize: 16,
    lineHeight: 22,
  },
  verseShareRow: {
    marginTop: 'auto',
    alignItems: 'flex-end',
  },
  verseShareButton: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardTitle: {
    ...typography.eyebrow,
    marginBottom: 0,
  },
  sectionHeading: {
    ...typography.sectionTitle,
  },
  verseText: {
    ...typography.readingDisplay,
    marginBottom: 0,
  },
  reference: {
    ...typography.label,
  },
  audioFallbackBody: {
    ...typography.bodyStrong,
    fontSize: 17,
    lineHeight: 26,
    marginBottom: 0,
  },
  sharePreviewMount: {
    position: 'absolute',
    left: -10000,
    top: 0,
  },
  headerRow: {
    gap: 3,
  },
  greetingLine: {
    ...typography.bodyStrong,
    fontSize: 18,
    lineHeight: 24,
  },
  dateLine: {
    ...typography.body,
    fontSize: 15,
    lineHeight: 20,
  },
  beginTitle: {
    ...typography.readingHeading,
    fontSize: 26,
    lineHeight: 32,
  },
  progressGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  smallCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 154,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  smallCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  smallCardEyebrow: {
    ...typography.bodyStrong,
    fontSize: 12,
    lineHeight: 16,
  },
  smallCardTitle: {
    ...typography.readingHeading,
    fontSize: 17,
    lineHeight: 22,
  },
  smallCardMeta: {
    ...typography.body,
    fontSize: 13,
    lineHeight: 18,
  },
  linearProgressTrack: {
    height: 8,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginTop: 'auto',
  },
  linearProgressFill: {
    height: 8,
    borderRadius: radius.pill,
  },
  smallCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  dotProgressRow: {
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
  },
  gatherStrip: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  gatherStripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  gatherTitle: {
    ...typography.bodyStrong,
    fontSize: 17,
    lineHeight: 23,
  },
  gatherHeaderCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  gatherFoundationLabel: {
    ...typography.bodyStrong,
    fontSize: 17,
    lineHeight: 23,
  },
  gatherPath: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  gatherNodeWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: spacing.sm,
  },
  gatherNodeRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gatherConnector: {
    flex: 1,
    height: 1,
  },
  gatherNode: {
    borderWidth: 1,
  },
  gatherFieldLabel: {
    ...typography.micro,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  homeStack: {
    flex: 1,
    minHeight: 0,
  },
});
