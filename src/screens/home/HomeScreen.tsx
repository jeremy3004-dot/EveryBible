import { useState, useEffect, useRef, type ComponentProps } from 'react';
import {
  View,
  Text,
  Image,
  ImageBackground,
  StyleSheet,
  TouchableOpacity,
  InteractionManager,
  useWindowDimensions,
  Share,
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
import { useProgressStore } from '../../stores/progressStore';
import { useBibleStore } from '../../stores/bibleStore';
import { useGatherStore } from '../../stores/gatherStore';
import { gatherFoundations } from '../../data/gatherFoundations';
import { gatherIconImages } from '../../data/gatherIcons';
import { getHomeVerseBackground } from '../../data/homeVerseBackgrounds';
import { getHomeScreenLayout, shouldUseCompactHomeStatsLayout } from './homeLayoutModel';
import { buildHomeVerseShareMessage } from './homeVerseShareModel';
import { getDailyScripture } from '../../services/bible';
import { getAudioAvailability, isRemoteAudioAvailable } from '../../services/audio';
import { CardSkeleton } from '../../components';
import type { DailyScripture } from '../../types';
import type { RootTabParamList } from '../../navigation/types';
import { radius, spacing, typography } from '../../design/system';
import { captureRef } from 'react-native-view-shot';

type NavigationProp = NativeStackNavigationProp<RootTabParamList>;

export function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const [dailyScripture, setDailyScripture] = useState<DailyScripture | null>(null);
  const [isLoadingVerse, setIsLoadingVerse] = useState(true);
  const [isSharingVerse, setIsSharingVerse] = useState(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verseSharePreviewRef = useRef<View | null>(null);
  const verseBackground = getHomeVerseBackground();
  const homeLayout = getHomeScreenLayout(screenWidth, screenHeight, bottomTabBarHeight);
  const isCompactHomeStatsLayout = shouldUseCompactHomeStatsLayout(screenWidth);

  const currentTranslation = useBibleStore((state) => state.currentTranslation);
  const translations = useBibleStore((state) =>
    Array.isArray(state.translations) ? state.translations : bibleTranslations
  );
  const currentTranslationInfo = translations.find(
    (translation) => translation.id === currentTranslation
  );
  const remoteAudioAvailable =
    config.features.audioEnabled && isRemoteAudioAvailable(currentTranslation);
  const getTodayCount = useProgressStore((state) => state.getTodayCount);
  const getWeekCount = useProgressStore((state) => state.getWeekCount);
  const getMonthCount = useProgressStore((state) => state.getMonthCount);
  const getYearCount = useProgressStore((state) => state.getYearCount);

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

  useEffect(() => {
    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      void loadVerseOfDay({ allowInitialization: false });
    });

    retryTimerRef.current = setTimeout(() => {
      void loadVerseOfDay({ allowInitialization: false, silent: true });
    }, 2500);

    return () => {
      interactionHandle.cancel();

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTranslation, remoteAudioAvailable]);

  const loadVerseOfDay = async ({
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
      if (!currentTranslationInfo) {
        setDailyScripture(null);
        return;
      }

      const scripture = await getDailyScripture(currentTranslationInfo, remoteAudioAvailable, {
        allowInitialization,
      });
      setDailyScripture(scripture);
    } catch (error) {
      console.error('Error loading verse of the day:', error);
    } finally {
      if (!silent) {
        setIsLoadingVerse(false);
      }
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('home.goodMorning');
    if (hour < 17) return t('home.goodAfternoon');
    return t('home.goodEvening');
  };

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

  const dailyReferenceLabel = dailyScripture
    ? `${getTranslatedBookName(dailyScripture.bookId, t)} ${dailyScripture.chapter}${
        dailyScripture.verse ? `:${dailyScripture.verse}` : ''
      }`
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
  const verseShareMessage = buildHomeVerseShareMessage({
    cardTitle: verseCardTitleLabel,
    referenceLabel: verseShareReferenceLabel,
    bodyText: verseShareBodyText,
  });
  const verseShareButtonSize = Math.max(40, Math.round(44 * homeLayout.scale));
  const verseShareIconSize = Math.max(18, Math.round(20 * homeLayout.scale));

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
      source={verseBackground}
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
      imageStyle={[styles.verseCardImage, { opacity: isDark ? 0.34 : 0.18 }]}
      resizeMode="cover"
    >
      <LinearGradient
        colors={
          isDark
            ? ['rgba(12, 11, 9, 0.12)', 'rgba(12, 11, 9, 0.72)']
            : ['rgba(245, 240, 232, 0.08)', 'rgba(245, 240, 232, 0.56)']
        }
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
        {dailyScripture?.kind === 'verse-text' ? (
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
              {`"${dailyScripture.text?.trim() || t('home.defaultVerse')}"`}
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
          <View
            style={[
              styles.content,
              {
                paddingHorizontal: homeLayout.screenPadding,
                paddingVertical: homeLayout.screenPadding,
                paddingBottom: Math.max(spacing.sm, homeLayout.screenPadding - spacing.xs),
                gap: homeLayout.sectionGap,
              },
            ]}
          >
        <View style={[styles.homeStack, { gap: homeLayout.sectionGap }]}>
          <View style={[styles.headerBlock, { gap: homeLayout.bodyGap }]}>
            <Text
              style={[
                styles.greeting,
                {
                  color: colors.primaryText,
                  fontSize: homeLayout.greetingFontSize,
                  lineHeight: homeLayout.greetingLineHeight,
                },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {getGreeting()}
            </Text>
            <Text
              style={[
                styles.subtitle,
                {
                  color: colors.secondaryText,
                  fontSize: homeLayout.subtitleFontSize,
                  lineHeight: homeLayout.subtitleLineHeight,
                },
              ]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              {t('home.welcome')}
            </Text>
          </View>

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
            <Text
              style={[
                styles.cardTitle,
                {
                  color: colors.secondaryText,
                  paddingHorizontal: homeLayout.cardPadding,
                  paddingTop: homeLayout.cardPadding,
                  marginBottom: homeLayout.cardTitleGap,
                },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              {activeFoundationDone > 0 ? 'CONTINUE IN FOUNDATIONS' : 'GET STARTED'}
            </Text>
            <View
              style={[
                styles.foundationCardBody,
                {
                  gap: homeLayout.foundationCardGap,
                  paddingHorizontal: homeLayout.cardPadding,
                  paddingBottom: homeLayout.cardPadding,
                  paddingTop: 0,
                },
              ]}
            >
              <View
                style={[
                  styles.foundationIconWrap,
                  {
                    backgroundColor: colors.accentPrimary + '18',
                    width: homeLayout.foundationIconSize,
                    height: homeLayout.foundationIconSize,
                  },
                ]}
              >
                {activeFoundation.iconImage && gatherIconImages[activeFoundation.iconImage] ? (
                  <Image
                    source={gatherIconImages[activeFoundation.iconImage]}
                    style={[
                      styles.foundationIconImage,
                      {
                        width: homeLayout.foundationIconSize,
                        height: homeLayout.foundationIconSize,
                      },
                    ]}
                    resizeMode="contain"
                  />
                ) : (
                  <Ionicons
                    name={
                      (activeFoundation.iconName as ComponentProps<typeof Ionicons>['name']) ??
                      'book-outline'
                    }
                    size={Math.max(28, Math.round(homeLayout.foundationIconSize * 0.52))}
                    color={colors.accentPrimary}
                  />
                )}
              </View>
              <View style={[styles.foundationCardInfo, { gap: homeLayout.bodyGap }]}>
                <Text
                  style={[styles.foundationCardTitle, { color: colors.primaryText }]}
                  numberOfLines={homeLayout.foundationTitleLines}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                >
                  {`Foundations ${activeFoundation.number}: ${activeFoundation.title}`}
                </Text>
                <Text
                  style={[styles.foundationCardSubtitle, { color: colors.secondaryText }]}
                  numberOfLines={homeLayout.foundationSubtitleLines}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                >
                  {activeFoundation.description}
                </Text>
                <Text
                  style={[styles.foundationCardProgress, { color: colors.accentPrimary }]}
                  numberOfLines={1}
                >
                  {`${activeFoundationDone} / ${activeFoundationTotal} lessons`}
                </Text>
              </View>
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

          {/* Stats Card */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.cardBackground,
                borderColor: colors.cardBorder,
                padding: isCompactHomeStatsLayout
                  ? homeLayout.denseCardPadding
                  : homeLayout.cardPadding,
                paddingBottom:
                  (isCompactHomeStatsLayout
                    ? homeLayout.denseCardPadding
                    : homeLayout.cardPadding) - 2,
              },
            ]}
          >
            <Text
              style={[
                styles.cardTitle,
                { color: colors.secondaryText, marginBottom: homeLayout.cardTitleGap },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              {t('home.chaptersRead')}
            </Text>
            <View
              style={[
                styles.statsRow,
                {
                  gap: isCompactHomeStatsLayout ? homeLayout.bodyGap : homeLayout.statsRowGap,
                },
              ]}
            >
              <View style={styles.statItem}>
                <Text
                  style={[
                    styles.statNumber,
                    {
                      color: colors.primaryText,
                      fontSize: homeLayout.statNumberFontSize,
                      lineHeight: homeLayout.statNumberLineHeight,
                    },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                >
                  {getTodayCount()}
                </Text>
                <Text
                  style={[
                    styles.statLabel,
                    {
                      color: colors.secondaryText,
                      fontSize: homeLayout.statLabelFontSize,
                      lineHeight: homeLayout.statLabelLineHeight,
                    },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                >
                  {t('home.today')}
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text
                  style={[
                    styles.statNumber,
                    {
                      color: colors.primaryText,
                      fontSize: homeLayout.statNumberFontSize,
                      lineHeight: homeLayout.statNumberLineHeight,
                    },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                >
                  {getWeekCount()}
                </Text>
                <Text
                  style={[
                    styles.statLabel,
                    {
                      color: colors.secondaryText,
                      fontSize: homeLayout.statLabelFontSize,
                      lineHeight: homeLayout.statLabelLineHeight,
                    },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                >
                  {t('home.week')}
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text
                  style={[
                    styles.statNumber,
                    {
                      color: colors.primaryText,
                      fontSize: homeLayout.statNumberFontSize,
                      lineHeight: homeLayout.statNumberLineHeight,
                    },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                >
                  {getMonthCount()}
                </Text>
                <Text
                  style={[
                    styles.statLabel,
                    {
                      color: colors.secondaryText,
                      fontSize: homeLayout.statLabelFontSize,
                      lineHeight: homeLayout.statLabelLineHeight,
                    },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                >
                  {t('home.month')}
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text
                  style={[
                    styles.statNumber,
                    {
                      color: colors.primaryText,
                      fontSize: homeLayout.statNumberFontSize,
                      lineHeight: homeLayout.statNumberLineHeight,
                    },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                >
                  {getYearCount()}
                </Text>
                <Text
                  style={[
                    styles.statLabel,
                    {
                      color: colors.secondaryText,
                      fontSize: homeLayout.statLabelFontSize,
                      lineHeight: homeLayout.statLabelLineHeight,
                    },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                >
                  {t('home.year')}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  greeting: {
    ...typography.screenTitle,
  },
  subtitle: {
    ...typography.body,
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
  foundationIconImage: {
    borderRadius: radius.pill,
  },
  foundationCardInfo: {
    flex: 1,
  },
  foundationCardTitle: {
    ...typography.bodyStrong,
  },
  foundationCardSubtitle: {
    ...typography.micro,
  },
  foundationCardProgress: {
    ...typography.label,
  },
  homeStack: {
    flex: 1,
    minHeight: 0,
  },
  headerBlock: {
    alignItems: 'flex-start',
  },
});
