import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Image,
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
import { bibleTranslations, getTranslatedBookName } from '../../constants';
import { config } from '../../constants/config';
import { useTheme } from '../../contexts/ThemeContext';
import { GatherIconBadge } from '../../components/gather/GatherIconBadge';
import { useBibleStore } from '../../stores/bibleStore';
import { useGatherStore } from '../../stores/gatherStore';
import { useReadingPlansStore } from '../../stores/readingPlansStore';
import {
  FOUNDATION_DESC_KEYS,
  FOUNDATION_TITLE_KEYS,
  gatherFoundations,
} from '../../data/gatherFoundations';
import { getHomeVerseBackground } from '../../data/homeVerseBackgrounds';
import { getHomeScreenLayout } from './homeLayoutModel';
import { selectHomeContinuePlans, type HomeContinuePlan } from './homeReadingPlansModel';
import { buildHomeVerseShareMessage } from './homeVerseShareModel';
import { formatDailyScriptureReferenceLabel, getDailyScripture } from '../../services/bible';
import { getMillisecondsUntilNextLocalMidnight } from '../../services/bible/dailyScriptureRefresh';
import { getAudioAvailability, isRemoteAudioAvailable } from '../../services/audio';
import { listReadingPlans } from '../../services/plans/readingPlanService';
import { getReadingPlanCoverSource } from '../../services/plans/readingPlanAssets';
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

function PlanResumeCover({ plan }: { plan: ReadingPlan }) {
  const { colors } = useTheme();
  const source = getReadingPlanCoverSource(plan);

  if (!source) {
    return (
      <View
        style={[
          planResumeStyles.coverFallback,
          { backgroundColor: colors.accentSecondary },
        ]}
      >
        <Ionicons name="book-outline" size={20} color={colors.secondaryText} />
      </View>
    );
  }

  return <Image source={source} style={planResumeStyles.coverImage} resizeMode="cover" />;
}

function ContinuePlanCard({
  item,
  onPress,
  showDivider = false,
}: {
  item: HomeContinuePlan;
  onPress: (planId: string) => void;
  showDivider?: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const title = t(item.plan.title_key as Parameters<typeof t>[0], {
    defaultValue: item.plan.title_key,
  });
  const completedCount = Object.keys(item.progress.completed_entries).length;
  const fraction = item.plan.duration_days > 0 ? completedCount / item.plan.duration_days : 0;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onPress(item.plan.id)}
      style={[
        planResumeStyles.row,
        showDivider ? { borderTopColor: colors.cardBorder, borderTopWidth: 1 } : null,
        {
          backgroundColor: 'transparent',
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${t('readingPlans.dayOf', {
        current: item.progress.current_day,
        total: item.plan.duration_days,
      })}. ${t('common.continue')}`}
    >
      <View style={planResumeStyles.topRow}>
        <PlanResumeCover plan={item.plan} />
        <View style={planResumeStyles.textColumn}>
          <Text
            style={[planResumeStyles.title, { color: colors.primaryText }]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            {title}
          </Text>
          <Text style={[planResumeStyles.meta, { color: colors.secondaryText }]} numberOfLines={1}>
            {t('readingPlans.dayOf', {
              current: item.progress.current_day,
              total: item.plan.duration_days,
            })}
          </Text>
        </View>
        <View style={[planResumeStyles.cta, { backgroundColor: colors.accentPrimary }]}>
          <Text
            style={[planResumeStyles.ctaText, { color: colors.onAccent }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
          >
            {t('common.continue')}
          </Text>
        </View>
      </View>
      <View style={[planResumeStyles.progressTrack, { backgroundColor: colors.cardBorder }]}>
        <View
          style={[
            planResumeStyles.progressFill,
            {
              width: `${Math.max(0, Math.min(1, fraction)) * 100}%`,
              backgroundColor: colors.accentPrimary,
            },
          ]}
        />
      </View>
    </TouchableOpacity>
  );
}

export function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const [dailyScripture, setDailyScripture] = useState<DailyScripture | null>(null);
  const [remoteVerseOverride, setRemoteVerseOverride] =
    useState<MobileVerseOfDayOverride | null>(null);
  const [isLoadingVerse, setIsLoadingVerse] = useState(true);
  const [isSharingVerse, setIsSharingVerse] = useState(false);
  const [readingPlans, setReadingPlans] = useState<ReadingPlan[]>([]);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const midnightRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const verseSharePreviewRef = useRef<View | null>(null);
  const verseBackground = getHomeVerseBackground();
  const homeLayout = getHomeScreenLayout(screenWidth, screenHeight, bottomTabBarHeight);

  const currentTranslation = useBibleStore((state) => state.currentTranslation);
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
  const activeFoundationDone = completedLessons[activeFoundation.id]?.length ?? 0;
  const activeFoundationTotal = activeFoundation.lessons.length;
  const activeFoundationTitle = FOUNDATION_TITLE_KEYS[activeFoundation.id]
    ? t(FOUNDATION_TITLE_KEYS[activeFoundation.id])
    : activeFoundation.title;
  const activeFoundationDescription = FOUNDATION_DESC_KEYS[activeFoundation.id]
    ? t(FOUNDATION_DESC_KEYS[activeFoundation.id])
    : activeFoundation.description;
  const foundationCardEyebrow =
    activeFoundationDone > 0 ? t('gather.foundations') : t('gather.getStarted');
  const continuePlans = useMemo(
    () => selectHomeContinuePlans(readingPlans, progressByPlanId),
    [progressByPlanId, readingPlans]
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

  const handlePlayDailyAudio = () => {
    if (!dailyScripture || !dailyAudioAvailability?.canPlayAudio) {
      return;
    }

    navigation.navigate('Bible', {
      screen: 'BibleReader',
      params: {
        bookId: dailyScripture.bookId,
        chapter: dailyScripture.chapter,
        autoplayAudio: true,
        focusVerse: dailyScripture.verse,
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
  const verseShareBodyText =
    remoteVerseOverride?.verseText?.trim()
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
  const verseCardImageOpacity = isDark ? 0.34 : 0.48;
  const verseCardOverlayColors = isDark
    ? (['rgba(12, 11, 9, 0.12)', 'rgba(12, 11, 9, 0.72)'] as const)
    : (['rgba(255, 255, 255, 0.04)', 'rgba(12, 11, 9, 0.18)'] as const);

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
      <Ionicons
        name="share-outline"
        size={verseShareIconSize}
        color={colors.primaryText}
      />
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
      <View style={[styles.verseCardContent, { padding: homeLayout.cardPadding, gap: homeLayout.bodyGap }]}>
        <Text
          style={[styles.cardTitle, { color: colors.secondaryText, marginBottom: 0 }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.78}
        >
          {verseCardTitleLabel}
        </Text>
        {remoteVerseOverride || dailyScripture?.kind === 'verse-text' ? (
          <>
            <Text
              style={[
                styles.verseText,
                {
                  color: colors.primaryText,
                  fontSize: homeLayout.verseTextFontSize,
                  lineHeight: homeLayout.verseTextLineHeight,
                },
              ]}
              numberOfLines={homeLayout.verseTextLines}
              adjustsFontSizeToFit
              minimumFontScale={0.66}
            >
              {`"${verseShareBodyText}"`}
            </Text>
            <Text
              style={[
                styles.reference,
                {
                  color: colors.accentGreen,
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
            {showActions ? (
              <View style={styles.verseShareRow}>{renderVerseShareButton()}</View>
            ) : null}
          </>
        ) : shouldShowDailyAudio ? (
          <>
            <Text
              style={[
                styles.audioFallbackBody,
                {
                  color: colors.primaryText,
                  fontSize: homeLayout.verseBodyFontSize,
                  lineHeight: homeLayout.verseBodyLineHeight,
                },
              ]}
              numberOfLines={homeLayout.verseBodyLines}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {verseShareBodyText}
            </Text>
            <Text
              style={[
                styles.reference,
                {
                  color: colors.accentGreen,
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
            {showActions ? (
              <>
                <TouchableOpacity
                  style={[
                    styles.audioAction,
                    {
                      backgroundColor: colors.bibleControlBackground,
                      paddingHorizontal: homeLayout.audioButtonPaddingHorizontal,
                      paddingVertical: homeLayout.audioButtonPaddingVertical,
                      gap: homeLayout.audioButtonGap,
                    },
                  ]}
                  onPress={handlePlayDailyAudio}
                  activeOpacity={0.9}
                >
                  <Ionicons
                    name="play"
                    size={Math.max(16, Math.round(18 * homeLayout.scale))}
                    color={colors.bibleBackground}
                  />
                  <Text
                    style={[
                      styles.audioActionText,
                      {
                        color: colors.bibleBackground,
                        fontSize: Math.max(14, homeLayout.subtitleFontSize + 1),
                        lineHeight: homeLayout.subtitleLineHeight,
                      },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.82}
                  >
                    {dailyAudioKind === 'section-audio'
                      ? t('home.playSectionOfTheDay')
                      : t('home.playVerseOfTheDay')}
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}
            {showActions ? (
              <View style={styles.verseShareRow}>{renderVerseShareButton()}</View>
            ) : null}
          </>
        ) : (
          <>
            <Text
              style={[
                styles.verseText,
                {
                  color: colors.primaryText,
                  fontSize: homeLayout.verseTextFontSize,
                  lineHeight: homeLayout.verseTextLineHeight,
                },
              ]}
              numberOfLines={homeLayout.verseTextLines}
              adjustsFontSizeToFit
              minimumFontScale={0.66}
            >
              {t('home.defaultVerse')}
            </Text>
            <Text
              style={[
                styles.reference,
                {
                  color: colors.accentGreen,
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
            {showActions ? (
              <View style={styles.verseShareRow}>{renderVerseShareButton()}</View>
            ) : null}
          </>
        )}
      </View>
    </ImageBackground>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
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
          {/* Continue in Foundations card */}
          <TouchableOpacity
            activeOpacity={0.8}
            style={[
              styles.card,
              styles.foundationCard,
              { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
            ]}
            onPress={() =>
              navigation.navigate('Learn', {
                screen: 'FoundationDetail',
                params: { foundationId: activeFoundation.id },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any)
            }
          >
            <View
              style={[
                styles.foundationCardBody,
                {
                  gap: homeLayout.foundationCardGap,
                  paddingHorizontal: homeLayout.cardPadding,
                  paddingTop: homeLayout.cardPadding + spacing.md,
                  paddingBottom: homeLayout.cardPadding + spacing.xs,
                },
              ]}
            >
              <GatherIconBadge
                artworkKey={activeFoundation.iconImage}
                size={homeLayout.foundationIconSize}
                iconSize={Math.max(30, Math.round(homeLayout.foundationIconSize * 0.58))}
                style={[
                  styles.foundationIconWrap,
                  { width: homeLayout.foundationIconSize, height: homeLayout.foundationIconSize },
                ]}
              />
              <View style={[styles.foundationCardInfo, { gap: homeLayout.bodyGap }]}>
                <Text
                  style={[styles.cardTitle, { color: colors.accentPrimary }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.78}
                >
                  {foundationCardEyebrow}
                </Text>
                <Text
                  style={[styles.foundationCardTitle, { color: colors.primaryText }]}
                  numberOfLines={homeLayout.foundationTitleLines}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                >
                  {`${t('gather.foundationLabel', { number: activeFoundation.number })}: ${activeFoundationTitle}`}
                </Text>
                <Text
                  style={[styles.foundationCardSubtitle, { color: colors.secondaryText }]}
                  numberOfLines={homeLayout.foundationSubtitleLines}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                >
                  {activeFoundationDescription}
                </Text>
                <View style={styles.foundationProgressRow}>
                  <Text
                    style={[styles.foundationCardProgress, { color: colors.accentPrimary }]}
                    numberOfLines={1}
                  >
                    {t('gather.lessonsProgress', {
                      completed: activeFoundationDone,
                      total: activeFoundationTotal,
                    })}
                  </Text>
                  <View
                    style={[styles.foundationProgressTrack, { backgroundColor: colors.cardBorder }]}
                  >
                    <View
                      style={[
                        styles.foundationProgressFill,
                        {
                          width: `${
                            Math.max(
                              0,
                              Math.min(
                                1,
                                activeFoundationTotal > 0
                                  ? activeFoundationDone / activeFoundationTotal
                                  : 0
                              )
                            ) * 100
                          }%`,
                          backgroundColor: colors.accentPrimary,
                        },
                      ]}
                    />
                  </View>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={26} color={colors.secondaryText} />
            </View>
          </TouchableOpacity>

          {/* Verse of the Day Card */}
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

          {continuePlans.length > 0 ? (
            <View style={styles.myPlansSection}>
              <View style={styles.myPlansHeader}>
                <Text
                  style={[
                    styles.sectionHeading,
                    {
                      color: colors.primaryText,
                    },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.78}
                >
                  {t('readingPlans.myPlans')}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={() => navigation.navigate('Plans', { screen: 'PlansHome' })}
                  style={styles.viewAllButton}
                  accessibilityRole="button"
                  accessibilityLabel={t('readingPlans.browsePlans')}
                >
                  <Text
                    style={[styles.viewAllText, { color: colors.accentPrimary }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                  >
                    {t('tabs.plans')}
                  </Text>
                  <Ionicons name="chevron-forward" size={22} color={colors.secondaryText} />
                </TouchableOpacity>
              </View>
              <View
                style={[
                  styles.card,
                  styles.myPlansCard,
                  {
                    backgroundColor: colors.cardBackground,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                {continuePlans.map((item, index) => (
                  <ContinuePlanCard
                    key={item.plan.id}
                    item={item}
                    onPress={handleContinuePlan}
                    showDivider={index > 0}
                  />
                ))}
              </View>
            </View>
          ) : null}
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
  audioAction: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
  },
  audioActionText: {
    ...typography.button,
  },
  sharePreviewMount: {
    position: 'absolute',
    left: -10000,
    top: 0,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  statItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginBottom: spacing.xs,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  statLabel: {
    ...typography.micro,
    textAlign: 'center',
  },
  // Foundations continuation card
  foundationCard: {
    padding: 0,
    overflow: 'hidden',
  },
  foundationCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 0,
  },
  foundationIconWrap: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  foundationCardInfo: {
    flex: 1,
    minWidth: 0,
  },
  foundationCardTitle: {
    ...typography.bodyStrong,
    fontSize: 18,
    lineHeight: 24,
  },
  foundationCardSubtitle: {
    ...typography.body,
  },
  foundationCardProgress: {
    ...typography.label,
    minWidth: 46,
  },
  foundationProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  foundationProgressTrack: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  foundationProgressFill: {
    height: 4,
    borderRadius: radius.pill,
  },
  homeStack: {
    flex: 1,
    minHeight: 0,
  },
  myPlansSection: {
    gap: spacing.md,
  },
  myPlansHeader: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 32,
    flexShrink: 0,
  },
  viewAllText: {
    ...typography.label,
  },
  myPlansCard: {
    overflow: 'hidden',
  },
});

const planResumeStyles = StyleSheet.create({
  row: {
    alignSelf: 'stretch',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  coverImage: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    flexShrink: 0,
  },
  coverFallback: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textColumn: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    ...typography.bodyStrong,
    fontSize: 16,
    lineHeight: 21,
  },
  meta: {
    ...typography.body,
  },
  cta: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    minHeight: 44,
  },
  ctaText: {
    ...typography.label,
    fontSize: 14,
  },
  progressTrack: {
    height: 3,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    borderRadius: radius.pill,
  },
});
